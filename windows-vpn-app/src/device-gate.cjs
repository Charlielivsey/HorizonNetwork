'use strict';
// "This device is not authorised": a window of its own, shown by HN Browser and HN Secure Network for Windows
// instead of the app until devices.hngroup.org.uk has approved this computer (identical copies in each app's
// src/device-gate.cjs, with ui/device.html, ui/device.js, ui/device.css and src/device-preload.cjs). It shows the
// code to add the computer with, opens devices.hngroup.org.uk, and checks again by itself every 15 seconds.
const path=require('node:path'),{pathToFileURL}=require('node:url');
function createDeviceGate({device,appName,electron,uiDir,preloadDir,icon=null,every=15000}){
 const{BrowserWindow,ipcMain,shell,app,nativeTheme}=electron,page=pathToFileURL(path.join(uiDir,'device.html')).href;
 let win=null,waiting=[],timer=null;
 const send=()=>{if(win&&!win.isDestroyed())win.webContents.send('hn-device:changed',{...device.state(),appName});};
 const ours=event=>win&&event.sender===win.webContents&&event.senderFrame?.url===page;
 const refresh=async()=>{const s=await device.check();send();if(s.allowed)release();return s;};
 function release(){clearInterval(timer);timer=null;const done=waiting;waiting=[];if(win&&!win.isDestroyed()){const w=win;win=null;setTimeout(()=>w.destroy(),900);}for(const resolve of done)resolve();}
 ipcMain.handle('hn-device:state',event=>ours(event)?{...device.state(),appName}:null);
 ipcMain.handle('hn-device:check',async event=>ours(event)?{...await refresh(),appName}:null);
 ipcMain.handle('hn-device:open',event=>{if(!ours(event))return;const url=device.state().linkUrl;if(typeof url==='string'&&url.startsWith(device.origin+'/'))shell.openExternal(url);});
 ipcMain.handle('hn-device:quit',event=>{if(ours(event))app.quit();});
 // Resolves once this computer is approved. The app shows itself only after that.
 function open(){
  return new Promise(resolve=>{
   waiting.push(resolve);
   if(!win||win.isDestroyed()){
    win=new BrowserWindow({width:560,height:640,minWidth:480,minHeight:560,resizable:true,show:false,title:appName+' · This device is not authorised',icon:icon||undefined,
     backgroundColor:nativeTheme.shouldUseDarkColors?'#0E1020':'#F6F4FA',autoHideMenuBar:true,...(process.platform==='darwin'?{titleBarStyle:'hiddenInset'}:{}),
     webPreferences:{preload:path.join(preloadDir,'device-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false,backgroundThrottling:false}});
    win.removeMenu();win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.loadURL(page);win.once('ready-to-show',()=>{win.show();win.focus();});
    win.on('closed',()=>{if(waiting.length){win=null;app.quit();}});
   }else{win.show();win.focus();}
   clearInterval(timer);timer=setInterval(()=>refresh().catch(()=>{}),every);timer.unref?.();
   refresh().catch(()=>{});
  });}
 // Before the app shows anything: straight on if the last answer still trusts this computer (checked again in
 // the background) or a check now approves it, otherwise the "not authorised" window until it's approved.
 async function ensure(){const s=device.state();if(s.allowed){device.check().catch(()=>{});return;}if((await device.check()).allowed)return;await open();}
 // While the app is open: checks every few hours; if the computer has been revoked (a definite answer, not just
 // being offline), onBlocked hides the app, and onAllowed brings it back once it's approved again.
 function watch({onBlocked,onAllowed,interval=3*3600000}){const t=setInterval(async()=>{const s=await device.check();if(!s.allowed&&s.checked){onBlocked?.();await open();onAllowed?.();}},interval);t.unref?.();return t;}
 return{open,ensure,watch,get window(){return win;}};
}
module.exports={createDeviceGate};
