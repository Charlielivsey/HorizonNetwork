'use strict';
// SSH in its own window: the app hands the session to src/ssh-console.cjs over a one-time loopback address.
// A real SSH server on this computer stands in for the HN Group server.
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const{Server,utils}=require('ssh2');
const{Terminals}=require('../src/terminal.cjs');
// HN_SSH_HELPER=<built program> runs the same checks against the built SSH window (scripts/ssh-helper.cjs).
const HELPER=path.join(__dirname,'..','src','ssh-console.cjs');

async function server(){const auth=[];const s=new Server({hostKeys:[utils.generateKeyPairSync('ed25519').private]},client=>{
  client.on('authentication',ctx=>{auth.push(ctx.method);if(ctx.method==='password'&&ctx.username==='charlie'&&ctx.password==='server-pass-582')ctx.accept();else ctx.reject(['password']);});
  client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('pty',a=>a?.());session.on('window-change',a=>a?.());session.on('shell',acceptShell=>{const stream=acceptShell();stream.write('Welcome to the HN Group server\r\n$ ');stream.on('data',d=>{stream.write(d);if(String(d).includes('exit')){stream.exit(0);stream.end();}});});}));
  client.on('error',()=>{});});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));return{s,auth,port:s.address().port};}
// Runs the SSH window with pipes instead of a console, collecting what it shows.
function windows(){const list=[];return{list,launch:args=>{const child=process.env.HN_SSH_HELPER?spawn(process.env.HN_SSH_HELPER,args,{stdio:['pipe','pipe','pipe']}):spawn(process.execPath,[HELPER,...args],{stdio:['pipe','pipe','pipe']});const w={child,output:'',exited:new Promise(r=>child.on('exit',r))};child.stdout.on('data',d=>{w.output+=d;});child.stderr.on('data',d=>{w.output+=d;});list.push(w);}};}
const until=async(fn,ms=8000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('timed out');};

test('the password is handed over once, keys are never offered, and the server identity is pinned',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-sn-term-')),{s,auth,port}=await server(),w=windows();const asked=[];
 try{
  const t=new Terminals({file:path.join(dir,'ssh.json'),launch:w.launch,verify:async x=>{asked.push(x);return true;},host:'127.0.0.1',port});
  assert.equal(t.snapshot().username,'root');
  await assert.rejects(t.open({username:'bad name',password:'x'}),/valid server username/);
  await assert.rejects(t.open({username:'charlie',password:''}),/password/);
  await t.open({username:'charlie',password:'server-pass-582'});
  await until(()=>w.list[0].output.includes('Welcome to the HN Group server'));
  assert.equal(asked.length,1);assert.match(asked[0].fingerprint,/^SHA256:/);
  await until(()=>t.snapshot().last?.status==='open');
  w.list[0].child.stdin.write('uptime\n');await until(()=>w.list[0].output.includes('uptime'));
  w.list[0].child.stdin.write('exit\n');assert.equal(await w.list[0].exited,0);
  const saved=fs.readFileSync(path.join(dir,'ssh.json'),'utf8');assert.ok(!saved.includes('server-pass-582'));
  assert.deepEqual(JSON.parse(saved),{username:'charlie',fingerprint:asked[0].fingerprint});
  // Next time the identity is already known; a wrong password is refused in the window and reported to the app.
  await t.open({username:'charlie',password:'wrong'});
  await until(()=>t.snapshot().last?.status==='error');assert.match(t.snapshot().last.error,/didn’t accept that username and password/);
  assert.equal(await w.list[1].exited,1);assert.equal(asked.length,1);
  assert.ok(auth.length&&auth.every(m=>m!=='publickey'),'no SSH key is ever offered: '+auth.join(','));
  // A changed server identity is refused.
  const other=new Terminals({file:path.join(dir,'ssh.json'),launch:w.launch,verify:async()=>true,host:'127.0.0.1',port});other.fingerprint='SHA256:'+'A'.repeat(43);
  await other.open({username:'charlie',password:'server-pass-582'});await until(()=>other.snapshot().last?.status==='error');
  assert.match(other.snapshot().last.error,/identity has changed/);assert.equal(await w.list[2].exited,1);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('only the window that was opened, with its ticket, gets the password',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-sn-term-'));
 try{
  let port;const t=new Terminals({file:path.join(dir,'ssh.json'),launch:args=>{port=Number(args[0]);},verify:async()=>false,timeout:3000});
  const opening=t.open({username:'root',password:'secret-1'});await until(()=>port);
  const net=require('node:net'),socket=net.connect({host:'127.0.0.1',port});let got='';socket.on('data',d=>{got+=d;});socket.on('error',()=>{});
  await new Promise(r=>socket.once('connect',r));socket.write(JSON.stringify({ticket:'f'.repeat(64)})+'\n');
  await assert.rejects(opening,/couldn’t be checked/);assert.ok(!got.includes('secret-1'));
  // Nobody else can connect afterwards, and a window that never calls back times out.
  await assert.rejects(new Promise((res,rej)=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();res();});s.on('error',rej);}));
  await assert.rejects(new Terminals({file:path.join(dir,'ssh.json'),launch:()=>{},verify:async()=>false,timeout:200}).open({username:'root',password:'x'}),/didn’t open/);
  // The helper refuses to run without the app.
  const lone=spawn(process.execPath,[HELPER,'nope']);let text='';lone.stdout.on('data',d=>{text+=d;});assert.equal(await new Promise(r=>lone.on('exit',r)),2);assert.match(text,/Open SSH from HN Secure Network/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
