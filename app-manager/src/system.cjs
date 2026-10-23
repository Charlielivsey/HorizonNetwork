'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),{entry,profileFile}=require('./catalog.cjs'),settings=require('./settings.cjs'),{verified,newer}=require('./releases.cjs');
const sq=s=>"'"+s.replaceAll("'","'\\''")+"'",psq=s=>"'"+s.replaceAll("'","''")+"'";
const within=(root,file)=>{const p=path.relative(root,file);return p!==''&&!p.startsWith('..'+path.sep)&&p!=='..'&&!path.isAbsolute(p);};
async function run(file,args,options={}){return(await exec(file,args,{timeout:30000,maxBuffer:16*1024*1024,windowsHide:true,...options})).stdout.trim();}
async function ps(script){return run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script]);}
function uninstallPath(command,dir){if(typeof command!=='string')throw Error('No registered uninstaller was found.');const match=/^"([^"]+\.exe)"(?:\s|$)/i.exec(command)||/^([^"\r\n]+\.exe)(?:\s|$)/i.exec(command);const exe=match?.[1];if(!exe||!path.win32.isAbsolute(exe)||!/^Uninstall[^\\/]*\.exe$/i.test(path.win32.basename(exe))||path.win32.dirname(exe).toLowerCase()!==path.win32.resolve(dir).toLowerCase())throw Error('The registered uninstaller is not inside this app. Use Windows Installed apps to remove it.');return exe;}
class System{
 constructor({platform=process.platform,arch=process.arch,home=os.homedir(),roaming=process.env.APPDATA}={}){this.platform=platform;this.arch=arch;this.home=home;this.roaming=roaming;}
 get supported(){return this.platform==='darwin'||this.platform==='win32'&&this.arch==='x64';}
 async detect(id){const a=entry(id);if(!this.supported)return null;
  if(this.platform==='darwin'){
   const roots=[path.join(this.home,'Applications'),'/Applications'];
   for(const root of roots){let files=[];try{files=await fs.promises.readdir(root);}catch{}for(const name of files.filter(n=>n.endsWith('.app')&&(n===a.app||id==='network'&&n==='HN Group VPN.app'))){const bundle=path.join(root,name);try{const info=JSON.parse(await run('/usr/bin/plutil',['-convert','json','-o','-',path.join(bundle,'Contents','Info.plist')]));if(info.CFBundleIdentifier!==a.bundle)continue;return{path:bundle,version:String(info.CFBundleShortVersionString),build:Number(info.CFBundleVersion)||0,exe:path.join(bundle,'Contents','MacOS',info.CFBundleExecutable)};}catch{}}}return null;
  }
  const script="$ErrorActionPreference='Stop'; $items=@(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq "+psq(a.name)+" }); ConvertTo-Json -Compress -InputObject $items";
  const raw=await ps(script),items=raw?JSON.parse(raw):[];
  for(const v of(Array.isArray(items)?items:[items])){const dir=typeof v.InstallLocation==='string'?v.InstallLocation.replace(/^"|"$/g,''):'';if(!path.win32.isAbsolute(dir))continue;const exe=path.win32.join(dir,a.exe);if(!fs.existsSync(exe))continue;let uninstall=null;try{uninstall=uninstallPath(v.UninstallString||v.QuietUninstallString,dir);}catch{}let build=0,version=String(v.DisplayVersion||'Unknown');try{const pkg=JSON.parse(fs.readFileSync(path.join(dir,'resources','app.asar','package.json'),'utf8'));if(/^\d+\.\d+\.\d+$/.test(pkg.version))version=pkg.version;build=Number(JSON.parse(fs.readFileSync(path.join(dir,'resources','app.asar','src','build.json'),'utf8')).build)||0;}catch{}return{path:dir,exe,version,build,uninstall};}return null;
 }
 async running(installed){if(!installed)return false;
  if(this.platform==='darwin'){const list=await run('/bin/ps',['-axo','comm=']);return list.split('\n').some(p=>p.trim()===installed.exe||p.trim().startsWith(installed.path+'/Contents/'));}
  const script="$ErrorActionPreference='Stop'; $root="+psq(installed.path+'\\')+"; @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root,[System.StringComparison]::OrdinalIgnoreCase) }).Count";return Number(await ps(script))>0;
 }
 async idle(id){const installed=await this.detect(id);if(installed&&await this.running(installed))throw Error('Quit '+entry(id).name+' first, including its menu bar or system tray icon, then try again.');return installed;}
 async preferences(id){const file=profileFile(id,this.platform,this.home,this.roaming);let saved={},spec={...settings.schema(id,this.platform)};if(file)saved=await settings.readJSON(file);else{try{saved.sshUser=await run('/usr/bin/defaults',['read',entry(id).bundle,'sshUser']);}catch{}const installed=await this.detect(id);if(installed&&!newer('2.4.1',installed.version)&&!await this.running(installed))saved.launchAtLogin=(await run(installed.exe,['--app-manager-login-item','read']))==='true';else delete spec.launchAtLogin;}return{schema:spec,values:settings.values(id,this.platform,saved)};}
 async save(id,patch){if(!await this.idle(id))throw Error('Install the app before changing its settings.');const checked=settings.validate(id,this.platform,patch),file=profileFile(id,this.platform,this.home,this.roaming);if(file)await settings.writeJSON(file,id,this.platform,checked);else{if(Object.hasOwn(checked,'launchAtLogin')){const installed=await this.detect(id);if(newer('2.4.1',installed.version))throw Error('Update Secure Network to manage its login item here.');const result=await run(installed.exe,['--app-manager-login-item',String(checked.launchAtLogin)]);if((result==='true')!==checked.launchAtLogin)throw Error('Approve Secure Network in macOS System Settings → General → Login Items, then try again.');}if(Object.hasOwn(checked,'sshUser'))await run('/usr/bin/defaults',['write',entry(id).bundle,'sshUser','-string',checked.sshUser]);}}
 async move(source,target){try{await fs.promises.rename(source,target);}catch(e){if(!['EACCES','EPERM'].includes(e.code))throw e;const command='/bin/mv '+sq(source)+' '+sq(target);await run('/usr/bin/osascript',['-e','do shell script '+JSON.stringify(command)+' with administrator privileges'],{timeout:120000});}}
 async install(id,file,release){await this.idle(id);await verified(file,release);
  if(this.platform==='win32'){await run(file,['/S'],{timeout:600000});return;}
  if(this.platform!=='darwin')throw Error('Installations require macOS or Windows.');
  const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'hn-app-manager-'));
  let staged=null;
  try{
   const names=(await run('/usr/bin/unzip',['-Z1',file])).split('\n');if(names.some(n=>n.startsWith('/')||n.includes('\\')||n.split('/').includes('..')))throw Error('Unsafe installer archive.');
   await run('/usr/bin/ditto',['-x','-k',file,dir],{timeout:180000});
   const apps=(await fs.promises.readdir(dir)).filter(n=>n.endsWith('.app'));if(apps.length!==1)throw Error('The installer must contain exactly one app.');const source=path.join(dir,apps[0]);
   async function checkLinks(folder){for(const item of await fs.promises.readdir(folder,{withFileTypes:true})){const p=path.join(folder,item.name);if(item.isSymbolicLink()){const real=await fs.promises.realpath(p);if(!within(source,real)&&real!==source)throw Error('Installer contains an unsafe link.');}else if(item.isDirectory())await checkLinks(p);}}await checkLinks(source);
   const info=JSON.parse(await run('/usr/bin/plutil',['-convert','json','-o','-',path.join(source,'Contents','Info.plist')]));if(info.CFBundleIdentifier!==entry(id).bundle||info.CFBundleShortVersionString!==release.version.split('-')[0])throw Error('The installer belongs to a different app or version.');
   await run('/usr/bin/codesign',['--verify','--deep',source]);
   const previous=await this.idle(id),folder=previous?path.dirname(previous.path):path.join(this.home,'Applications');await fs.promises.mkdir(folder,{recursive:true});
   // Stage beside the destination so the final rename is atomic. Administrator approval is
   // requested by macOS only for an existing app in a protected Applications folder.
   const target=previous?.path||path.join(folder,entry(id).app);staged=path.join(folder,'.hn-manager-'+crypto.randomUUID()+'.app');
   try{await run('/usr/bin/ditto',[source,staged],{timeout:180000});}catch(e){if(fs.existsSync(staged))await fs.promises.rm(staged,{recursive:true,force:true}).catch(()=>{});const command='/usr/bin/ditto '+sq(source)+' '+sq(staged);await run('/usr/bin/osascript',['-e','do shell script '+JSON.stringify(command)+' with administrator privileges'],{timeout:180000});}
   const backup=target+'.manager-backup-'+crypto.randomUUID();if(previous)await this.move(target,backup);
   try{await this.move(staged,target);staged=null;}catch(e){if(previous)await this.move(backup,target);throw e;}
   if(previous)await this.trash(backup);
  }finally{await fs.promises.rm(dir,{recursive:true,force:true});if(staged)await fs.promises.rm(staged,{recursive:true,force:true}).catch(()=>{});}
 }
 async trash(bundle){const trash=path.join(this.home,'.Trash');await fs.promises.mkdir(trash,{recursive:true});await this.move(bundle,path.join(trash,path.basename(bundle)+'-'+Date.now()));}
 async uninstall(id){const installed=await this.idle(id);if(!installed)throw Error('This app is not installed.');if(this.platform==='darwin')await this.trash(installed.path);else{if(!installed.uninstall||!fs.existsSync(installed.uninstall))throw Error('Use Windows Installed apps to remove this installation.');await run(installed.uninstall,['/S'],{timeout:300000});}}
}
module.exports={System,within,uninstallPath};
