const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { Client, utils: sshUtils } = require("ssh2");
const pkg = require("../package.json");

const APP_VERSION = pkg.version;
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "icon.ico")
  : path.join(__dirname, "..", "assets", "icon.ico");
const GITHUB_OWNER = "Charlielivsey";
const GITHUB_REPO = "HorizonNetwork";
const UPDATE_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/claude/vps-welcome-screen-m373a1/hn-terminal/package.json`;
const CONNECT_TIMEOUT_MS = 12000;

const DEFAULT_SETTINGS = {
  host: "217.154.34.205",
  port: 22,
  username: "root",
};

let splashWindow = null;
let mainWindow = null;
let tray = null;
let session = null;

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
    width: 1040,
    height: 680,
    minWidth: 640,
    minHeight: 420,
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
      checkForUpdates(false);
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
      { label: "Check for Updates", click: () => checkForUpdates(true) },
      { type: "separator" },
      { label: `v${APP_VERSION}`, enabled: false },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          disconnect();
          app.quit();
        },
      },
    ])
  );
  tray.on("double-click", showMainWindow);
  return true;
}

// ── SSH ───────────────────────────────────────────────────

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
  if (session === s) session = null;
  clearTimeout(s.connectTimer);
  s.passwordCallback = null;
  try {
    if (s.stream) s.stream.close();
  } catch (_) {}
  try {
    s.conn.end();
  } catch (_) {}
}

function failSession(s, err) {
  if (session !== s) return;
  const info = describeError(err, s);
  endSession(s);
  send("ssh-status", { state: "error", ...info });
}

function disconnect() {
  if (session) endSession(session);
}

function connect({ cols, rows }) {
  disconnect();

  const target = getSettings();
  const conn = new Client();
  const s = {
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
  session = s;

  send("ssh-status", { state: "connecting", target });

  s.connectTimer = setTimeout(() => {
    s.timedOut = true;
    failSession(s, null);
  }, CONNECT_TIMEOUT_MS);

  conn.on("ready", () => {
    if (session !== s) return;
    conn.shell({ term: "xterm-256color", cols: cols || 80, rows: rows || 24 }, (err, stream) => {
      if (session !== s) return;
      if (err) return failSession(s, err);

      s.stream = stream;
      send("ssh-status", { state: "connected", target });

      stream.on("data", (data) => send("ssh-data", data));
      stream.stderr.on("data", (data) => send("ssh-data", data));
      stream.on("close", () => {
        if (session !== s) return;
        endSession(s);
        send("ssh-status", { state: "closed", target });
      });
    });
  });

  conn.on("error", (err) => failSession(s, err));

  conn.on("close", () => {
    if (session !== s) return;
    if (s.stream) {
      endSession(s);
      send("ssh-status", { state: "closed", target });
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
      // Reaching auth means the handshake finished, so the connect timeout no longer applies.
      clearTimeout(s.connectTimer);
      if (session !== s) return next(false);

      const username = target.username;

      // "none" lets Tailscale SSH (or any server that pre-authorises us) log straight in.
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
        state: "password",
        target,
        error: s.passwordAttempts > 0 ? "Incorrect password. Try again." : null,
      });
    },
  });
}

// ── Updates ───────────────────────────────────────────────

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

function checkForUpdates(manual) {
  const showFailure = (message) => {
    if (!manual || !mainWindow) return;
    dialog.showMessageBox(mainWindow, { type: "warning", title: "Update Check Failed", message, buttons: ["OK"] });
  };

  const req = https.get(UPDATE_URL, { headers: { "User-Agent": "HN-Secure-Enclave" }, timeout: 10000 }, (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      let remoteVersion;
      try {
        remoteVersion = JSON.parse(body).version;
      } catch (_) {
        return showFailure("Could not check for updates. Try again later.");
      }

      if (compareVersions(APP_VERSION, remoteVersion) < 0) {
        send("update-available", remoteVersion);
        if (!mainWindow) return;
        dialog
          .showMessageBox(mainWindow, {
            type: "info",
            title: "Update Available",
            message: `A new version of HN Secure Enclave is available.\n\nCurrent: v${APP_VERSION}\nLatest: v${remoteVersion}\n\nWould you like to download the update?`,
            buttons: ["Download Update", "Later"],
            defaultId: 0,
            cancelId: 1,
          })
          .then(({ response }) => {
            if (response === 0) shell.openExternal(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`);
          });
      } else if (manual && mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "No Updates",
          message: `You're running the latest version (v${APP_VERSION}).`,
          buttons: ["OK"],
        });
      }
    });
  });

  req.on("timeout", () => req.destroy(new Error("timeout")));
  req.on("error", () => showFailure("Could not reach GitHub. Check your internet connection."));
}

// ── IPC ───────────────────────────────────────────────────

ipcMain.handle("get-state", () => ({ version: APP_VERSION, settings: getSettings() }));

ipcMain.handle("save-settings", (_event, input) => {
  const result = validateSettings(input || {});
  if (result.error) return { ok: false, error: result.error };
  const cfg = loadConfig();
  Object.assign(cfg, result.settings);
  saveConfig(cfg);
  return { ok: true, settings: result.settings };
});

ipcMain.handle("forget-host-key", () => {
  const { host, port } = getSettings();
  const cfg = loadConfig();
  if (cfg.hostKeys) delete cfg.hostKeys[hostKeyId(host, port)];
  saveConfig(cfg);
  return true;
});

ipcMain.on("ssh-connect", (_event, size) => connect(size || {}));

ipcMain.on("ssh-cancel", () => {
  if (!session) return;
  const s = session;
  endSession(s);
  send("ssh-status", { state: "idle", target: s.target });
});

ipcMain.on("ssh-password", (_event, password) => {
  if (session && session.passwordCallback && typeof password === "string") {
    session.passwordCallback(password);
  }
});

ipcMain.on("ssh-input", (_event, data) => {
  if (session && session.stream && typeof data === "string") session.stream.write(data);
});

ipcMain.on("ssh-resize", (_event, { cols, rows } = {}) => {
  if (session && session.stream && cols > 0 && rows > 0) session.stream.setWindow(rows, cols, 0, 0);
});

ipcMain.handle("clipboard-read", () => clipboard.readText());
ipcMain.on("clipboard-write", (_event, text) => {
  if (typeof text === "string") clipboard.writeText(text);
});

ipcMain.on("open-external", (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.on("check-updates", () => checkForUpdates(true));

ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("window-close", () => {
  disconnect();
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
    disconnect();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.quit();
  });
}
