'use strict';
// Other HN Group apps on the downloads page: HN Secure Network (the HN Group VPN and SSH app) for Mac
// and for Windows. Each is built by its own GitHub workflow (.github/workflows/mac-vpn-app.yml and
// windows-vpn-app.yml), published as a GitHub preview release of the fixed repository and recorded in
// downloads-site/secure-network.json or secure-network-windows.json. Newest wins between GitHub and the
// installed copy.
const fs=require('node:fs'),path=require('node:path'),{newer}=require('./releases');
const REPO='Charlielivsey/HorizonNetwork',BASE='https://github.com/'+REPO+'/releases/download/',RAW='https://raw.githubusercontent.com/'+REPO+'/claude/confident-volta-gxjboo/downloads-site/';
const KINDS={
 'manager-mac':{file:'app-manager-mac.json',tag:/^app-manager-v(\d+\.\d+\.\d+)-(\d+)$/,asset:v=>'HN-Group-App-Manager-'+v+'-mac-universal.zip'},
 'manager-windows':{file:'app-manager-windows.json',tag:/^app-manager-v(\d+\.\d+\.\d+)-(\d+)$/,asset:v=>'HN-Group-App-Manager-'+v+'-win-x64.exe'},
 mac:{file:'secure-network.json',tag:/^secure-network-v(\d+\.\d+\.\d+)-(\d+)$/,asset:v=>'HN-Secure-Network-'+v+'-macOS.zip'},
 windows:{file:'secure-network-windows.json',tag:/^secure-network-windows-v(\d+\.\d+\.\d+)-(\d+)$/,asset:v=>'HN-Secure-Network-'+v+'-windows-x64.exe'},
};
// Only a genuine record: the right tag, the matching file name, a sensible size and a SHA-256.
function readApp(m,kind='mac'){
 const k=KINDS[kind],t=k&&k.tag.exec(m?.tag||'');if(!t)return null;const a=m.asset||{};
 if(a.name!==k.asset(t[1])||!Number.isSafeInteger(a.size)||a.size<1||a.size>400*1024*1024||!/^[a-f0-9]{64}$/.test(a.sha256||''))return null;
 return{version:t[1]+'-'+t[2],release:t[1],build:Number(t[2]),publishedAt:m.publishedAt||null,asset:{name:a.name,size:a.size,sha256:a.sha256,url:BASE+m.tag+'/'+a.name}};
}
function createApp(dir,{kind='mac',fetcher=fetch,bundled}={}){
 const k=KINDS[kind];bundled=bundled||path.join(__dirname,'..',k.file);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,k.file);let value=null,at=0,pending;
 try{value=readApp(JSON.parse(fs.readFileSync(file)),kind);}catch{}
 const offer=m=>{const parsed=readApp(m,kind);if(!parsed||(value&&!newer(parsed.version,value.version)))return;value=parsed;try{fs.writeFileSync(file+'.tmp',JSON.stringify(m),{mode:0o600});fs.renameSync(file+'.tmp',file);}catch{}};
 async function refresh(){if(pending)return pending;if(Date.now()-at<120000)return value;at=Date.now();pending=(async()=>{
  try{offer(JSON.parse(fs.readFileSync(bundled,'utf8')));}catch{}
  try{const r=await fetcher(RAW+k.file,{headers:{'User-Agent':'HN-Group-Downloads'},signal:AbortSignal.timeout(10000)});if(r.ok)offer(await r.json());}catch{}
  pending=null;return value;})();return pending;}
 return{refresh,get current(){return value;}};
}
module.exports={createApp,readApp};
