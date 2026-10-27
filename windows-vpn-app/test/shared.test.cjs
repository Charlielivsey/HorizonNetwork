'use strict';
// HN Secure Network for Windows shares its VPN controller and secure storage with HN Browser: the copies must
// stay identical, so a fix in one reaches both.
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('the VPN controller and secure storage are identical to HN Browser’s',()=>{
 for(const file of['vpn.cjs','vault.cjs'])assert.equal(fs.readFileSync(path.join(__dirname,'..','src',file),'utf8'),fs.readFileSync(path.join(__dirname,'..','..','browser-app','src',file),'utf8'),file+' differs from browser-app/src/'+file);
});
test('the device check is identical in HN Browser, HN Secure Network and HN Group App Manager',()=>{
 for(const file of['src/device.cjs','src/device-gate.cjs','src/device-preload.cjs','ui/device.html','ui/device.js','ui/device.css'])for(const other of['browser-app','app-manager'])
  assert.equal(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),fs.readFileSync(path.join(__dirname,'..','..',other,file),'utf8'),file+' differs from '+other+'/'+file);
});
test('the Linux AppImage helpers are identical in HN Browser, HN Secure Network and HN Group App Manager',()=>{
 for(const other of['browser-app','app-manager'])assert.equal(fs.readFileSync(path.join(__dirname,'..','src','appimage.cjs'),'utf8'),fs.readFileSync(path.join(__dirname,'..','..',other,'src','appimage.cjs'),'utf8'),'src/appimage.cjs differs from '+other+'/src/appimage.cjs');
});
test('sign-ins are labelled HN Secure Network, devices are named after this PC, and the PIN is checked by the server',async()=>{
 const{VPN,FakeController}=require('../src/vpn.cjs'),os=require('node:os');const calls=[];let saved=null;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-sn-shared-'));
 try{const vpn=new VPN({vault:{load:()=>saved,save:t=>saved=t,clear:()=>saved=null},controller:new FakeController(),stateFile:path.join(dir,'vpn.json'),client:'secure-network',appName:'HN Secure Network',deviceName:'LAPTOP-1 (Windows)',hostname:'LAPTOP-1',reach:async()=>true,
  fetcher:async(url,o)=>{calls.push({url,client:o.headers['X-HN-VPN-Client'],body:o.body?JSON.parse(o.body):null});if(url.endsWith('/api/me'))return Response.json({user:{displayName:'A'},devices:[],limit:5});if(url.endsWith('/api/devices'))return Response.json({device:{id:'a'.repeat(24)},connection:{config:'PrivateKey = <this device’s private key>\n',configVersion:3}},{status:201});
   if(url.endsWith('/api/app/verify-pin'))return JSON.parse(o.body).pin==='246810'?Response.json({ok:true}):Response.json({error:'That PIN isn’t right. 4 tries left.'},{status:400});return Response.json({});}});
  vpn.token='t'.repeat(64);await vpn.setUp();
  assert.ok(calls.every(c=>c.client==='secure-network'));assert.equal(calls.find(c=>c.url.endsWith('/api/devices')).body.name,'LAPTOP-1 (Windows)');
  await assert.rejects(vpn.verifyPin('12345'),/six-digit PIN/);await assert.rejects(vpn.verifyPin('111111'),/4 tries left/);await vpn.verifyPin('246810');
  assert.deepEqual(calls.filter(c=>c.url.endsWith('/api/app/verify-pin')).map(c=>c.body.pin),['111111','246810']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
