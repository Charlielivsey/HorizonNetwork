'use strict';
// HN Secure Network for Windows: the HN Group VPN (all of this PC's traffic goes through HN Group's
// server, which is 10.88.0.1 inside the VPN) and SSH sessions to that server. It shares its VPN code
// with HN Browser (src/vpn.cjs and src/vault.cjs are identical copies of browser-app/src/…): sign-in
// goes through HN Group Auth in the default browser, the device key is made on this PC and kept in an
// Administrators-only WireGuard configuration, and only an encrypted VPN sign-in token is stored here.
const{app,BrowserWindow,Tray,Menu,ipcMain,shell,safeStorage,nativeImage,nativeTheme,Notification,dialog}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFile}=require('node:child_process');
const{VPN,controllerFor,FakeController,ORIGIN:VPN_ORIGIN,SERVER}=require('./vpn.cjs');
const{Vault}=require('./vault.cjs');
const{Updates}=require('./updates.cjs');

// Desktop tests only (never in an installed copy): a profile folder and an in-memory VPN connection.
const TESTING=!app.isPackaged&&!!process.env.HN_SECURE_NETWORK_TEST;
if(TESTING&&process.env.HN_SECURE_NETWORK_PROFILE)app.setPath('userData',process.env.HN_SECURE_NETWORK_PROFILE);
const UI=path.join(__dirname,'..','ui'),DATA=app.getPath('userData');
const DOWNLOADS='https://downloads.hngroup.org.uk',WIREGUARD='https://download.wireguard.com/windows-client/wireguard-installer.exe',WIREGUARD_PAGE='https://www.wireguard.com/install/';
let build=0;try{build=Number(JSON.parse(fs.readFileSync(path.join(__dirname,'build.json'),'utf8')).build)||0;}catch{}
const DEFAULTS={launchAtLogin:true,connectOnLaunch:false,theme:'system',sshUser:'root',trayHint:false};
let prefs={...DEFAULTS};try{prefs={...DEFAULTS,...JSON.parse(fs.readFileSync(path.join(DATA,'preferences.json'),'utf8'))};}catch{}
const savePrefs=()=>{fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(path.join(DATA,'preferences.json.tmp'),JSON.stringify(prefs));fs.renameSync(path.join(DATA,'preferences.json.tmp'),path.join(DATA,'preferences.json'));};

let win=null,tray=null,vpn,updates,quitting=false,connectedAt=null,toolsBusy=false,stateTimer=null,avatar={tag:null,data:null},testLog=[];

if(!app.requestSingleInstanceLock()){app.quit();}
else{
 app.on('second-instance',()=>show());
 app.whenReady().then(start).catch(e=>{dialog.showErrorBox('HN Secure Network couldn’t start',String(e?.message||e));app.quit();});
}

function show(){if(!win||win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();}
function changed(){if(stateTimer)return;stateTimer=setTimeout(()=>{stateTimer=null;const s=snapshot();if(win&&!win.isDestroyed())win.webContents.send('sn:state',s);updateTray(s);},16);}
function snapshot(){const v=vpn.snapshot();if(v.connected&&!connectedAt)connectedAt=Date.now();if(!v.connected)connectedAt=null;
 return{vpn:v,connectedAt,prefs,update:updates.state,version:app.getVersion(),build,hostname:os.hostname(),platform:process.platform,toolsBusy,avatarTag:vpn.user?.avatar||null,server:SERVER,ssh:!!sshExe()||TESTING};}

const colors=()=>nativeTheme.shouldUseDarkColors?{color:'#0e0f1a',symbolColor:'#e9e4f7'}:{color:'#f5f3fa',symbolColor:'#1d1b2b'};
async function start(){
 app.setAppUserModelId('uk.org.hngroup.securenetwork');
 nativeTheme.themeSource=['light','dark'].includes(prefs.theme)?prefs.theme:'system';
 const controller=TESTING&&process.env.HN_SECURE_NETWORK_FAKE_VPN?new FakeController():controllerFor(process.platform);
 vpn=new VPN({vault:new Vault(path.join(DATA,'vpn.enc'),safeStorage),controller,stateFile:path.join(DATA,'vpn.json'),changed,client:'secure-network',appName:'HN Secure Network',deviceName:os.hostname()+' (Windows)',version:app.getVersion()+(build?' ('+build+')':''),...(TESTING?{reach:async()=>true}:{}),
  openTab:async url=>{if(TESTING){testLog.push({signIn:url});return null;}await shell.openExternal(url);return null;}});
 updates=new Updates({dir:path.join(DATA,'updates'),current:{version:app.getVersion(),build},changed});
 if(!TESTING)app.setLoginItemSettings({openAtLogin:!!prefs.launchAtLogin,args:['--hidden']});
 createWindow(!process.argv.includes('--hidden'));createTray();
 nativeTheme.on('updated',()=>{if(win&&!win.isDestroyed()&&process.platform==='win32')win.setTitleBarOverlay(colors());changed();});
 await vpn.restore().catch(()=>{});
 if(prefs.connectOnLaunch&&vpn.ready&&!vpn.connected)vpn.connect().catch(()=>{});
 // The connection is checked every 10 seconds while the window is open (30 while it's in the tray).
 let ticks=0;setInterval(()=>{ticks++;if(win?.isVisible()||ticks%3===0)vpn.poll().catch(()=>{});},10000).unref();
 setInterval(()=>vpn.refresh().catch(()=>{}),300000).unref();
 if(!TESTING){setTimeout(()=>updates.check(),15000).unref();setInterval(()=>updates.check(),6*3600000).unref();}
}

function createWindow(visible){
 win=new BrowserWindow({width:1060,height:760,minWidth:880,minHeight:640,show:false,title:'HN Secure Network',backgroundColor:nativeTheme.shouldUseDarkColors?'#0e0f1a':'#f5f3fa',autoHideMenuBar:true,
  ...(process.platform==='win32'?{titleBarStyle:'hidden',titleBarOverlay:{...colors(),height:40}}:{}),icon:path.join(UI,'assets','tray.png'),
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:false,backgroundThrottling:false}});
 win.removeMenu();
 const wc=win.webContents;
 wc.on('will-navigate',e=>e.preventDefault());
 wc.setWindowOpenHandler(({url})=>{openWeb(url);return{action:'deny'};});
 wc.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
 win.loadFile(path.join(UI,'index.html'));
 win.once('ready-to-show',()=>{if(visible)show();});
 // Closing the window keeps the VPN and the tray icon; Quit is in the tray menu.
 win.on('close',e=>{if(quitting)return;e.preventDefault();win.hide();if(!prefs.trayHint&&Notification.isSupported()){prefs.trayHint=true;savePrefs();new Notification({title:'HN Secure Network is still running',body:'Find it in the system tray. Your VPN connection stays as it is.',silent:true}).show();}});
}

function trayImage(on){const file=path.join(UI,'assets',on?'tray-on.png':'tray.png');return fs.existsSync(file)?nativeImage.createFromPath(file):nativeImage.createEmpty();}
function createTray(){tray=new Tray(trayImage(false));tray.setToolTip('HN Secure Network');tray.on('click',show);updateTray(snapshot());}
let trayKey='';
function updateTray(s){if(!tray)return;const v=s.vpn,key=[v.connected,v.ready,v.signedIn,v.busy].join();if(key===trayKey)return;trayKey=key;tray.setImage(trayImage(v.connected));tray.setToolTip('HN Secure Network · '+(v.connected?'Protected':v.ready?'Not connected':'Not set up'));
 tray.setContextMenu(Menu.buildFromTemplate([{label:v.connected?'Protected · connected':v.ready?'Not connected':v.signedIn?'This PC isn’t set up':'Not signed in',enabled:false},{type:'separator'},
  ...(v.ready?[{label:v.connected?'Disconnect':'Connect',enabled:!v.busy,click:()=>vpn.toggle().catch(e=>notify(e.message))}]:[]),
  {label:'SSH to the server…',enabled:v.ready,click:()=>{show();win.webContents.send('sn:go','ssh');}},{label:'Open HN Secure Network',click:show},{type:'separator'},
  {label:'Quit',click:()=>{quitting=true;app.quit();}}]));}
function notify(body){if(Notification.isSupported())new Notification({title:'HN Secure Network',body,silent:true}).show();}

// Opens only HN Group and WireGuard web pages in the default browser.
function openWeb(url){let u;try{u=new URL(url);}catch{return;}if(u.protocol==='https:'&&(/(^|\.)hngroup\.org\.uk$/.test(u.hostname)||u.hostname==='www.wireguard.com'))shell.openExternal(u.href);}

// ---------- WireGuard for Windows ----------
// Downloads the official installer, checks it's signed by WireGuard LLC, runs it (Windows asks first)
// and waits for it to finish. If anything goes wrong the WireGuard download page opens instead.
const ps=(script,timeout=60000)=>new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{timeout,windowsHide:true},(error,stdout)=>resolve({ok:!error,out:String(stdout||'').trim()})));
async function installWireGuard(){
 if(toolsBusy)return;if(process.platform!=='win32'&&!TESTING)throw Error('WireGuard for Windows can only be installed on Windows.');
 toolsBusy=true;changed();const file=path.join(os.tmpdir(),'wireguard-installer-'+crypto.randomBytes(6).toString('hex')+'.exe');
 try{
  if(TESTING){testLog.push({wireguard:WIREGUARD});return;}
  const r=await fetch(WIREGUARD,{signal:AbortSignal.timeout(300000)});if(!r.ok)throw Error('The WireGuard download didn’t start.');
  const data=Buffer.from(await r.arrayBuffer());if(data.length<100000||data.length>80*1024*1024)throw Error('The WireGuard download looks wrong.');fs.writeFileSync(file,data);
  const sig=await ps('$s = Get-AuthenticodeSignature -LiteralPath \''+file.replace(/'/g,"''")+'\'; if ($s.Status -eq \'Valid\' -and $s.SignerCertificate.Subject -match \'WireGuard LLC\') { \'ok\' }');
  if(sig.out!=='ok')throw Error('The WireGuard installer’s signature couldn’t be checked.');
  const child=spawn(file,[],{detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
  for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,3000));if(vpn.controller.tools())break;}
  if(!vpn.controller.tools())throw Error('WireGuard for Windows wasn’t installed.');
 }catch(e){openWeb(WIREGUARD_PAGE);throw Error(e.message+' The WireGuard download page has opened in your browser instead.');}
 finally{toolsBusy=false;fs.rmSync(file,{force:true});await vpn.poll().catch(()=>{});changed();}
}

// ---------- SSH ----------
// Opens Windows Terminal (or a console window) running Windows' own SSH client to the HN Group server
// through the VPN. The password is typed there and never seen or saved by this app.
function sshExe(){const p=path.join(process.env.SystemRoot||'C:\\Windows','System32','OpenSSH','ssh.exe');return process.platform==='win32'&&fs.existsSync(p)?p:null;}
async function openSSH(user){
 user=String(user||'').trim();if(!/^[a-z_][a-z0-9_.-]{0,31}$/i.test(user))throw Error('Enter a valid username, for example root.');
 prefs.sshUser=user;savePrefs();changed();
 if(!vpn.ready)throw Error('Set up the VPN on this PC first.');
 if(!vpn.connected)await vpn.connect();
 const args=['-o','ConnectTimeout=15',user+'@'+SERVER];
 if(TESTING){testLog.push({ssh:args});return;}
 const ssh=sshExe();if(!ssh)throw Error('Windows’ SSH client isn’t installed. Add “OpenSSH Client” in Settings → System → Optional features, then try again.');
 const wt=path.join(process.env.LOCALAPPDATA||'','Microsoft','WindowsApps','wt.exe');
 const child=fs.existsSync(wt)?spawn(wt,['new-tab','--title','HN Group server',ssh,...args],{detached:true,stdio:'ignore'}):spawn('cmd.exe',['/c','start','HN Group server',ssh,...args],{detached:true,stdio:'ignore'});
 child.on('error',()=>{});child.unref();
}

// ---------- Profile ----------
async function profilePicture(){
 const tag=vpn.user?.avatar||null;if(!tag||!vpn.token)return null;if(avatar.tag===tag)return avatar.data;
 try{const r=await fetch(VPN_ORIGIN+'/api/avatar',{headers:{Authorization:'Bearer '+vpn.token,'X-HN-VPN-Client':'secure-network'},signal:AbortSignal.timeout(15000),redirect:'error'});const type=(r.headers.get('content-type')||'').split(';')[0];
  if(!r.ok||!/^image\/(png|jpeg|webp|gif)$/.test(type))return null;const data=Buffer.from(await r.arrayBuffer());if(data.length>4*1024*1024)return null;avatar={tag,data:'data:'+type+';base64,'+data.toString('base64')};return avatar.data;}catch{return null;}}

// ---------- The window's controls ----------
const confirm=async(message,detail,button)=>(await dialog.showMessageBox(win,{type:'question',message,detail,buttons:['Cancel',button],defaultId:0,cancelId:0})).response===1;
const PREFS={launchAtLogin:'boolean',connectOnLaunch:'boolean',theme:['system','light','dark']};
ipcMain.handle('sn:state',event=>{trusted(event);return snapshot();});
ipcMain.handle('sn:action',async(event,name,data)=>{trusted(event);try{let result=null;switch(name){
 case'sign-in':await vpn.signIn();break;
 case'cancel-sign-in':vpn.cancel();vpn.note();break;
 case'install-tools':await installWireGuard();break;
 case'set-up':await vpn.setUp();break;
 case'connect':await vpn.connect();break;
 case'disconnect':await vpn.disconnect();break;
 case'refresh':await vpn.poll();break;
 case'remove':if(await confirm('Remove this PC from the HN VPN?','It disconnects and this PC’s VPN key is deleted. You can set it up again at any time.','Remove'))await vpn.remove();break;
 case'sign-out':if(await confirm('Sign out of HN Secure Network?','Signing out disconnects and removes this PC from the VPN.','Sign out')){if(vpn.ready)await vpn.remove().catch(()=>{});await vpn.signOut();avatar={tag:null,data:null};}break;
 case'profile':result=await vpn.call('api/profile');break;
 case'avatar':result=await profilePicture();break;
 case'end-session':if(!/^[a-f0-9]{16}$/.test(String(data)))throw Error('That sign-in can’t be found.');await vpn.call('api/sessions/'+data,{method:'DELETE'});break;
 case'ssh':await openSSH(data?.user);break;
 case'preference':{const{key,value}=data||{},rule=PREFS[key];if(!rule||(rule==='boolean'?typeof value!=='boolean':!rule.includes(value)))throw Error('That setting can’t be changed.');prefs[key]=value;savePrefs();if(key==='theme')nativeTheme.themeSource=value;if(key==='launchAtLogin'&&!TESTING)app.setLoginItemSettings({openAtLogin:value,args:['--hidden']});break;}
 case'check-update':await updates.check();break;
 case'download-update':await updates.download();break;
 case'install-update':{const file=await updates.verifiedFile();if(TESTING){testLog.push({install:file});break;}const child=spawn(file,['/S','--force-run'],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();quitting=true;setTimeout(()=>app.quit(),500);break;}
 case'open':{const pages={vpn:VPN_ORIGIN+'/',devices:VPN_ORIGIN+'/#devices',downloads:DOWNLOADS+'/',wireguard:WIREGUARD_PAGE};if(!pages[data])throw Error('Unknown page.');openWeb(pages[data]);break;}
 default:throw Error('Unknown action.');}
 changed();return{ok:true,result};}catch(e){changed();return{error:e.message||'Something went wrong.'};}});
function trusted(event){if(!win||event.sender!==win.webContents||!String(event.senderFrame?.url||'').startsWith('file://'))throw Error('Untrusted request.');}

app.on('before-quit',()=>{quitting=true;});
app.on('window-all-closed',e=>{if(!quitting)e.preventDefault?.();});
if(TESTING)global.__secureNetworkTest={log:testLog,vpn:()=>vpn,updates:()=>updates};
