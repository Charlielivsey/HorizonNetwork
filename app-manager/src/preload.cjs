'use strict';
// The window's only bridge to App Manager: a fixed list of requests, the state, page changes and questions.
const{contextBridge,ipcRenderer}=require('electron');
const REQUESTS=['state','sign-in','sign-in-cancel','unlock','lock','sign-out','manager-check','move-to-applications','check','enqueue','update-all','cancel','open','reveal','settings','save','preference','clear-activity','manager-update','website','dialog-answer'];
const listen=(channel,callback)=>{const handler=(_event,value)=>callback(value);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);};
contextBridge.exposeInMainWorld('manager',Object.freeze({
 call:(method,...args)=>{if(!REQUESTS.includes(method))throw Error('Unknown request.');return ipcRenderer.invoke('manager:'+method,...args);},
 onState:callback=>listen('manager:state',callback),
 onNavigate:callback=>listen('manager:navigate',page=>callback(String(page))),
 onDialog:(open,close)=>{listen('manager:dialog',open);listen('manager:dialog-close',id=>close(String(id)));},
}));
