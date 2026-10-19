'use strict';
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('browser',Object.freeze({
 focusAddress:callback=>{const handler=()=>callback();ipcRenderer.on('browser:focus-address',handler);return()=>ipcRenderer.removeListener('browser:focus-address',handler);},
 suggestChosen:callback=>{const handler=()=>callback();ipcRenderer.on('browser:suggest-chosen',handler);return()=>ipcRenderer.removeListener('browser:suggest-chosen',handler);},
 focusFind:callback=>{const handler=()=>callback();ipcRenderer.on('browser:find',handler);return()=>ipcRenderer.removeListener('browser:find',handler);},
 state:()=>ipcRenderer.invoke('browser:state'),
 action:(action,data)=>ipcRenderer.invoke('browser:action',action,data),
 subscribe:callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('browser:changed',handler);return()=>ipcRenderer.removeListener('browser:changed',handler);}
}));
