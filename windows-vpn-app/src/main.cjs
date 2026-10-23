'use strict';
// HN Secure Network for Windows: the HN Group VPN (all of this PC's traffic goes through HN Group's
// server, which is 10.88.0.1 inside the VPN) and SSH sessions to that server in their own terminal window.
// It shares its VPN code with HN Browser (src/vpn.cjs and src/vault.cjs are identical copies of
// browser-app/src/…): sign-in goes through HN Group Auth in the default browser, the device key is made on
// this PC and kept in an Administrators-only WireGuard configuration, and only an encrypted VPN sign-in token
// is stored here. Every connection asks for the HN account's six-digit PIN first, checked by the server.
const{app,BrowserWindow,Tray,Menu,ipcMain,shell,safeStorage,nativeImage,nativeTheme,Notification}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFile}=require('node:child_process');
const{VPN,controllerFor,FakeController,ORIGIN:VPN_ORIGIN,SERVER}=require('./vpn.cjs');
const{Vault}=require('./vault.cjs');
const{Updates}=require('./updates.cjs');
const{Terminals}=require('./terminal.cjs');

// Desktop tests only (never in an installed copy): a profile folder, an in-memory VPN connection and an SSH
// window that runs with pipes instead of a console.
const TESTING=!app.isPackaged&&!!process.env.HN_SECURE_NETWORK_TEST;
if(TESTING&&process.env.HN_SECURE_NETWORK_PROFILE)app.setPath('userData',process.env.HN_SECURE_NETWORK_PROFILE);
const UI=path.join(__dirname,'..','ui'),DATA=app.getPath('userData');
const DOWNLOADS='https://downloads.hngroup.org.uk',WIREGUARD='https://download.wireguard.com/windows-client/wireguard-installer.exe',WIREGUARD_PAGE='https://www.wireguard.com/install/';
let build=0;try{build=Number(JSON.parse(fs.readFileSync(path.join(__dirname,'build.json'),'utf8')).build)||0;}catch{}
const DEFAULTS={launchAtLogin:true,connectOnLaunch:false,theme:'system',trayHint:false};
let prefs={...DEFAULTS};try{prefs={...DEFAULTS,...JSON.parse(fs.readFileSync(path.join(DATA,'preferences.json'),'utf8'))};}catch{}
const savePrefs=()=>{fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(path.join(DATA,'preferences.json.tmp'),JSON.stringify(prefs));fs.renameSync(path.join(DATA,'preferences.json.tmp'),path.join(DATA,'preferences.json'));};

let win=null,tray=null,vpn,updates,terminals,quitting=false,connectedAt=null,toolsBusy=false,stateTimer=null,avatar={tag:null,data:null};
const testLog=[],dialogs=new Map();

if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>show());
 app.whenReady().then(start).catch(e=>{console.error(e);app.quit();});
}

function show(){if(!win||win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();}
function send(channel,value){if(win&&!win.isDestroyed())win.webContents.send(channel,value);}
function changed(){if(stateTimer)return;stateTimer=setTimeout(()=>{stateTimer=null;const s=snapshot();send('sn:state',s);updateTray(s);},16);}
function snapshot(){const v=vpn.snapshot();if(v.connected&&!connectedAt)connectedAt=Date.now();if(!v.connected)connectedAt=null;
 return{vpn:v,connectedAt,prefs,update:updates.state,version:app.getVersion(),build,hostname:os.hostname(),toolsBusy,avatarTag:vpn.user?.avatar||null,server:SERVER,ssh:terminals.snapshot()};}
// Takes the person to a page, and optionally straight to the PIN for connecting.
function go(page,extra={}){show();send('sn:go',{page,...extra});}

const colors=()=>nativeTheme.shouldUseDarkColors?{color:'#0E1020',symbolColor:'#ECEBF4'}:{color:'#F6F4FA',symbolColor:'#1B1A21'};
async function start(){
 app.setAppUserModelId('uk.org.hngroup.securenetwork');
 nativeTheme.themeSource=['light','dark'].includes(prefs.theme)?prefs.theme:'system';
 const controller=TESTING&&process.env.HN_SECURE_NETWORK_FAKE_VPN?new FakeController():controllerFor(process.platform);
 vpn=new VPN({vault:new Vault(path.join(DATA,'vpn.enc'),safeStorage),controller,stateFile:path.join(DATA,'vpn.json'),changed,client:'secure-network',appName:'HN Secure Network',deviceName:os.hostname()+' (Windows)',version:app.getVersion()+(build?' ('+build+')':''),...(TESTING?{reach:async()=>true}:{}),
  openTab:async url=>{if(TESTING){testLog.push({signIn:url});return null;}await shell.openExternal(url);return null;}});
 updates=new Updates({dir:path.join(DATA,'updates'),current:{version:app.getVersion(),build},changed});
 terminals=new Terminals({file:path.join(DATA,'ssh.json'),launch:openSSHWindow,
  ...(TESTING&&process.env.HN_SECURE_NETWORK_SSH_PORT?{host:'127.0.0.1',port:Number(process.env.HN_SECURE_NETWORK_SSH_PORT)}:{}),
  verify:({host,fingerprint})=>ask({kind:'trust',title:'Check the HN Group server',text:'This is the first SSH session from this PC. Check that this fingerprint matches the one HN Group gave you before trusting '+host+'.',detail:fingerprint,
   note:'It’s remembered on this PC, and HN Secure Network refuses to connect if it ever changes.',buttons:[{id:'cancel',label:'Don’t connect'},{id:'trust',label:'Trust the server',primary:true}]}).then(choice=>choice==='trust')});
 terminals.on('changed',changed);
 if(!TESTING)app.setLoginItemSettings({openAtLogin:!!prefs.launchAtLogin,args:['--hidden']});
 createWindow(!process.argv.includes('--hidden'));createTray();
 nativeTheme.on('updated',()=>{if(win&&!win.isDestroyed()&&process.platform==='win32')win.setTitleBarOverlay(colors());changed();});
 await vpn.restore().catch(()=>{});
 // "Ask to connect when HN Secure Network opens": the window opens on the PIN (connecting always needs it).
 if(prefs.connectOnLaunch&&vpn.ready&&!vpn.connected&&vpn.token){const open=()=>go('connection',{connect:true});if(win.webContents.isLoading())win.webContents.once('did-finish-load',open);else open();}
 // The connection is checked every 10 seconds while the window is open (30 while it's in the tray).
 let ticks=0;setInterval(()=>{ticks++;if(win?.isVisible()||ticks%3===0)vpn.poll().catch(()=>{});},10000).unref();
 setInterval(()=>vpn.refresh().catch(()=>{}),300000).unref();
 if(!TESTING){setTimeout(()=>updates.check(),15000).unref();setInterval(()=>updates.check(),6*3600000).unref();}
}

function createWindow(visible){
 win=new BrowserWindow({width:1080,height:760,minWidth:900,minHeight:640,show:false,title:'HN Secure Network',backgroundColor:nativeTheme.shouldUseDarkColors?'#0E1020':'#F6F4FA',autoHideMenuBar:true,
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
function createTray(){tray=new Tray(trayImage(false));tray.setToolTip('HN Secure Network');tray.on('click',show);tray.on('double-click',show);updateTray(snapshot());}
let trayKey='';
function updateTray(s){if(!tray)return;const v=s.vpn,key=[v.connected,v.ready,v.signedIn,v.busy].join();if(key===trayKey)return;trayKey=key;tray.setImage(trayImage(v.connected));tray.setToolTip('HN Secure Network · '+(v.connected?'Protected':v.ready?'Not connected':'Not set up'));
 tray.setContextMenu(Menu.buildFromTemplate([{label:v.connected?'Protected · connected':v.ready?'Not connected':v.signedIn?'This PC isn’t set up':'Not signed in',enabled:false},{type:'separator'},
  ...(v.ready?[v.connected?{label:'Disconnect',enabled:!v.busy,click:()=>vpn.disconnect().catch(e=>notify(e.message))}:{label:'Connect…',enabled:!v.busy,click:()=>go('connection',{connect:true})}]:[]),
  {label:'SSH to the server…',enabled:v.ready,click:()=>go('ssh')},{label:'Open HN Secure Network',click:show},{type:'separator'},
  {label:'Quit',click:()=>{quitting=true;app.quit();}}]));}
function notify(body){if(Notification.isSupported())new Notification({title:'HN Secure Network',body,silent:true}).show();}

// Opens only HN Group and WireGuard web pages in the default browser.
function openWeb(url){let u;try{u=new URL(url);}catch{return;}if(u.protocol==='https:'&&(/(^|\.)hngroup\.org\.uk$/.test(u.hostname)||u.hostname==='www.wireguard.com'))shell.openExternal(u.href);}

// Asks a question in the window, in the HN Group design (never a plain Windows box). Resolves with the
// chosen button's id, or 'cancel'.
function ask(spec){const id=crypto.randomUUID();show();return new Promise(resolve=>{const timer=setTimeout(()=>finish('cancel'),300000);const finish=choice=>{if(!dialogs.has(id))return;clearTimeout(timer);dialogs.delete(id);send('sn:dialog-close',id);resolve(choice);};dialogs.set(id,{finish,buttons:spec.buttons.map(b=>b.id)});send('sn:dialog',{id,...spec});});}

// ---------- WireGuard for Windows ----------
// Downloads the official installer, checks it's signed by WireGuard LLC, runs it (Windows asks first)
// and waits for it to finish. If anything goes wrong the WireGuard download page opens instead.
const psQuote=value=>"'"+String(value).replace(/'/g,"''")+"'";
const ps=(script,timeout=60000)=>new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{timeout,windowsHide:true},(error,stdout,stderr)=>resolve({ok:!error,out:String(stdout||'').trim(),err:String(stderr||'').trim()})));
async function installWireGuard(){
 if(toolsBusy)return;if(process.platform!=='win32'&&!TESTING)throw Error('WireGuard for Windows can only be installed on Windows.');
 toolsBusy=true;changed();const file=path.join(os.tmpdir(),'wireguard-installer-'+crypto.randomBytes(6).toString('hex')+'.exe');
 try{
  if(TESTING){testLog.push({wireguard:WIREGUARD});return;}
  const r=await fetch(WIREGUARD,{signal:AbortSignal.timeout(300000)});if(!r.ok)throw Error('The WireGuard download didn’t start.');
  const data=Buffer.from(await r.arrayBuffer());if(data.length<100000||data.length>80*1024*1024)throw Error('The WireGuard download looks wrong.');fs.writeFileSync(file,data);
  const sig=await ps('$s = Get-AuthenticodeSignature -LiteralPath '+psQuote(file)+'; if ($s.Status -eq \'Valid\' -and $s.SignerCertificate.Subject -match \'WireGuard LLC\') { \'ok\' }');
  if(sig.out!=='ok')throw Error('The WireGuard installer’s signature couldn’t be checked.');
  const child=spawn(file,[],{detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
  for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,3000));if(vpn.controller.tools())break;}
  if(!vpn.controller.tools())throw Error('WireGuard for Windows wasn’t installed.');
 }catch(e){openWeb(WIREGUARD_PAGE);throw Error(e.message+' The WireGuard download page has opened in your browser instead.');}
 finally{toolsBusy=false;fs.rmSync(file,{force:true});await vpn.poll().catch(()=>{});changed();}
}

// ---------- Connecting (always with the PIN) ----------
async function checkPin(pin){try{await vpn.verifyPin(pin);}catch(e){throw Object.assign(e,{pin:true});}}
async function connect(pin){
 if(!vpn.ready)throw Error('Set up the VPN on this PC first.');
 await checkPin(pin);
 if(!vpn.connected)await vpn.connect();
}

// ---------- SSH in its own window ----------
// The window is "HN Secure Network SSH.exe" (built by scripts/ssh-helper.cjs), opened with Start-Process so
// Windows shows it in Windows Terminal or the console, whichever this PC uses.
function openSSHWindow(args){
 if(TESTING){const child=spawn(process.execPath,[path.join(__dirname,'ssh-console.cjs'),...args],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['pipe','pipe','pipe']});
  const entry={child,output:''};child.stdout.on('data',d=>{entry.output+=d;});child.stderr.on('data',d=>{entry.output+=d;});testLog.push({terminal:entry});return;}
 const exe=path.join(process.resourcesPath,'ssh','HN Secure Network SSH.exe');
 if(!app.isPackaged||!fs.existsSync(exe))throw Error('The SSH window is missing. Reinstall HN Secure Network from downloads.hngroup.org.uk.');
 return ps('Start-Process -FilePath '+psQuote(exe)+' -ArgumentList '+args.map(psQuote).join(','),30000).then(r=>{if(!r.ok)throw Error('The SSH window couldn’t be opened. '+(r.err.split(/\r?\n/)[0]||''));});
}
async function openSSH({username,password,pin}={}){
 if(!vpn.ready)throw Error('Set up the VPN on this PC first.');
 if(typeof password!=='string'||!password)throw Error('Enter your server password.');
 if(!vpn.connected){if(pin==null)throw Object.assign(Error('Enter your PIN to connect.'),{pin:true,needPin:true});await connect(pin);}
 if(!TESTING&&!(await vpn.reach()))throw Error('The VPN is on, but the HN Group server isn’t answering through it yet. Try disconnecting and connecting again. If it keeps happening, your network may block UDP port 51820.');
 await terminals.open({username,password});
}

// ---------- Profile ----------
async function profilePicture(){
 const tag=vpn.user?.avatar||null;if(!tag||!vpn.token)return null;if(avatar.tag===tag)return avatar.data;
 try{const r=await fetch(VPN_ORIGIN+'/api/avatar',{headers:{Authorization:'Bearer '+vpn.token,'X-HN-VPN-Client':'secure-network'},signal:AbortSignal.timeout(15000),redirect:'error'});const type=(r.headers.get('content-type')||'').split(';')[0];
  if(!r.ok||!/^image\/(png|jpeg|webp|gif)$/.test(type))return null;const data=Buffer.from(await r.arrayBuffer());if(data.length>4*1024*1024)return null;avatar={tag,data:'data:'+type+';base64,'+data.toString('base64')};return avatar.data;}catch{return null;}}

// ---------- The window's controls ----------
// Questions that need an answer (sign out, remove this PC) are asked in the window first, in the HN design.
const PREFS={launchAtLogin:'boolean',connectOnLaunch:'boolean',theme:['system','light','dark']};
ipcMain.handle('sn:state',event=>{trusted(event);return snapshot();});
ipcMain.handle('sn:action',async(event,name,data)=>{trusted(event);try{let result=null;switch(name){
 case'sign-in':await vpn.signIn();break;
 case'cancel-sign-in':vpn.cancel();vpn.note();break;
 case'install-tools':await installWireGuard();break;
 case'set-up':await vpn.setUp();break;
 case'connect':await connect(data?.pin);break;
 case'disconnect':await vpn.disconnect();break;
 case'refresh':await vpn.poll();break;
 case'remove':await vpn.remove();break;
 case'sign-out':if(vpn.ready)await vpn.remove().catch(()=>{});await vpn.signOut();avatar={tag:null,data:null};break;
 case'profile':result=await vpn.call('api/profile');break;
 case'avatar':result=await profilePicture();break;
 case'end-session':if(!/^[a-f0-9]{16}$/.test(String(data)))throw Error('That sign-in can’t be found.');await vpn.call('api/sessions/'+data,{method:'DELETE'});break;
 case'ssh-open':await openSSH(data||{});break;
 case'dialog-answer':{const d=dialogs.get(String(data?.id));if(d)d.finish(d.buttons.includes(data?.choice)?data.choice:'cancel');break;}
 case'preference':{const{key,value}=data||{},rule=PREFS[key];if(!rule||(rule==='boolean'?typeof value!=='boolean':!rule.includes(value)))throw Error('That setting can’t be changed.');prefs[key]=value;savePrefs();if(key==='theme')nativeTheme.themeSource=value;if(key==='launchAtLogin'&&!TESTING)app.setLoginItemSettings({openAtLogin:value,args:['--hidden']});break;}
 case'check-update':await updates.check();break;
 case'download-update':await updates.download();break;
 case'install-update':{const file=await updates.verifiedFile();if(TESTING){testLog.push({install:file});break;}const child=spawn(file,['/S','--force-run'],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();quitting=true;setTimeout(()=>app.quit(),500);break;}
 case'open':{const pages={vpn:VPN_ORIGIN+'/',devices:VPN_ORIGIN+'/#devices',downloads:DOWNLOADS+'/',wireguard:WIREGUARD_PAGE};if(!pages[data])throw Error('Unknown page.');openWeb(pages[data]);break;}
 default:throw Error('Unknown action.');}
 changed();return{ok:true,result};}catch(e){changed();return{error:e.message||'Something went wrong.',...(e.pin?{pin:true}:{}),...(e.needPin?{needPin:true}:{})};}});
function trusted(event){if(!win||event.sender!==win.webContents||!String(event.senderFrame?.url||'').startsWith('file://'))throw Error('Untrusted request.');}

app.on('before-quit',()=>{quitting=true;for(const d of dialogs.values())d.finish('cancel');});
app.on('window-all-closed',e=>{if(!quitting)e.preventDefault?.();});
if(TESTING)global.__secureNetworkTest={log:testLog,vpn:()=>vpn,terminals:()=>terminals};
