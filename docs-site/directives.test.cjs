'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('./lib/store'),catalog=require('./lib/catalog'),policy=require('./lib/hn-operations-policy.json');
const user={id:'fixture',email:'fixture@example.test',displayName:'Fixture',fullName:'Fixture Owner',admin:true};
test('ED numbering is durable, immutable, company-scoped, legacy-aware and unique on duplication',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-directive-test-'));try{store.init(dir);const seed=store.create(user,{template:'letter',company:'hn-group'});const file=path.join(dir,'documents.json'),data=JSON.parse(fs.readFileSync(file));Object.assign(data.documents[seed.id],{template:'executive-directive',fields:{reference:'ED0001',authority:'Article 10 of the Operations Policy'},body:'<p>Existing user wording</p>'});fs.writeFileSync(file,JSON.stringify(data));store.init(dir);
 assert.throws(()=>store.create(user,{template:'executive-directive',company:'hn-group'}),e=>e.status===400);
 const a=store.create(user,{template:'executive-directive',company:'horizon-network',fields:{reference:'ED9999',authority:'wrong'}});assert.equal(a.fields.reference,'ED0002');assert.equal(a.fields.authority,'Article 1 of the Horizon Network Operations Policy');
 const b=store.create(user,{template:'executive-directive',company:'horizon-network'});assert.equal(b.fields.reference,'ED0003');
 const changed=store.update(a.id,user,{version:a.version,fields:{...a.fields,reference:'ED9999',authority:'Article 8'}});assert.equal(changed.fields.reference,'ED0002');assert.equal(changed.fields.authority,a.fields.authority);
 assert.throws(()=>store.update(a.id,user,{version:changed.version,company:'hn-group'}),e=>e.status===400);
 const copy=store.duplicate(a.id,user);assert.equal(copy.fields.reference,'ED0004');store.remove(copy.id,user);store.init(dir);const next=store.create(user,{template:'executive-directive',company:'horizon-network'});assert.equal(next.fields.reference,'ED0005');
 const old=store.view(store.get(seed.id,user),user,true);const saved=store.update(old.id,user,{version:old.version,fields:{...old.fields,reference:'ED9999',authority:'changed'}});assert.equal(saved.fields.reference,'ED0001');assert.equal(saved.fields.authority,'Article 10 of the Operations Policy');assert.equal(saved.body,'<p>Existing user wording</p>');
 const t=catalog.start(catalog.template('executive-directive'),catalog.company('horizon-network'),user);for(const n of ['1.2','1.3','1.5','1.9','4.1','5.1'])assert.ok(t.body.includes(policy.articles.flatMap(a=>a[1]).find(c=>c[0]===n)[1]),n+' quote is exact');assert.ok(!/Article (8|9|10)\b/.test(t.body));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('policy drafts have an honest save history without becoming final or corrupting published versions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-policy-history-'));try{store.init(dir);let d=store.create(user,{template:'policy',company:'horizon-network',title:'Operations Policy',fields:{version:'0.1',owner:'Board',effective:'Pending approval'},body:'<h2>Article 1</h2><p>Original</p>'});assert.equal(d.status,'draft');assert.equal(d.history.length,0);assert.equal(d.draftHistory.length,1);assert.equal(d.draftHistory[0].draft,true);assert.equal(d.body,'<h2>Article 1</h2><p>Original</p>');
 d=store.update(d.id,user,{version:d.version,body:'<h2>Article 1</h2><p>Changed</p>'});assert.deepEqual(d.draftHistory[1].changes,['Updated Article 1']);assert.equal(d.history.length,0);const count=d.draftHistory.length;d=store.update(d.id,user,{version:d.version,body:d.body});assert.equal(d.draftHistory.length,count);
 d=store.update(d.id,user,{version:d.version,status:'final'});assert.equal(d.history.length,1);assert.equal(d.history[0].version,'0.1');d=store.update(d.id,user,{version:d.version,status:'draft',body:'<h2>Article 1</h2><p>Revised</p>'});d=store.update(d.id,user,{version:d.version,status:'final'});assert.equal(d.history.length,2);assert.equal(d.history[1].version,'0.2');assert.equal(d.draftHistory.length,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
