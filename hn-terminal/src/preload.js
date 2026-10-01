const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hn", {
  onTerminalData: (cb) => ipcRenderer.on("terminal-data", (_e, data) => cb(data)),
  onConnectionStatus: (cb) => ipcRenderer.on("connection-status", (_e, status) => cb(status)),
  onSshConnected: (cb) => ipcRenderer.on("ssh-connected", () => cb()),
  onSshDisconnected: (cb) => ipcRenderer.on("ssh-disconnected", (_e, code) => cb(code)),
  onSshError: (cb) => ipcRenderer.on("ssh-error", (_e, msg) => cb(msg)),
  onAppVersion: (cb) => ipcRenderer.on("app-version", (_e, version) => cb(version)),
  onUpdateAvailable: (cb) => ipcRenderer.on("update-available", (_e, version) => cb(version)),
  onVpsIp: (cb) => ipcRenderer.on("vps-ip", (_e, ip) => cb(ip)),
  sendInput: (data) => ipcRenderer.send("terminal-input", data),
  resize: (cols, rows) => ipcRenderer.send("terminal-resize", { cols, rows }),
  reconnect: () => ipcRenderer.send("reconnect"),
  checkUpdates: () => ipcRenderer.send("check-updates"),
  setVpsIp: (ip) => ipcRenderer.send("set-vps-ip", ip),
  getVpsIp: () => ipcRenderer.invoke("get-vps-ip"),
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
});
