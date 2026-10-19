'use strict';
const fs=require('node:fs'),path=require('node:path');
class Vault{
 constructor(file,storage){this.file=file;this.storage=storage;}
 available(){return this.storage.isEncryptionAvailable()&&(process.platform!=='linux'||this.storage.getSelectedStorageBackend?.()!=='basic_text');}
 save(token){if(!this.available())throw Error('Secure account storage is unavailable on this computer. Your account will need a new sign-in after closing.');const encrypted=this.storage.encryptString(token);fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});fs.writeFileSync(this.file+'.tmp',encrypted,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 load(){if(!fs.existsSync(this.file)||!this.available())return null;try{const value=this.storage.decryptString(fs.readFileSync(this.file));return/^[a-f0-9]{64}$/.test(value)?value:null;}catch{return null;}}
 clear(){fs.rmSync(this.file,{force:true});}
}
module.exports={Vault};
