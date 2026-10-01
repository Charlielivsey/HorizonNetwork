const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hn", {
  onTerminalData: (cb) => ipcRenderer.on("terminal-data", (_e, data) => cb(data)),
  onVpnStatus: (cb) => ipcRenderer.on("vpn-status", (_e, status) => cb(status)),
  onSshConnected: (cb) => ipcRenderer.on("ssh-connected", () => cb()),
  onSshDisconnected: (cb) => ipcRenderer.on("ssh-disconnected", (_e, code) => cb(code)),
  onSshError: (cb) => ipcRenderer.on("ssh-error", (_e, msg) => cb(msg)),
  sendInput: (data) => ipcRenderer.send("terminal-input", data),
  resize: (cols, rows) => ipcRenderer.send("terminal-resize", { cols, rows }),
  reconnect: () => ipcRenderer.send("reconnect"),
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
});
