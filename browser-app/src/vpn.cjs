'use strict';
// HN VPN in HN Browser: sign in to vpn.hngroup.org.uk (through HN Group Auth in a tab, so an unlocked
// browser account only needs its PIN), register this computer with its own WireGuard key, and turn the
// split-tunnel VPN (only traffic to the HN Group server, 10.88.0.1) on and off.
// Only an opaque VPN sign-in token is kept, encrypted like the browser account (vpn.enc). Device keys
// live in the root/Administrator-only WireGuard configuration, never in browser storage.
const http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process');
const ORIGIN='https://vpn.hngroup.org.uk',SERVER='10.88.0.1',PLACEHOLDER='<this device’s private key>';
const run=(file,args,options={})=>new Promise(resolve=>execFile(file,args,{timeout:options.timeout||30000,windowsHide:true},(error,stdout,stderr)=>resolve({code:error?(typeof error.code==='number'?error.code:-1):0,output:String(stdout||'')+String(stderr||'')})));
const lastLine=text=>String(text||'').trim().split(/\r?\n/).filter(Boolean).at(-1)||'';
// A WireGuard (Curve25519) key pair, made on this computer.
function keyPair(){const{publicKey,privateKey}=crypto.generateKeyPairSync('x25519');const b64=jwk=>Buffer.from(jwk,'base64url').toString('base64');return{publicKey:b64(publicKey.export({format:'jwk'}).x),privateKey:b64(privateKey.export({format:'jwk'}).d)};}
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
const psQuote=value=>"'"+String(value).replace(/'/g,"''")+"'";

// macOS: shares the helper, configuration and sudo rule with HN Group Secure Terminal, so either app
// can turn the same connection on and off. Setting up asks for the Mac password once.
class MacController{
 constructor({helperSource,user=os.userInfo().username}={}){this.helper='/usr/local/libexec/hn-vpn/hn-vpn-ctl';this.helperSource=helperSource;this.user=user;this.supported=true;this.toolsName='WireGuard tools (Homebrew)';}
 tools(){return['/opt/homebrew/bin/wg-quick','/usr/local/bin/wg-quick'].some(f=>{try{fs.accessSync(f,fs.constants.X_OK);return true;}catch{return false;}});}
 async ready(){if(!fs.existsSync(this.helper)||!fs.existsSync('/usr/local/etc/hn-vpn'))return false;return(await run('/usr/bin/sudo',['-n',this.helper,'status'])).code===0;}
 async status(){const r=await run('/usr/bin/sudo',['-n',this.helper,'status']);return r.code===0&&r.output.trim()==='up';}
 async up(){const r=await run('/usr/bin/sudo',['-n',this.helper,'up'],{timeout:60000});if(r.code!==0)throw Error('The VPN couldn’t connect. '+lastLine(r.output));}
 async down(){const r=await run('/usr/bin/sudo',['-n',this.helper,'down'],{timeout:60000});if(r.code!==0)throw Error('The VPN couldn’t disconnect. '+lastLine(r.output));}
 async remove(){if(fs.existsSync(this.helper))await run('/usr/bin/sudo',['-n',this.helper,'remove'],{timeout:60000});}
 async install(config){
  if(!/^[a-z_][a-z0-9_.-]{0,31}$/i.test(this.user))throw Error('This Mac user name can’t be used for the VPN.');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-vpn-'));
  try{
   const conf=path.join(dir,'hn-vpn.conf'),helper=path.join(dir,'hn-vpn-ctl'),rule=path.join(dir,'sudoers');
   fs.writeFileSync(conf,config,{mode:0o600});fs.writeFileSync(helper,fs.readFileSync(this.helperSource),{mode:0o755});fs.writeFileSync(rule,this.user+' ALL=(root) NOPASSWD: '+this.helper+'\n',{mode:0o600});
   const command=['set -e','/usr/sbin/visudo -cf '+quote(rule)+' >/dev/null','mkdir -p /usr/local/libexec/hn-vpn /usr/local/etc/hn-vpn','chown root:wheel /usr/local/libexec/hn-vpn /usr/local/etc/hn-vpn','chmod 755 /usr/local/libexec/hn-vpn; chmod 700 /usr/local/etc/hn-vpn','install -m 755 -o root -g wheel '+quote(helper)+' '+this.helper,'install -m 600 -o root -g wheel '+quote(conf)+' /usr/local/etc/hn-vpn/hn-vpn.conf','install -m 440 -o root -g wheel '+quote(rule)+' /etc/sudoers.d/hn-group-vpn'].join('; ');
   const script='do shell script "'+command.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'" with prompt "HN Browser needs to set up the HN VPN on this Mac." with administrator privileges';
   const r=await run('/usr/bin/osascript',['-e',script],{timeout:300000});
   if(r.code!==0)throw Error(/-128|cancel/i.test(r.output)?'Setup was cancelled.':'Setup didn’t finish. '+lastLine(r.output));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
}

// Windows: WireGuard for Windows runs the connection as the "WireGuardTunnel$hn-vpn" service. Setting
// up (one administrator prompt) keeps the configuration in an Administrators-only folder and lets this
// computer's signed-in users start and stop that one service, so connecting needs no prompt.
class WindowsController{
 constructor({programFiles=process.env.ProgramFiles||'C:\\Program Files',programData=process.env.ProgramData||'C:\\ProgramData'}={}){this.exe=path.win32.join(programFiles,'WireGuard','wireguard.exe');this.dir=path.win32.join(programData,'HN Group','VPN');this.service='WireGuardTunnel$hn-vpn';this.supported=true;this.toolsName='WireGuard for Windows';}
 tools(){return fs.existsSync(this.exe);}
 async ready(){return(await run('sc.exe',['query',this.service])).code===0;}
 async status(){const r=await run('sc.exe',['query',this.service]);return r.code===0&&/STATE\s*:\s*4\s/.test(r.output);}
 async control(verb){const r=await run('sc.exe',[verb,this.service],{timeout:60000});if(r.code===0||(verb==='stop'&&r.code===1062)||(verb==='start'&&r.code===1056))return;if(r.code===5){await this.elevated('sc.exe '+verb+' '+psQuote(this.service)+' | Out-Null');return;}throw Error((verb==='start'?'The VPN couldn’t connect. ':'The VPN couldn’t disconnect. ')+lastLine(r.output));}
 up(){return this.control('start');}
 down(){return this.control('stop');}
 setupScript(conf){
  const target=path.win32.join(this.dir,'hn-vpn.conf');
  return['$dir = '+psQuote(this.dir),
   'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
   // SYSTEM and Administrators only (SIDs, so it works in any Windows language).
   'icacls $dir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null',
   'Copy-Item -Force -LiteralPath '+psQuote(conf)+' -Destination '+psQuote(target),
   'if (Get-Service -Name '+psQuote(this.service)+' -ErrorAction SilentlyContinue) { & '+psQuote(this.exe)+' /uninstalltunnelservice hn-vpn | Out-Null; Start-Sleep -Seconds 2 }',
   '& '+psQuote(this.exe)+' /installtunnelservice '+psQuote(target),
   'Start-Sleep -Seconds 3',
   // Signed-in (interactive) users may start, stop and query this one service.
   'sc.exe sdset '+psQuote(this.service)+' "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWRPWPDTLOCRRC;;;IU)" | Out-Null',
   'if ($LASTEXITCODE -ne 0) { throw "The VPN service permissions couldn’t be set." }',
   'sc.exe config '+psQuote(this.service)+' start= demand | Out-Null'].join('\r\n');
 }
 // Runs a PowerShell script as an administrator (Windows asks first) and checks it finished.
 async elevated(body){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-vpn-'));
  try{
   const script=path.join(dir,'run.ps1'),done=path.join(dir,'done');
   fs.writeFileSync(script,'\ufeff$ErrorActionPreference = "Stop"\r\n'+body+'\r\nSet-Content -LiteralPath '+psQuote(done)+' -Value ok\r\n');
   const r=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '+psQuote('-NoProfile -ExecutionPolicy Bypass -File "'+script+'"')],{timeout:300000});
   if(r.code!==0)throw Error(/cancel/i.test(r.output)?'The change was cancelled.':'Windows didn’t allow the change. '+lastLine(r.output));
   if(!fs.existsSync(done))throw Error('That didn’t finish. Try again and approve the Windows prompt.');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 async install(config){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-vpn-'));
  try{const conf=path.join(dir,'hn-vpn.conf');fs.writeFileSync(conf,config,{mode:0o600});await this.elevated(this.setupScript(conf));}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 async remove(){if(await this.ready())await this.elevated('& '+psQuote(this.exe)+' /uninstalltunnelservice hn-vpn | Out-Null\r\nRemove-Item -Force -LiteralPath '+psQuote(path.win32.join(this.dir,'hn-vpn.conf'))+' -ErrorAction SilentlyContinue');}
}

class UnsupportedController{constructor(){this.supported=false;this.toolsName='';}tools(){return false;}async ready(){return false;}async status(){return false;}async up(){throw Error('The HN VPN can’t be controlled on this computer.');}async down(){}async remove(){}async install(){throw Error('The HN VPN can’t be set up on this computer.');}}

// For desktop tests only: a connection that lives in memory.
class FakeController{constructor(){this.supported=true;this.toolsName='WireGuard';this.installed=null;this.on=false;}tools(){return true;}async ready(){return!!this.installed;}async status(){return this.on;}async up(){if(!this.installed)throw Error('Not set up.');this.on=true;}async down(){this.on=false;}async remove(){this.installed=null;this.on=false;}async install(config){this.installed=config;}}

function controllerFor(platform,options){return platform==='darwin'?new MacController(options):platform==='win32'?new WindowsController(options):new UnsupportedController();}

class VPN{
 constructor({vault,controller,stateFile,openTab,closeTab,changed,fetcher=fetch,origin=ORIGIN,version='0',hostname=os.hostname(),reach=reachable}){Object.assign(this,{vault,controller,stateFile,openTab,closeTab,changed,fetch:fetcher,origin,version,hostname,reach});this.token=null;this.user=null;this.devices=[];this.limit=5;this.deviceId=null;this.ready=false;this.tools=false;this.connected=false;this.reachable=null;this.busy=null;this.error='';this.pending=null;this.generation=0;try{this.deviceId=JSON.parse(fs.readFileSync(stateFile,'utf8')).deviceId||null;}catch{}}
 snapshot(){const device=this.devices.find(d=>d.id===this.deviceId)||null;return{supported:this.controller.supported,toolsName:this.controller.toolsName,signedIn:!!this.token,user:this.user,device:device&&{name:device.name,address:device.address},devices:this.devices.length,limit:this.limit,tools:this.tools,ready:this.ready,shared:this.ready&&!device,connected:this.connected,reachable:this.reachable,busy:this.busy,error:this.error,server:SERVER,signingIn:!!this.pending};}
 note(){this.changed?.(this.snapshot());}
 saveState(){fs.mkdirSync(path.dirname(this.stateFile),{recursive:true});fs.writeFileSync(this.stateFile+'.tmp',JSON.stringify({deviceId:this.deviceId}),{mode:0o600});fs.renameSync(this.stateFile+'.tmp',this.stateFile);}
 async call(route,{method='GET',body}={}){let response;try{response=await this.fetch(this.origin+'/'+route,{method,headers:{Accept:'application/json','X-HN-VPN-Client':'hn-browser','X-HN-VPN-App':this.version,...(this.token?{Authorization:'Bearer '+this.token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw Error('The HN VPN service can’t be reached. Check your internet connection.');}const value=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(value.error||'The HN VPN service had a problem. Please try again.'),{status:response.status});return value;}
 async task(name,fn){if(this.busy)throw Error('The VPN is busy. Try again in a moment.');this.busy=name;this.error='';this.note();try{return await fn();}catch(e){this.error=e.message;throw e;}finally{this.busy=null;this.note();}}
 async restore(){this.token=this.vault.load();this.tools=this.controller.tools();await this.poll();if(this.token)await this.refresh();}
 async refresh(){if(!this.token)return;try{const me=await this.call('api/me');this.user=me.user;this.devices=me.devices||[];this.limit=me.limit||5;if(this.deviceId&&!this.devices.some(d=>d.id===this.deviceId)){this.deviceId=null;this.saveState();}this.note();}catch(e){if(e.status===401){this.forgetToken();this.error='Your HN VPN sign-in ended. Sign in again.';this.note();}}}
 async poll(){this.tools=this.controller.tools();this.ready=await this.controller.ready().catch(()=>false);this.connected=this.ready&&await this.controller.status().catch(()=>false);this.reachable=this.connected?await this.reach():null;this.note();}
 cancel(){this.generation++;if(this.pending){clearTimeout(this.pending.timer);this.pending.server.close();this.pending=null;}}
 // Sign-in happens in a browser tab: the VPN site → HN Group Auth (PIN only when the browser is
 // unlocked) → the VPN site hands a one-time code to this loopback address. Only this browser knows
 // the secret behind the challenge, so the code is useless to anyone else.
 async signIn(){
  this.cancel();const generation=this.generation,verifier=crypto.randomBytes(32).toString('hex'),challenge=crypto.createHash('sha256').update(verifier).digest('hex');
  const server=http.createServer(async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
   const url=new URL(req.url,'http://127.0.0.1');
   if(req.headers.host!=='127.0.0.1:'+server.address().port||req.method!=='GET'||url.pathname!=='/vpn-callback'||!/^[a-f0-9]{64}$/.test(url.searchParams.get('code')||'')){res.writeHead(400);return res.end('Invalid sign-in request.');}
   if(!this.pending||this.pending.used||generation!==this.generation){res.writeHead(400);return res.end('This sign-in has already finished.');}this.pending.used=true;const tab=this.pending.tab;
   let ok=true;
   try{const result=await this.call('api/app/exchange',{method:'POST',body:{code:url.searchParams.get('code'),verifier}});if(generation!==this.generation)throw Error('Sign-in cancelled.');this.token=result.token;this.vault.save(this.token);this.error='';await this.refresh();}
   catch(e){ok=false;this.error=e.message;}
   res.writeHead(ok?200:400,{'Content-Type':'text/html; charset=utf-8'});
   res.end('<!doctype html><meta charset="utf-8"><title>HN VPN</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#161126;color:#f4efff;font:15px system-ui,sans-serif;text-align:center"><div><h1 style="font-size:24px">'+(ok?'HN VPN is ready in HN Browser.':'HN VPN sign-in didn’t finish.')+'</h1><p style="color:#b7a9cc">'+(ok?'This tab closes by itself.':'Close this tab and try again from HN Browser.')+'</p></div>');
   if(generation===this.generation)this.cancel();this.note();if(ok&&tab)setTimeout(()=>this.closeTab?.(tab),1200).unref?.();
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const timer=setTimeout(()=>{if(generation===this.generation){this.cancel();this.error='HN VPN sign-in timed out. Please try again.';this.note();}},10*60000);timer.unref();
  this.pending={server,timer,used:false,tab:null};this.error='';this.note();
  try{this.pending.tab=await this.openTab(this.origin+'/auth/login?app='+challenge+'&loopback='+server.address().port);}catch(e){this.cancel();throw e;}
 }
 forgetToken(){this.token=null;this.user=null;this.devices=[];this.vault.clear();}
 async signOut(){this.cancel();const token=this.token;if(token)await this.call('api/sign-out',{method:'POST',body:{}}).catch(()=>{});this.forgetToken();this.error='';this.note();}
 // Registers this computer with a key made here and installs its configuration (one system prompt).
 setUp(){return this.task('setting-up',async()=>{
  if(!this.token)throw Error('Sign in to the HN VPN first.');if(!this.controller.supported)throw Error('The HN VPN can’t be set up on this computer.');if(!this.controller.tools())throw Error('Install '+this.controller.toolsName+' first.');
  const key=keyPair(),old=this.deviceId;
  const created=await this.call('api/devices',{method:'POST',body:{name:('HN Browser on '+this.hostname).slice(0,60),publicKey:key.publicKey}});
  try{await this.controller.install(created.connection.config.split(PLACEHOLDER).join(key.privateKey));}
  catch(e){await this.call('api/devices/'+created.device.id,{method:'DELETE'}).catch(()=>{});throw e;}
  this.deviceId=created.device.id;this.saveState();
  if(old&&old!==this.deviceId)await this.call('api/devices/'+old,{method:'DELETE'}).catch(()=>{});
  await this.refresh();await this.poll();
 });}
 connect(){return this.task('connecting',async()=>{if(!this.ready)throw Error('Set up the HN VPN on this computer first.');await this.controller.up();await new Promise(r=>setTimeout(r,800));await this.poll();if(!this.connected)throw Error('The VPN didn’t connect. Try again.');});}
 disconnect(){return this.task('disconnecting',async()=>{await this.controller.down();await this.poll();});}
 toggle(){return this.connected?this.disconnect():this.connect();}
 // Removes this computer's VPN connection and its registration.
 remove(){return this.task('removing',async()=>{await this.controller.down().catch(()=>{});await this.controller.remove();if(this.deviceId&&this.token)await this.call('api/devices/'+this.deviceId,{method:'DELETE'}).catch(()=>{});this.deviceId=null;this.saveState();await this.refresh();await this.poll();});}
}

// Whether the HN Group server answers through the VPN (its SSH port).
function reachable(host=SERVER,port=22,timeout=3000){return new Promise(resolve=>{const socket=net.connect({host,port});const done=value=>{socket.destroy();resolve(value);};socket.setTimeout(timeout,()=>done(false));socket.once('connect',()=>done(true));socket.once('error',()=>done(false));});}

module.exports={VPN,MacController,WindowsController,UnsupportedController,FakeController,controllerFor,keyPair,reachable,ORIGIN,SERVER};
