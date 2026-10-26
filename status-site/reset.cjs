'use strict';
// Offline administrative command. Stop hn-status first so a check cannot overwrite the reset.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{fresh}=require('./catalog.cjs');
function reset(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'status.json'),backupDir=path.join(dir,'backups');let backup=null;
 if(fs.existsSync(file)){const data=fs.readFileSync(file);JSON.parse(data.toString('utf8'));fs.mkdirSync(backupDir,{recursive:true,mode:0o700});backup=path.join(backupDir,'status-before-reset-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json');fs.writeFileSync(backup,data,{flag:'wx',mode:0o600});}
 const db=fresh(),tmp=file+'.reset-'+crypto.randomUUID();try{fs.writeFileSync(tmp,JSON.stringify(db),{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}return{backup,services:db.services.length};}
if(require.main===module){if(process.argv[2]!=='--confirm-status-stopped'){console.error('Stop hn-status first, then use: DATA_DIR=/var/lib/hn-status node reset.cjs --confirm-status-stopped');process.exitCode=2;}else console.log(JSON.stringify(reset(process.env.DATA_DIR||path.join(__dirname,'data'))));}
module.exports={reset};
