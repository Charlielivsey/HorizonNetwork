'use strict';
// The only bridge between the window and the app: read the state, ask for an action, hear about changes.
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('secureNetwork',Object.freeze({
 state:()=>ipcRenderer.invoke('sn:state'),
 action:(name,data)=>ipcRenderer.invoke('sn:action',String(name),data),
 subscribe:fn=>{ipcRenderer.on('sn:state',(_e,state)=>fn(state));},
 onGo:fn=>{ipcRenderer.on('sn:go',(_e,page)=>fn(String(page)));},
 // SSH terminal output arrives in chunks; each is acknowledged once drawn, so a busy server can't flood the window.
 terminalData:fn=>{ipcRenderer.on('sn:ssh-data',(_e,event)=>fn(event));},
 terminalAck:(id,bytes)=>ipcRenderer.send('sn:ssh-ack',String(id),Number(bytes)),
}));
