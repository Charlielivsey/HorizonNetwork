'use strict';
const fs=require('node:fs'),path=require('node:path');
const REPO='Charlielivsey/HorizonNetwork',BASE='https://github.com/'+REPO+'/releases/download/';
function readRelease(release){
 if(!release||release.draft||!/^browser-v\d+\.\d+\.\d+-\d+$/.test(release.tag_name))return null;
 // DMGs, the Windows installer and the Linux AppImage are for people; the Mac zips let HN Browser update itself in place.
 const platforms={'mac-arm64':/-mac-arm64\.dmg$/,'windows-x64':/-win-x64\.exe$/,'mac-arm64-zip':/-mac-arm64\.zip$/,'linux-x64':/-linux-x86_64\.AppImage$/};
 const assets={};for(const[id,pattern]of Object.entries(platforms)){const a=(release.assets||[]).find(a=>pattern.test(a.name)&&/^HN-Browser-[0-9A-Za-z._\-]+$/.test(a.name)&&a.browser_download_url?.startsWith(BASE+release.tag_name+'/'));if(a)assets[id]={name:a.name,url:a.browser_download_url,size:a.size,sha256:/^sha256:[a-f0-9]{64}$/.test(a.digest||'')?a.digest.slice(7):null};}
 return Object.keys(assets).length?{version:release.tag_name.replace(/^browser-v/,''),publishedAt:release.published_at,assets}:null;
}
// CI records each browser release in downloads-site/release.json (version, file names, sizes, SHA-256),
// so the newest browser is found at a fixed address without GitHub's API (which allows only 60
// unauthenticated requests an hour and then hides new releases). The API stays as a fallback.
const MANIFEST='https://raw.githubusercontent.com/'+REPO+'/claude/confident-volta-gxjboo/downloads-site/release.json';
function fromManifest(m){if(!m||!/^browser-v\d+\.\d+\.\d+-\d+$/.test(m.tag||'')||typeof m.assets!=='object')return null;return{tag_name:m.tag,draft:false,published_at:m.publishedAt||null,assets:Object.values(m.assets).filter(a=>a&&typeof a.name==='string'&&/^[a-f0-9]{64}$/.test(a.sha256||'')).map(a=>({name:a.name,size:a.size,digest:'sha256:'+a.sha256,browser_download_url:BASE+m.tag+'/'+a.name}))};}
// Version order for "0.7.0-17" style versions (version, then build).
function newer(a,b){const x=String(a||'').split(/[.-]/).map(Number),y=String(b||'').split(/[.-]/).map(Number);for(let i=0;i<4;i++)if((x[i]||0)!==(y[i]||0))return(x[i]||0)>(y[i]||0);return false;}
// Sources, newest wins: release.json on GitHub (no rate limit), the copy installed with this site
// (downloads-site/release.json, so a plain update works even if GitHub can't be reached), then the API.
function createReleases(dir,{fetcher=fetch,bundled=path.join(__dirname,'..','release.json')}={}){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'release.json');let value=null,at=0,pending,source='saved',checked=null,problems=[];
 try{value=readRelease(JSON.parse(fs.readFileSync(file)));}catch{}
 function offer(release,from){const parsed=readRelease(release);if(!parsed||(value&&!newer(parsed.version,value.version)&&parsed.version!==value.version))return;if(value&&parsed.version===value.version&&source!=='saved')return;value=parsed;source=from;try{fs.writeFileSync(file+'.tmp',JSON.stringify(release),{mode:0o600});fs.renameSync(file+'.tmp',file);}catch{}}
 async function refresh(){if(pending)return pending;if(Date.now()-at<120000)return value;at=Date.now();pending=(async()=>{problems=[];let manifest=false;
  try{offer(fromManifest(JSON.parse(fs.readFileSync(bundled,'utf8'))),'installed copy');}catch{}
  try{const m=await fetcher(MANIFEST,{headers:{'User-Agent':'HN-Group-Downloads'},signal:AbortSignal.timeout(10000)});if(m.ok){const release=fromManifest(await m.json());offer(release,'GitHub release.json');manifest=!!readRelease(release);}else problems.push('release.json: HTTP '+m.status);}catch(e){problems.push('release.json: '+(e.cause?.code||e.message));}
  // The API (60 requests an hour without a key) is only needed when release.json couldn't be read.
  if(!manifest)try{const r=await fetcher('https://api.github.com/repos/'+REPO+'/releases?per_page=30',{headers:{Accept:'application/vnd.github+json','User-Agent':'HN-Group-Downloads'},signal:AbortSignal.timeout(10000),redirect:'error'});if(r.ok){for(const release of await r.json())offer(release,'GitHub API');}else problems.push('API: HTTP '+r.status);}catch(e){problems.push('API: '+(e.cause?.code||e.message));}
  checked=new Date().toISOString();pending=null;return value;})();return pending;}
 return{refresh,get current(){return value;},get status(){return{version:value?.version||null,source,checked,problems};}};
}
module.exports={createReleases,readRelease,fromManifest,MANIFEST,newer};
