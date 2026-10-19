'use strict';
// The address bar suggestions list (a trusted HN Browser page drawn above the website).
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('popup',Object.freeze({
 onItems:callback=>{const handler=(_e,data)=>callback(data);ipcRenderer.on('popup:items',handler);return()=>ipcRenderer.removeListener('popup:items',handler);},
 choose:index=>ipcRenderer.send('popup:choose',Number(index)),
}));
