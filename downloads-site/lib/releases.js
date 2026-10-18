'use strict';
const fs=require('node:fs'),path=require('node:path');
const REPO='Charlielivsey/HorizonNetwork',BASE='https://github.com/'+REPO+'/releases/download/';
function readRelease(release){
 if(!release||release.draft||!/^browser-v\d+\.\d+\.\d+-\d+$/.test(release.tag_name))return null;
 const platforms={'mac-arm64':/-mac-arm64\.dmg$/,'mac-x64':/-mac-x64\.dmg$/,'windows-x64':/-win-x64\.exe$/};
 const assets={};for(const[id,pattern]of Object.entries(platforms)){const a=(release.assets||[]).find(a=>pattern.test(a.name)&&/^HN-Browser-[0-9A-Za-z.\-]+$/.test(a.name)&&a.browser_download_url?.startsWith(BASE+release.tag_name+'/'));if(a)assets[id]={name:a.name,url:a.browser_download_url,size:a.size,sha256:/^sha256:[a-f0-9]{64}$/.test(a.digest||'')?a.digest.slice(7):null};}
 return Object.keys(assets).length?{version:release.tag_name.replace(/^browser-v/,''),publishedAt:release.published_at,assets}:null;
}
function createReleases(dir,{fetcher=fetch}={}){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'release.json');let value=null,at=0,pending;
 try{const saved=JSON.parse(fs.readFileSync(file));value=readRelease(saved);}catch{}
 async function refresh(){if(pending)return pending;if(Date.now()-at<300000)return value;at=Date.now();pending=(async()=>{try{const r=await fetcher('https://api.github.com/repos/'+REPO+'/releases?per_page=30',{headers:{Accept:'application/vnd.github+json','User-Agent':'HN-Group-Downloads'},signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)return value;const releases=await r.json();for(const release of releases){const parsed=readRelease(release);if(parsed){value=parsed;fs.writeFileSync(file+'.tmp',JSON.stringify(release),{mode:0o600});fs.renameSync(file+'.tmp',file);break;}}}catch{}finally{pending=null;}return value;})();return pending;}
 return{refresh,get current(){return value;}};
}
module.exports={createReleases,readRelease};
