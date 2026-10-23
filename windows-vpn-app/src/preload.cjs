'use strict';
// The only bridge between the window and the app: read the state, ask for an action, hear about changes,
// and answer the questions the app asks (shown in the window in the HN Group design).
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('secureNetwork',Object.freeze({
 state:()=>ipcRenderer.invoke('sn:state'),
 action:(name,data)=>ipcRenderer.invoke('sn:action',String(name),data),
 subscribe:fn=>{ipcRenderer.on('sn:state',(_e,state)=>fn(state));},
 onGo:fn=>{ipcRenderer.on('sn:go',(_e,target)=>fn(target&&typeof target==='object'?{page:String(target.page),connect:!!target.connect}:{page:String(target)}));},
 onDialog:(open,close)=>{ipcRenderer.on('sn:dialog',(_e,spec)=>open(spec));ipcRenderer.on('sn:dialog-close',(_e,id)=>close(String(id)));},
}));
