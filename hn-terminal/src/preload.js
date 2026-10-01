const { contextBridge, ipcRenderer, webUtils } = require("electron");

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
  sftpDownload: (tabId, path) => ipcRenderer.invoke("sftp-download", { tabId, path }),
  sftpUpload: (tabId, remoteDir) => ipcRenderer.invoke("sftp-upload", { tabId, remoteDir }),
  sftpUploadBuffer: (tabId, remoteDir, fileName, buffer) => ipcRenderer.invoke("sftp-upload-buffer", { tabId, remoteDir, fileName, buffer }),
  sftpDelete: (tabId, path, isDir) => ipcRenderer.invoke("sftp-delete", { tabId, path, isDir }),
  sftpRename: (tabId, oldPath, newPath) => ipcRenderer.invoke("sftp-rename", { tabId, oldPath, newPath }),
  sftpMkdir: (tabId, path) => ipcRenderer.invoke("sftp-mkdir", { tabId, path }),
  sftpChmod: (tabId, path, mode) => ipcRenderer.invoke("sftp-chmod", { tabId, path, mode }),
  getFilePath: (file) => webUtils.getPathForFile(file),

  login: (username, password) => ipcRenderer.invoke("login", { username, password }),
  getUsers: () => ipcRenderer.invoke("get-users"),
  addUser: (username, password, isAdmin) => ipcRenderer.invoke("add-user", { username, password, isAdmin }),
  deleteUser: (username) => ipcRenderer.invoke("delete-user", { username }),
  toggleAdmin: (username) => ipcRenderer.invoke("toggle-admin", { username }),
  syncTheme: (theme) => ipcRenderer.invoke("sync-theme", theme),
  saveUserTheme: (username, theme) => ipcRenderer.invoke("save-user-theme", { username, theme }),

  readClipboard: () => ipcRenderer.invoke("clipboard-read"),
  writeClipboard: (text) => ipcRenderer.send("clipboard-write", text),
  openExternal: (url) => ipcRenderer.send("open-external", url),

  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  onWindowState: on("window-state"),
});
