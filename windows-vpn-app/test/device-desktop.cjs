'use strict';
// "This device is not authorised": an unapproved PC sees the gate window (with its code) instead of HN Secure
// Network, and the app opens by itself once devices.hngroup.org.uk approves it.
const{_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-sn-device-'));let app;try{
 fs.writeFileSync(path.join(dir,'device-status.txt'),'unlinked');
 app=await electron.launch({executablePath:require('electron'),args:[...((process.getuid?.()===0||process.env.CI)?['--no-sandbox']:[]),path.resolve(__dirname,'..')],env:{...process.env,HN_SECURE_NETWORK_TEST:'1',HN_SECURE_NETWORK_FAKE_VPN:'1',HN_SECURE_NETWORK_PROFILE:dir}});
 const gate=await app.firstWindow();await gate.waitForURL(/device\.html$/);
 await gate.waitForFunction(()=>document.querySelector('#code')?.textContent==='ABCD-2345');
 assert.equal(await gate.locator('#title').textContent(),'This device is not authorised');assert.ok(await gate.locator('#open').isVisible());
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1,'the app must not open before approval');
 const device=JSON.parse(fs.readFileSync(path.join(dir,'device','device.json'),'utf8'));assert.match(device.id,/^[0-9a-f-]{36}$/);assert.match(device.secret,/^[a-f0-9]{64}$/);
 fs.mkdirSync(path.resolve(__dirname,'../screenshots'),{recursive:true});await gate.screenshot({path:path.resolve(__dirname,'../screenshots/device-not-authorised.png')});
 fs.writeFileSync(path.join(dir,'device-status.txt'),'pending');await gate.locator('#check').click();await gate.waitForFunction(()=>document.body.dataset.status==='pending');
 fs.writeFileSync(path.join(dir,'device-status.txt'),'authorised');const opened=app.waitForEvent('window',{predicate:w=>!w.url().endsWith('device.html'),timeout:20000});await gate.locator('#check').click();
 const main=await opened;await main.waitForURL(/index\.html$/);await main.locator('body').waitFor();
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'device','status.json'),'utf8')).status,'authorised');
 await app.close();app=null;
 // Approved before: opens straight away, with no gate window at all.
 app=await electron.launch({executablePath:require('electron'),args:[...((process.getuid?.()===0||process.env.CI)?['--no-sandbox']:[]),path.resolve(__dirname,'..')],env:{...process.env,HN_SECURE_NETWORK_TEST:'1',HN_SECURE_NETWORK_FAKE_VPN:'1',HN_SECURE_NETWORK_PROFILE:dir}});
 const again=await app.firstWindow();assert.doesNotMatch(again.url(),/device\.html$/);
 console.log('Device desktop passed: unapproved computers see the not-authorised window with their code, and HN Secure Network opens once approved.');
}finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}})().catch(e=>{console.error(e);process.exitCode=1;});
