const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const { exec, spawn } = require("child_process");
const os = require("os");

let splashWindow;
let mainWindow;
let tray = null;
let sshProcess = null;
let connectCheckInterval = null;

const VPS_IP = "100.95.232.62";
const SSH_USER = "root";
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
  tray.setToolTip("HN Secure Enclave");
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

function checkTailscale() {
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
  const connected = await checkTailscale();
  if (mainWindow) {
    mainWindow.webContents.send("vpn-status", connected);
  }

  if (connected && !sshProcess) {
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
      const text = data.toString("utf-8");
      if (mainWindow) {
        mainWindow.webContents.send("terminal-data", text);
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

ipcMain.on("terminal-input", (_event, data) => {
  if (sshProcess && sshProcess.stdin.writable) {
    sshProcess.stdin.write(data);
  }
});

ipcMain.on("terminal-resize", (_event, { cols, rows }) => {
  // resize is handled by the terminal emulator on the VPS side
});

ipcMain.on("reconnect", () => {
  killSSH();
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
