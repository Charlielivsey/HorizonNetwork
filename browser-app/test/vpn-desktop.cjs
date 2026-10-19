'use strict';
// HN VPN in the browser, find in page, tab icons and keyboard shortcuts, driven through the real shell.
// A stand-in HN Auth and VPN service run inside the app (patched fetch); the WireGuard connection is
// the in-memory test controller (HN_BROWSER_VPN_FAKE), so nothing on this computer changes.
const{_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),{Vault}=require('../src/vault.cjs');
// Settings are saved just after they change, so wait for the file to catch up.
const savedPrefs=async(file,ok)=>{for(let i=0;i<100;i++){try{const p=JSON.parse(fs.readFileSync(file,'utf8'));if(ok(p))return p;}catch{}await new Promise(r=>setTimeout(r,50));}return JSON.parse(fs.readFileSync(file,'utf8'));};
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-vpn-desktop-')),profile=path.join(dir,'profile'),fixture=path.join(dir,'fixture'),key=crypto.randomBytes(32).toString('hex'),token='a'.repeat(64),vpnToken='b'.repeat(64);let app,server;
 const storageCode=`const crypto=require('node:crypto'),key=Buffer.from('${key}','hex');const storage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:value=>{const iv=crypto.randomBytes(16),c=crypto.createCipheriv('aes-256-cbc',key,iv);return Buffer.concat([iv,c.update(value),c.final()]);},decryptString:value=>{const c=crypto.createDecipheriv('aes-256-cbc',key,value.subarray(0,16));return Buffer.concat([c.update(value.subarray(16)),c.final()]).toString();}};`;
 const provider=Function('require',storageCode+'return storage;')(require);new Vault(path.join(profile,'account.enc'),provider).save(token);new Vault(path.join(profile,'vpn.enc'),provider).save(vpnToken);
 fs.mkdirSync(fixture);fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'hn-browser-vpn-fixture',version:'0.6.0',main:'main.cjs'}));
 fs.writeFileSync(path.join(fixture,'main.cjs'),storageCode+`Object.assign(require('electron').safeStorage,storage);const originalFetch=global.fetch;const devices=[];
 global.fetch=async(url,options={})=>{const u=new URL(url);
  if(u.origin==='https://auth.hngroup.org.uk'){const route=u.pathname.split('/').at(-1);if(route==='avatar')return new Response('',{status:404});if(route==='unlock'&&JSON.parse(options.body).code!=='582947')return Response.json({error:'Wrong PIN'},{status:401});return Response.json({user:{displayName:'VPN Person',email:'vpn@hngroup.org.uk',company:'HN Group',jobTitle:'Team member'},ok:true});}
  if(u.origin==='https://vpn.hngroup.org.uk'){if(options.headers?.Authorization!=='Bearer ${vpnToken}')return Response.json({error:'Sign in again.'},{status:401});
   if(u.pathname==='/api/me')return Response.json({user:{displayName:'VPN Person',email:'vpn@hngroup.org.uk'},devices,limit:5});
   if(u.pathname==='/api/sign-out')return Response.json({ok:true});
   if(u.pathname==='/api/devices'&&options.method==='POST'){const body=JSON.parse(options.body);const d={id:'c'.repeat(24),name:body.name,address:'10.88.0.7'};devices.splice(0,devices.length,d);return Response.json({device:d,connection:{config:'[Interface]\\nPrivateKey = <this device’s private key>\\n'}},{status:201});}
   if(options.method==='DELETE'){devices.splice(0);return Response.json({ok:true});}
   return Response.json({error:'Not found'},{status:404});}
  return originalFetch(url,options);};
 require(${JSON.stringify(path.resolve(__dirname,'../src/main.cjs'))});`);
 const icon=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
 server=http.createServer((req,res)=>{if(req.url==='/favicon.png'){res.writeHead(200,{'Content-Type':'image/png'});return res.end(icon);}res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Find fixture</title><link rel="icon" href="/favicon.png"><p>needle one</p><p>needle two</p><p>needle three</p>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+server.address().port+'/';
 const mod=process.platform==='darwin'?'Meta':'Control';
 try{
  app=await electron.launch({executablePath:require('electron'),args:[...((process.getuid?.()===0||process.env.CI)?['--no-sandbox']:[]),fixture],env:{...process.env,HN_BROWSER_TEST_PROFILE:profile,HN_BROWSER_VPN_FAKE:'1'}});
  const page=await app.firstWindow();let top=await require('./layers.cjs').overlayOf(app);await top.locator('#account-pin').waitFor({state:'visible'});await top.waitForFunction(()=>document.activeElement.id==='account-pin');await top.keyboard.type('582947');await top.locator('#overlay').waitFor({state:'hidden'});
  // HN VPN: signed in already (remembered), so the next step is setting up this computer.
  await page.locator('#vpn-button').click();await top.locator('#vpn-panel').waitFor({state:'visible'});
  await top.waitForFunction(()=>document.querySelector('#vpn-step-title').textContent==='Set up this computer');
  assert.equal(await top.locator('#vpn-user').textContent(),'VPN Person');assert.ok(await top.locator('#vpn-power').isDisabled());
  const state=await page.evaluate(()=>window.browser.state());assert.ok(!JSON.stringify(state).includes(vpnToken));assert.ok(!JSON.stringify(state).includes(token));
  await top.locator('#vpn-step-button').click();await top.waitForFunction(()=>document.querySelector('#vpn-step').hidden);
  assert.match(await top.locator('#vpn-device').textContent(),/HN Browser on .* · 10\.88\.0\.7/);
  await top.locator('#vpn-power').click();await top.waitForFunction(()=>document.querySelector('#vpn-title').textContent==='Connected');
  assert.equal(await top.locator('#vpn-power').getAttribute('aria-pressed'),'true');await page.locator('#vpn-dot').waitFor({state:'visible'});await top.waitForFunction(()=>document.querySelector('#vpn-chip').textContent.startsWith('Server reachable'));
  fs.mkdirSync(path.resolve(__dirname,'../.test-results'),{recursive:true});await top.screenshot({path:path.resolve(__dirname,'../.test-results/vpn.png')});
  await top.locator('#vpn-panel input[data-preference=vpnAutoConnect]').check();await page.waitForFunction(()=>window.browser.state().then(s=>s.preferences.vpnAutoConnect));assert.equal((await savedPrefs(path.join(profile,'preferences.json'),p=>p.vpnAutoConnect===true)).vpnAutoConnect,true);
  await top.locator('#vpn-power').click();await top.waitForFunction(()=>document.querySelector('#vpn-title').textContent==='Not connected');assert.ok(await page.locator('#vpn-dot').isHidden());
  // The menu shows the VPN status, and Settings has its own section.
  await top.keyboard.press('Escape');await page.locator('#browser-menu').click();await top.waitForFunction(()=>document.querySelector('#menu-vpn-status').textContent==='Not connected');await top.keyboard.press('Escape');
  // Signing out of the VPN leaves sign-in as the next step; signing in opens HN Auth via the VPN site in a tab.
  await page.locator('#vpn-button').click();await top.locator('#vpn-sign-out').click();await top.waitForFunction(()=>document.querySelector('#vpn-step-title').textContent==='Sign in to the HN VPN');assert.ok(!fs.existsSync(path.join(profile,'vpn.enc')));
  await app.evaluate(({session})=>{globalThis.vpnRequests=[];session.fromPartition('persist:hn-browser-pages').webRequest.onBeforeRequest({urls:['https://vpn.hngroup.org.uk/*']},(details,callback)=>{globalThis.vpnRequests.push(details.url);callback({cancel:true});});});
  await top.locator('#vpn-step-button').click();await top.locator('#overlay').waitFor({state:'hidden'});
  let opened='';for(let i=0;i<50&&!opened;i++){opened=(await app.evaluate(()=>globalThis.vpnRequests))[0]||'';if(!opened)await page.waitForTimeout(100);}
  assert.match(opened,/^https:\/\/vpn\.hngroup\.org\.uk\/auth\/login\?app=[a-f0-9]{64}&loopback=[0-9]+$/);
  assert.equal((await page.evaluate(()=>window.browser.state())).vpn.signingIn,true);
  await page.locator('.tab .close').last().click();
  // Find in page, tab icons and shortcuts on an ordinary website.
  await page.locator('#address').fill(site);await page.keyboard.press('Enter');await page.waitForFunction(()=>[...document.querySelectorAll('.tab-title')].some(t=>t.textContent.includes('Find fixture')));
  await page.waitForFunction(()=>{const i=document.querySelector('.tab.active .tab-icon');return i&&!i.hidden&&i.src.startsWith('data:image/png');});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.focus());await page.keyboard.press(mod+'+f');await top.locator('#find-bar').waitFor({state:'visible'});await top.waitForFunction(()=>document.activeElement.id==='find-input');
  await top.keyboard.type('needle');await top.waitForFunction(()=>document.querySelector('#find-count').textContent==='1 of 3');
  await top.keyboard.press('Enter');await top.waitForFunction(()=>document.querySelector('#find-count').textContent==='2 of 3');
  await top.keyboard.press('Shift+Enter');await top.waitForFunction(()=>document.querySelector('#find-count').textContent==='1 of 3');
  await top.keyboard.press('Escape');await top.locator('#find-bar').waitFor({state:'hidden'});
  const count=()=>page.evaluate(()=>document.querySelectorAll('.tab').length),activeIndex=()=>page.evaluate(()=>[...document.querySelectorAll('.tab')].findIndex(t=>t.classList.contains('active')));
  const before=await count();await page.keyboard.press(mod+'+t');await page.waitForFunction(n=>document.querySelectorAll('.tab').length===n+1,before);
  await page.keyboard.press(mod+'+1');await page.waitForFunction(()=>document.querySelector('.tab').classList.contains('active'));
  await page.keyboard.press('Control+Tab');await page.waitForFunction(()=>document.querySelectorAll('.tab')[1].classList.contains('active'));assert.equal(await activeIndex(),1);
  await page.keyboard.press(mod+'+w');await page.waitForFunction(n=>document.querySelectorAll('.tab').length===n,before);
  await page.keyboard.press(mod+'+Shift+t');await page.waitForFunction(n=>document.querySelectorAll('.tab').length===n+1,before);
  console.log('VPN desktop passed: VPN set-up, connect and disconnect from the browser, status in menu, auto-connect setting, VPN sign-out and sign-in tab, no tokens in the renderer, find in page, tab icons and tab shortcuts.');
 }finally{if(app)await app.close();server?.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
