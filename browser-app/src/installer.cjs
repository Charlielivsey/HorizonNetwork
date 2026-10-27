'use strict';
// Installs a verified update in place, like HN Secure Network: on a Mac the new app (from the release's
// zip) is checked and swapped in for this one after HN Browser closes, then reopened; on Windows the
// installer runs silently and reopens HN Browser; on Linux the new AppImage replaces this one (same file
// name, so shortcuts keep working) after HN Browser closes, then opens. Browser data is kept either way.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFile,spawn}=require('node:child_process');
const BUNDLE_ID='uk.org.hngroup.browser';
const run=(file,args)=>new Promise(resolve=>execFile(file,args,{timeout:120000},(error,stdout,stderr)=>resolve({code:error?(typeof error.code==='number'?error.code:-1):0,out:String(stdout||'').trim(),err:String(stderr||'').trim()})));
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
// This running app's bundle (…/HN Browser.app), from its executable.
function currentBundle(exe=process.execPath){const bundle=path.resolve(exe,'..','..','..');if(!bundle.endsWith('.app'))throw Error('HN Browser isn’t running from an app, so it can’t update itself. Download the update from downloads.hngroup.org.uk instead.');return bundle;}
// Unpacks the zip and checks it is HN Browser at the expected version with an intact signature.
async function prepareMac(zip,expectedVersion){
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'hn-browser-update-'));
 try{
  if((await run('/usr/bin/ditto',['-x','-k',zip,work])).code!==0)throw Error('The update couldn’t be unpacked.');
  const name=fs.readdirSync(work).find(f=>f.endsWith('.app'));if(!name)throw Error('The update doesn’t contain HN Browser.');
  const app=path.join(work,name),plist=path.join(app,'Contents','Info.plist');
  const id=(await run('/usr/bin/plutil',['-extract','CFBundleIdentifier','raw','-o','-',plist])).out,v=(await run('/usr/bin/plutil',['-extract','CFBundleShortVersionString','raw','-o','-',plist])).out;
  if(id!==BUNDLE_ID)throw Error('The update isn’t HN Browser, so it wasn’t installed.');
  if(v!==String(expectedVersion).split('-')[0])throw Error('The update is a different version than expected, so it wasn’t installed.');
  if((await run('/usr/bin/codesign',['--verify','--deep',app])).code!==0)throw Error('The update’s signature didn’t check out, so it wasn’t installed.');
  await run('/usr/bin/xattr',['-dr','com.apple.quarantine',app]);
  return{work,app};
 }catch(e){fs.rmSync(work,{recursive:true,force:true});throw e;}
}
// The script that waits for HN Browser to close, swaps the app and reopens it. If the app's folder needs
// an administrator (such as /Applications on a shared Mac), macOS asks once.
function swapScript({pid,bundle,app,work}){
 const swap='rm -rf '+quote(bundle+'.old')+' && mv '+quote(bundle)+' '+quote(bundle+'.old')+' && mv '+quote(app)+' '+quote(bundle)+' && rm -rf '+quote(bundle+'.old');
 const admin='do shell script "'+swap.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'" with prompt "HN Browser needs your password to finish updating." with administrator privileges';
 return['#!/bin/bash','for i in $(seq 1 120); do kill -0 '+Number(pid)+' 2>/dev/null || break; sleep 0.5; done',
  'if [ -w '+quote(path.dirname(bundle))+' ] && [ -w '+quote(bundle)+' ]; then '+swap+'; else /usr/bin/osascript -e '+quote(admin)+'; fi',
  '/usr/bin/open '+quote(bundle),'rm -rf '+quote(work),'rm -f "$0"'].join('\n')+'\n';
}
async function installMac(zip,expectedVersion,{pid=process.pid,exe=process.execPath}={}){
 const bundle=currentBundle(exe),{work,app}=await prepareMac(zip,expectedVersion);
 const script=path.join(work,'..','hn-browser-update-'+process.pid+'.sh');fs.writeFileSync(script,swapScript({pid,bundle,app,work}),{mode:0o700});
 spawn('/bin/bash',[script],{detached:true,stdio:'ignore'}).unref();
}
function installWindows(exe){spawn(exe,['/S','--force-run'],{detached:true,stdio:'ignore',windowsHide:true}).unref();}
// Linux: the shared AppImage swap (src/appimage.cjs).
const appimage=require('./appimage.cjs');
async function installLinux(file,{pid=process.pid,env=process.env}={}){appimage.installUpdate(file,{appName:'HN Browser',pid,env});}
module.exports={installMac,installWindows,installLinux,swapScript,currentBundle,BUNDLE_ID};
