const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell } = require("electron");
const path = require("path");
const https = require("https");
const { exec, spawn } = require("child_process");
const os = require("os");
const pkg = require("../package.json");

let splashWindow;
let mainWindow;
let tray = null;
let sshProcess = null;
let connectCheckInterval = null;

const APP_VERSION = pkg.version;
const VPS_IP = "100.95.232.62";
const SSH_USER = "root";
const ICON_PATH = path.join(__dirname, "..", "assets", "icon.ico");
const GITHUB_OWNER = "Charlielivsey";
const GITHUB_REPO = "HorizonNetwork";
const VERSION_FILE_PATH = "hn-terminal/package.json";

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
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.center();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: "#0c0c0c",
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.once("ready-to-show", () => {
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
      mainWindow.webContents.send("app-version", APP_VERSION);
      startConnectionLoop();
      checkForUpdates(false);
    }, 1800);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    mainWindow.hide();
    createTrayIfNeeded();
  });
}

function createTrayIfNeeded() {
  if (tray) return;
  tray = new Tray(ICON_PATH);
  tray.setToolTip(`HN Secure Enclave v${APP_VERSION}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show HN Secure Enclave",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: "separator" },
      {
        label: "Reconnect",
        click: () => {
          killSSH();
          mainWindow?.show();
          startConnectionLoop();
        },
      },
      {
        label: "Check for Updates",
        click: () => checkForUpdates(true),
      },
      { type: "separator" },
      {
        label: `v${APP_VERSION}`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          killSSH();
          app.quit();
        },
      },
    ])
  );
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function checkReachable() {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32"
        ? `ping -n 1 -w 2000 ${VPS_IP}`
        : `ping -c 1 -W 2 ${VPS_IP}`;
    exec(cmd, (error) => {
      resolve(!error);
    });
  });
}

async function startConnectionLoop() {
  const reachable = await checkReachable();
  if (mainWindow) {
    mainWindow.webContents.send("connection-status", reachable);
  }

  if (reachable && !sshProcess) {
    startSSH();
    return;
  }

  if (!reachable) {
    if (connectCheckInterval) clearInterval(connectCheckInterval);
    connectCheckInterval = setInterval(async () => {
      const status = await checkReachable();
      if (mainWindow) {
        mainWindow.webContents.send("connection-status", status);
      }
      if (status && !sshProcess) {
        clearInterval(connectCheckInterval);
        connectCheckInterval = null;
        startSSH();
      }
    }, 3000);
  }
}

function killSSH() {
  if (sshProcess) {
    try {
      sshProcess.kill();
    } catch (_) {}
    sshProcess = null;
  }
}

function startSSH() {
  try {
    const sshPath = process.platform === "win32" ? "ssh.exe" : "ssh";
    const args = [
      "-tt",
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-o", "ConnectTimeout=10",
      "-o", "UserKnownHostsFile=" + path.join(os.homedir(), ".ssh", "known_hosts"),
      `${SSH_USER}@${VPS_IP}`,
    ];

    const proc = spawn(sshPath, args, {
      env: { ...process.env, TERM: "xterm-256color" },
      windowsHide: true,
    });

    sshProcess = proc;

    proc.stdout.on("data", (data) => {
      if (mainWindow) {
        mainWindow.webContents.send("terminal-data", data.toString("utf-8"));
      }
    });

    proc.stderr.on("data", (data) => {
      if (mainWindow) {
        mainWindow.webContents.send("terminal-data", data.toString("utf-8"));
      }
    });

    proc.on("close", (code) => {
      sshProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send("ssh-disconnected", code);
        startConnectionLoop();
      }
    });

    proc.on("error", (err) => {
      sshProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send("ssh-error", err.message);
      }
    });

    if (mainWindow) {
      mainWindow.webContents.send("ssh-connected");
    }
  } catch (err) {
    if (mainWindow) {
      mainWindow.webContents.send("ssh-error", err.message);
    }
  }
}

function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

function checkForUpdates(manual) {
  const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/claude/vps-welcome-screen-m373a1/${VERSION_FILE_PATH}`;

  const req = https.get(url, { headers: { "User-Agent": "HN-Secure-Enclave" } }, (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      try {
        const remote = JSON.parse(body);
        const remoteVersion = remote.version;

        if (compareVersions(APP_VERSION, remoteVersion) < 0) {
          if (mainWindow) {
            mainWindow.webContents.send("update-available", remoteVersion);
          }

          dialog
            .showMessageBox(mainWindow, {
              type: "info",
              title: "Update Available",
              message: `A new version of HN Secure Enclave is available.\n\nCurrent: v${APP_VERSION}\nLatest: v${remoteVersion}\n\nWould you like to download the update?`,
              buttons: ["Download Update", "Later"],
              defaultId: 0,
              cancelId: 1,
              icon: ICON_PATH,
            })
            .then(({ response }) => {
              if (response === 0) {
                shell.openExternal(
                  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
                );
              }
            });
        } else if (manual) {
          dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "No Updates",
            message: `You're running the latest version.\n\nv${APP_VERSION}`,
            buttons: ["OK"],
            icon: ICON_PATH,
          });
        }
      } catch (_) {
        if (manual) {
          dialog.showMessageBox(mainWindow, {
            type: "warning",
            title: "Update Check Failed",
            message: "Could not check for updates. Try again later.",
            buttons: ["OK"],
          });
        }
      }
    });
  });

  req.on("error", () => {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Update Check Failed",
        message: "Could not reach GitHub. Check your internet connection.",
        buttons: ["OK"],
      });
    }
  });
}

ipcMain.on("terminal-input", (_event, data) => {
  if (sshProcess && sshProcess.stdin.writable) {
    sshProcess.stdin.write(data);
  }
});

ipcMain.on("terminal-resize", (_event, { cols, rows }) => {});

ipcMain.on("reconnect", () => {
  killSSH();
  startConnectionLoop();
});

ipcMain.on("check-updates", () => {
  checkForUpdates(true);
});

ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on("window-close", () => {
  killSSH();
  mainWindow?.close();
});

app.whenReady().then(() => {
  createSplash();
  createWindow();
});

app.on("window-all-closed", () => {
  if (connectCheckInterval) clearInterval(connectCheckInterval);
  killSSH();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
});
