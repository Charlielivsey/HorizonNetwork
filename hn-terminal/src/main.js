const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { exec, spawn } = require("child_process");
const os = require("os");

let mainWindow;
let ptyProcess = null;
let connectCheckInterval = null;

const VPS_IP = "100.95.232.62";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: "#0c0c0c",
    frame: false,
    titleBarStyle: "hidden",
    icon: path.join(__dirname, "..", "assets", "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function checkTailscale() {
  return new Promise((resolve) => {
    exec(`ping -n 1 -w 1500 ${VPS_IP}`, (error) => {
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
  createWindow();
  startConnectionLoop();
});

app.on("window-all-closed", () => {
  if (connectCheckInterval) clearInterval(connectCheckInterval);
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  app.quit();
});
