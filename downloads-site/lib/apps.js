'use strict';
// Other HN Group apps on the downloads page. HN Secure Network (the Mac VPN and SSH app) is built by
// .github/workflows/mac-vpn-app.yml, published as a GitHub preview release of the fixed repository and
// recorded in downloads-site/secure-network.json. Newest wins between GitHub and the installed copy.
const fs=require('node:fs'),path=require('node:path'),{newer}=require('./releases');
const REPO='Charlielivsey/HorizonNetwork',BASE='https://github.com/'+REPO+'/releases/download/';
const MANIFEST='https://raw.githubusercontent.com/'+REPO+'/claude/confident-volta-gxjboo/downloads-site/secure-network.json';
// Only a genuine record: secure-network-vX.Y.Z-N tag, matching file name, size and SHA-256.
function readApp(m){
 if(!m||!/^secure-network-v\d+\.\d+\.\d+-\d+$/.test(m.tag||''))return null;const version=m.tag.replace(/^secure-network-v/,''),a=m.asset||{};
 if(!/^HN-Secure-Network-\d+\.\d+\.\d+-macOS\.zip$/.test(a.name||'')||!Number.isSafeInteger(a.size)||a.size<1||a.size>200*1024*1024||!/^[a-f0-9]{64}$/.test(a.sha256||''))return null;
 return{version,publishedAt:m.publishedAt||null,asset:{name:a.name,size:a.size,sha256:a.sha256,url:BASE+m.tag+'/'+a.name}};
}
function createApp(dir,{fetcher=fetch,bundled=path.join(__dirname,'..','secure-network.json')}={}){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'secure-network.json');let value=null,record=null,at=0,pending;
 try{record=JSON.parse(fs.readFileSync(file));value=readApp(record);}catch{}
 const offer=m=>{const parsed=readApp(m);if(!parsed||(value&&!newer(parsed.version,value.version)))return;value=parsed;record=m;try{fs.writeFileSync(file+'.tmp',JSON.stringify(m),{mode:0o600});fs.renameSync(file+'.tmp',file);}catch{}};
 async function refresh(){if(pending)return pending;if(Date.now()-at<120000)return value;at=Date.now();pending=(async()=>{
  try{offer(JSON.parse(fs.readFileSync(bundled,'utf8')));}catch{}
  try{const r=await fetcher(MANIFEST,{headers:{'User-Agent':'HN-Group-Downloads'},signal:AbortSignal.timeout(10000)});if(r.ok)offer(await r.json());}catch{}
  pending=null;return value;})();return pending;}
 return{refresh,get current(){return value;}};
}
module.exports={createApp,readApp};
