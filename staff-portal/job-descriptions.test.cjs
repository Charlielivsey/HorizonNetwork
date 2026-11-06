'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('job descriptions: post, validate, list by company, edit, delete and keep across restarts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-jd-'));
 try{
  const store=require('./lib/store');store.init(dir);
  const jd=require('./lib/jobdescriptions');jd.init(dir);
  const [a,b]=store.COMPANIES;
  assert.throws(()=>jd.save({role:'',company:'Nope'},null),/name.*company.*reports to.*description.*authority/is);
  const x=jd.save({role:'Chief of Staff',company:b,reportsTo:'President',description:'Runs the office.\nKeeps things moving.',authority:'Approves spending up to £500.'},null,{displayName:'Charlie'});
  jd.save({role:'Advisor',company:a,reportsTo:'Board of Directors',description:'Advises.',authority:'None on their own.'},null);
  assert.throws(()=>jd.save({role:'chief of staff',company:b,reportsTo:'x',description:'x',authority:'x'},null),/already/);
  assert.deepEqual(jd.list().map(i=>i.role),['Advisor','Chief of Staff'],'ordered by company then role');
  assert.equal(jd.list()[1].description,'Runs the office.\nKeeps things moving.');assert.equal(jd.list()[1].updatedBy,'Charlie');
  jd.save({...jd.view(x),reportsTo:'Vice President'},x);
  jd.init(dir);assert.equal(jd.get(x.id).reportsTo,'Vice President','saved to disk');
  jd.remove(jd.get(x.id));assert.equal(jd.list().length,1);
  assert.ok(store.PERMISSIONS.some(p=>p.key===jd.MANAGE));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
