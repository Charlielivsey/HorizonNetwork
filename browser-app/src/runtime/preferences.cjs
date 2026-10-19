'use strict';
const fs=require('node:fs'),path=require('node:path');
// Coalesced, ordered atomic writes. Disk I/O never sits on the interaction path.
class Preferences{
 constructor(file){this.file=file;this.next=null;this.timer=null;this.writing=null;this.sequence=0;}
 save(value){this.next=JSON.stringify(value);clearTimeout(this.timer);this.timer=setTimeout(()=>this.drain().catch(()=>{}),80);}
 async drain(){clearTimeout(this.timer);this.timer=null;if(this.writing){await this.writing;if(this.next!==null)return this.drain();return;}if(this.next===null)return;const data=this.next;this.next=null;const file=this.file+'.'+process.pid+'.'+(++this.sequence)+'.tmp';this.writing=(async()=>{await fs.promises.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{await fs.promises.writeFile(file,data,{mode:0o600});await fs.promises.rename(file,this.file);}finally{await fs.promises.rm(file,{force:true});}})();try{await this.writing;}finally{this.writing=null;}if(this.next!==null)await this.drain();}
}
module.exports={Preferences};
