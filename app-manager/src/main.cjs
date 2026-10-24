'use strict';
// HN Group App Manager: installs, updates, repairs and removes HN Browser and HN Secure Network from verified
// downloads, changes their settings while they're closed, and keeps itself up to date. Work runs one job at a
// time from a queue; a job for an app that's open waits until the person quits it (App Manager never stops
// another app). Questions are asked in the window in the HN design, never in plain system boxes.
// It only opens on a computer approved on devices.hngroup.org.uk, and only after the person signs in with their
// HN Group account (HN Group Auth) and unlocks it with their six-digit PIN each time it opens.
const{app,BrowserWindow,ipcMain,shell,nativeTheme,Notification,Tray,Menu,nativeImage,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const{CATALOG,entry}=require('./catalog.cjs'),releases=require('./releases.cjs'),{Store}=require('./store.cjs'),selfUpdate=require('./self-update.cjs');
const{Account,AUTH}=require('./account.cjs'),{Vault}=require('./vault.cjs'),{Device,testFetcher}=require('./device.cjs'),{createDeviceGate}=require('./device-gate.cjs');

// Desktop tests only (never in an installed copy): a temporary profile, a pretend Windows PC and local fixtures.
const TEST=!app.isPackaged&&process.env.HN_MANAGER_TEST==='1';
if(TEST&&process.env.HN_MANAGER_TEST_PROFILE)app.setPath('userData',process.env.HN_MANAGER_TEST_PROFILE);
const PLATFORM=TEST?'win32':process.platform,ARCH=TEST?'x64':process.arch;
let build=0;try{build=Number(require('./build.json').build)||0;}catch{}
const UI=path.join(__dirname,'..','ui','index.html'),ASSETS=path.join(__dirname,'..','ui','assets');
const system=TEST?new(require('./fake-system.cjs').FakeSystem)(app.getPath('userData')):new(require('./system.cjs').System)();
const store=new Store(app.getPath('userData'));
const testLog=[];
// Desktop tests read the release feed and installers from a local folder instead of the internet.
// HN Group Auth is a stand-in too: any sign-in works, and the PIN is 246810.
const testUser={displayName:'Charlie Livsey',email:'charlie.livsey@hngroup.org.uk',jobTitle:'Managing director'};
const testAuth=async(u,options)=>{const body=options?.body?JSON.parse(options.body):{};testLog.push({auth:u.pathname});
 if(u.pathname==='/api/native/exchange')return Response.json({token:'a'.repeat(64),user:testUser});
 if(options?.headers?.Authorization!=='Bearer '+'a'.repeat(64))return Response.json({error:'Please sign in again.'},{status:401});
 if(u.pathname==='/api/native/unlock')return body.code==='246810'?Response.json({user:testUser}):Response.json({error:'That PIN isn’t right. 4 tries left.'},{status:400});
 if(u.pathname==='/api/native/session')return Response.json({user:testUser});
 if(['/api/native/lock','/api/native/logout'].includes(u.pathname))return Response.json({ok:true});
 return new Response('',{status:404});};
const fetcher=TEST?async(url,options)=>{const u=new URL(url),dir=process.env.HN_MANAGER_TEST_FIXTURES;if(u.origin===AUTH)return testAuth(u,options);if(u.pathname==='/api/releases')return new Response(fs.readFileSync(path.join(dir,'feed.json')),{headers:{'Content-Type':'application/json'}});const file=path.join(dir,path.basename(u.pathname));return fs.existsSync(file)?new Response(fs.readFileSync(file)):new Response('',{status:404});}:fetch;

let win=null,tray=null,account,device,deviceGate,feed=null,queue=[],current=null,controller=null,working=false,checking=false,quitting=false,stateTimer=null,notified='';
const dialogs=new Map();
const state={version:app.getVersion(),build,platform:PLATFORM,arch:ARCH,supported:system.supported,checkedAt:null,checking:false,error:null,apps:Object.values(CATALOG).map(a=>({...a,installed:null,running:false,latest:null,update:false,canInstall:false,error:null})),
 operation:null,queue:[],manager:{latest:null,update:false,status:'idle',progress:0,error:null,checkedAt:null,location:'installed'},accountError:null};
// Where this copy of App Manager is running on a Mac: from the disk image or Downloads it can't update itself in
// place, so it offers to move to Applications.
if(PLATFORM==='darwin'&&!TEST){const bundle=selfUpdate.bundleOf(process.execPath);state.manager.location=!app.isPackaged||!bundle?'development':selfUpdate.temporary(bundle)?'temporary':'installed';}

// ---------- Sending state to the window (at most once a frame) ----------
function snapshot(){return{...state,account:account?{...account.snapshot(),error:state.accountError}:{status:'signed-out',user:null,avatar:null,error:null},device:device?device.state():null,preferences:store.preferences,activity:store.activity.slice(0,100),queue:queue.map(j=>({id:j.id,kind:j.kind}))};}
function changed(){if(stateTimer)return;stateTimer=setTimeout(()=>{stateTimer=null;if(win&&!win.isDestroyed())win.webContents.send('manager:state',snapshot());updateTray();},16);}
function show(page){if(!win||win.isDestroyed())createWindow(true);else{if(win.isMinimized())win.restore();win.show();win.focus();}if(process.platform==='darwin')app.dock?.show();if(page)win.webContents.send('manager:navigate',page);}
// Asks a question in the window and resolves with the chosen button's id, or 'cancel'.
function ask(spec){const id=crypto.randomUUID();show();return new Promise(resolve=>{const finish=choice=>{if(!dialogs.has(id))return;dialogs.delete(id);win?.webContents.send('manager:dialog-close',id);resolve(choice);};dialogs.set(id,{finish,buttons:spec.buttons.map(b=>b.id)});win.webContents.send('manager:dialog',{id,...spec});});}

// ---------- Who may make changes ----------
// Installs, updates and settings need this computer approved and the HN account unlocked with its PIN. Automatic
// updates in the background need the approved computer and a remembered account (locked is fine).
function requireDevice(){if(!device.state().allowed)throw Error('This computer isn’t approved on devices.hngroup.org.uk, so apps can’t be installed or updated here.');}
function requireUnlocked(){if(!account.unlocked)throw Error('Unlock App Manager with your HN Group PIN first.');}
const mayWorkInBackground=()=>device.state().allowed&&!!account.token;

// ---------- Finding apps and updates ----------
const installedVersion=i=>i.version+(i.build?'-'+i.build:'');
async function scan(){
 state.apps=await Promise.all(Object.values(CATALOG).map(async a=>{
  try{const installed=await system.detect(a.id),latest=releases.asset(feed,a.id,PLATFORM,ARCH);
   const canInstall=system.supported&&!(a.id==='browser'&&PLATFORM==='darwin'&&ARCH!=='arm64');
   return{...a,installed,running:installed?await system.running(installed):false,latest,canInstall,update:!!installed&&!!latest&&releases.newer(latest.version,installedVersion(installed)),error:null};}
  catch(e){return{...a,installed:null,running:false,latest:null,update:false,canInstall:false,error:e.message};}}));
 changed();}
async function check({quiet=false}={}){
 if(checking)return;checking=true;state.checking=true;state.error=null;changed();
 try{const r=await fetcher(releases.ORIGIN+'/api/releases',{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('The update service isn’t available right now. Try again in a few minutes.');feed=await r.json();
  const own=releases.asset(feed,'manager',PLATFORM,ARCH);
  state.manager={...state.manager,latest:own,update:!!own&&releases.newer(own.version,app.getVersion()+'-'+build)};
  if(!state.manager.update&&state.manager.status!=='downloading')state.manager.status='idle';
  state.checkedAt=Date.now();await scan();
  const updates=state.apps.filter(a=>a.update);
  if(!quiet)store.log('check',updates.length?updates.length+' update'+(updates.length===1?'':'s')+' found: '+updates.map(a=>a.name+' '+a.latest.version.split('-')[0]).join(', ')+'.':'Checked for updates. Everything is up to date.');
  afterCheck(updates);}
 catch(e){state.error=e.message||'Couldn’t check for updates.';}
 finally{checking=false;state.checking=false;changed();}}
// Installs updates by themselves for apps that are closed (when that's switched on), and says when there are new ones.
function afterCheck(updates){
 if(store.preferences.autoUpdate&&mayWorkInBackground())for(const a of updates)if(!a.running)enqueue(a.id,'update',{auto:true});
 // App Manager's own update installs by itself while nothing else is happening and its window isn't in use.
 if(state.manager.update&&store.preferences.autoUpdateManager&&mayWorkInBackground()&&state.manager.location==='installed'&&!working&&!queue.length&&!(win&&win.isVisible()&&win.isFocused())&&!TEST)updateSelf({auto:true}).catch(()=>{});
 const key=updates.map(a=>a.id+a.latest.version).join()+(state.manager.update?'manager'+state.manager.latest.version:'');
 if(key&&key!==notified&&store.preferences.notify&&Notification.isSupported()&&!(win&&win.isVisible()&&win.isFocused())&&!store.preferences.autoUpdate){
  const names=[...updates.map(a=>a.name),...(state.manager.update?['App Manager']:[])];
  const n=new Notification({title:'Updates are ready',body:names.join(' and ')+(names.length===1?' has':' have')+' an update. Open App Manager to install.',silent:true});n.on('click',()=>show('overview'));n.show();}
 notified=key;}

// ---------- The queue: one install, update, reinstall or removal at a time ----------
function enqueue(id,kind,{auto=false}={}){entry(id);if(!['install','update','reinstall','uninstall'].includes(kind))throw Error('Unknown action.');
 if(current?.id===id||queue.some(j=>j.id===id))return false;
 queue.push({id,kind,auto});changed();work();return true;}
async function work(){if(working)return;working=true;
 try{while(queue.length){const job=queue.shift();current=job;try{await runJob(job);}catch(e){
  if(!e.cancelled){store.log('error',entry(job.id).name+': '+(e.message||'Something went wrong.'),job.id);state.error=e.message;}}
  finally{current=null;controller=null;state.operation=null;await scan().catch(()=>{});changed();}}}
 finally{working=false;changed();}}
async function runJob(job){
 const a=entry(job.id);requireDevice();controller=new AbortController();
 const op=state.operation={id:job.id,kind:job.kind,phase:'preparing',received:0,total:0,speed:0,cancellable:true};changed();
 // Waits for the person to quit the app (never stops it). Automatic updates skip apps that are open.
 let installed=await system.detect(job.id);
 if(installed&&await system.running(installed)){if(job.auto)return;installed=await system.closed(job.id,{signal:controller.signal,onWait:()=>{op.phase='waiting';changed();}});}
 if(job.kind==='uninstall'){if(!installed)throw Error('This app isn’t installed.');op.phase='removing';op.cancellable=false;changed();await system.uninstall(job.id);store.log('remove',a.name+' was removed. Its settings and account data were kept.',job.id);return;}
 if(job.kind==='install'&&installed)throw Error('It’s already installed.');
 if(job.kind!=='install'&&!installed)throw Error('Install it first.');
 const release=releases.asset(feed,job.id,PLATFORM,ARCH);if(!release)throw Error('There’s no download for this computer yet.');
 if(job.kind==='update'&&!releases.newer(release.version,installedVersion(installed)))return;
 op.phase='downloading';op.total=release.size;op.version=release.version;changed();
 let file,last={at:Date.now(),bytes:0};
 try{
  file=await releases.download(release,path.join(app.getPath('userData'),'installers'),{fetcher,signal:controller.signal,progress:(received,total)=>{op.received=received;op.total=total;const now=Date.now();if(now-last.at>=500){op.speed=Math.round((received-last.bytes)/((now-last.at)/1000));last={at:now,bytes:received};}changed();}});
  op.phase='installing';op.cancellable=false;op.received=op.total;changed();
  await system.install(job.id,file,release);
  const short=release.version.split('-')[0];
  store.log(job.kind,job.kind==='install'?a.name+' '+short+' was installed.':job.kind==='reinstall'?a.name+' '+short+' was reinstalled.':a.name+' was updated to '+short+(job.auto?' automatically.':'.'),job.id);
 }finally{if(file)await fs.promises.rm(file,{force:true}).catch(()=>{});}}
function cancel(id){const i=queue.findIndex(j=>j.id===id);if(i>=0){queue.splice(i,1);changed();return;}if(current?.id===id&&state.operation?.cancellable)controller?.abort();}

// ---------- App Manager's own updates ----------
async function updateSelf({auto=false}={}){const release=state.manager.latest;if(!state.manager.update||!release)throw Error('App Manager is up to date.');if(working||queue.length)throw Error('Wait for the other updates to finish first.');requireDevice();
 if(state.manager.status==='downloading'||state.manager.status==='installing')return;
 state.manager={...state.manager,status:'downloading',progress:0,error:null};changed();let file;
 try{file=await releases.download(release,path.join(app.getPath('userData'),'installers'),{fetcher,progress:(r,t)=>{state.manager.progress=Math.floor(r/t*100);changed();}});
  state.manager.status='installing';changed();store.log('manager','App Manager '+release.version.split('-')[0]+(auto?' is installing by itself.':' is installing.')+' It reopens by itself.');
  if(TEST){testLog.push({selfUpdate:release.version});state.manager.status='idle';return;}
  await selfUpdate.installSelf({file,release,system,quit:()=>{quitting=true;setTimeout(()=>app.quit(),300);}});}
 catch(e){state.manager={...state.manager,status:'error',error:e.message};if(file)await fs.promises.rm(file,{force:true}).catch(()=>{});throw e;}
 finally{changed();}}

// Checks just for App Manager's own update (Settings → Check for App Manager updates).
async function checkSelf(){await check({quiet:true});state.manager.checkedAt=Date.now();if(state.error)throw Error(state.error);changed();return state.manager.update;}
// A Mac copy running from the disk image or Downloads: moves itself to Applications and reopens from there.
async function moveToApplications(){if(PLATFORM!=='darwin'||state.manager.location!=='temporary')throw Error('App Manager is already installed.');if(working||queue.length)throw Error('Wait for the current change to finish first.');
 store.log('manager','App Manager moved to the Applications folder.');if(TEST){testLog.push({move:true});return;}await selfUpdate.moveToApplications({quit:()=>{quitting=true;setTimeout(()=>app.quit(),300);}});}

// ---------- Window, tray and login item ----------
const colors=()=>nativeTheme.shouldUseDarkColors?{color:'#0E1020',symbolColor:'#ECEBF4'}:{color:'#F6F4FA',symbolColor:'#1B1A21'};
function createWindow(visible){
 win=new BrowserWindow({width:1180,height:800,minWidth:900,minHeight:640,show:false,title:'HN Group App Manager',backgroundColor:nativeTheme.shouldUseDarkColors?'#0E1020':'#F6F4FA',autoHideMenuBar:true,
  titleBarStyle:'hidden',...(process.platform==='darwin'?{trafficLightPosition:{x:18,y:16}}:{titleBarOverlay:{...colors(),height:44}}),
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:false,backgroundThrottling:false}});
 win.removeMenu();const wc=win.webContents;
 wc.on('will-navigate',e=>e.preventDefault());wc.setWindowOpenHandler(()=>({action:'deny'}));wc.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 win.loadFile(UI);win.once('ready-to-show',()=>{if(visible)win.show();});
 // Closing keeps App Manager in the menu bar or tray when it runs in the background; work in progress always finishes.
 win.on('close',e=>{if(quitting)return;if(store.preferences.background){e.preventDefault();win.hide();if(process.platform==='darwin')app.dock?.hide();return;}
  if(working||state.manager.status==='downloading'){e.preventDefault();ask({title:'Wait for this to finish?',text:'App Manager is installing or downloading. It closes by itself as soon as it’s done.',icon:'clock',buttons:[{id:'cancel',label:'Keep it open'},{id:'ok',label:'Close when done',tone:'primary'}]}).then(choice=>{if(choice==='ok')quitWhenIdle();});}});
 // Hidden in the menu bar or tray for 15 minutes: the account locks, so the PIN is needed again.
 let away=null;win.on('hide',()=>{clearTimeout(away);away=setTimeout(()=>account?.lock().catch(()=>{}),15*60000);away.unref?.();});win.on('show',()=>clearTimeout(away));
 win.on('closed',()=>{clearTimeout(away);win=null;});}
function quitWhenIdle(){const tick=()=>{if(working||queue.length||state.manager.status==='downloading')return setTimeout(tick,500);quitting=true;app.quit();};tick();}
function trayImage(){const file=path.join(ASSETS,process.platform==='darwin'?'trayTemplate.png':'tray.png');if(!fs.existsSync(file))return nativeImage.createEmpty();const image=nativeImage.createFromPath(file);if(process.platform==='darwin')image.setTemplateImage(true);return image;}
function setupTray(){if(!store.preferences.background||TEST){tray?.destroy();tray=null;return;}if(tray)return;tray=new Tray(trayImage());tray.setToolTip('HN Group App Manager');tray.on('click',()=>show());updateTray(true);}
let trayKey='';
function updateTray(force){if(!tray)return;const updates=state.apps.filter(a=>a.update).length,key=[updates,working,state.checking,state.manager.update,account?.unlocked].join();if(key===trayKey&&!force)return;trayKey=key;
 tray.setToolTip('HN Group App Manager'+(updates?' · '+updates+' update'+(updates===1?'':'s'):''));
 tray.setContextMenu(Menu.buildFromTemplate([{label:working?'Installing…':updates?updates+' update'+(updates===1?'':'s')+' ready':'Everything is up to date',enabled:false},{type:'separator'},
  ...(updates?[{label:'Update all',enabled:!working&&account.unlocked,click:()=>{try{requireUnlocked();updateAll();}catch{show();}}}]:[]),{label:'Check for updates',enabled:!state.checking,click:()=>check()},{label:'Open App Manager',click:()=>show()},{type:'separator'},{label:'Quit App Manager',click:()=>{quitting=true;app.quit();}}]));}
function loginItem(){if(!TEST&&app.isPackaged)app.setLoginItemSettings({openAtLogin:store.preferences.openAtLogin,args:['--hidden']});}
function updateAll(){requireDevice();for(const a of state.apps)if(a.update)enqueue(a.id,'update');}

// ---------- Requests from the window ----------
function guard(event){if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==pathToFileURL(UI).href)throw Error('Untrusted request.');}
// Requests that work before the account is unlocked; everything else needs the PIN first.
const OPEN=new Set(['state','sign-in','sign-in-cancel','unlock','sign-out','dialog-answer','website','preference']);
const handlers={
 state:()=>snapshot(),
 'sign-in':async()=>{state.accountError=null;await account.start();},
 'sign-in-cancel':()=>{account.cancel();},
 unlock:async code=>{state.accountError=null;try{await account.unlock(code);}finally{changed();}},
 lock:async()=>{await account.lock();},
 'sign-out':async()=>{if(working||queue.length)throw Error('Wait for the current change to finish first.');await account.signOut();},
 check:()=>check(),
 enqueue:(id,kind)=>{requireDevice();if(!enqueue(id,kind))throw Error(entry(id).name+' is already waiting for another change.');},
 'update-all':()=>updateAll(),
 cancel:id=>cancel(id),
 open:async id=>{const installed=await system.detect(id);if(!installed)throw Error('This app isn’t installed.');if(TEST){testLog.push({open:id});return;}const error=await shell.openPath(PLATFORM==='darwin'?installed.path:installed.exe);if(error)throw Error(error);},
 reveal:async id=>{const installed=await system.detect(id);if(!installed)throw Error('This app isn’t installed.');if(TEST){testLog.push({reveal:id});return;}shell.showItemInFolder(PLATFORM==='darwin'?installed.path:installed.exe);},
 settings:id=>{entry(id);return system.preferences(id);},
 save:async(id,patch)=>{if(current?.id===id)throw Error('Wait for the current change to '+entry(id).name+' to finish.');await system.save(id,patch);store.log('settings',entry(id).name+' settings were changed. They apply when it next opens.',id);changed();},
 preference:(key,value)=>{if(key!=='theme')requireUnlocked();store.set(key,value);if(key==='theme')nativeTheme.themeSource=value;if(key==='background')setupTray();if(key==='openAtLogin')loginItem();changed();},
 'clear-activity':()=>{store.clearActivity();changed();},
 'manager-update':()=>updateSelf(),
 'manager-check':()=>checkSelf(),
 'move-to-applications':()=>moveToApplications(),
 website:page=>{const pages={downloads:'https://downloads.hngroup.org.uk/',manager:'https://downloads.hngroup.org.uk/#app-manager',devices:'https://devices.hngroup.org.uk/',account:'https://accounts.hngroup.org.uk/'};if(!pages[page])throw Error('Unknown page.');if(TEST){testLog.push({website:page});return;}return shell.openExternal(pages[page]);},
 'dialog-answer':(id,choice)=>{const d=dialogs.get(String(id));if(d)d.finish(d.buttons.includes(choice)?choice:'cancel');},
};
for(const[name,fn]of Object.entries(handlers))ipcMain.handle('manager:'+name,async(event,...args)=>{try{guard(event);if(!OPEN.has(name))requireUnlocked();return{ok:true,value:await fn(...args)};}catch(e){changed();return{ok:false,error:e.message||'Something went wrong.'};}});

// ---------- Start ----------
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>show());
 app.whenReady().then(async()=>{
  app.setAppUserModelId('uk.org.hngroup.appmanager');
  nativeTheme.themeSource=store.preferences.theme;
  // This computer must be approved on devices.hngroup.org.uk before App Manager opens (tests answer from a file).
  const deviceTest=TEST?{dir:path.join(app.getPath('userData'),'device'),fetcher:testFetcher(path.join(app.getPath('userData'),'device-status.txt')),machine:'0'.repeat(64),name:'Test PC'}:{};
  device=new Device({app:'app-manager',version:app.getVersion(),...deviceTest});
  deviceGate=createDeviceGate({device,appName:'HN Group App Manager',electron:require('electron'),uiDir:path.join(__dirname,'..','ui'),preloadDir:__dirname});
  await deviceGate.ensure();
  // The HN account: remembered (encrypted by the system) and locked until the PIN is entered.
  const storage=TEST?{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>'test',encryptString:s=>Buffer.from('test:'+s),decryptString:b=>String(b).replace(/^test:/,'')}:safeStorage;
  account=new Account({vault:new Vault(path.join(app.getPath('userData'),'account.enc'),storage),fetcher,
   open:async url=>{if(TEST){testLog.push({signIn:url});return;}await shell.openExternal(url);},
   changed:result=>{if(result.error)state.accountError=result.error;if(result.signedIn){state.accountError=null;store.log('manager','Signed in as '+(account.user?.displayName||'your HN Group account')+'.');show();}changed();}});
  account.load();account.restore().catch(()=>{});
  setInterval(()=>account.refresh().catch(()=>{}),10*60000).unref();
  nativeTheme.on('updated',()=>{if(win&&!win.isDestroyed()&&process.platform!=='darwin')win.setTitleBarOverlay(colors());});
  const hidden=process.argv.includes('--hidden')||(process.platform==='darwin'&&app.getLoginItemSettings().wasOpenedAtLogin);
  createWindow(!hidden);setupTray();loginItem();if(hidden&&process.platform==='darwin')app.dock?.hide();
  // Stopped being approved while open: hide App Manager behind the "not authorised" window until it's approved again.
  deviceGate.watch({onBlocked:()=>{queue.length=0;controller?.abort();if(win&&!win.isDestroyed())win.hide();changed();},onAllowed:()=>{show();changed();}});
  scan().then(()=>{if(store.preferences.autoCheck||!TEST)check({quiet:true});});
  setInterval(()=>{if(!working)scan().catch(()=>{});},15000).unref();
  setInterval(()=>{if(store.preferences.autoCheck)check({quiet:true});},6*3600000).unref();
 }).catch(e=>{console.error(e);app.quit();});
 app.on('activate',()=>show());
 app.on('before-quit',()=>{quitting=true;for(const d of dialogs.values())d.finish('cancel');});
 app.on('window-all-closed',()=>{if(!store.preferences.background)app.quit();});
}
if(TEST)global.__managerTest={log:testLog,system,store,state:()=>snapshot(),account:()=>account};
