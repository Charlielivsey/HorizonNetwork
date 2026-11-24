'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('./lib/store'),jobs=require('./lib/jobdescriptions');
test('Discord position identities survive renames/restarts, keep permission aliases and distinguish re-created positions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-position-identity-'));
 try{
  store.init(dir);jobs.init(dir);const company='Horizon Network',original=store.positions()[company][0];
  const before=fs.readFileSync(path.join(dir,'settings.json'));
  const initial=store.discordPositionCatalog()[company].find(p=>p.title===original);
  assert.deepEqual(fs.readFileSync(path.join(dir,'settings.json')),before,'Reading the feed does not mutate settings');
  store.renamePosition(company,original,'Fixture Chief',{displayName:'Fixture'});
  let renamed=store.discordPositionCatalog()[company].find(p=>p.title==='Fixture Chief');
  assert.equal(renamed.id,initial.id);assert.ok(renamed.aliases.includes(original));
  store.renamePosition(company,'Fixture Chief','Fixture Executive',{displayName:'Fixture'});
  store.init(dir);jobs.init(dir);renamed=store.discordPositionCatalog()[company].find(p=>p.title==='Fixture Executive');
  assert.equal(renamed.id,initial.id);assert.deepEqual(renamed.aliases,[original,'Fixture Chief']);
  store.addPosition(company,'Fixture New');const added=store.discordPositionCatalog()[company].find(p=>p.title==='Fixture New');
  store.removePosition(company,'Fixture New');assert.ok(!store.discordPositionCatalog()[company].some(p=>p.id===added.id));
  store.addPosition(company,'Fixture New');assert.notEqual(store.discordPositionCatalog()[company].find(p=>p.title==='Fixture New').id,added.id);
 }finally{require('./lib/badges').reset();fs.rmSync(dir,{recursive:true,force:true});}
});
