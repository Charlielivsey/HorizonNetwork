'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const{readRelease,createReleases}=require('./lib/releases');
function release(){const tag='browser-v0.1.0-1';return{tag_name:tag,draft:false,published_at:'2026-10-19T12:00:00Z',assets:[['mac-arm64','dmg'],['win-x64','exe'],['mac-arm64','zip']].map(([platform,ext])=>({name:'HN-Browser-0.1.0-'+platform+'.'+ext,browser_download_url:'https://github.com/Charlielivsey/HorizonNetwork/releases/download/'+tag+'/HN-Browser-0.1.0-'+platform+'.'+ext,size:100,digest:'sha256:'+'a'.repeat(64)}))};}
test('only genuine browser release assets from the fixed repository become downloads',()=>{assert.equal(Object.keys(readRelease(release()).assets).length,3);assert.equal(readRelease(release()).assets['mac-arm64-zip'].name,'HN-Browser-0.1.0-mac-arm64.zip');assert.equal(readRelease({...release(),draft:true}),null);assert.equal(readRelease({...release(),tag_name:'vpn-v1.0'}),null);const invalid=release();invalid.assets[0].browser_download_url='https://evil.test/download.exe';assert.equal(readRelease(invalid).assets['mac-arm64'],undefined);});
test('release cache survives an upstream failure and restart',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-download-release-'));try{const good=createReleases(dir,{bundled:'/nonexistent',fetcher:async()=>Response.json([release()])});await good.refresh();assert.equal(good.current.version,'0.1.0-1');const offline=createReleases(dir,{bundled:'/nonexistent',fetcher:async()=>{throw Error('Offline');}});await offline.refresh();assert.equal(offline.current.assets['windows-x64'].sha256,'a'.repeat(64));}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('the newest release is found from its release.json without GitHub’s API',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-download-release-'));const{MANIFEST}=require('./lib/releases');const calls=[];
 const manifest={tag:'browser-v0.6.1-13',publishedAt:'2026-10-19T14:00:00Z',assets:{'mac-arm64':{name:'HN-Browser-0.6.1-mac-arm64.dmg',size:10,sha256:'b'.repeat(64)},'windows-x64':{name:'HN-Browser-0.6.1-win-x64.exe',size:20,sha256:'c'.repeat(64)},'bad':{name:'evil.exe',size:1,sha256:'nope'}}};
 try{const r=createReleases(dir,{bundled:'/nonexistent',fetcher:async url=>{calls.push(url);if(url===MANIFEST)return Response.json(manifest);return new Response('rate limited',{status:403});}});await r.refresh();
  assert.equal(r.current.version,'0.6.1-13');assert.equal(r.current.assets['windows-x64'].sha256,'c'.repeat(64));assert.equal(r.current.assets['windows-x64'].url,'https://github.com/Charlielivsey/HorizonNetwork/releases/download/browser-v0.6.1-13/HN-Browser-0.6.1-win-x64.exe');assert.deepEqual(calls,[MANIFEST]);
  // Without a manifest (older releases), the API is still used.
  const fallback=createReleases(fs.mkdtempSync(path.join(os.tmpdir(),'hn-download-release-')),{bundled:'/nonexistent',fetcher:async url=>url===MANIFEST?new Response('',{status:404}):Response.json([release()])});await fallback.refresh();assert.equal(fallback.current.version,'0.1.0-1');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('the newest release wins: an older GitHub answer never replaces a newer installed copy',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-download-release-'));const bundled=path.join(dir,'bundled.json');
 fs.writeFileSync(bundled,JSON.stringify({tag:'browser-v0.7.0-17',assets:{'mac-arm64':{name:'HN-Browser-0.7.0-mac-arm64.dmg',size:5,sha256:'d'.repeat(64)},'windows-x64':{name:'HN-Browser-0.7.0-win-x64.exe',size:6,sha256:'e'.repeat(64)}}}));
 try{const old={...release(),tag_name:'browser-v0.6.1-16'};old.assets=old.assets.map(a=>({...a,name:a.name.replace('0.1.0','0.6.1'),browser_download_url:a.browser_download_url.replace('browser-v0.1.0-1','browser-v0.6.1-16').replace('0.1.0','0.6.1')}));
  const r=createReleases(path.join(dir,'data'),{bundled,fetcher:async url=>url.includes('raw.githubusercontent')?new Response('',{status:404}):Response.json([old])});await r.refresh();
  assert.equal(r.current.version,'0.7.0-17');assert.equal(r.status.source,'installed copy');assert.deepEqual(r.status.problems,['release.json: HTTP 404']);
  const offline=createReleases(path.join(dir,'data'),{bundled:path.join(dir,'missing.json'),fetcher:async()=>{throw Error('Offline');}});await offline.refresh();assert.equal(offline.current.version,'0.7.0-17');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('HN Secure Network is offered only from a genuine record, newest first',async()=>{const{readApp,createApp}=require('./lib/apps');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-download-app-'));
 const record=(v,n)=>({tag:'secure-network-v'+v+'-'+n,asset:{name:'HN-Secure-Network-'+v+'-macOS.zip',size:1000,sha256:'a'.repeat(64)}});
 try{assert.equal(readApp({...record('2.1.0',30),tag:'browser-v2.1.0-30'}),null);assert.equal(readApp({...record('2.1.0',30),asset:{name:'evil.zip',size:1,sha256:'a'.repeat(64)}}),null);
  assert.equal(readApp(record('2.1.0',30)).asset.url,'https://github.com/Charlielivsey/HorizonNetwork/releases/download/secure-network-v2.1.0-30/HN-Secure-Network-2.1.0-macOS.zip');
  const bundled=path.join(dir,'b.json');fs.writeFileSync(bundled,JSON.stringify(record('2.1.0',31)));
  const a=createApp(path.join(dir,'data'),{bundled,fetcher:async()=>Response.json(record('2.0.0',9))});await a.refresh();assert.equal(a.current.version,'2.1.0-31');
  const b=createApp(path.join(dir,'data2'),{bundled:path.join(dir,'none'),fetcher:async()=>Response.json(record('2.1.0',32))});await b.refresh();assert.equal(b.current.version,'2.1.0-32');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('HN Secure Network for Windows is offered only from a genuine Windows record',async()=>{const{readApp,createApp}=require('./lib/apps');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-download-win-'));
 const record=(v,n)=>({tag:'secure-network-windows-v'+v+'-'+n,asset:{name:'HN-Secure-Network-'+v+'-windows-x64.exe',size:5000,sha256:'b'.repeat(64)}});
 try{assert.equal(readApp(record('1.0.0',3),'mac'),null,'a Windows record is never a Mac one');assert.equal(readApp({tag:'secure-network-v1.0.0-3',asset:{name:'HN-Secure-Network-1.0.0-macOS.zip',size:1,sha256:'b'.repeat(64)}},'windows'),null);
  assert.equal(readApp({...record('1.0.0',3),asset:{name:'HN-Secure-Network-1.0.1-windows-x64.exe',size:5000,sha256:'b'.repeat(64)}},'windows'),null,'the file name must match the version');
  const w=readApp(record('1.0.0',3),'windows');assert.equal(w.release,'1.0.0');assert.equal(w.build,3);assert.equal(w.asset.url,'https://github.com/Charlielivsey/HorizonNetwork/releases/download/secure-network-windows-v1.0.0-3/HN-Secure-Network-1.0.0-windows-x64.exe');
  const a=createApp(path.join(dir,'data'),{kind:'windows',bundled:path.join(dir,'none'),fetcher:async url=>{assert.match(url,/secure-network-windows\.json$/);return Response.json(record('1.0.0',4));}});await a.refresh();assert.equal(a.current.build,4);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}});
