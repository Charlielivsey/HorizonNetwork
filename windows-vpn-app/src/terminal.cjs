'use strict';
// Opens SSH sessions to the HN Group server in their own terminal window (src/ssh-console.cjs), like the Mac
// app opens Terminal. The app keeps only the username (root by default) and the server's SHA-256
// fingerprint once it has been confirmed. The password typed in the app is handed once to the window that
// was just opened, over a one-time loopback address that only accepts a single-use ticket, and then dropped.
const{EventEmitter}=require('node:events');
const net=require('node:net'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const HOST='10.88.0.1',PORT=22,USERNAME=/^[a-z_][a-z0-9_.-]{0,31}$/i,FINGERPRINT=/^SHA256:[A-Za-z0-9+/]{43}$/;

class Terminals extends EventEmitter{
 // launch(args) opens the SSH window with these two arguments; verify({host,fingerprint}) asks the person to
 // confirm the server the first time.
 constructor({file,launch,verify,host=HOST,port=PORT,timeout=60000}){super();Object.assign(this,{file,launch,verify,host,port,timeout});this.username='root';this.fingerprint=null;this.last=null;this.opened=0;
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(USERNAME.test(saved.username||''))this.username=saved.username;if(FINGERPRINT.test(saved.fingerprint||''))this.fingerprint=saved.fingerprint;}catch{}}
 snapshot(){return{host:HOST,username:this.username,fingerprint:this.fingerprint,opened:this.opened,last:this.last&&{...this.last}};}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify({username:this.username,fingerprint:this.fingerprint}),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 note(status,error=''){this.last={status,error,at:Date.now()};this.emit('changed',this.snapshot());}
 // Resolves once the new window has collected the session (it then signs in by itself).
 open({username,password}){
  username=String(username||'').trim()||'root';
  if(!USERNAME.test(username))return Promise.reject(Error('Enter a valid server username.'));
  if(typeof password!=='string'||!password)return Promise.reject(Error('Enter your server password.'));
  if(password.length>4096)return Promise.reject(Error('That password is too long.'));
  this.username=username;this.save();
  const ticket=crypto.randomBytes(32).toString('hex');let secret=password;password=null;
  return new Promise((resolve,reject)=>{
   const server=net.createServer();let settled=false;
   const done=error=>{if(settled)return;settled=true;clearTimeout(timer);server.close();secret=null;if(error){this.note('error',error.message);reject(error);}else resolve();};
   const timer=setTimeout(()=>done(Error('The SSH window didn’t open. Try again.')),this.timeout);timer.unref?.();
   server.maxConnections=1;
   server.on('connection',socket=>{
    // Only the first caller is heard, and only with the right ticket.
    server.close();socket.setEncoding('utf8');let buffer='',handed=false;
    const send=message=>{if(!socket.destroyed)socket.write(JSON.stringify(message)+'\n');};
    socket.on('error',()=>{});
    socket.on('close',()=>{if(!handed)done(Error('The SSH window closed before it started.'));});
    socket.on('data',async chunk=>{
     buffer+=chunk;if(buffer.length>16384){socket.destroy();return;}
     let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let message;try{message=JSON.parse(line);}catch{socket.destroy();return;}
      if(!handed){
       const given=Buffer.from(String(message.ticket||'')),expected=Buffer.from(ticket);
       if(given.length!==expected.length||!crypto.timingSafeEqual(given,expected)){socket.destroy();done(Error('The SSH window couldn’t be checked, so it wasn’t given your password.'));return;}
       handed=true;send({host:this.host,port:this.port,username,password:secret,fingerprint:this.fingerprint});secret=null;
       this.opened++;this.note('connecting');done();continue;}
      if(typeof message.verify==='string'&&FINGERPRINT.test(message.verify)&&!this.fingerprint){
       const trusted=await Promise.resolve(this.verify({host:HOST,fingerprint:message.verify})).catch(()=>false);
       if(trusted){this.fingerprint=message.verify;this.save();}
       send({trusted:!!trusted});if(!trusted)this.note('error','The server’s identity wasn’t confirmed, so the session was not opened.');}
      else if(message.ready===true)this.note('open');
      else if(typeof message.error==='string')this.note('error',message.error.slice(0,300));
     }
    });
   });
   server.listen(0,'127.0.0.1',()=>{Promise.resolve().then(()=>this.launch([String(server.address().port),ticket])).catch(e=>done(Error(e?.message||'The SSH window couldn’t be opened.')));});
  });
 }
}
module.exports={Terminals,HOST,PORT};
