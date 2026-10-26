'use strict';
// The window's only bridge to App Manager: one request call (the main process checks each request and who sent it),
// the state, page changes and questions. No Node access and no tokens reach the window.
const { contextBridge, ipcRenderer } = require('electron');
const listen = (channel, fn) => { const h = (_e, v) => fn(v); ipcRenderer.on(channel, h); return () => ipcRenderer.removeListener(channel, h); };
contextBridge.exposeInMainWorld('manager', Object.freeze({
  call: (method, ...args) => ipcRenderer.invoke('am:call', String(method), ...args),
  onState: (fn) => listen('am:state', fn),
  onGo: (fn) => listen('am:go', (p) => fn(String(p))),
  onDialog: (open, close) => { listen('am:dialog', open); listen('am:dialog-close', (id) => close(String(id))); },
}));
