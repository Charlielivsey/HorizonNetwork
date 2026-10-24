// Real-browser sign-in to HN Group Devices, end to end: the real staff account service, the real HN Group Auth
// and the real Devices site behind a loopback HTTPS gateway, driven in Chromium. Signing in with the password and
// PIN must land back on devices.hngroup.org.uk signed in (the user's report, 24 October 2026: it got stuck on Auth).
//   node devices-site/browser-smoke.cjs      (needs Playwright's Chromium and openssl)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),https=require('https'),net=require('net'),assert=require('assert/strict'),{spawn,execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const free=()=>new Promise(r=>{const s=http.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const ready=async url=>{for(let n=0;n<100;n++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Not ready: '+url);};
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-devices-sso-'));const store=require(root+'/staff-portal/lib/store');store.init(dir);
 const p=store.saveEmployee({firstName:'Test',lastName:'Owner',jobTitle:'System owner',company:store.COMPANIES[0],emails:[{local:'test.owner',domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(p);store.setPassword(p,'Test-password-582!');store.setCode(p,'582947');
 const secret=path.join(dir,'secret');fs.writeFileSync(secret,'d'.repeat(64));process.env.STATUS_SSO_SECRET_FILE=secret;
 const staffPort=await free(),devicesPort=await free();
 const staff=spawn(process.execPath,[root+'/staff-portal/server.js'],{env:{...process.env,PORT:String(staffPort),DATA_DIR:dir},stdio:'ignore'});process.env.STAFF_PORTAL_BACKEND='http://127.0.0.1:'+staffPort;
 const auth=require(root+'/auth-site/server').server;await new Promise(r=>auth.listen(0,'127.0.0.1',r));const authBase='http://127.0.0.1:'+auth.address().port;
 const devices=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(devicesPort),HOST:'127.0.0.1',DEVICES_DATA_DIR:path.join(dir,'devices'),DEVICES_ORIGIN:'https://devices.hngroup.org.uk',AUTH_BACKEND:authBase,STATUS_SSO_SECRET_FILE:secret},stdio:'ignore'});
 const upstreams={'auth.hngroup.org.uk':authBase,'devices.hngroup.org.uk':'http://127.0.0.1:'+devicesPort};
 let browser,proxy,gateway;const sockets=new Set();
 try{await ready('http://127.0.0.1:'+staffPort+'/healthz');await ready('http://127.0.0.1:'+devicesPort+'/healthz');
  const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=hngroup.org.uk','-keyout',key,'-out',cert],{stdio:'ignore'});
  gateway=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{const base=upstreams[req.headers.host];if(!base){res.writeHead(404);return res.end();}const up=http.request(base+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});up.on('error',()=>{res.writeHead(502);res.end();});req.pipe(up);});
  await new Promise(r=>gateway.listen(0,'127.0.0.1',r));gateway.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  proxy=http.createServer((req,res)=>{res.writeHead(403);res.end();});proxy.on('connect',(req,client,head)=>{if(!Object.keys(upstreams).map(h=>h+':443').includes(req.url)){client.destroy();return;}sockets.add(client);client.on('close',()=>sockets.delete(client));const target=net.connect(gateway.address().port,'127.0.0.1',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)target.write(head);target.pipe(client);client.pipe(target);});target.on('error',()=>client.destroy());client.on('error',()=>target.destroy());});
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),proxy:{server:'http://127.0.0.1:'+proxy.address().port}});
  const page=await browser.newPage({viewport:{width:1280,height:900},ignoreHTTPSErrors:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  // Arriving from an app with a code: sign in, and come back to adding that computer.
  await page.goto('https://devices.hngroup.org.uk/link?code=ABCD-2345');await page.locator('#signed-out').waitFor();
  await page.locator('#sign-in').click();await page.waitForURL(/^https:\/\/auth\.hngroup\.org\.uk\/authorize/);
  await page.locator('#destination-name',{hasText:'HN Group Devices'}).waitFor();
  await page.locator('#username').fill('test.owner@hngroup.org.uk');await page.locator('#password').fill('Test-password-582!');await page.locator('#login button[type=submit]').click();
  await page.locator('#code').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#pin button[type=submit]').disabled);await page.locator('#code').pressSequentially('582947');
  await page.waitForURL('https://devices.hngroup.org.uk/link?code=ABCD-2345');
  await page.locator('#signed-in').waitFor();await page.locator('#who-name',{hasText:'Test'}).waitFor();
  assert.equal(await page.locator('#code').inputValue(),'ABCD-2345','the code from the app is ready to add');
  // Signing in again later goes straight through with the remembered PIN.
  await page.goto('https://devices.hngroup.org.uk/');await page.locator('#signed-in').waitFor();
  await page.screenshot({path:path.join(os.tmpdir(),'hn-devices-signed-in.png')});
  assert.deepEqual(errors,[]);
  console.log('Devices sign-in passed: Devices → HN Group Auth (password and PIN) → back on devices.hngroup.org.uk signed in, with the app’s code kept.');
 }finally{if(browser)await browser.close();for(const s of sockets)s.destroy();if(proxy)await new Promise(r=>proxy.close(r));if(gateway)await new Promise(r=>gateway.close(r));await new Promise(r=>auth.close(r));for(const c of[staff,devices])if(c.exitCode===null){c.kill('SIGTERM');await new Promise(r=>c.once('exit',r));}fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
