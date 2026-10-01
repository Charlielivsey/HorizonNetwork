const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { Client } = require("ssh2");
const fs = require("fs");
const os = require("os");

let splashWindow;
let mainWindow;
let tray = null;
let sshClient = null;
let sshStream = null;
let connectCheckInterval = null;

const VPS_IP = "100.95.232.62";
const SSH_USER = "root";
const ICON_PATH = path.join(__dirname, "..", "assets", "icon.ico");

function getSSHKeyPath() {
  const home = os.homedir();
  const keys = ["id_ed25519", "id_rsa", "id_ecdsa"];
  for (const k of keys) {
    const p = path.join(home, ".ssh", k);
    if (fs.existsSync(p)) return p;
  }
  return null;
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
          disconnectSSH();
          mainWindow?.show();
          startConnectionLoop();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          disconnectSSH();
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

  if (connected && !sshClient) {
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
      if (status && !sshClient) {
        clearInterval(connectCheckInterval);
        connectCheckInterval = null;
        startSSH();
      }
    }, 3000);
  }
}

function disconnectSSH() {
  if (sshStream) {
    sshStream.close();
    sshStream = null;
  }
  if (sshClient) {
    sshClient.end();
    sshClient = null;
  }
}

function startSSH() {
  const keyPath = getSSHKeyPath();
  if (!keyPath) {
    if (mainWindow) {
      mainWindow.webContents.send(
        "ssh-error",
        "No SSH key found in ~/.ssh (tried id_ed25519, id_rsa, id_ecdsa). Add a key or enable Tailscale SSH on the VPS."
      );
    }
    return;
  }

  const conn = new Client();
  sshClient = conn;

  conn.on("ready", () => {
    if (mainWindow) {
      mainWindow.webContents.send("ssh-connected");
    }

    conn.shell(
      {
        term: "xterm-256color",
        cols: 120,
        rows: 30,
      },
      (err, stream) => {
        if (err) {
          if (mainWindow) mainWindow.webContents.send("ssh-error", err.message);
          return;
        }

        sshStream = stream;

        stream.on("data", (data) => {
          if (mainWindow) {
            mainWindow.webContents.send("terminal-data", data.toString("utf-8"));
          }
        });

        stream.stderr.on("data", (data) => {
          if (mainWindow) {
            mainWindow.webContents.send("terminal-data", data.toString("utf-8"));
          }
        });

        stream.on("close", () => {
          sshStream = null;
          disconnectSSH();
          if (mainWindow) {
            mainWindow.webContents.send("ssh-disconnected", 0);
            startConnectionLoop();
          }
        });
      }
    );
  });

  conn.on("error", (err) => {
    sshClient = null;
    if (mainWindow) {
      mainWindow.webContents.send("ssh-error", err.message);
      startConnectionLoop();
    }
  });

  conn.on("close", () => {
    sshClient = null;
    sshStream = null;
  });

  conn.connect({
    host: VPS_IP,
    port: 22,
    username: SSH_USER,
    privateKey: fs.readFileSync(keyPath),
    readyTimeout: 10000,
    keepaliveInterval: 30000,
    keepaliveCountMax: 3,
  });
}

ipcMain.on("terminal-input", (_event, data) => {
  if (sshStream) {
    sshStream.write(data);
  }
});

ipcMain.on("terminal-resize", (_event, { cols, rows }) => {
  if (sshStream) {
    sshStream.setWindow(rows, cols, 0, 0);
  }
});

ipcMain.on("reconnect", () => {
  disconnectSSH();
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
  disconnectSSH();
  mainWindow?.close();
});

app.whenReady().then(() => {
  createSplash();
  createWindow();
});

app.on("window-all-closed", () => {
  if (connectCheckInterval) clearInterval(connectCheckInterval);
  disconnectSSH();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
});
