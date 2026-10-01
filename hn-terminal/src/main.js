const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

let splashWindow;
let mainWindow;
let tray = null;
let ptyProcess = null;
let connectCheckInterval = null;

const VPS_IP = "100.95.232.62";
const ICON_PATH = path.join(__dirname, "..", "assets", "icon.ico");

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
      startConnectionLoop();
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
  tray.setToolTip("HN Terminal");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show HN Terminal",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: "separator" },
      {
        label: "Reconnect",
        click: () => {
          if (ptyProcess) {
            ptyProcess.kill();
            ptyProcess = null;
          }
          mainWindow?.show();
          startConnectionLoop();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          if (ptyProcess) {
            ptyProcess.kill();
            ptyProcess = null;
          }
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

function checkTailscale() {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32"
        ? `ping -n 1 -w 1500 ${VPS_IP}`
        : `ping -c 1 -W 2 ${VPS_IP}`;
    exec(cmd, (error) => {
      resolve(!error);
    });
  });
}

async function startConnectionLoop() {
  const connected = await checkTailscale();
  if (mainWindow) {
    mainWindow.webContents.send("vpn-status", connected);
  }

  if (connected && !ptyProcess) {
    startSSH();
    return;
  }

  if (!connected) {
    if (connectCheckInterval) clearInterval(connectCheckInterval);
    connectCheckInterval = setInterval(async () => {
      const status = await checkTailscale();
      if (mainWindow) {
        mainWindow.webContents.send("vpn-status", status);
      }
      if (status && !ptyProcess) {
        clearInterval(connectCheckInterval);
        connectCheckInterval = null;
        startSSH();
      }
    }, 3000);
  }
}

function startSSH() {
  try {
    const pty = require("node-pty");
    const shell = process.platform === "win32" ? "ssh.exe" : "ssh";
    const args = [
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "ServerAliveInterval=30",
      "-o", "ConnectTimeout=10",
      `root@${VPS_IP}`,
    ];

    ptyProcess = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: os.homedir(),
      env: process.env,
    });

    ptyProcess.onData((data) => {
      if (mainWindow) {
        mainWindow.webContents.send("terminal-data", data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      ptyProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send("ssh-disconnected", exitCode);
        startConnectionLoop();
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

ipcMain.on("terminal-input", (_event, data) => {
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});

ipcMain.on("terminal-resize", (_event, { cols, rows }) => {
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows);
    } catch (_) {}
  }
});

ipcMain.on("reconnect", () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  startConnectionLoop();
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
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  mainWindow?.close();
});

app.whenReady().then(() => {
  createSplash();
  createWindow();
});

app.on("window-all-closed", () => {
  if (connectCheckInterval) clearInterval(connectCheckInterval);
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
});
