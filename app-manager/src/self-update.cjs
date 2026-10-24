'use strict';
// App Manager updates itself in place from the same verified downloads as the apps it manages, so it never has to
// be downloaded again by hand. On Windows the verified installer runs silently and reopens it. On a Mac the checked
// app is unpacked into a private folder, and once App Manager has quit a small script copies it next to the
// installed copy, swaps them (putting the old one back if anything fails) and reopens it. If that folder needs an
// administrator, macOS asks once. A copy running from the downloaded disk image or from Downloads (which macOS
// runs from a read-only "translocated" place) is installed into Applications instead, which is also how
// "Move to Applications" works.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const{verified}=require('./releases.cjs'),{run,sq}=require('./system.cjs');
const BUNDLE='uk.org.hngroup.appmanager',NAME='HN Group App Manager.app',APPLICATIONS='/Applications';
// The .app that contains this executable (…/HN Group App Manager.app/Contents/MacOS/HN Group App Manager).
function bundleOf(exe){const bundle=path.posix.resolve(exe,'..','..','..');return bundle.endsWith('.app')?bundle:null;}
// Running from somewhere it can't stay: the disk image, or Downloads (translocated by macOS).
const temporary=bundle=>bundle.includes('/AppTranslocation/')||bundle.startsWith('/Volumes/')||bundle.startsWith('/private/var/folders/');
const inApplications=bundle=>[APPLICATIONS,path.posix.join(os.homedir(),'Applications')].includes(path.posix.dirname(bundle));
// Where the new copy goes: in place, unless this copy is only temporary.
function targetOf(bundle){return temporary(bundle)?path.posix.join(APPLICATIONS,NAME):bundle;}
// The two scripts: swap.sh does the copy and swap (run as an administrator only when the folder needs it);
// the other waits for App Manager to quit, runs it, and reopens App Manager (the old copy if the swap failed).
function scripts({pid,source,target,fallback,work}){
 const id=crypto.randomUUID(),dir=path.posix.dirname(target),staged=path.posix.join(dir,'.hn-manager-'+id+'.app'),backup=target+'.manager-old-'+id;
 const swap=['#!/bin/bash','set -u',
  '/usr/bin/ditto '+sq(source)+' '+sq(staged)+' || { /bin/rm -rf '+sq(staged)+'; exit 1; }',
  'if [ -e '+sq(target)+' ]; then /bin/mv '+sq(target)+' '+sq(backup)+' || { /bin/rm -rf '+sq(staged)+'; exit 1; }; fi',
  'if /bin/mv '+sq(staged)+' '+sq(target)+'; then /bin/rm -rf '+sq(backup)+'; else [ -e '+sq(backup)+' ] && /bin/mv '+sq(backup)+' '+sq(target)+'; /bin/rm -rf '+sq(staged)+'; exit 1; fi',
  '/usr/bin/xattr -dr com.apple.quarantine '+sq(target)+' 2>/dev/null','exit 0'].join('\n')+'\n';
 const admin='do shell script "/bin/bash '+sq(path.posix.join(work,'swap.sh')).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'" with prompt "HN Group App Manager needs your password to finish updating." with administrator privileges';
 const main=['#!/bin/bash','for i in $(seq 1 240); do /bin/kill -0 '+Number(pid)+' 2>/dev/null || break; /bin/sleep 0.25; done',
  'if [ -w '+sq(dir)+' ] && { [ ! -e '+sq(target)+' ] || [ -w '+sq(target)+' ]; }; then /bin/bash '+sq(path.posix.join(work,'swap.sh'))+'; else /usr/bin/osascript -e '+sq(admin)+'; fi',
  'if [ -d '+sq(target)+' ]; then /usr/bin/open '+sq(target)+'; else /usr/bin/open '+sq(fallback)+'; fi',
  '/bin/rm -rf '+sq(work)].join('\n')+'\n';
 return{swap,main};}
function launchScripts({pid,source,target,fallback,work,launch=spawn}){const{swap,main}=scripts({pid,source,target,fallback,work});
 fs.writeFileSync(path.join(work,'swap.sh'),swap,{mode:0o700});fs.writeFileSync(path.join(work,'update.sh'),main,{mode:0o700});
 const child=launch('/bin/bash',[path.join(work,'update.sh')],{detached:true,stdio:'ignore'});child.on?.('error',()=>{});child.unref?.();}
async function installSelf({file,release,platform=process.platform,exe=process.execPath,pid=process.pid,system,launch=spawn,quit}){
 await verified(file,release);
 if(platform==='win32'){const child=launch(file,['/S','--force-run'],{detached:true,stdio:'ignore',windowsHide:true});child.on?.('error',()=>{});child.unref?.();quit();return;}
 if(platform!=='darwin')throw Error('App Manager can update itself on macOS and Windows.');
 const bundle=bundleOf(exe);if(!bundle)throw Error('App Manager isn’t running from an app, so it can’t update itself.');
 const{dir,source}=await system.unpackMac(file,BUNDLE,release.version);
 try{await run('/usr/bin/xattr',['-dr','com.apple.quarantine',source]).catch(()=>{});launchScripts({pid,source,target:targetOf(bundle),fallback:bundle,work:dir,launch});}
 catch(e){await fs.promises.rm(dir,{recursive:true,force:true}).catch(()=>{});throw e;}
 quit();}
// "Move to Applications": copies this running copy into Applications and reopens it from there.
async function moveToApplications({exe=process.execPath,pid=process.pid,launch=spawn,quit}){
 const bundle=bundleOf(exe);if(!bundle)throw Error('App Manager isn’t running from an app.');
 const work=await fs.promises.mkdtemp(path.join(os.tmpdir(),'hn-app-manager-move-'));
 launchScripts({pid,source:bundle,target:path.posix.join(APPLICATIONS,NAME),fallback:bundle,work,launch});quit();}
module.exports={installSelf,moveToApplications,bundleOf,targetOf,temporary,inApplications,scripts,BUNDLE};
