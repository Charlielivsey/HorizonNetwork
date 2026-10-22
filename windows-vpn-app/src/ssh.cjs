'use strict';
// Fixed-server SSH. Credentials live only in ssh2's connection memory; UI state contains metadata only.
const {EventEmitter}=require('node:events');
const {Client}=require('ssh2');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const HOST='10.88.0.1',PORT=22,TIMEOUT=15000;
const UNREACHABLE="The server isn't answering through the VPN. Check the VPN is connected and UDP 51820 is open.";
const fingerprint=key=>'SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'');
class SSH extends EventEmitter{
 constructor({file,verify=async()=>false,clientFactory=()=>new Client(),host=HOST,port=PORT,timeout=TIMEOUT}={}){super();Object.assign(this,{file,verify,clientFactory,host,port,timeout});this.sessions=new Map();this.username='root';this.pin=null;this.pendingPin=null;try{const saved=JSON.parse(fs.readFileSync(file));if(/^[a-z_][a-z0-9_.-]{0,63}$/i.test(saved.username))this.username=saved.username;if(/^SHA256:[A-Za-z0-9+/]{43}$/.test(saved.fingerprint))this.pin=saved.fingerprint;}catch{}}
 persist(){if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});fs.writeFileSync(this.file+'.tmp',JSON.stringify({username:this.username,fingerprint:this.pin}),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 snapshot(){return{host:HOST,port:PORT,username:this.username,fingerprint:this.pin,sessions:[...this.sessions.values()].map(s=>({id:s.id,username:s.username,status:s.status,error:s.error||'',started:s.started}))};}
 changed(){this.emit('changed',this.snapshot());}
 async trust(key){const candidate=fingerprint(key);if(this.pin){if(this.pin!==candidate)throw Error('The server host key has changed. Connection refused. Contact the system owner to verify the server before reconnecting.');return true;}if(!this.pendingPin){this.pendingPin=Promise.resolve(this.verify({host:HOST,fingerprint:candidate})).then(ok=>{if(!ok)throw Error('Server identity was not accepted.');this.pin=candidate;this.persist();return candidate;}).finally(()=>{this.pendingPin=null;});}if(await this.pendingPin!==candidate)throw Error('The server host key has changed. Connection refused.');return true;}
 connect({username=this.username,password,privateKey,passphrase,cols=100,rows=28}={}){
  if(!/^[a-z_][a-z0-9_.-]{0,63}$/i.test(username))throw Error('Enter a valid server username.');
  if((typeof password!=='string'||!password)&&!privateKey)throw Error('Enter your server password.');if(password?.length>4096)throw Error('That password is too long.');
  if([...this.sessions.values()].filter(s=>['connecting','connected'].includes(s.status)).length>=4)throw Error('Close a session before starting another (maximum four).');
  const s={id:crypto.randomUUID(),username,status:'connecting',started:Date.now(),client:this.clientFactory(),stream:null,queue:[],bytes:0,unacked:0};this.sessions.set(s.id,s);this.username=username;this.persist();this.changed();
  const fail=error=>{if(s.status==='closed'||s.status==='error')return;s.status='error';s.error=error;clearTimeout(s.timeout);clearTimeout(s.flush);s.queue=[];s.bytes=0;s.client.destroy();this.changed();};
  const arm=()=>{clearTimeout(s.timeout);s.timeout=setTimeout(()=>fail(UNREACHABLE),this.timeout);s.timeout.unref?.();};arm();
  s.client.on('error',e=>fail(e.level==='client-authentication'?'The username, password or private key was not accepted. Try again.':s.hostError||(/timed out|ECONN|ENET|EHOST/i.test(e.message)?UNREACHABLE:'The SSH connection ended unexpectedly. Check the VPN and reconnect.')));
  s.client.on('close',()=>{clearTimeout(s.timeout);if(s.status==='connecting')fail(s.hostError||'The server closed the connection before sign-in finished.');else if(s.status==='connected'){s.status='closed';this.changed();}});
  s.client.once('ready',()=>{clearTimeout(s.timeout);if(s.status!=='connecting')return;s.client.shell({term:'xterm-256color',cols:this.dimension(cols,200),rows:this.dimension(rows,100)},(error,stream)=>{if(error){fail('The server could not open a terminal.');return;}if(s.status!=='connecting'){stream.end();return;}s.stream=stream;s.status='connected';this.changed();stream.on('data',data=>this.output(s,data));stream.stderr?.on('data',data=>this.output(s,data));stream.on('close',()=>{s.status='closed';s.client.end();this.changed();});});});
  try{s.client.connect({host:this.host,port:this.port,username,...(privateKey?{privateKey,...(passphrase?{passphrase}:{})}:{password}),readyTimeout:0,keepaliveInterval:15000,keepaliveCountMax:3,hostVerifier:(key,callback)=>{clearTimeout(s.timeout);this.trust(key).then(()=>{if(s.status==='connecting'){arm();callback(true);}else callback(false);}).catch(e=>{s.hostError=e.message;callback(false);fail(e.message);});}});}catch{fail('The SSH credentials or private key could not be used.');}
  return s.id;
 }
 dimension(value,max){return Math.max(2,Math.min(max,Number.isFinite(value)?Math.floor(value):80));}
 entry(id){const s=this.sessions.get(id);if(!s)throw Error('That SSH session has ended.');return s;}
 output(s,data){if(s.status!=='connected')return;s.queue.push(Buffer.from(data));s.bytes+=data.length;if(s.bytes+s.unacked>262144)s.stream?.pause();if(!s.flush)s.flush=setTimeout(()=>{s.flush=null;if(!s.queue.length)return;const data=Buffer.concat(s.queue);s.queue=[];s.bytes=0;for(let i=0;i<data.length;i+=32768){const part=data.subarray(i,i+32768);s.unacked+=part.length;this.emit('data',{id:s.id,data:part.toString('base64'),bytes:part.length});}},16);}
 ack(id,bytes){const s=this.sessions.get(id);if(!s)return;s.unacked=Math.max(0,s.unacked-Math.max(0,Math.min(32768,Number(bytes)||0)));if(s.unacked+s.bytes<131072)s.stream?.resume();}
 input(id,data){const s=this.entry(id);if(s.status!=='connected'||typeof data!=='string'||Buffer.byteLength(data)>65536)throw Error('The terminal is not connected.');s.stream.write(data);}
 resize(id,cols,rows){const s=this.entry(id);if(s.stream&&s.status==='connected')s.stream.setWindow(this.dimension(rows,200),this.dimension(cols,400),0,0);}
 close(id){const s=this.sessions.get(id);if(!s)return;clearTimeout(s.timeout);clearTimeout(s.flush);s.status='closed';s.stream?.end();s.client.end();s.client.destroy();this.sessions.delete(id);this.changed();}
 closeAll(){for(const id of this.sessions.keys())this.close(id);}
}
module.exports={SSH,HOST,PORT,TIMEOUT,UNREACHABLE,fingerprint};
