'use strict';
// HN Secure Network for Windows, end to end in the real app: sign in through the loopback callback, set
// up this PC, connect and disconnect, SSH, profile, settings, an update, and sign out. The VPN service,
// downloads site and OS storage are test stand-ins; the WireGuard connection lives in memory.
//   xvfb-run -a node test/desktop.cjs      (screenshots: windows-vpn-app/screenshots/)
const{Server,utils}=require('ssh2');
const{_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),crypto=require('node:crypto');
const pkg=require('../package.json'),shots=path.join(__dirname,'..','screenshots');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-secure-network-')),profileDir=path.join(dir,'profile'),fixture=path.join(dir,'fixture'),key=crypto.randomBytes(32).toString('hex'),token='c'.repeat(64);
 const installer=Buffer.from('HN Secure Network test installer '.repeat(64)),sha=crypto.createHash('sha256').update(installer).digest('hex');
 fs.mkdirSync(fixture);fs.mkdirSync(shots,{recursive:true});
 fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'hn-secure-network-fixture',version:pkg.version,main:'main.cjs'}));
 fs.writeFileSync(path.join(fixture,'main.cjs'),`const crypto=require('node:crypto'),key=Buffer.from('${key}','hex'),electron=require('electron');
Object.assign(electron.safeStorage,{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>'test',encryptString:v=>{const iv=crypto.randomBytes(16),c=crypto.createCipheriv('aes-256-cbc',key,iv);return Buffer.concat([iv,c.update(v),c.final()]);},decryptString:b=>{const c=crypto.createDecipheriv('aes-256-cbc',key,b.subarray(0,16));return Buffer.concat([c.update(b.subarray(16)),c.final()]).toString();}});
electron.dialog.showMessageBox=async()=>({response:1});
const user={displayName:'Charlie Livsey',email:'charlie.livsey@hngroup.org.uk',admin:true,avatar:'a1'},devices=[{id:'f'.repeat(24),name:'iPhone',address:'10.88.0.3',lastHandshake:null,connected:false}],log=global.__fixtureLog=[];
const installer=Buffer.from(${JSON.stringify(installer.toString())});
global.fetch=async(url,options={})=>{const u=new URL(url),method=options.method||'GET',body=options.body?JSON.parse(options.body):{},headers=options.headers||{};log.push({url:u.pathname,method,client:headers['X-HN-VPN-Client']||headers['x-hn-vpn-client']||null,auth:headers.Authorization||null});
 if(u.origin==='https://vpn.hngroup.org.uk'){
  if(u.pathname==='/api/app/exchange')return /^[a-f0-9]{64}$/.test(body.code)?Response.json({token:'${token}',user}):Response.json({error:'bad'},{status:400});
  if(headers.Authorization!=='Bearer ${token}')return Response.json({error:'Sign in'},{status:401});
  if(u.pathname==='/api/me')return Response.json({user,devices,limit:5});
  if(u.pathname==='/api/ip')return Response.json({ip:'217.154.34.205',viaVpn:true});
  if(u.pathname==='/api/devices'&&method==='POST'){const d={id:'e'.repeat(24),name:body.name,address:'10.88.0.9',lastHandshake:new Date().toISOString(),connected:true};devices.unshift(d);return Response.json({device:d,connection:{config:'[Interface]\\nPrivateKey = <this device’s private key>\\nAddress = 10.88.0.9/32\\n[Peer]\\nAllowedIPs = 0.0.0.0/0, ::/0\\n',configVersion:3}},{status:201});}
  if(/^\\/api\\/devices\\/[a-f0-9]{24}$/.test(u.pathname)&&method==='DELETE'){const i=devices.findIndex(d=>u.pathname.endsWith(d.id));if(i>=0)devices.splice(i,1);return Response.json({ok:true});}
  if(u.pathname==='/api/profile')return Response.json({user,devices,limit:5,sessions:[{id:'1'.repeat(16),kind:'app',client:'HN Secure Network',appVersion:'${pkg.version}',createdAt:'2026-10-22T09:12:00Z',lastUsedAt:'2026-10-22T16:40:00Z',current:true},{id:'2'.repeat(16),kind:'web',client:'Website',createdAt:'2026-10-21T14:02:00Z',lastUsedAt:'2026-10-21T14:30:00Z',current:false}],activity:[{at:'2026-10-22T09:12:00Z',action:'Signed in',detail:'HN Secure Network'},{at:'2026-10-22T09:13:00Z',action:'Added a device',detail:'LAPTOP (Windows)'}]});
  if(u.pathname.startsWith('/api/sessions/')&&method==='DELETE')return Response.json({ok:true});
  if(u.pathname==='/api/avatar')return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'),{headers:{'Content-Type':'image/png'}});
  if(u.pathname==='/api/sign-out')return Response.json({ok:true});
  return Response.json({error:'Not found'},{status:404});}
 if(u.origin==='https://downloads.hngroup.org.uk'){
  if(u.pathname==='/api/releases')return Response.json({release:null,apps:{'secure-network-windows':{version:'${pkg.version}',build:999,publishedAt:'2026-10-22T10:00:00Z',asset:{name:'HN-Secure-Network-${pkg.version}-windows-x64.exe',size:installer.length,sha256:'${sha}',url:'/download/secure-network-windows'}}}});
  if(u.pathname==='/download/secure-network-windows')return new Response(installer);}
 return new Response('',{status:404});};
require(${JSON.stringify(path.resolve(__dirname,'../src/main.cjs'))});`);
 let app,sshServer;
 try{
  // A real SSH server on this computer stands in for the HN Group server.
  const sshAuth=[];sshServer=new Server({hostKeys:[utils.generateKeyPairSync('ed25519').private]},client=>{
   client.on('authentication',ctx=>{sshAuth.push(ctx.method);if(ctx.method==='password'&&ctx.username==='charlie'&&ctx.password==='server-pass-582')ctx.accept();else ctx.reject(['password']);});
   client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('pty',a=>a?.());session.on('window-change',a=>a?.());session.on('shell',acceptShell=>{const stream=acceptShell();stream.write('Welcome to the HN Group server\r\n$ ');stream.on('data',d=>stream.write(d));});}));
   client.on('error',()=>{});});
  await new Promise(r=>sshServer.listen(0,'127.0.0.1',r));
  app=await electron.launch({executablePath:require('electron'),args:[...((process.getuid?.()===0||process.env.CI)?['--no-sandbox']:[]),fixture],env:{...process.env,HN_SECURE_NETWORK_TEST:'1',HN_SECURE_NETWORK_FAKE_VPN:'1',HN_SECURE_NETWORK_PROFILE:profileDir,HN_SECURE_NETWORK_SSH_PORT:String(sshServer.address().port)}});
  const page=await app.firstWindow();
  const test=fn=>app.evaluate(fn);
  const shot=async name=>{await page.evaluate(()=>{document.getElementById('toast').hidden=true;});for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(450);await page.screenshot({path:path.join(shots,name+'-'+scheme+'.png')});}await page.emulateMedia({colorScheme:'light'});};
  // Welcome: sign in with HN Group Auth through the loopback callback, like the default browser does.
  await page.locator('#sign-in').waitFor();await page.waitForTimeout(700);await shot('welcome');
  await page.locator('#sign-in').click();
  const signIn=await test(()=>global.__secureNetworkTest.log.find(x=>x.signIn)?.signIn);
  const start=new URL(signIn);assert.equal(start.origin+start.pathname,'https://vpn.hngroup.org.uk/auth/login');assert.match(start.searchParams.get('app'),/^[a-f0-9]{64}$/);
  await page.getByText('Finish signing in in your browser').waitFor();
  const done=await fetch('http://127.0.0.1:'+start.searchParams.get('loopback')+'/vpn-callback?code='+'d'.repeat(64));
  assert.equal(done.status,200);assert.match(await done.text(),/HN VPN is ready in HN Secure Network/);
  // Set up this PC: a key made here, registered, configuration installed.
  await page.locator('#set-up').waitFor();await page.waitForTimeout(400);await shot('setup');
  await page.locator('#set-up').click();
  await page.locator('#power').waitFor();
  const fetched=await test(()=>global.__fixtureLog);
  assert.ok(fetched.filter(x=>x.url.startsWith('/api/')&&x.url!=='/api/app/exchange').every(x=>x.client==='secure-network'),'sign-ins are labelled HN Secure Network');
  const installed=await test(()=>global.__secureNetworkTest.vpn().controller.installed);
  assert.match(installed,/PrivateKey = [A-Za-z0-9+/]{43}=/);assert.ok(!installed.includes('<this device'),'the private key made here is in the configuration');
  // Connect.
  await page.locator('#power').click();await page.locator('#hero-title',{hasText:'You’re protected'}).waitFor();
  await page.getByText('217.154.34.205').first().waitFor();await page.getByText('Reachable for SSH').waitFor();await page.waitForTimeout(600);await shot('connected');
  const state=await page.evaluate(()=>window.secureNetwork.state());
  assert.ok(!JSON.stringify(state).includes(token),'the VPN token never reaches the window');
  assert.deepEqual(Object.keys(await page.evaluate(()=>window.secureNetwork)).sort(),['action','onGo','state','subscribe','terminalAck','terminalData']);
  // SSH inside the app, to a real local SSH server: the password is typed here and used once, keys are
  // never offered, a wrong password is refused, and the terminal works both ways.
  await page.locator('[data-page=ssh]').click();assert.equal(await page.locator('#ssh-user').inputValue(),'root','root by default');
  await page.locator('#ssh-user').fill('charlie');await page.locator('#ssh-password').fill('not-the-password');await page.waitForTimeout(300);await shot('ssh');
  await page.locator('#ssh-connect').click();await page.getByText('The username, password or private key was not accepted. Try again.').first().waitFor();
  await page.locator('#ssh-new').click();assert.equal(await page.locator('#ssh-user').inputValue(),'charlie','the username is remembered');assert.equal(await page.locator('#ssh-password').inputValue(),'','the password field starts empty');
  await page.locator('#ssh-password').fill('server-pass-582');await page.locator('#ssh-password').press('Enter');
  await page.locator('.xterm-rows',{hasText:'Welcome to the HN Group server'}).waitFor();
  await page.locator('.term-host:not([hidden]) .xterm').click();await page.keyboard.type('uptime');await page.locator('.xterm-rows',{hasText:'uptime'}).waitFor();
  await page.waitForTimeout(400);await shot('ssh-terminal');
  assert.ok(sshAuth.length&&sshAuth.every(m=>m!=='publickey'),'no SSH key is ever offered: '+sshAuth.join(','));assert.ok(sshAuth.includes('password'));
  const afterSSH=await page.evaluate(()=>window.secureNetwork.state());assert.ok(!JSON.stringify(afterSSH).includes('server-pass-582'),'the password never reaches the window state');
  const saved=fs.readFileSync(path.join(profileDir,'ssh.json'),'utf8');assert.ok(!saved.includes('server-pass-582'));assert.equal(JSON.parse(saved).username,'charlie');assert.match(JSON.parse(saved).fingerprint,/^SHA256:/);
  // Profile.
  await page.locator('[data-page=profile]').click();await page.getByText('Where you’re signed in').waitFor();await page.getByText('VPN administrator').waitFor();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.profile-top .avatar')).backgroundImage.includes('data:image/png'));await page.waitForTimeout(500);await shot('profile');
  await page.locator('.item button',{hasText:'Sign out'}).click();await page.getByText('Signed out of that device.').waitFor();
  // Settings: preferences and an update, verified before it installs.
  await page.locator('[data-page=settings]').click();await page.locator('.switch').nth(1).click();
  await page.waitForFunction(()=>window.secureNetwork.state().then(s=>s.prefs.connectOnLaunch===true));
  await page.locator('#check-update').click();await page.getByText('Download update').waitFor();await page.waitForTimeout(300);await shot('settings');
  await page.getByText('Download update').click();await page.getByText('Install and restart').waitFor();await page.getByText('Install and restart').click();
  await page.waitForFunction(()=>new Promise(r=>setTimeout(()=>r(true),300)));
  assert.ok((await test(()=>global.__secureNetworkTest.log.some(x=>x.install))),'the verified installer would run');
  // Disconnect, then sign out (removes this PC from the VPN).
  await page.locator('[data-page=connection]').click();await page.locator('#toggle',{hasText:'Disconnect'}).click();await page.locator('#hero-title',{hasText:'You’re not connected'}).waitFor();await page.waitForTimeout(500);await shot('disconnected');
  await page.locator('[data-page=settings]').click();await page.locator('#sign-out').click();await page.locator('#sign-in').waitFor();
  assert.equal(await test(()=>global.__secureNetworkTest.vpn().controller.installed),null,'signing out removes the VPN configuration');
  assert.ok(!fs.existsSync(path.join(profileDir,'vpn.enc')),'and the saved sign-in');
  console.log('Secure Network desktop passed: sign-in, setup, connect/disconnect, SSH, profile, settings, verified update and sign-out. Screenshots in windows-vpn-app/screenshots.');
 }finally{await app?.close().catch(()=>{});sshServer?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
