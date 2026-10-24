'use strict';
// This computer's HN Group device identity, shared by HN Browser, HN Secure Network and HN Group App Manager
// (identical copies in each app's src/device.cjs; the Mac Secure Network app reads the same files in Swift).
// A device must be approved on devices.hngroup.org.uk before the apps can be used, installed or updated there.
//
// The identity (a random id and secret) is made once and kept in a folder every HN app on this computer shares:
//   macOS   ~/Library/Application Support/HN Group/Device/device.json
//   Windows %APPDATA%\HN Group\Device\device.json
// The server also gets a fingerprint of the computer's hardware id (IOPlatformUUID / MachineGuid), so a copied
// identity on other hardware isn't trusted. The last answer is kept in status.json, so an approved computer keeps
// working for a while (trustFor, 7 days) when devices.hngroup.org.uk can't be reached.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const ORIGIN='https://devices.hngroup.org.uk',TRUST_FOR=7*86400000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,HEX=/^[a-f0-9]{64}$/;
const STATUSES=['authorised','pending','unlinked','revoked','mismatch'];
function folder(platform=process.platform,home=os.homedir(),appData=process.env.APPDATA){
 if(platform==='darwin')return path.join(home,'Library','Application Support','HN Group','Device');
 if(platform==='win32')return path.join(appData||path.join(home,'AppData','Roaming'),'HN Group','Device');
 return path.join(home,'.config','hn-group','device');}
const run=(file,args)=>new Promise(resolve=>execFile(file,args,{timeout:10000,windowsHide:true},(error,stdout)=>resolve(error?'':String(stdout||''))));
// A fingerprint of this computer's hardware id, never the id itself.
async function machineId(platform=process.platform){
 let raw='';
 if(platform==='darwin')raw=(/"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(await run('/usr/sbin/ioreg',['-rd1','-c','IOPlatformExpertDevice']))||[])[1]||'';
 else if(platform==='win32')raw=(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/.exec(await run('reg.exe',['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid']))||[])[1]||'';
 else{try{raw=fs.readFileSync('/etc/machine-id','utf8').trim();}catch{}}
 if(!raw)raw='host:'+os.hostname()+':'+platform;
 return crypto.createHash('sha256').update('hn-group-device:'+raw.trim().toUpperCase()).digest('hex');}
function readJSON(file){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:null;}catch{return null;}}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify(value,null,1),{mode:0o600});fs.renameSync(tmp,file);}
function osName(platform=process.platform){const r=os.release();if(platform==='darwin'){const major=Number(r.split('.')[0]);return'macOS '+(major>=20?major-9:'10.'+(major-4));}if(platform==='win32')return Number(r.split('.')[2])>=22000?'Windows 11':'Windows 10';return'Linux';}
// The computer's own name, as people know it (on a Mac, its sharing name).
async function computerName(platform=process.platform){if(platform==='darwin'){const n=(await run('/usr/sbin/scutil',['--get','ComputerName'])).trim();if(n)return n;}return os.hostname().replace(/\.local$/,'');}

class Device{
 // app: 'browser' | 'secure-network' | 'app-manager'. dir/machine/name/fetcher can be replaced in tests.
 constructor({app,version='0',dir=folder(),origin=ORIGIN,platform=process.platform,fetcher=fetch,machine=null,name=null}){Object.assign(this,{app,version,dir,origin,platform,fetch:fetcher,machineOverride:machine,nameOverride:name});this.last=null;this.checking=null;}
 // Made once, shared by every HN app: the first app to run creates it (exclusively, so two apps can't race).
 identity(){
  const file=path.join(this.dir,'device.json'),saved=readJSON(file);
  if(saved&&UUID.test(saved.id||'')&&HEX.test(saved.secret||''))return saved;
  const fresh={id:crypto.randomUUID(),secret:crypto.randomBytes(32).toString('hex'),createdAt:new Date().toISOString()};
  fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
  try{fs.writeFileSync(file,JSON.stringify(fresh,null,1),{flag:saved?'w':'wx',mode:0o600});return fresh;}
  catch(e){if(e.code==='EEXIST'){const other=readJSON(file);if(other&&UUID.test(other.id||'')&&HEX.test(other.secret||''))return other;writeJSON(file,fresh);return fresh;}throw e;}}
 cached(){const v=readJSON(path.join(this.dir,'status.json'));return v&&STATUSES.includes(v.status)?v:null;}
 // What the app should do now: allowed, plus everything the "not authorised" page shows.
 state(){const c=this.last||this.cached(),now=Date.now();
  if(!c)return{status:'unknown',allowed:false,checked:false,offline:!!this.error,error:this.error||null};
  const fresh=!!this.last&&!this.error,trusted=c.status==='authorised'&&(fresh||now<(c.trustUntil||0));
  return{status:c.status,allowed:trusted,checked:fresh,offline:!!this.error,error:this.error||null,name:c.name||null,owner:c.owner||null,code:c.code||null,linkUrl:c.linkUrl||this.origin+'/link'+(c.code?'?code='+c.code:''),checkedAt:c.checkedAt||null,id:this.identity().id};}
 // Asks devices.hngroup.org.uk. Offline or a server problem keeps the last answer (see state()).
 check(){if(this.checking)return this.checking;this.checking=(async()=>{
  try{const id=this.identity(),body={id:id.id,secret:id.secret,machine:this.machineOverride||await machineId(this.platform),name:this.nameOverride||await computerName(this.platform),platform:this.platform,os:osName(this.platform),app:this.app,version:String(this.version)};
   let response;try{response=await this.fetch(this.origin+'/api/device/check',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});}
   catch{throw Error('HN Group Devices can’t be reached. Check your internet connection.');}
   const value=await response.json().catch(()=>null);
   if(!response.ok||!value||!STATUSES.includes(value.status))throw Error(value?.error||'HN Group Devices couldn’t check this computer right now.');
   const now=Date.now(),record={status:value.status,name:String(value.name||''),owner:value.owner?.displayName?{displayName:String(value.owner.displayName)}:null,code:/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value.code||'')?value.code:null,
    linkUrl:typeof value.linkUrl==='string'&&value.linkUrl.startsWith(this.origin+'/')?value.linkUrl:this.origin+'/link',checkedAt:now,trustUntil:value.status==='authorised'?now+Math.min(Number(value.trustFor)||TRUST_FOR,TRUST_FOR):0};
   this.last=record;this.error=null;try{writeJSON(path.join(this.dir,'status.json'),record);}catch{}
  }catch(e){this.error=e.message;}
  finally{this.checking=null;}
  return this.state();})();return this.checking;}
}
// Desktop tests only: answers like devices.hngroup.org.uk, with the status written in a file (approved by default),
// so a test can show the "not authorised" window and then approve the computer.
function testFetcher(file){return async()=>{let status='authorised';try{status=fs.readFileSync(file,'utf8').trim()||status;}catch{}if(status==='offline')throw Error('offline');
 return new Response(JSON.stringify({status,name:'Test computer',owner:status==='pending'||status==='authorised'?{displayName:'Test Person'}:null,code:status==='unlinked'?'ABCD-2345':null,linkUrl:ORIGIN+'/link'+(status==='unlinked'?'?code=ABCD-2345':''),trustFor:TRUST_FOR}),{status:200,headers:{'Content-Type':'application/json'}});};}
module.exports={Device,folder,machineId,osName,testFetcher,ORIGIN,TRUST_FOR};
