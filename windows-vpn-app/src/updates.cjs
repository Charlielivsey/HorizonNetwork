'use strict';
// Updates for HN Secure Network on Windows, from downloads.hngroup.org.uk: the same installer the
// downloads page offers, checked for size and SHA-256 before it runs silently and reopens the app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ORIGIN='https://downloads.hngroup.org.uk',MAX_BYTES=400*1024*1024;
const parse=value=>{const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(value||'');return m?m.slice(1).map(Number):null;};
// Newer version, or the same version with a later build.
function newer(candidate,current){const a=parse(candidate?.version),b=parse(current?.version);if(!a||!b)return false;for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return(Number(candidate.build)||0)>(Number(current.build)||0);}
// The installer to update with, if the downloads site has a newer genuine one.
function installer(app,current){
 if(!app||!newer(app,current))return null;const a=app.asset||{};
 if(a.url!=='/download/secure-network-windows'||a.name!=='HN-Secure-Network-'+app.version+'-windows-x64.exe'||!/^[a-f0-9]{64}$/.test(a.sha256||'')||!Number.isSafeInteger(a.size)||a.size<1||a.size>MAX_BYTES)throw Error('The update information could not be verified.');
 return{name:a.name,size:a.size,sha256:a.sha256,url:ORIGIN+a.url,version:app.version,build:Number(app.build)||0};
}
class Updates{
 constructor({dir,current,changed=()=>{},fetcher=fetch}){Object.assign(this,{dir,current,changed,fetcher});this.state={status:'idle',progress:0,error:null,latest:null};this.asset=null;this.file=null;this.busy=false;}
 emit(patch){this.state={...this.state,...patch};this.changed(this.state);}
 async check(){if(this.busy||this.state.status==='ready')return this.state;this.busy=true;this.emit({status:'checking',error:null});
  try{const r=await this.fetcher(ORIGIN+'/api/releases',{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('Couldn’t check for updates. Try again later.');const data=await r.json();this.asset=installer(data.apps?.['secure-network-windows'],this.current);this.emit({status:this.asset?'available':'current',latest:this.asset?this.asset.version+' (build '+this.asset.build+')':null,progress:0});}
  catch(e){this.emit({status:'error',error:e.message});}finally{this.busy=false;}return this.state;}
 async download(){if(this.busy||!this.asset)return;this.busy=true;this.emit({status:'downloading',progress:0,error:null});let temporary;
  try{const asset=this.asset;fs.mkdirSync(this.dir,{recursive:true,mode:0o700});temporary=path.join(this.dir,crypto.randomUUID()+'.partial');
   const r=await this.fetcher(asset.url,{signal:AbortSignal.timeout(1800000),redirect:'follow'});if(!r.ok||!r.body)throw Error('The update download is unavailable. Try again.');
   const hash=crypto.createHash('sha256'),file=await fs.promises.open(temporary,'wx',0o600);let received=0,last=-1;
   try{for await(const chunk of r.body){received+=chunk.length;if(received>asset.size)throw Error('The update download has an unexpected size.');hash.update(chunk);await file.writeFile(chunk);const p=Math.floor(received/asset.size*100);if(p!==last){last=p;this.emit({progress:p});}}}finally{await file.close();}
   if(received!==asset.size||hash.digest('hex')!==asset.sha256)throw Error('The update couldn’t be verified, so it was discarded.');
   this.file=path.join(this.dir,asset.name);await fs.promises.rm(this.file,{force:true});await fs.promises.rename(temporary,this.file);temporary=null;this.emit({status:'ready',progress:100});
  }catch(e){this.file=null;this.emit({status:'error',error:e.message});}finally{if(temporary)await fs.promises.rm(temporary,{force:true});this.busy=false;}}
 // Checks the downloaded installer again just before it runs.
 async verifiedFile(){if(!this.file||this.state.status!=='ready')throw Error('Download the update first.');const hash=crypto.createHash('sha256');let size=0;for await(const chunk of fs.createReadStream(this.file)){hash.update(chunk);size+=chunk.length;}if(size!==this.asset.size||hash.digest('hex')!==this.asset.sha256){this.file=null;this.emit({status:'error',error:'The installer changed. Download the update again.'});throw Error(this.state.error);}return this.file;}
}
module.exports={Updates,newer,installer,ORIGIN};
