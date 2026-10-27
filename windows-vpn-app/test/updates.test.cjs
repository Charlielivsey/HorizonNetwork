'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const{Updates,newer,installer}=require('../src/updates.cjs');
const app=(version,build,extra={})=>({version,build,asset:{name:'HN-Secure-Network-'+version+'-windows-x64.exe',size:10,sha256:'a'.repeat(64),url:'/download/secure-network-windows',...extra}});
test('newer versions and builds win; anything unverifiable is refused',()=>{
 assert.ok(newer({version:'1.0.1',build:1},{version:'1.0.0',build:9}));assert.ok(newer({version:'1.0.0',build:10},{version:'1.0.0',build:9}));
 assert.ok(!newer({version:'1.0.0',build:9},{version:'1.0.0',build:9}));assert.ok(!newer({version:'0.9.9',build:99},{version:'1.0.0',build:1}));
 assert.equal(installer(app('1.0.0',3),{version:'1.0.0',build:3}),null);
 assert.equal(installer(app('1.0.0',4),{version:'1.0.0',build:3}).url,'https://downloads.hngroup.org.uk/download/secure-network-windows');
 for(const bad of[{url:'https://evil.test/x.exe'},{name:'evil.exe'},{sha256:'zz'},{size:0}])assert.throws(()=>installer(app('1.0.0',4,bad),{version:'1.0.0',build:3}),/couldn’t|could not/);
});
test('an update downloads, is checked twice, and a changed file is refused',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-sn-update-')),data=Buffer.from('installer bytes'),sha=crypto.createHash('sha256').update(data).digest('hex');
 try{const record={version:'1.2.0',build:7,asset:{name:'HN-Secure-Network-1.2.0-windows-x64.exe',size:data.length,sha256:sha,url:'/download/secure-network-windows'}};
  const u=new Updates({dir,platform:'win32',current:{version:'1.0.0',build:1},fetcher:async url=>url.endsWith('/api/releases')?Response.json({apps:{'secure-network-windows':record}}):new Response(data)});
  assert.equal((await u.check()).status,'available');await u.download();assert.equal(u.state.status,'ready');assert.ok((await u.verifiedFile()).endsWith('HN-Secure-Network-1.2.0-windows-x64.exe'));
  fs.appendFileSync(u.file,'tampered');await assert.rejects(u.verifiedFile(),/changed/);
  const bad=new Updates({dir,platform:'win32',current:{version:'1.0.0',build:1},fetcher:async url=>url.endsWith('/api/releases')?Response.json({apps:{'secure-network-windows':record}}):new Response(Buffer.from('something else'))});
  await bad.check();await bad.download();assert.equal(bad.state.status,'error');assert.ok(!fs.readdirSync(dir).some(f=>f.endsWith('.partial')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Linux updates come from the AppImage record, and Windows installers are never used on Linux',async()=>{
 const linux=(version,build,extra={})=>({version,build,asset:{name:'HN-Secure-Network-'+version+'-linux-x86_64.AppImage',size:10,sha256:'b'.repeat(64),url:'/download/secure-network-linux',...extra}});
 assert.equal(installer(linux('2.1.0',5),{version:'2.0.1',build:1},'linux').url,'https://downloads.hngroup.org.uk/download/secure-network-linux');
 assert.throws(()=>installer(app('2.1.0',5),{version:'2.0.1',build:1},'linux'),/could not/);
 assert.equal(installer(linux('2.1.0',5),{version:'2.0.1',build:1},'darwin'),null);
 const u=new Updates({dir:os.tmpdir(),platform:'linux',current:{version:'2.0.1',build:1},fetcher:async()=>Response.json({apps:{'secure-network-windows':app('9.0.0',1),'secure-network-linux':linux('2.1.0',5)}})});
 assert.equal((await u.check()).status,'available');assert.equal(u.asset.name,'HN-Secure-Network-2.1.0-linux-x86_64.AppImage');
});
