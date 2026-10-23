'use strict';
// HN Secure Network's SSH window: a small console program that the app opens in a terminal window (Windows
// Terminal or the console, whichever Windows uses), like the Mac app opens Terminal. It is built into its
// own executable (scripts/ssh-helper.cjs) so the window is a real console with full keyboard support.
//
// It never asks for or keeps anything itself: it calls back to the app on a one-time loopback address,
// proves itself with a single-use ticket, and receives the server, the username and the password typed
// in the app. It signs in with that password only (no SSH keys on this PC are ever read or offered),
// checks the server's SHA-256 fingerprint against the one the app remembers, and asks the app to confirm
// it the first time. The password is dropped as soon as the server has accepted it.
const net=require('node:net'),crypto=require('node:crypto'),{Client}=require('ssh2');

const fingerprint=key=>'SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'');
const out=text=>process.stdout.write(text);
const tty=!!(process.stdin.isTTY&&process.stdout.isTTY);
const C={dim:'\x1b[2m',violet:'\x1b[38;2;201;180;255m',green:'\x1b[38;2;124;211;160m',amber:'\x1b[38;2;242;199;107m',red:'\x1b[38;2;242;138;168m',bold:'\x1b[1m',reset:'\x1b[0m'};

// One JSON message per line, both ways.
class Channel{
 constructor(socket){this.socket=socket;this.buffer='';this.queue=[];this.waiting=[];this.closed=false;
  socket.setEncoding('utf8');
  socket.on('data',chunk=>{this.buffer+=chunk;if(this.buffer.length>65536){socket.destroy();return;}let i;while((i=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);let message;try{message=JSON.parse(line);}catch{continue;}const next=this.waiting.shift();if(next)next.resolve(message);else this.queue.push(message);}});
  const end=()=>{this.closed=true;for(const w of this.waiting.splice(0))w.reject(Error('HN Secure Network closed the connection.'));};
  socket.on('close',end);socket.on('error',end);}
 static open(port){return new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>resolve(new Channel(socket)));socket.once('error',()=>reject(Error('HN Secure Network isn’t answering. Open SSH from the app again.')));});}
 send(message){if(!this.closed)this.socket.write(JSON.stringify(message)+'\n');}
 next(timeout){if(this.queue.length)return Promise.resolve(this.queue.shift());if(this.closed)return Promise.reject(Error('HN Secure Network closed the connection.'));
  return new Promise((resolve,reject)=>{const entry={resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};const timer=setTimeout(()=>{this.waiting.splice(this.waiting.indexOf(entry),1);reject(Error('HN Secure Network didn’t answer in time.'));},timeout);this.waiting.push(entry);});}
 close(){this.closed=true;this.socket.end();}
}

// Leaves the window open long enough to read what went wrong.
function finish(message,code){
 if(message)out('\r\n'+C.red+message+C.reset+'\r\n');
 if(!tty)process.exit(code);
 out('\r\n'+C.dim+'Press Enter to close this window.'+C.reset);
 try{process.stdin.setRawMode(false);}catch{}
 process.stdin.resume();process.stdin.once('data',()=>process.exit(code));
}

async function main(){
 out('\x1b]0;HN Group server\x07');
 const[portArg,ticket]=process.argv.slice(-2);
 if(!/^\d{1,5}$/.test(portArg||'')||!/^[a-f0-9]{64}$/.test(ticket||''))return finish('Open SSH from HN Secure Network.',2);
 let channel;
 try{channel=await Channel.open(Number(portArg));channel.send({ticket});}catch(e){return finish(e.message,1);}
 let job;try{job=await channel.next(15000);}catch(e){return finish(e.message,1);}
 if(!job||typeof job.username!=='string'||typeof job.password!=='string'||typeof job.host!=='string')return finish(job?.error||'HN Secure Network didn’t hand over the session.',1);
 const{host,port,username}=job;let password=job.password;job.password=null;
 out(C.violet+C.bold+'HN Secure Network'+C.reset+C.dim+' · encrypted session through the HN Group VPN'+C.reset+'\r\n');
 out(C.dim+'Connecting to '+C.reset+C.violet+username+'@'+host+C.reset+C.dim+'…'+C.reset+'\r\n');

 const client=new Client();let failure=null,started=false;
 const fail=message=>{if(failure)return;failure=message;channel.send({error:message});client.end();};
 client.on('keyboard-interactive',(_name,_instructions,_lang,prompts,reply)=>{
  // Some servers ask for the password this way instead; it's answered once, with the same password.
  reply(prompts.map(p=>!p.echo&&/password/i.test(p.prompt)&&password?(()=>{const value=password;password=null;return value;})():''));});
 client.on('error',e=>fail(e.level==='client-authentication'?'The server didn’t accept that username and password. Open SSH from HN Secure Network to try again.':failure||(/timed out|ECONN|ENET|EHOST/i.test(e.message)?'The HN Group server isn’t answering through the VPN. Check HN Secure Network shows you’re connected, then try again.':'The SSH connection ended unexpectedly: '+e.message)));
 client.on('close',()=>{if(!started)finish(failure||'The server closed the connection before you were signed in.',1);});
 client.on('ready',()=>{
  password=null;channel.send({ready:true});channel.close();
  client.shell({term:'xterm-256color',cols:process.stdout.columns||100,rows:process.stdout.rows||30},(error,stream)=>{
   if(error){fail('The server couldn’t open a terminal.');return;}
   started=true;out(C.green+'Signed in.'+C.reset+'\r\n');
   if(tty)process.stdin.setRawMode(true);
   process.stdin.resume();process.stdin.on('data',data=>stream.write(data));
   stream.on('data',data=>process.stdout.write(data));stream.stderr.on('data',data=>process.stderr.write(data));
   process.stdout.on('resize',()=>stream.setWindow(process.stdout.rows,process.stdout.columns,0,0));
   stream.on('close',()=>{try{if(tty)process.stdin.setRawMode(false);}catch{}out('\r\n'+C.dim+'The session ended.'+C.reset+'\r\n');client.end();process.exit(0);});
  });
 });

 client.connect({host,port,username,password,tryKeyboard:true,readyTimeout:15000,keepaliveInterval:15000,keepaliveCountMax:4,
  // The server's identity: it must match the one HN Secure Network remembers, or be confirmed in the app the first time.
  hostVerifier:(key,callback)=>{const seen=fingerprint(key);
   if(job.fingerprint){if(seen===job.fingerprint)return callback(true);failure='The HN Group server’s identity has changed ('+seen+'), so HN Secure Network refused to connect. Contact HN Group before trying again.';channel.send({error:failure,changed:seen});return callback(false);}
   out(C.amber+'Confirm the server’s identity in HN Secure Network…'+C.reset+'\r\n');
   channel.send({verify:seen});
   channel.next(300000).then(answer=>{if(answer?.trusted===true)return callback(true);failure='The server’s identity wasn’t confirmed, so the session was not opened.';callback(false);}).catch(e=>{failure=e.message;callback(false);});}});
}

main().catch(e=>finish(e.message||String(e),1));
