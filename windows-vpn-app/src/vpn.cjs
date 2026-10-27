'use strict';
// HN VPN in HN Browser: sign in to vpn.hngroup.org.uk (through HN Group Auth in a tab, so an unlocked
// browser account only needs its PIN), register this computer with its own WireGuard key, and turn the
// full-tunnel VPN (all traffic goes through the HN Group server; it is 10.88.0.1 inside the VPN) on and off.
// Only an opaque VPN sign-in token is kept, encrypted like the browser account (vpn.enc). Device keys
// live in the root/Administrator-only WireGuard configuration, never in browser storage.
const http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process');
// CONFIG_VERSION 3: full tunnel (all traffic). Computers set up for the split tunnel (no version) are offered an update.
const ORIGIN='https://vpn.hngroup.org.uk',SERVER='10.88.0.1',CONFIG_VERSION=3,PLACEHOLDER='<this device’s private key>';
const run=(file,args,options={})=>new Promise(resolve=>execFile(file,args,{timeout:options.timeout||30000,windowsHide:true},(error,stdout,stderr)=>resolve({code:error?(typeof error.code==='number'?error.code:-1):0,output:String(stdout||'')+String(stderr||'')})));
const lastLine=text=>String(text||'').trim().split(/\r?\n/).filter(Boolean).at(-1)||'';
// A WireGuard (Curve25519) key pair, made on this computer.
function keyPair(){const{publicKey,privateKey}=crypto.generateKeyPairSync('x25519');const b64=jwk=>Buffer.from(jwk,'base64url').toString('base64');return{publicKey:b64(publicKey.export({format:'jwk'}).x),privateKey:b64(privateKey.export({format:'jwk'}).d)};}
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
const psQuote=value=>"'"+String(value).replace(/'/g,"''")+"'";

// macOS: shares the helper, configuration and sudo rule with HN Secure Network, so either app
// can turn the same connection on and off. Setting up asks for the Mac password once.
class MacController{
 constructor({helperSource,user=os.userInfo().username}={}){this.helper='/usr/local/libexec/hn-vpn/hn-vpn-ctl';this.helperSource=helperSource;this.user=user;this.supported=true;this.toolsName='WireGuard tools (Homebrew)';}
 tools(){return['/opt/homebrew/bin/wg-quick','/usr/local/bin/wg-quick'].some(f=>{try{fs.accessSync(f,fs.constants.X_OK);return true;}catch{return false;}});}
 async ready(){if(!fs.existsSync(this.helper)||!fs.existsSync('/usr/local/etc/hn-vpn'))return false;return(await run('/usr/bin/sudo',['-n',this.helper,'status'])).code===0;}
 async status(){const r=await run('/usr/bin/sudo',['-n',this.helper,'status']);return r.code===0&&r.output.trim()==='up';}
 async handshake(){const r=await run('/usr/bin/sudo',['-n',this.helper,'handshake']);const epoch=Number(r.output.trim());return r.code===0&&epoch>0?new Date(epoch*1000).toISOString():null;}
 async up(){const r=await run('/usr/bin/sudo',['-n',this.helper,'up'],{timeout:60000});if(r.code!==0)throw Error('The VPN couldn’t connect. '+lastLine(r.output));}
 async down(){const r=await run('/usr/bin/sudo',['-n',this.helper,'down'],{timeout:60000});if(r.code!==0)throw Error('The VPN couldn’t disconnect. '+lastLine(r.output));}
 async remove(){if(fs.existsSync(this.helper))await run('/usr/bin/sudo',['-n',this.helper,'remove'],{timeout:60000});}
 async install(config,{reuseKey=false}={}){
  if(!/^[a-z_][a-z0-9_.-]{0,31}$/i.test(this.user))throw Error('This Mac user name can’t be used for the VPN.');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-vpn-'));
  try{
   const conf=path.join(dir,'hn-vpn.conf'),helper=path.join(dir,'hn-vpn-ctl'),rule=path.join(dir,'sudoers');
   fs.writeFileSync(conf,config,{mode:0o600});fs.writeFileSync(helper,fs.readFileSync(this.helperSource),{mode:0o755});fs.writeFileSync(rule,this.user+' ALL=(root) NOPASSWD: '+this.helper+'\n',{mode:0o600});
   const command=['set -e',...(reuseKey?["hn_key=$(/usr/bin/awk '/^PrivateKey[[:space:]]*=/{print $3;exit}' /usr/local/etc/hn-vpn/hn-vpn.conf)",'[ ${#hn_key} -eq 44 ]',"/usr/bin/sed 's|<this device’s private key>|'\"$hn_key\"'|' "+quote(conf)+' > '+quote(conf+'.resolved'), 'mv '+quote(conf+'.resolved')+' '+quote(conf)]:[]),'/usr/sbin/visudo -cf '+quote(rule)+' >/dev/null','mkdir -p /usr/local/libexec/hn-vpn /usr/local/etc/hn-vpn','chown root:wheel /usr/local/libexec/hn-vpn /usr/local/etc/hn-vpn','chmod 755 /usr/local/libexec/hn-vpn; chmod 700 /usr/local/etc/hn-vpn','install -m 755 -o root -g wheel '+quote(helper)+' '+this.helper,'hn_was_up=0; if [ -f /var/run/wireguard/hn-vpn.name ]; then '+this.helper+' down; hn_was_up=1; fi','install -m 600 -o root -g wheel '+quote(conf)+' /usr/local/etc/hn-vpn/hn-vpn.conf','install -m 440 -o root -g wheel '+quote(rule)+' /etc/sudoers.d/hn-group-vpn','if [ "$hn_was_up" -eq 1 ]; then '+this.helper+' up; fi'].join('; ');
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
 setupScript(conf,{reuseKey=false}={}){
  const target=path.win32.join(this.dir,'hn-vpn.conf');
  return['$dir = '+psQuote(this.dir),...(reuseKey?['$oldConfig = Get-Content -Raw -LiteralPath '+psQuote(target),"$keyMatch = [regex]::Match($oldConfig, '(?m)^PrivateKey\\s*=\\s*(\\S+)')",'if (-not $keyMatch.Success) { throw "The old VPN key is unavailable. Remove and set up this computer again." }']:[]),
   'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
   // SYSTEM and Administrators only (SIDs, so it works in any Windows language).
   'icacls $dir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null',
   ...(reuseKey?['$template = Get-Content -Raw -LiteralPath '+psQuote(conf),'[IO.File]::WriteAllText('+psQuote(target)+', $template.Replace('+psQuote(PLACEHOLDER)+', $keyMatch.Groups[1].Value))']:['Copy-Item -Force -LiteralPath '+psQuote(conf)+' -Destination '+psQuote(target)]),
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
 async install(config,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-vpn-'));
  try{const conf=path.join(dir,'hn-vpn.conf');fs.writeFileSync(conf,config,{mode:0o600});await this.elevated(this.setupScript(conf,options));}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 async remove(){if(await this.ready())await this.elevated('& '+psQuote(this.exe)+' /uninstalltunnelservice hn-vpn | Out-Null\r\nRemove-Item -Force -LiteralPath '+psQuote(path.win32.join(this.dir,'hn-vpn.conf'))+' -ErrorAction SilentlyContinue');}
}

// Linux (Bazzite, Fedora and other NetworkManager desktops): the connection is a NetworkManager WireGuard
// connection called hn-vpn. Setting up imports it (the desktop asks for an administrator's password if
// NetworkManager needs one) and makes it this user's own, so connecting and disconnecting need no prompt.
// NetworkManager keeps the private key in its root-only connection store.
class LinuxController{
 constructor({nmcli,user=os.userInfo().username}={}){this.nmcli=nmcli||['/usr/bin/nmcli','/bin/nmcli','/usr/local/bin/nmcli'].find(f=>fs.existsSync(f))||'/usr/bin/nmcli';this.name='hn-vpn';this.user=user;this.supported=true;this.toolsName='NetworkManager';}
 tools(){try{fs.accessSync(this.nmcli,fs.constants.X_OK);return true;}catch{return false;}}
 nm(args,timeout){return run(this.nmcli,args,{timeout});}
 // Every NetworkManager connection called hn-vpn (an import never replaces one, so there could be several).
 async ids(active=false){const r=await this.nm(['-t','-f','UUID,NAME,TYPE','connection','show',...(active?['--active']:[])]);if(r.code!==0)return[];return r.output.split(/\r?\n/).map(l=>l.split(':')).filter(p=>p.length===3&&p[1]===this.name&&p[2]==='wireguard').map(p=>p[0]).filter(u=>/^[0-9a-f-]{36}$/i.test(u));}
 async ready(){return(await this.ids()).length>0;}
 async status(){return(await this.ids(true)).length>0;}
 // NetworkManager only shows the last handshake to root; the VPN website's record is used instead.
 async handshake(){return null;}
 async up(){const[id]=await this.ids();if(!id)throw Error('Set up the HN VPN on this computer first.');const r=await this.nm(['--wait','45','connection','up','uuid',id],60000);if(r.code!==0)throw Error('The VPN couldn’t connect. '+lastLine(r.output));}
 async down(){for(const id of await this.ids(true)){const r=await this.nm(['--wait','30','connection','down','uuid',id],60000);if(r.code!==0&&await this.status())throw Error('The VPN couldn’t disconnect. '+lastLine(r.output));}}
 async remove(){for(const id of await this.ids())await this.nm(['connection','delete','uuid',id],60000);}
 // The private key of the connection already set up here (only its owner may read it).
 async key(){const[id]=await this.ids();if(!id)return'';const r=await this.nm(['--show-secrets','-g','wireguard.private-key','connection','show','uuid',id]);const k=r.output.trim();return r.code===0&&/^[A-Za-z0-9+/]{43}=$/.test(k)?k:'';}
 async install(config,{reuseKey=false}={}){
  if(!/^[a-z_][a-z0-9_.-]{0,31}$/i.test(this.user))throw Error('This user name can’t be used for the VPN.');
  if(reuseKey){const k=await this.key();if(!k)throw Error('The old VPN key is unavailable. Remove and set up this computer again.');config=config.split(PLACEHOLDER).join(k);}
  // The file name becomes the connection's (and its network interface's) name.
  const base=process.env.XDG_RUNTIME_DIR&&fs.existsSync(process.env.XDG_RUNTIME_DIR)?process.env.XDG_RUNTIME_DIR:os.tmpdir(),dir=fs.mkdtempSync(path.join(base,'hn-vpn-'));
  try{
   const conf=path.join(dir,this.name+'.conf');fs.writeFileSync(conf,config,{mode:0o600});
   // The new connection is added before the old one is deleted, so a failed or cancelled setup keeps the old one.
   const old=await this.ids(),wasUp=await this.status();if(wasUp)await this.down().catch(()=>{});
   const r=await this.nm(['connection','import','type','wireguard','file',conf],300000);
   if(r.code!==0){if(wasUp)await this.up().catch(()=>{});throw Error(/not authori[sz]ed|insufficient privileges|permission/i.test(r.output)?'NetworkManager didn’t allow the change. Approve the password prompt to set up the VPN.':'Setup didn’t finish. '+lastLine(r.output));}
   const id=(await this.ids()).find(u=>!old.includes(u));if(!id)throw Error('Setup didn’t finish. NetworkManager didn’t keep the connection.');
   for(const u of old)await this.nm(['connection','delete','uuid',u],60000);
   // Never starts by itself (HN apps only connect when asked); this user's own, so it connects without a prompt.
   await this.nm(['connection','modify','uuid',id,'connection.autoconnect','no','connection.permissions','user:'+this.user],120000);
   if(wasUp)await this.nm(['--wait','45','connection','up','uuid',id],60000);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
}

class UnsupportedController{constructor(){this.supported=false;this.toolsName='';}tools(){return false;}async ready(){return false;}async status(){return false;}async up(){throw Error('The HN VPN can’t be controlled on this computer.');}async down(){}async remove(){}async install(){throw Error('The HN VPN can’t be set up on this computer.');}}

// For desktop tests only: a connection that lives in memory.
class FakeController{constructor(){this.supported=true;this.toolsName='WireGuard';this.installed=null;this.on=false;}tools(){return true;}async ready(){return!!this.installed;}async status(){return this.on;}async up(){if(!this.installed)throw Error('Not set up.');this.on=true;}async down(){this.on=false;}async remove(){this.installed=null;this.on=false;}async install(config,{reuseKey=false}={}){if(reuseKey){const key=/PrivateKey = (\S+)/.exec(this.installed||'')?.[1];if(!key)throw Error('The previous VPN key is missing.');config=config.split(PLACEHOLDER).join(key);}this.installed=config;}}

function controllerFor(platform,options){return platform==='darwin'?new MacController(options):platform==='win32'?new WindowsController(options):platform==='linux'?new LinuxController(options):new UnsupportedController();}

class VPN{
 // client/appName/deviceName let HN Secure Network for Windows share this file with HN Browser.
 constructor({vault,controller,stateFile,openTab,closeTab,changed,fetcher=fetch,origin=ORIGIN,version='0',hostname=os.hostname(),reach=reachable,client='hn-browser',appName='HN Browser',deviceName}){Object.assign(this,{vault,controller,stateFile,openTab,closeTab,changed,fetch:fetcher,origin,version,hostname,reach,client,appName});this.deviceName=deviceName||(appName+' on '+hostname);this.token=null;this.user=null;this.devices=[];this.limit=5;this.deviceId=null;this.ready=false;this.tools=false;this.connected=false;this.reachable=null;this.publicIp=null;this.viaVpn=null;this.lastHandshake=null;this.polling=null;this.removed=false;this.busy=null;this.error='';this.pending=null;this.generation=0;try{const saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));this.deviceId=saved.deviceId||null;this.configVersion=saved.configVersion||0;}catch{}}
 snapshot(){const device=this.devices.find(d=>d.id===this.deviceId)||null;return{outdated:!!(this.ready&&device&&(this.configVersion||0)<CONFIG_VERSION),supported:this.controller.supported,toolsName:this.controller.toolsName,signedIn:!!this.token,user:this.user,device:device&&{name:device.name,address:device.address},publicIp:this.publicIp,viaVpn:this.viaVpn,lastHandshake:this.lastHandshake||device?.lastHandshake||null,removed:this.removed,devices:this.devices.length,limit:this.limit,tools:this.tools,ready:this.ready,shared:this.ready&&!device,connected:this.connected,reachable:this.reachable,busy:this.busy,error:this.error,server:SERVER,signingIn:!!this.pending};}
 note(){this.changed?.(this.snapshot());}
 saveState(){fs.mkdirSync(path.dirname(this.stateFile),{recursive:true});fs.writeFileSync(this.stateFile+'.tmp',JSON.stringify({deviceId:this.deviceId,configVersion:this.configVersion||0}),{mode:0o600});fs.renameSync(this.stateFile+'.tmp',this.stateFile);}
 async call(route,{method='GET',body}={}){let response;try{response=await this.fetch(this.origin+'/'+route,{method,headers:{Accept:'application/json','X-HN-VPN-Client':this.client,'X-HN-VPN-App':this.version,...(this.token?{Authorization:'Bearer '+this.token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw Error('The HN VPN service can’t be reached. Check your internet connection.');}const value=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(value.error||'The HN VPN service had a problem. Please try again.'),{status:response.status});return value;}
 async task(name,fn){if(this.busy)throw Error('The VPN is busy. Try again in a moment.');this.busy=name;this.error='';this.note();try{return await fn();}catch(e){this.error=e.message;throw e;}finally{this.busy=null;this.note();}}
 async restore(){this.token=this.vault.load();this.tools=this.controller.tools();await this.poll();if(this.token)await this.refresh();}
 async refresh(){if(!this.token)return;try{const me=await this.call('api/me');this.user=me.user;this.devices=me.devices||[];this.limit=me.limit||5;if(this.deviceId&&!this.devices.some(d=>d.id===this.deviceId)){this.removed=true;this.error='This computer was removed from the VPN website. Set it up again before connecting.';await this.controller.down().catch(()=>{});this.deviceId=null;this.ready=false;this.connected=false;this.saveState();}this.note();}catch(e){if(e.status===401||e.status===403){await this.controller.down().catch(()=>{});this.connected=false;this.forgetToken();this.error=e.status===403?'Your HN account is disabled or no longer permitted to use the VPN. Contact an administrator.':'Your HN VPN sign-in ended. Sign in again.';this.note();}}}
 async poll(){if(this.polling)return this.polling;this.polling=(async()=>{this.tools=this.controller.tools();this.ready=await this.controller.ready().catch(()=>false);this.connected=this.ready&&await this.controller.status().catch(()=>false);if(this.removed)this.ready=false;this.reachable=this.connected?await this.reach():null;
  if(this.connected){const [ip]=await Promise.all([this.call('api/ip').catch(()=>null),this.token?this.refresh():null]);this.publicIp=ip?.ip||null;this.viaVpn=typeof ip?.viaVpn==='boolean'?ip.viaVpn:null;this.lastHandshake=this.devices.find(d=>d.id===this.deviceId)?.lastHandshake||await this.controller.handshake?.().catch(()=>null)||null;}else{this.publicIp=null;this.viaVpn=null;this.lastHandshake=null;}this.note();})();try{return await this.polling;}finally{this.polling=null;}}
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
   res.end('<!doctype html><meta charset="utf-8"><title>HN VPN</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#161126;color:#f4efff;font:15px system-ui,sans-serif;text-align:center"><div><h1 style="font-size:24px">'+(ok?'HN VPN is ready in '+this.appName+'.':'HN VPN sign-in didn’t finish.')+'</h1><p style="color:#b7a9cc">'+(ok?(this.closeTab?'This tab closes by itself.':'You can close this tab and go back to '+this.appName+'.'):'Close this tab and try again from '+this.appName+'.')+'</p></div>');
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
  const old=this.deviceId;if(old){const current=await this.call('api/devices/'+old+'/connection');await this.controller.install(current.connection.config,{reuseKey:true});this.configVersion=current.connection.configVersion||CONFIG_VERSION;this.removed=false;this.saveState();await this.refresh();await this.poll();return;}const key=keyPair();
  const created=await this.call('api/devices',{method:'POST',body:{name:this.deviceName.slice(0,60),publicKey:key.publicKey}});
  try{await this.controller.install(created.connection.config.split(PLACEHOLDER).join(key.privateKey));}
  catch(e){await this.call('api/devices/'+created.device.id,{method:'DELETE'}).catch(()=>{});throw e;}
  this.removed=false;this.deviceId=created.device.id;this.configVersion=created.connection.configVersion||CONFIG_VERSION;this.saveState();
  if(old&&old!==this.deviceId)await this.call('api/devices/'+old,{method:'DELETE'}).catch(()=>{});
  await this.refresh();await this.poll();
 });}
 connect(){return this.task('connecting',async()=>{if(!this.ready)throw Error('Set up the HN VPN on this computer first.');await this.controller.up();await new Promise(r=>setTimeout(r,800));await this.poll();if(!this.connected)throw Error('The VPN didn’t connect. Try again.');if(this.reachable===false){this.error='The tunnel started, but the HN server is not answering. UDP 51820 may be blocked by your network or the hosting provider firewall. Check the VPN handshake and try again.';this.note();}});}
 disconnect(){return this.task('disconnecting',async()=>{await this.controller.down();await this.poll();});}
 toggle(){return this.connected?this.disconnect():this.connect();}
 // HN Secure Network asks for the HN account's six-digit PIN before every connection; vpn.hngroup.org.uk
 // checks it with the staff backend (five wrong tries lock it for 15 minutes).
 async verifyPin(pin){if(!/^\d{6}$/.test(String(pin||'')))throw Error('Enter your six-digit PIN.');if(!this.token)throw Error('Sign in to the HN VPN first.');try{await this.call('api/app/verify-pin',{method:'POST',body:{pin:String(pin)}});}catch(e){if(e.status===404)throw Error('The VPN server needs its latest update before it can check PINs. Please try again later.');if(e.status===401){this.forgetToken();this.error='Your HN VPN sign-in ended. Sign in again.';this.note();}throw e;}}
 // Removes this computer's VPN connection and its registration.
 remove(){return this.task('removing',async()=>{await this.controller.down().catch(()=>{});await this.controller.remove();if(this.deviceId&&this.token)await this.call('api/devices/'+this.deviceId,{method:'DELETE'}).catch(()=>{});this.deviceId=null;this.saveState();await this.refresh();await this.poll();});}
}

// Whether the HN Group server answers through the VPN (its SSH port).
function reachable(host=SERVER,port=22,timeout=3000){return new Promise(resolve=>{const socket=net.connect({host,port});const done=value=>{socket.destroy();resolve(value);};socket.setTimeout(timeout,()=>done(false));socket.once('connect',()=>done(true));socket.once('error',()=>done(false));});}

module.exports={VPN,MacController,WindowsController,LinuxController,UnsupportedController,FakeController,controllerFor,keyPair,reachable,ORIGIN,SERVER};
