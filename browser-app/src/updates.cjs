'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ORIGIN='https://downloads.hngroup.org.uk',MAX_BYTES=400*1024*1024;
function version(value){const m=/^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(value||'');return m?m.slice(1).map(n=>Number(n||0)):null;}
function newer(candidate,current){const a=version(candidate),b=version(current);if(!a||!b)return false;for(let i=0;i<4;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}
function installer(release,platform,arch,current){
 const id=platform==='darwin'&&arch==='arm64'?'mac-arm64':platform==='win32'&&arch==='x64'?'windows-x64':null;
 const asset=id&&release?.assets?.[id];if(!asset||!newer(release.version,current))return null;
 const v=version(release.version),suffix=platform==='darwin'?'mac-'+arch+'.dmg':'win-x64.exe';
 if(asset.url!=='/download/'+id||asset.name!=='HN-Browser-'+v.slice(0,3).join('.')+'-'+suffix||!/^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>MAX_BYTES)throw Error('The update information could not be verified.');
 return{...asset,version:release.version,url:ORIGIN+asset.url};
}
class Updates{
 constructor({dir,current,platform=process.platform,arch=process.arch,changed=()=>{},fetcher=fetch}){Object.assign(this,{dir,current,platform,arch,changed,fetcher});this.state={status:'idle',current,progress:0};this.asset=null;this.file=null;this.busy=false;}
 emit(patch){this.state={...this.state,...patch};this.changed(this.state);}
 async check(){if(this.busy||this.state.status==='ready')return;this.busy=true;this.emit({status:'checking',error:null});try{const response=await this.fetcher(ORIGIN+'/api/releases',{signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw Error('Could not check for updates. Try again later.');const data=await response.json();this.asset=installer(data.release,this.platform,this.arch,this.current);this.emit({status:this.asset?'available':'current',latest:this.asset?.version||null,progress:0});}catch(e){this.emit({status:'error',error:e.message});}finally{this.busy=false;}}
 async download(){if(this.busy||!this.asset)return;this.busy=true;this.emit({status:'downloading',progress:0,error:null});let temporary;
 try{const asset=this.asset;fs.mkdirSync(this.dir,{recursive:true,mode:0o700});temporary=path.join(this.dir,crypto.randomUUID()+'.partial');const response=await this.fetcher(asset.url,{signal:AbortSignal.timeout(1800000),redirect:'error'});if(!response.ok||!response.body)throw Error('The update download is unavailable. Try again.');const hash=crypto.createHash('sha256');let received=0,last=-1;const file=await fs.promises.open(temporary,'wx',0o600);
 try{for await(const chunk of response.body){received+=chunk.length;if(received>asset.size||received>MAX_BYTES)throw Error('The update download has an unexpected size.');hash.update(chunk);await file.writeFile(chunk);const progress=Math.floor(received/asset.size*100);if(progress!==last){last=progress;this.emit({progress});}}}finally{await file.close();}
 if(received!==asset.size||hash.digest('hex')!==asset.sha256)throw Error('Update verification failed. The installer has been discarded.');
 this.file=path.join(this.dir,asset.name);await fs.promises.rm(this.file,{force:true});await fs.promises.rename(temporary,this.file);temporary=null;this.emit({status:'ready',progress:100});
 }catch(e){this.file=null;this.emit({status:'error',error:e.message});}finally{if(temporary)await fs.promises.rm(temporary,{force:true});this.busy=false;}}
 async verifiedFile(){if(!this.file||this.state.status!=='ready'||!this.asset)throw Error('Download an update first.');const hash=crypto.createHash('sha256');let size=0;for await(const chunk of fs.createReadStream(this.file)){hash.update(chunk);size+=chunk.length;}if(size!==this.asset.size||hash.digest('hex')!==this.asset.sha256){this.file=null;this.emit({status:'error',error:'The installer changed. Download the update again.'});throw Error(this.state.error);}return this.file;}
}
module.exports={Updates,newer,installer};
