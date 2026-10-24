'use strict';
// The "This device is not authorised" window's only bridge: read the status, check again, open
// devices.hngroup.org.uk, quit, and hear when the status changes.
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hnDevice',Object.freeze({
 state:()=>ipcRenderer.invoke('hn-device:state'),
 check:()=>ipcRenderer.invoke('hn-device:check'),
 open:()=>ipcRenderer.invoke('hn-device:open'),
 quit:()=>ipcRenderer.invoke('hn-device:quit'),
 onChange:fn=>{ipcRenderer.on('hn-device:changed',(_e,state)=>fn(state));},
}));
