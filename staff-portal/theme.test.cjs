'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('Midnight Lavender is the account default and all three explicit themes persist',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-theme-'));try{
 const store=require('./lib/store');store.init(dir);const p=store.saveEmployee({firstName:'Theme',lastName:'Fixture',company:'HN Group',jobTitle:'Analyst',emails:[{local:'theme.fixture',domain:'hngroup.org.uk',primary:true}]});
 assert.equal(store.themeOf(p),'midnight');
 for(const [input,expected]of [['light','light'],['lavender-dusk','dusk'],['midnight','midnight']]){store.setTheme(store.getPerson(p.id),input);assert.equal(store.themeOf(store.getPerson(p.id)),expected);store.init(dir);assert.equal(store.themeOf(store.getPerson(p.id)),expected);}
 assert.throws(()=>store.setTheme(store.getPerson(p.id),'invalid'),/Choose/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
