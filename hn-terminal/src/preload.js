const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload));

contextBridge.exposeInMainWorld("hn", {
  getState: () => ipcRenderer.invoke("get-state"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  forgetHostKey: () => ipcRenderer.invoke("forget-host-key"),

  connect: (cols, rows) => ipcRenderer.send("ssh-connect", { cols, rows }),
  cancel: () => ipcRenderer.send("ssh-cancel"),
  sendPassword: (password) => ipcRenderer.send("ssh-password", password),
  sendInput: (data) => ipcRenderer.send("ssh-input", data),
  resize: (cols, rows) => ipcRenderer.send("ssh-resize", { cols, rows }),
  onStatus: on("ssh-status"),
  onData: on("ssh-data"),

  readClipboard: () => ipcRenderer.invoke("clipboard-read"),
  writeClipboard: (text) => ipcRenderer.send("clipboard-write", text),
  openExternal: (url) => ipcRenderer.send("open-external", url),

  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  onWindowState: on("window-state"),
});
