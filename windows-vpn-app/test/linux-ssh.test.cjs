'use strict';
// SSH on Linux: the real OpenSSH client (ssh and ssh-keyscan) against a real SSH server on this computer standing in for
// the HN Group server. The terminal window is replaced by pipes so the test can read it. Skipped where OpenSSH is missing.
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const{Server,utils}=require('ssh2');
const{LinuxTerminals,keyscan,which,terminalOrder,sshArgs,cleanEnv}=require('../src/linux-ssh.cjs');

async function server(){const auth=[];const s=new Server({hostKeys:[utils.generateKeyPairSync('ed25519').private]},client=>{
  client.on('authentication',ctx=>{auth.push(ctx.method);if(ctx.method==='password'&&ctx.username==='charlie'&&ctx.password==='server-pass-582')ctx.accept();else ctx.reject(['password']);});
  client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('pty',a=>a?.());session.on('env',a=>a?.());session.on('shell',acceptShell=>{const stream=acceptShell();stream.write('Welcome to the HN Group server\n');stream.on('data',d=>{if(String(d).includes('exit')){stream.exit(0);stream.end();}else stream.write('> '+d);});});}));
  client.on('error',()=>{});});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));return{s,auth,port:s.address().port};}
// "Terminal windows" that run the session with pipes.
function terminals(){const list=[];return{list,launch:async cmd=>{const child=spawn(cmd[0],cmd.slice(1),{stdio:['pipe','pipe','pipe'],env:cleanEnv(process.env)});const w={child,output:'',exited:new Promise(r=>child.on('exit',r))};child.stdout.on('data',d=>{w.output+=d;});child.stderr.on('data',d=>{w.output+=d;});list.push(w);}};}
const until=async(fn,ms=15000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('timed out');};

test('Linux SSH: password only through a one-time askpass, keys never offered, server identity pinned',{skip:!which('ssh')||!which('ssh-keyscan')||process.platform==='win32'},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-sn-linux-ssh-')),runtime=fs.mkdtempSync(path.join(os.tmpdir(),'hn-sn-runtime-')),{s,auth,port}=await server(),w=terminals(),asked=[];
 // A key in ~/.ssh and an agent must be ignored: the session signs in with the password only.
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'hn-sn-home-'));fs.mkdirSync(path.join(home,'.ssh'));fs.writeFileSync(path.join(home,'.ssh','config'),'Host *\n  IdentityFile ~/.ssh/id_test\n  PubkeyAuthentication yes\n');
 const env={...process.env,XDG_RUNTIME_DIR:runtime,HOME:home,SSH_AUTH_SOCK:path.join(home,'agent.sock')};
 try{
  const t=new LinuxTerminals({file:path.join(dir,'ssh.json'),launch:w.launch,verify:async x=>{asked.push(x);return true;},host:'127.0.0.1',port,env});
  await assert.rejects(t.open({username:'bad name',password:'x'}),/valid server username/);
  await assert.rejects(t.open({username:'charlie',password:''}),/password/);
  // The fingerprint ssh-keyscan reports is the one the app pins.
  const scanned=await keyscan('127.0.0.1',port);assert.match(scanned.fingerprint,/^SHA256:[A-Za-z0-9+/]{43}$/);assert.equal(scanned.type,'ssh-ed25519');
  await t.open({username:'charlie',password:'server-pass-582'});
  assert.deepEqual(asked.map(a=>a.fingerprint),[scanned.fingerprint]);
  await until(()=>w.list[0].output.includes('Welcome to the HN Group server'));
  await until(()=>t.snapshot().last?.status==='open');
  // The password was handed over once and is gone; it was never on the command line or in the session script.
  const session=fs.readdirSync(runtime).map(n=>path.join(runtime,n))[0];
  assert.ok(!fs.existsSync(path.join(session,'secret')),'the password is deleted once ssh has it');
  assert.ok(!fs.readFileSync(path.join(session,'session.sh'),'utf8').includes('server-pass-582'));
  w.list[0].child.stdin.write('exit\n');await until(()=>w.list[0].output.includes('Press Enter'));w.list[0].child.stdin.end('\n');await w.list[0].exited;
  assert.equal(fs.readdirSync(runtime).length,0,'the session folder is removed when the window closes');
  const saved=fs.readFileSync(path.join(dir,'ssh.json'),'utf8');assert.ok(!saved.includes('server-pass-582'));assert.deepEqual(JSON.parse(saved),{username:'charlie',fingerprint:scanned.fingerprint});
  // A wrong password is refused and reported; the identity isn't asked again.
  await t.open({username:'charlie',password:'wrong'});
  await until(()=>t.snapshot().last?.status==='error');assert.match(t.snapshot().last.error,/didn’t accept the sign-in/);
  w.list[1].child.stdin.end('\n');await w.list[1].exited;assert.equal(asked.length,1);
  assert.ok(auth.length&&auth.every(m=>m!=='publickey'),'no SSH key is ever offered: '+auth.join(','));
  // A changed server identity is refused before any window opens.
  const other=new LinuxTerminals({file:path.join(dir,'other.json'),launch:w.launch,verify:async()=>true,host:'127.0.0.1',port,env});other.fingerprint='SHA256:'+'A'.repeat(43);
  await assert.rejects(other.open({username:'charlie',password:'server-pass-582'}),/identity has changed/);assert.equal(w.list.length,2);
  // A server identity that isn't confirmed opens nothing.
  const declined=new LinuxTerminals({file:path.join(dir,'declined.json'),launch:w.launch,verify:async()=>false,host:'127.0.0.1',port,env});
  await assert.rejects(declined.open({username:'charlie',password:'server-pass-582'}),/wasn’t confirmed/);assert.equal(w.list.length,2);assert.equal(fs.readdirSync(runtime).length,0);
 }finally{s.close();for(const x of w.list)x.child.kill();for(const d of[dir,runtime,home])fs.rmSync(d,{recursive:true,force:true});}
});

test('Linux SSH: the desktop’s own terminal is preferred and ssh is told never to use keys or agents',()=>{
 assert.equal(terminalOrder('KDE')[0],'konsole');assert.equal(terminalOrder('GNOME')[0],'ptyxis');assert.ok(terminalOrder('').includes('xterm'));
 const a=sshArgs({host:'10.88.0.1',port:22,username:'root',type:'ssh-ed25519',dir:'/run/user/1000/hn-ssh-x'}).join(' ');
 for(const o of['-F /dev/null','PubkeyAuthentication=no','IdentityAgent=none','IdentityFile=none','StrictHostKeyChecking=yes','HostKeyAlgorithms=ssh-ed25519','ForwardAgent=no'])assert.ok(a.includes(o),o);
 assert.ok(sshArgs({host:'h',port:22,username:'r',type:'ssh-rsa',dir:'/d'}).includes('HostKeyAlgorithms=rsa-sha2-512,rsa-sha2-256'));
 const env=cleanEnv({PATH:'/tmp/.mount_x:/usr/bin',APPDIR:'/tmp/.mount_x',APPIMAGE:'/a.AppImage',LD_LIBRARY_PATH:'/tmp/.mount_x/usr/lib',HOME:'/home/sam'});
 assert.equal(env.PATH,'/usr/bin');assert.equal(env.LD_LIBRARY_PATH,undefined);assert.equal(env.APPIMAGE,undefined);assert.equal(env.HOME,'/home/sam');
});
