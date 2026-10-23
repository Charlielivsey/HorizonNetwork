'use strict';
// Release records from downloads.hngroup.org.uk: only the exact app, platform, file name and fixed download route
// are accepted, and every download is checked for its size and SHA-256 before (and again just before) it's used.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ORIGIN='https://downloads.hngroup.org.uk',MAX=400*1024*1024;
function parts(v){return typeof v==='string'&&/^\d+\.\d+\.\d+(?:-\d+)?$/.test(v)?v.split(/[.-]/).map(Number):null;}
function newer(a,b){const x=parts(a),y=parts(b);if(!x||!y)return false;for(let i=0;i<4;i++){if((x[i]||0)!==(y[i]||0))return(x[i]||0)>(y[i]||0);}return false;}
function asset(data,id,platform,arch){
 let a,v,build=0,route,name,published=null;
 const mac=platform==='darwin';if(!mac&&!(platform==='win32'&&arch==='x64'))return null;
 if(id==='browser'){
  if(mac&&arch!=='arm64')return null;
  v=data?.release?.version;if(!parts(v))return null;
  const short=v.split('-')[0];route=mac?'mac-arm64-zip':'windows-x64';a=data.release.assets?.[route];published=data.release.publishedAt;name='HN-Browser-'+short+(mac?'-mac-arm64.zip':'-win-x64.exe');
 }else if(['network','manager'].includes(id)){
  const key=id==='network'?(mac?'secure-network':'secure-network-windows'):(mac?'app-manager-mac':'app-manager-windows');
  const app=data?.apps?.[key];v=app?.version;build=app?.build||0;if(!parts(v)||!Number.isSafeInteger(build)||build<0)return null;
  if(build&&!v.includes('-'))v+='-'+build;
  route=id==='network'?(mac?'secure-network-mac':'secure-network-windows'):key;
  name=(id==='network'?'HN-Secure-Network-':'HN-Group-App-Manager-')+v.split('-')[0]+(id==='network'?(mac?'-macOS.zip':'-windows-x64.exe'):(mac?'-mac-universal.zip':'-win-x64.exe'));
  a=app?.asset;published=app?.publishedAt;
 }else return null;
 if(!a||a.url!=='/download/'+route||a.name!==name||!Number.isSafeInteger(a.size)||a.size<1||a.size>MAX||!/^[a-f0-9]{64}$/.test(a.sha256||''))return null;
 const at=Date.parse(published||'');
 return{version:v,name,size:a.size,sha256:a.sha256,url:ORIGIN+a.url,publishedAt:Number.isFinite(at)?new Date(at).toISOString():null};
}
async function verified(file,a){const stat=await fs.promises.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==a.size)throw Error('Installer size did not match. Please download it again.');const hash=crypto.createHash('sha256');for await(const c of fs.createReadStream(file))hash.update(c);if(hash.digest('hex')!==a.sha256)throw Error('Installer verification failed. Please download it again.');return file;}
async function download(a,dir,{fetcher=fetch,progress=()=>{},signal}={}){
 if(!a||!a.url.startsWith(ORIGIN+'/download/')||a.name!==path.basename(a.name)||!parts(a.version)||!Number.isSafeInteger(a.size)||a.size<1||a.size>MAX||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('Invalid installer.');
 await fs.promises.mkdir(dir,{recursive:true,mode:0o700});const out=path.join(dir,a.sha256+'-'+a.name),tmp=out+'.'+crypto.randomUUID()+'.part';
 const response=await fetcher(a.url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(1800000)]):AbortSignal.timeout(1800000)});
 if(!response.ok||!response.body)throw Error('The installer is temporarily unavailable.');
 const file=await fs.promises.open(tmp,'wx',0o600);let received=0;
 try{for await(const chunk of response.body){received+=chunk.length;if(received>a.size)throw Error('Installer was larger than expected.');await file.writeFile(chunk);progress(received,a.size);}await file.close();await verified(tmp,a);await fs.promises.rename(tmp,out);return out;}catch(e){await file.close().catch(()=>{});await fs.promises.rm(tmp,{force:true});throw e;}
}
module.exports={ORIGIN,MAX,parts,newer,asset,download,verified};
