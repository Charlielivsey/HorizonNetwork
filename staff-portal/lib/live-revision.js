'use strict';
// Opaque change marker only: no file names, contents or case metadata leave the backend.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function liveRevision(dir){
 let at=0,cached='';
 return function revision(){
  if(Date.now()-at<250&&cached)return cached;
  const rows=[];
  for(const name of fs.readdirSync(dir).sort()){
   if(!name.endsWith('.json')||/^(sessions|audit|activity|login-attempts)([.-]|$)/i.test(name))continue;
   try{const stat=fs.statSync(path.join(dir,name));if(stat.isFile())rows.push([name,stat.mtimeMs,stat.size]);}catch{}
  }
  cached=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');at=Date.now();return cached;
 };
};
