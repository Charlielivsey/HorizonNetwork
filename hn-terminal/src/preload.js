const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload));

contextBridge.exposeInMainWorld("hn", {
  getState: () => ipcRenderer.invoke("get-state"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  saveTheme: (theme) => ipcRenderer.invoke("save-theme", theme),
  forgetHostKey: () => ipcRenderer.invoke("forget-host-key"),

  connect: (tabId, cols, rows) => ipcRenderer.send("ssh-connect", { tabId, cols, rows }),
  cancel: (tabId) => ipcRenderer.send("ssh-cancel", tabId),
  sendPassword: (tabId, password) => ipcRenderer.send("ssh-password", { tabId, password }),
  sendInput: (tabId, data) => ipcRenderer.send("ssh-input", { tabId, data }),
  resize: (tabId, cols, rows) => ipcRenderer.send("ssh-resize", { tabId, cols, rows }),
  disconnect: (tabId) => ipcRenderer.send("ssh-disconnect", tabId),
  onStatus: on("ssh-status"),
  onData: on("ssh-data"),

  sftpList: (tabId, path) => ipcRenderer.invoke("sftp-list", { tabId, path }),
  sftpRead: (tabId, path) => ipcRenderer.invoke("sftp-read", { tabId, path }),

  readClipboard: () => ipcRenderer.invoke("clipboard-read"),
  writeClipboard: (text) => ipcRenderer.send("clipboard-write", text),
  openExternal: (url) => ipcRenderer.send("open-external", url),

  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  onWindowState: on("window-state"),
});
