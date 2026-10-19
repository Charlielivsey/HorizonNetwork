'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');const{Updates,newer,installer}=require('../src/updates.cjs');
const data=Buffer.from('verified installer fixture'),sha256=crypto.createHash('sha256').update(data).digest('hex');
const release={version:'0.2.0-4',assets:{'mac-arm64':{url:'/download/mac-arm64',name:'HN-Browser-0.2.0-mac-arm64.dmg',size:data.length,sha256}}};
test('updates compare versions and builds and reject unexpected installer origins, names and hashes',()=>{assert.ok(newer('0.2.0-4','0.2.0-3'));assert.ok(newer('0.3.0-1','0.2.0-10'));for(const v of ['0.2.0-3','0.1.0-99','invalid'])assert.ok(!newer(v,'0.2.0-3'));assert.equal(installer(release,'darwin','arm64','0.1.0-2').url,'https://downloads.hngroup.org.uk/download/mac-arm64');assert.equal(installer(release,'win32','arm64','0.1.0-2'),null);for(const changed of [{url:'https://evil.test/app.dmg'},{name:'../app.dmg'},{sha256:null},{size:500000000}])assert.throws(()=>installer({...release,assets:{'mac-arm64':{...release.assets['mac-arm64'],...changed}}},'darwin','arm64','0.1.0-2'));});
test('update download verifies bytes before exposing installer and rechecks before opening',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-update-'));let corrupt=false,calls=[];const u=new Updates({dir,current:'0.1.0-2',platform:'darwin',arch:'arm64',fetcher:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');return url.endsWith('/api/releases')?Response.json({release}):new Response(corrupt?Buffer.from('incorrect installer bytes'):data);}});try{await u.check();assert.equal(u.state.status,'available');await u.download();assert.equal(u.state.status,'ready');const file=await u.verifiedFile();assert.equal(fs.readFileSync(file).toString(),data.toString());fs.writeFileSync(file,'tampered');await assert.rejects(u.verifiedFile(),/installer changed/i);assert.equal(u.state.status,'error');await u.check();corrupt=true;await u.download();assert.equal(u.state.status,'error');assert.equal(u.file,null);assert.ok(!fs.readdirSync(dir).some(f=>f.endsWith('.partial')));assert.ok(calls.every(url=>url.startsWith('https://downloads.hngroup.org.uk/')));}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('Macs update from the app zip when a release has one, so no disk image is needed',()=>{
 const zip={url:'/download/mac-arm64-zip',name:'HN-Browser-0.2.0-mac-arm64.zip',size:10,sha256:'b'.repeat(64)},both={...release,assets:{...release.assets,'mac-arm64-zip':zip}};
 const chosen=installer(both,'darwin','arm64','0.1.0-2');assert.equal(chosen.kind,'zip');assert.equal(chosen.url,'https://downloads.hngroup.org.uk/download/mac-arm64-zip');
 assert.equal(installer(release,'darwin','arm64','0.1.0-2').kind,'dmg');assert.throws(()=>installer({...both,assets:{...both.assets,'mac-arm64-zip':{...zip,name:'evil.zip'}}},'darwin','arm64','0.1.0-2'));
 assert.equal(installer({version:'0.2.0-4',assets:{'windows-x64':{url:'/download/windows-x64',name:'HN-Browser-0.2.0-win-x64.exe',size:5,sha256:'c'.repeat(64)}}},'win32','x64','0.1.0-2').kind,'exe');
});

test('the Mac in-place swap waits for HN Browser to close, swaps the app safely and reopens it',()=>{
 const{swapScript,currentBundle}=require('../src/installer.cjs');
 assert.equal(currentBundle('/Applications/HN Browser.app/Contents/MacOS/HN Browser'),'/Applications/HN Browser.app');assert.throws(()=>currentBundle('/usr/bin/node'));
 const s=swapScript({pid:4321,bundle:"/Applications/HN Browser.app",app:"/tmp/x/HN Browser.app",work:"/tmp/x"});
 assert.match(s,/kill -0 4321/);assert.match(s,/mv '\/Applications\/HN Browser\.app' '\/Applications\/HN Browser\.app\.old' && mv '\/tmp\/x\/HN Browser\.app' '\/Applications\/HN Browser\.app'/);assert.match(s,/with administrator privileges/);assert.match(s,/\/usr\/bin\/open '\/Applications\/HN Browser\.app'/);
});
