const { app, BrowserWindow, ipcMain, Tray, Menu, shell, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { Client, utils: sshUtils } = require("ssh2");
const pkg = require("../package.json");

const APP_VERSION = pkg.version;
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "icon.ico")
  : path.join(__dirname, "..", "assets", "icon.ico");
const CONNECT_TIMEOUT_MS = 12000;

const DEFAULT_SETTINGS = {
  host: "217.154.34.205",
  port: 22,
  username: "root",
};

let splashWindow = null;
let mainWindow = null;
let tray = null;

// Map of tabId -> session object for multi-tab SSH
const sessions = new Map();

// ── Config ────────────────────────────────────────────────

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf-8"));
  } catch (_) {
    return {};
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function getSettings() {
  const cfg = loadConfig();
  return {
    host: cfg.host || DEFAULT_SETTINGS.host,
    port: Number(cfg.port) || DEFAULT_SETTINGS.port,
    username: cfg.username || DEFAULT_SETTINGS.username,
    theme: cfg.theme || "dark",
  };
}

function validateSettings(input) {
  const host = String(input.host || "").trim();
  const port = Number(String(input.port || "").trim());
  const username = String(input.username || "").trim();

  if (!host) return { error: "Enter an IP address or hostname." };
  if (!/^[A-Za-z0-9.\-:\[\]]+$/.test(host)) return { error: "That doesn't look like a valid IP address or hostname." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Port must be a number between 1 and 65535." };
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(username)) return { error: "Enter a valid username." };

  return { settings: { host: host.replace(/^\[|\]$/g, ""), port, username } };
}

function hostKeyId(host, port) {
  return `${host}:${port}`;
}

// ── Windows ───────────────────────────────────────────────

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    icon: ICON_PATH,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"), { query: { v: APP_VERSION } });
  splashWindow.center();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 700,
    minHeight: 480,
    backgroundColor: "#0c0c0c",
    show: false,
    frame: false,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

  mainWindow.once("ready-to-show", () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      splashWindow = null;
      mainWindow.show();
      mainWindow.focus();
    }, 1500);
  });

  mainWindow.on("maximize", () => send("window-state", { maximized: true }));
  mainWindow.on("unmaximize", () => send("window-state", { maximized: false }));

  mainWindow.on("minimize", (event) => {
    if (!createTrayIfNeeded()) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function createTrayIfNeeded() {
  if (tray) return true;
  try {
    tray = new Tray(ICON_PATH);
  } catch (_) {
    return false;
  }
  tray.setToolTip(`HN Secure Enclave v${APP_VERSION}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show HN Secure Enclave", click: showMainWindow },
      { type: "separator" },
      { label: `v${APP_VERSION}`, enabled: false },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          disconnectAll();
          app.quit();
        },
      },
    ])
  );
  tray.on("double-click", showMainWindow);
  return true;
}

// ── SSH (multi-tab) ──────────────────────────────────────

function loadPrivateKeys() {
  const keys = [];
  for (const name of ["id_ed25519", "id_ecdsa", "id_rsa"]) {
    try {
      const parsed = sshUtils.parseKey(fs.readFileSync(path.join(os.homedir(), ".ssh", name)));
      if (parsed && !(parsed instanceof Error) && !Array.isArray(parsed)) keys.push(parsed);
    } catch (_) {}
  }
  return keys;
}

function describeError(err, s) {
  const { host, port } = s.target;
  const code = err && err.code;

  if (s.hostKeyMismatch) {
    return {
      title: "Host key changed",
      message: `The server at ${host} is presenting a different identity than last time. If the server was reinstalled, open Settings and click Forget next to "Saved host key". Otherwise, do not connect.`,
    };
  }
  if (s.authUnsupported) {
    return {
      title: "Password login is disabled",
      message: `The server only accepts: ${s.authUnsupported.join(", ")}. Enable password authentication on the VPS to log in with a password.`,
    };
  }
  if (err && err.level === "client-authentication") {
    return { title: "Login failed", message: "The server rejected the login." };
  }
  if (s.awaitingPassword) {
    return { title: "Login timed out", message: "The server closed the connection while waiting for the password." };
  }
  if (s.stream) {
    return { title: "Connection lost", message: `The connection to ${host} was interrupted.` };
  }
  if (s.timedOut || code === "ETIMEDOUT") {
    return {
      title: "Unable to connect",
      message: `${host} didn't respond on port ${port}. The server may be offline, or a firewall is blocking SSH on this address.`,
    };
  }
  if (code === "ECONNREFUSED") {
    return { title: "Unable to connect", message: `${host} refused the connection on port ${port}. SSH isn't listening on this address.` };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || (err && err.level === "client-dns")) {
    return { title: "Unable to connect", message: `Couldn't find a server called "${host}".` };
  }
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") {
    return { title: "Unable to connect", message: `No route to ${host}. Check your network connection.` };
  }
  if (code === "ECONNRESET") {
    return { title: "Unable to connect", message: `${host} reset the connection.` };
  }
  return { title: "Unable to connect", message: (err && err.message) || "An unknown error occurred." };
}

function endSession(s) {
  sessions.delete(s.tabId);
  clearTimeout(s.connectTimer);
  s.passwordCallback = null;
  try { if (s.stream) s.stream.close(); } catch (_) {}
  try { s.conn.end(); } catch (_) {}
}

function failSession(s, err) {
  if (!sessions.has(s.tabId) || sessions.get(s.tabId) !== s) return;
  const info = describeError(err, s);
  endSession(s);
  send("ssh-status", { tabId: s.tabId, state: "error", ...info });
}

function disconnectTab(tabId) {
  const s = sessions.get(tabId);
  if (s) endSession(s);
}

function disconnectAll() {
  for (const s of sessions.values()) {
    clearTimeout(s.connectTimer);
    s.passwordCallback = null;
    try { if (s.stream) s.stream.close(); } catch (_) {}
    try { s.conn.end(); } catch (_) {}
  }
  sessions.clear();
}

function connectTab(tabId, { cols, rows }) {
  disconnectTab(tabId);

  const target = getSettings();
  const conn = new Client();
  const s = {
    tabId,
    conn,
    target,
    stream: null,
    keys: loadPrivateKeys(),
    passwordCallback: null,
    passwordAttempts: 0,
    awaitingPassword: false,
    hostKeyMismatch: false,
    authUnsupported: null,
    timedOut: false,
    connectTimer: null,
  };
  sessions.set(tabId, s);

  send("ssh-status", { tabId, state: "connecting", target });

  s.connectTimer = setTimeout(() => {
    s.timedOut = true;
    failSession(s, null);
  }, CONNECT_TIMEOUT_MS);

  conn.on("ready", () => {
    if (sessions.get(tabId) !== s) return;
    conn.shell({ term: "xterm-256color", cols: cols || 80, rows: rows || 24 }, (err, stream) => {
      if (sessions.get(tabId) !== s) return;
      if (err) return failSession(s, err);

      s.stream = stream;
      send("ssh-status", { tabId, state: "connected", target });

      stream.on("data", (data) => send("ssh-data", { tabId, data }));
      stream.stderr.on("data", (data) => send("ssh-data", { tabId, data }));
      stream.on("close", () => {
        if (sessions.get(tabId) !== s) return;
        endSession(s);
        send("ssh-status", { tabId, state: "closed", target });
      });
    });
  });

  conn.on("error", (err) => failSession(s, err));

  conn.on("close", () => {
    if (sessions.get(tabId) !== s) return;
    if (s.stream) {
      endSession(s);
      send("ssh-status", { tabId, state: "closed", target });
    } else {
      failSession(s, new Error("The server closed the connection."));
    }
  });

  const keyId = hostKeyId(target.host, target.port);

  conn.connect({
    host: target.host,
    port: target.port,
    username: target.username,
    readyTimeout: 0,
    keepaliveInterval: 15000,
    keepaliveCountMax: 4,
    hostVerifier: (key) => {
      const fingerprint = "SHA256:" + crypto.createHash("sha256").update(key).digest("base64");
      const cfg = loadConfig();
      cfg.hostKeys = cfg.hostKeys || {};
      const known = cfg.hostKeys[keyId];
      if (!known) {
        cfg.hostKeys[keyId] = fingerprint;
        saveConfig(cfg);
        return true;
      }
      if (known === fingerprint) return true;
      s.hostKeyMismatch = true;
      return false;
    },
    authHandler: (methodsLeft, _partialSuccess, next) => {
      clearTimeout(s.connectTimer);
      if (sessions.get(tabId) !== s) return next(false);

      const username = target.username;

      if (methodsLeft === null) return next({ type: "none", username });

      if (methodsLeft.includes("publickey") && s.keys.length) {
        return next({ type: "publickey", username, key: s.keys.shift() });
      }

      const canPassword = methodsLeft.includes("password");
      const canKeyboard = methodsLeft.includes("keyboard-interactive");
      if (!canPassword && !canKeyboard) {
        s.authUnsupported = methodsLeft;
        return next(false);
      }

      s.awaitingPassword = true;
      s.passwordCallback = (password) => {
        s.awaitingPassword = false;
        s.passwordCallback = null;
        s.passwordAttempts += 1;
        if (canPassword) {
          next({ type: "password", username, password });
        } else {
          next({
            type: "keyboard-interactive",
            username,
            prompt: (_name, _instructions, _lang, prompts, finish) => finish(prompts.map(() => password)),
          });
        }
      };

      send("ssh-status", {
        tabId,
        state: "password",
        target,
        error: s.passwordAttempts > 0 ? "Incorrect password. Try again." : null,
      });
    },
  });
}

// ── SFTP file browser ─────────────────────────────────────

function sftpListDir(tabId, dirPath) {
  const s = sessions.get(tabId);
  if (!s || !s.conn) return Promise.reject(new Error("Not connected"));
  return new Promise((resolve, reject) => {
    s.conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.readdir(dirPath, (err2, list) => {
        if (err2) return reject(err2);
        const items = list
          .filter((f) => f.filename !== "." && f.filename !== "..")
          .map((f) => ({
            name: f.filename,
            isDir: (f.attrs.mode & 0o40000) !== 0,
            size: f.attrs.size,
            modified: f.attrs.mtime * 1000,
            mode: f.attrs.mode,
          }))
          .sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        resolve(items);
      });
    });
  });
}

function sftpReadFile(tabId, filePath) {
  const s = sessions.get(tabId);
  if (!s || !s.conn) return Promise.reject(new Error("Not connected"));
  return new Promise((resolve, reject) => {
    s.conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.stat(filePath, (statErr, stats) => {
        if (statErr) return reject(statErr);
        if (stats.size > 2 * 1024 * 1024) return reject(new Error("File is too large to preview (max 2 MB)."));
        const chunks = [];
        const rs = sftp.createReadStream(filePath);
        rs.on("data", (chunk) => chunks.push(chunk));
        rs.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        rs.on("error", reject);
      });
    });
  });
}

// ── IPC ───────────────────────────────────────────────────

ipcMain.handle("get-state", () => ({ version: APP_VERSION, settings: getSettings() }));

ipcMain.handle("save-settings", (_event, input) => {
  const result = validateSettings(input || {});
  if (result.error) return { ok: false, error: result.error };
  const cfg = loadConfig();
  Object.assign(cfg, result.settings);
  if (input.theme) cfg.theme = input.theme;
  saveConfig(cfg);
  return { ok: true, settings: { ...result.settings, theme: cfg.theme || "dark" } };
});

ipcMain.handle("save-theme", (_event, theme) => {
  const cfg = loadConfig();
  cfg.theme = theme;
  saveConfig(cfg);
  return { ok: true };
});

ipcMain.handle("forget-host-key", () => {
  const { host, port } = getSettings();
  const cfg = loadConfig();
  if (cfg.hostKeys) delete cfg.hostKeys[hostKeyId(host, port)];
  saveConfig(cfg);
  return true;
});

ipcMain.on("ssh-connect", (_event, { tabId, cols, rows }) => connectTab(tabId, { cols, rows }));

ipcMain.on("ssh-cancel", (_event, tabId) => {
  const s = sessions.get(tabId);
  if (!s) return;
  endSession(s);
  send("ssh-status", { tabId, state: "idle", target: s.target });
});

ipcMain.on("ssh-password", (_event, { tabId, password }) => {
  const s = sessions.get(tabId);
  if (s && s.passwordCallback && typeof password === "string") {
    s.passwordCallback(password);
  }
});

ipcMain.on("ssh-input", (_event, { tabId, data }) => {
  const s = sessions.get(tabId);
  if (s && s.stream && typeof data === "string") s.stream.write(data);
});

ipcMain.on("ssh-resize", (_event, { tabId, cols, rows }) => {
  const s = sessions.get(tabId);
  if (s && s.stream && cols > 0 && rows > 0) s.stream.setWindow(rows, cols, 0, 0);
});

ipcMain.on("ssh-disconnect", (_event, tabId) => disconnectTab(tabId));

ipcMain.handle("sftp-list", (_event, { tabId, path: dirPath }) => sftpListDir(tabId, dirPath));
ipcMain.handle("sftp-read", (_event, { tabId, path: filePath }) => sftpReadFile(tabId, filePath));

ipcMain.handle("clipboard-read", () => clipboard.readText());
ipcMain.on("clipboard-write", (_event, text) => {
  if (typeof text === "string") clipboard.writeText(text);
});

ipcMain.on("open-external", (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("window-close", () => {
  disconnectAll();
  mainWindow?.close();
});

// ── App lifecycle ─────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  app.whenReady().then(() => {
    createSplash();
    createWindow();
  });

  app.on("window-all-closed", () => {
    disconnectAll();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.quit();
  });
}
