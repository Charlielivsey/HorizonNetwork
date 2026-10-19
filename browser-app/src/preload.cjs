'use strict';
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('browser',Object.freeze({
 appearance:callback=>{const handler=(_event,data)=>callback(data);ipcRenderer.on('browser:appearance',handler);return()=>ipcRenderer.removeListener('browser:appearance',handler);},
 terminalData:callback=>{const handler=(_event,data)=>callback(data);ipcRenderer.on('browser:ssh-data',handler);return()=>ipcRenderer.removeListener('browser:ssh-data',handler);},
 terminalAck:(id,bytes)=>ipcRenderer.send('browser:ssh-ack',String(id),Number(bytes)),
 focusAddress:callback=>{const handler=()=>callback();ipcRenderer.on('browser:focus-address',handler);return()=>ipcRenderer.removeListener('browser:focus-address',handler);},
 suggestChosen:callback=>{const handler=()=>callback();ipcRenderer.on('browser:suggest-chosen',handler);return()=>ipcRenderer.removeListener('browser:suggest-chosen',handler);},
 focusFind:callback=>{const handler=()=>callback();ipcRenderer.on('browser:find',handler);return()=>ipcRenderer.removeListener('browser:find',handler);},
 state:()=>ipcRenderer.invoke('browser:state'),
 action:(action,data)=>ipcRenderer.invoke('browser:action',action,data),
 subscribe:callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('browser:changed',handler);return()=>ipcRenderer.removeListener('browser:changed',handler);}
}));
