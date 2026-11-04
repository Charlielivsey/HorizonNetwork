'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function sessions(dir){const file=path.join(dir,'sessions.json');let db={};fs.mkdirSync(dir,{recursive:true,mode:0o700});try{db=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
 const save=()=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db),{mode:0o600});fs.renameSync(tmp,file);};
 return{session(token){const s=db[hash(token)];return s&&s.expires>Date.now()?s:null;},createSession(user,authSession,expires){const token=crypto.randomBytes(32).toString('hex');db[hash(token)]={user,authSession,checked:Date.now(),expires:Math.min(expires,Date.now()+30*86400000)};for(const[k,s]of Object.entries(db))if(s.expires<Date.now())delete db[k];save();return token;},updateSession(token,patch){if(db[hash(token)]){Object.assign(db[hash(token)],patch);save();}},endSession(token){delete db[hash(token)];save();}};}
module.exports={sessions};
