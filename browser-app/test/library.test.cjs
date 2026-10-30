'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const{Library}=require('../src/library.cjs'),settings=require('../src/settings.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'hn-library-'));

test('history records websites only, merges quick revisits, searches, removes and survives a restart',()=>{const dir=temp();let now=1e12;try{
 const lib=new Library({dir,now:()=>now});assert.equal(lib.visit('hn-browser://start/'),null);assert.equal(lib.visit('file:///etc/passwd'),null);
 lib.visit('https://staff.hngroup.org.uk/','Staff portal');now+=60000;lib.visit('https://staff.hngroup.org.uk/','Staff portal');assert.equal(lib.history.length,1);
 now+=3600000;lib.visit('https://wiki.hngroup.org.uk/wiki/HN_Group');lib.title('https://wiki.hngroup.org.uk/wiki/HN_Group','HN Group – Wiki');
 assert.equal(lib.searchHistory('wiki')[0].title,'HN Group – Wiki');assert.equal(lib.searchHistory().length,2);
 lib.flush();const again=new Library({dir,now:()=>now});assert.equal(again.history.length,2);assert.ok(!fs.readFileSync(path.join(dir,'history.json'),'utf8').includes('file:'));
 if(process.platform!=='win32')assert.equal(fs.statSync(path.join(dir,'history.json')).mode&0o777,0o600);
 again.removeHistory(again.history[0].id);assert.equal(again.history.length,1);again.clearHistory();assert.equal(again.history.length,0);
}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('bookmarks add once, rename, reorder, toggle and reject non-websites',()=>{const dir=temp();try{
 const lib=new Library({dir});const a=lib.addBookmark('https://links.hngroup.org.uk/','HN Group Links');assert.equal(lib.addBookmark('https://links.hngroup.org.uk/').id,a.id);
 assert.throws(()=>lib.addBookmark('javascript:alert(1)'));lib.renameBookmark(a.id,'  Links  ');assert.equal(lib.bookmarks[0].title,'Links');assert.throws(()=>lib.renameBookmark(a.id,'   '));
 const b=lib.addBookmark('https://mail.google.com/');assert.equal(b.title,'mail.google.com');lib.moveBookmark(b.id,-1);assert.equal(lib.bookmarks[0].id,b.id);
 assert.equal(lib.toggleBookmark('https://mail.google.com/'),null);assert.equal(lib.bookmarks.length,1);lib.flush();assert.equal(new Library({dir}).bookmarks[0].title,'Links');
}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('suggestions rank bookmarks, then frequent and recent history, and leave out search pages',()=>{const dir=temp();let now=1e12;try{
 const lib=new Library({dir,now:()=>now});for(let i=0;i<3;i++){lib.visit('https://staff.hngroup.org.uk/#people','Staff portal');now+=31*60000;}
 lib.visit('https://www.google.com/search?q=staff');lib.visit('https://status.hngroup.org.uk/','HN Group Status');lib.addBookmark('https://hngroup.org.uk/support','Support');
 const s=lib.suggest('s');assert.equal(s[0].kind,'bookmark');assert.ok(s.some(x=>x.url.startsWith('https://staff.')));assert.ok(!s.some(x=>x.url.includes('google.com/search')));
 assert.deepEqual(lib.suggest('staff portal').map(x=>x.url),['https://staff.hngroup.org.uk/#people']);assert.deepEqual(lib.suggest(''),[]);
 assert.equal(lib.topSites()[0].title,'Staff portal');
}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('the last session restores websites and pinned tabs only',()=>{const dir=temp();try{
 const lib=new Library({dir});assert.equal(lib.session(),null);lib.saveSession([{url:'https://hngroup.org.uk/',pinned:true},{url:'file:///x'},{url:'hn-browser://start/'}],5);
 assert.deepEqual(new Library({dir}).session(),{tabs:[{url:'https://hngroup.org.uk/',pinned:true},{url:'hn-browser://start/',pinned:false}],active:1});
}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('settings accept only known values and older saved settings load safely',()=>{
 assert.equal(settings.validate('autoLock',15),15);assert.throws(()=>settings.validate('autoLock',7));assert.throws(()=>settings.validate('startup','evil'));assert.throws(()=>settings.validate('unknown',true));assert.throws(()=>settings.validate('greeting','yes'));
 const loaded=settings.load({theme:'forest',searchEngine:'yahoo',autoLock:'5',defaultZoom:9,admin:true,downloadPath:'/tmp/x'});
 assert.equal(loaded.theme,'forest');assert.equal(loaded.searchEngine,'google');assert.equal(loaded.autoLock,0);assert.equal(loaded.defaultZoom,0);assert.equal(loaded.admin,undefined);assert.equal(loaded.downloadPath,'/tmp/x');assert.equal(loaded.saveHistory,true);
 assert.equal(settings.load(null).theme,'midnight-lavender');
});
