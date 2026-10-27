'use strict';
// HN Group apps on Linux (Bazzite, Fedora and other desktops) come as AppImages: one file that runs on its own.
// Identical copies in browser-app, windows-vpn-app and app-manager (src/appimage.cjs). This file:
//  - finds the AppImage the app is running from (the AppImage runtime names it in $APPIMAGE),
//  - checks a downloaded file really is an AppImage,
//  - swaps a verified update in for the running copy once the app has quit (same file name, so shortcuts keep
//    working; the old copy stays if anything fails) and opens it again,
//  - turns "open when I sign in" on and off with a desktop entry in ~/.config/autostart,
//  - adds the app to the desktop's app menu the first time it runs from an AppImage (integrate()).
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";

// The AppImage this app is running from, or an error that says why it can't update itself.
function currentAppImage(appName,env=process.env){
 const file=env.APPIMAGE;
 if(!file||!path.isAbsolute(file)||!/\.AppImage$/i.test(file)||!fs.existsSync(file))throw Error(appName+' isn’t running from its AppImage, so it can’t update itself. Download the update from downloads.hngroup.org.uk instead.');
 return file;
}
// An AppImage is an ELF program with "AI" and type 2 at byte 8.
function isAppImage(file){
 let fd;try{fd=fs.openSync(file,'r');const b=Buffer.alloc(11);if(fs.readSync(fd,b,0,11,0)<11)return false;return b.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46]))&&b[8]===0x41&&b[9]===0x49&&b[10]===2;}
 catch{return false;}finally{if(fd!==undefined)fs.closeSync(fd);}
}
// Waits for the app (pid) to quit, puts the new AppImage in place in one step and opens it again (with args).
function swapScript({pid,target,source,work,reopen=true,args=[]}){
 const staged=path.join(path.dirname(target),'.'+path.basename(target)+'.hn-update');
 return['#!/bin/sh',
  ...(pid?['for i in $(seq 1 240); do kill -0 '+Number(pid)+' 2>/dev/null || break; sleep 0.25; done']:[]),
  'if cp '+quote(source)+' '+quote(staged)+' && chmod 755 '+quote(staged)+' && mv -f '+quote(staged)+' '+quote(target)+'; then status=0; else rm -f '+quote(staged)+'; status=1; fi',
  ...(reopen?['unset APPIMAGE APPDIR ARGV0 OWD','nohup '+[target,...args].map(quote).join(' ')+' >/dev/null 2>&1 &']:[]),
  'rm -rf '+quote(work),'exit $status'].join('\n')+'\n';
}
// Swaps in a checked update after this app quits and reopens it. Returns straight away: the caller quits.
function installUpdate(file,{appName,pid=process.pid,env=process.env,reopen=true,args=[]}){
 const target=currentAppImage(appName,env);
 if(!isAppImage(file))throw Error('The update isn’t an AppImage, so it wasn’t installed.');
 try{fs.accessSync(path.dirname(target),fs.constants.W_OK);}catch{throw Error(appName+'’s folder can’t be changed, so it can’t update itself. Download the update from downloads.hngroup.org.uk instead.');}
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'hn-appimage-update-')),source=path.join(work,'update.AppImage'),script=path.join(work,'update.sh');
 fs.copyFileSync(file,source);fs.chmodSync(source,0o755);fs.writeFileSync(script,swapScript({pid,target,source,work,reopen,args}),{mode:0o700});
 const child=spawn('/bin/sh',[script],{detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
}
// ~/.config/autostart/<id>.desktop, which Linux desktops open when you sign in.
const autostartFile=(id,home=os.homedir(),config=process.env.XDG_CONFIG_HOME)=>path.join(config&&path.isAbsolute(config)?config:path.join(home,'.config'),'autostart',id+'.desktop');
const desktopQuote=value=>/^[A-Za-z0-9_./+-]+$/.test(value)?value:'"'+String(value).replace(/["`$\\]/g,c=>'\\'+c)+'"';
function setAutostart(enabled,{id,name,exec,args=[],comment='',icon='',home,config}){
 const file=autostartFile(id,home,config);
 if(!enabled){fs.rmSync(file,{force:true});return;}
 if(!exec||!path.isAbsolute(exec))throw Error(name+' can only open by itself when it runs from its AppImage.');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const entry=['[Desktop Entry]','Type=Application','Name='+name,...(comment?['Comment='+comment]:[]),'Exec='+[exec,...args].map(desktopQuote).join(' '),...(icon?['Icon='+icon]:[]),'Terminal=false','X-GNOME-Autostart-enabled=true','X-KDE-autostart-after=panel',''].join('\n');
 fs.writeFileSync(file+'.tmp',entry,{mode:0o644});fs.renameSync(file+'.tmp',file);
}
// The environment for desktop tools: the AppImage's own folders and libraries left out.
function hostEnv(env=process.env){const out={...env};for(const k of['APPIMAGE','APPDIR','ARGV0','OWD','LD_LIBRARY_PATH','GSETTINGS_SCHEMA_DIR','ELECTRON_RUN_AS_NODE','CHROME_DESKTOP'])delete out[k];if(env.APPDIR)out.PATH=String(env.PATH||'').split(':').filter(p=>!p.startsWith(env.APPDIR)).join(':');return out;}
// Puts the running AppImage in the app menu (~/.local/share/applications/<id>.desktop, with its icon), so an AppImage
// opened from Downloads shows up like any other app. An entry that already opens a copy that still exists is left alone
// (HN Group App Manager's, or one for a copy kept elsewhere). Returns true when it added or repaired the entry.
function integrate({id,name,comment='',categories='Utility;',args=[],icon,env=process.env,home=os.homedir()}){
 const file=env.APPIMAGE;if(!file||!path.isAbsolute(file)||!/\.AppImage$/i.test(file)||!fs.existsSync(file))return false;
 const data=env.XDG_DATA_HOME&&path.isAbsolute(env.XDG_DATA_HOME)?env.XDG_DATA_HOME:path.join(home,'.local','share'),entry=path.join(data,'applications',id+'.desktop');
 try{const old=fs.readFileSync(entry,'utf8'),m=/^TryExec=(.+)$/m.exec(old)||/^Exec="?([^"\s]+)/m.exec(old);if(m&&fs.existsSync(m[1].trim()))return false;}catch{}
 if(icon&&fs.existsSync(icon)){try{const dir=path.join(data,'icons','hicolor','256x256','apps');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id+'.png'),fs.readFileSync(icon));}catch{}}
 fs.mkdirSync(path.dirname(entry),{recursive:true});
 const lines=['[Desktop Entry]','Type=Application','Name='+name,...(comment?['Comment='+comment]:[]),'Exec='+[desktopQuote(file),...args].join(' '),'TryExec='+file,'Icon='+id,'Terminal=false','Categories='+categories,'StartupWMClass='+id,'X-HN-Group-App-Manager=true',''];
 fs.writeFileSync(entry+'.tmp',lines.join('\n'),{mode:0o644});fs.renameSync(entry+'.tmp',entry);
 // Tell the desktop (KDE keeps a menu cache; others read the desktop entry database).
 for(const[cmd,a]of[['update-desktop-database',[path.dirname(entry)]],['kbuildsycoca6',[]],['kbuildsycoca5',[]]]){const c=spawn(cmd,a,{detached:true,stdio:'ignore',env:hostEnv(env)});c.on('error',()=>{});c.unref();}
 return true;
}
function autostartEnabled(id,{home,config}={}){try{return fs.readFileSync(autostartFile(id,home,config),'utf8').includes('[Desktop Entry]');}catch{return false;}}
module.exports={currentAppImage,isAppImage,swapScript,installUpdate,setAutostart,autostartEnabled,autostartFile,desktopQuote,integrate,hostEnv};
