'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('job descriptions, positions and supervisors set as positions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-jd-'));
 try{
  const store=require('./lib/store');store.init(dir);
  const jd=require('./lib/jobdescriptions');jd.init(dir);
  // The user's positions and job descriptions are there from the start.
  assert.deepEqual(store.positions()['HN Group'],['Board Chairman','Board Director','Board Member','Chief Executive Officer','Chief Operating Officer','Executive Assistant']);
  assert.equal(store.positions()['Horizon Network'].length,7);
  assert.equal(jd.list().length,13);
  const president=jd.list().find(i=>i.company==='Horizon Network'&&i.role==='President');
  assert.equal(president.reportsTo,'Chief Operating Officer (HN Group)');assert.match(president.authority,/Divisions Policy, Article 6/);
  // Seeds are added once: deleting one doesn't bring it back.
  jd.remove(jd.get(president.id));jd.init(dir);assert.equal(jd.list().length,12);
  // Roles must be one of the company's positions; positions can be added and removed.
  assert.throws(()=>jd.save({role:'Designer',company:'Horizon Network',reportsTo:'x',description:'x',authority:'x'},null),/positions/);
  store.addPosition('Horizon Media Group','Designer');
  assert.throws(()=>store.addPosition('Horizon Media Group','designer'),/already/);
  const x=jd.save({role:'Designer',company:'Horizon Media Group',reportsTo:'President',description:'Designs.',authority:'None.'},null,{displayName:'Charlie'});
  assert.equal(x.updatedBy,'Charlie');
  assert.throws(()=>jd.save({role:'Designer',company:'Horizon Media Group',reportsTo:'x',description:'x',authority:'x'},null),/already/);
  // Supervisors as positions: whoever holds the position is filled in, and it follows the position.
  const make=(first,title,extra)=>store.saveEmployee({firstName:first,lastName:'Test',jobTitle:title,company:'Horizon Network',emails:[{domain:store.COMPANY_DOMAINS['Horizon Network'],auto:true,primary:true}],...extra},null);
  const vp=make('Val','Vice President',{supervisorPosition:{company:'Horizon Network',title:'President'}});
  assert.equal(vp.supervisorId,null,'vacant position: nobody yet');
  const pres=make('Pat','President');
  assert.equal(store.getPerson(vp.id).supervisorId,pres.id,'filled in once someone holds it');
  store.saveEmployee({...store.publicView(pres),jobTitle:'Advisor',emails:pres.emails.map(e=>{const at=e.address.indexOf('@');return{local:e.address.slice(0,at),domain:e.address.slice(at+1),primary:e.primary};})},pres);
  assert.equal(store.getPerson(vp.id).supervisorId,null,'follows the position, not the person');
  assert.throws(()=>store.removePosition('Horizon Network','Vice President'),/holds/);
  store.removePosition('Horizon Media Group','Founder'.replace('Founder','Designer'));
  assert.ok(!store.positions()['Horizon Media Group'].includes('Designer'));
  // The user's reporting lines (7 November 2026) are there from the start and can be changed, never in a loop.
  const rep=store.positionReports();
  assert.equal(rep['HN Group']['Board Chairman'],null);
  assert.deepEqual(rep['HN Group']['Chief Operating Officer'],{company:'HN Group',title:'Chief Executive Officer'});
  assert.deepEqual(rep['Horizon Network']['President'],{company:'HN Group',title:'Chief Operating Officer'});
  assert.deepEqual(rep['Horizon Network']['Advisor'],{company:'Horizon Network',title:'Chief of Staff'});
  assert.equal(rep['Horizon Network']['Founder'],null);
  store.setPositionReport('Horizon Network','Advisor',{company:'Horizon Network',title:'President'});
  assert.deepEqual(store.reportsToOf('Horizon Network','advisor'),{company:'Horizon Network',title:'President'});
  assert.throws(()=>store.setPositionReport('HN Group','Board Chairman',{company:'HN Group',title:'Board Director'}),/already reports/);
  assert.throws(()=>store.setPositionReport('HN Group','Board Chairman',{company:'HN Group',title:'Nobody'}),/Choose/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
