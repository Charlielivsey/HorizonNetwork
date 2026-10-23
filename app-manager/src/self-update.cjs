'use strict';
// App Manager updates itself in place from the same verified downloads as the apps it manages. On Windows the
// verified installer runs silently and reopens it; on a Mac the checked app is staged next to this one and a
// small script swaps them once App Manager has quit, then reopens it (putting the old one back if the swap fails).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const{verified}=require('./releases.cjs'),{run,sq}=require('./system.cjs');
const BUNDLE='uk.org.hngroup.appmanager';
// The .app that contains this executable (…/HN Group App Manager.app/Contents/MacOS/HN Group App Manager).
function bundleOf(exe){const bundle=path.posix.resolve(exe,'..','..','..');return bundle.endsWith('.app')?bundle:null;}
function swapScript(pid,bundle,staged){const backup=bundle+'.manager-old-'+crypto.randomUUID();
 return['while /bin/kill -0 '+Number(pid)+' 2>/dev/null; do /bin/sleep 0.2; done',
  'if /bin/mv '+sq(bundle)+' '+sq(backup)+'; then if /bin/mv '+sq(staged)+' '+sq(bundle)+'; then /bin/rm -rf '+sq(backup)+'; else /bin/mv '+sq(backup)+' '+sq(bundle)+'; /bin/rm -rf '+sq(staged)+'; fi; fi',
  '/usr/bin/open '+sq(bundle)].join('\n');}
async function installSelf({file,release,platform=process.platform,exe=process.execPath,pid=process.pid,system,launch=spawn,quit}){
 await verified(file,release);
 if(platform==='win32'){const child=launch(file,['/S','--force-run'],{detached:true,stdio:'ignore',windowsHide:true});child.on?.('error',()=>{});child.unref?.();quit();return;}
 if(platform!=='darwin')throw Error('App Manager can update itself on macOS and Windows.');
 const bundle=bundleOf(exe);if(!bundle)throw Error('App Manager isn’t running from an app bundle, so it can’t update itself.');
 const{dir,source}=await system.unpackMac(file,BUNDLE,release.version);
 const staged=path.join(path.dirname(bundle),'.hn-manager-self-'+crypto.randomUUID()+'.app');
 try{await run('/usr/bin/ditto',[source,staged],{timeout:180000});}
 catch{await fs.promises.rm(staged,{recursive:true,force:true}).catch(()=>{});throw Error('App Manager’s folder can’t be changed from here. Download the update from downloads.hngroup.org.uk instead.');}
 finally{await fs.promises.rm(dir,{recursive:true,force:true});}
 const child=launch('/bin/sh',['-c',swapScript(pid,bundle,staged)],{detached:true,stdio:'ignore'});child.on?.('error',()=>{});child.unref?.();quit();}
module.exports={installSelf,bundleOf,swapScript,BUNDLE};
