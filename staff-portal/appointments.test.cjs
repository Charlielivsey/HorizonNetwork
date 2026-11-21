'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('./lib/store'),badges=require('./lib/badges'),projection=require('./lib/people-public');
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT+8AAAAASUVORK5CYII=';
const input={firstName:'Jamie',lastName:'Fixture',company:'HN Group',jobTitle:'Board Chairman',discordId:'123456789012345678',emails:[{local:'jamie',domain:'hngroup.org.uk',primary:true}]};
test('same-company appointments keep independent temporary status, supervisors and unique company profiles',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-appointments-'));try{
  store.init(dir);const boss=store.saveEmployee({...input,firstName:'Boss',jobTitle:'Chief Executive Officer',emails:[{local:'boss',domain:'hngroup.org.uk',primary:true}]});
  const p=store.saveEmployee({...input,otherRoles:[{company:'HN Group',jobTitle:'Chief Operating Officer',temporary:true,supervisorPosition:{company:'HN Group',title:'Chief Executive Officer'}},{company:'HN Group',jobTitle:'Board Member',temporary:false},{company:'Horizon Network',jobTitle:'Advisor',temporary:true}]});
  store.issueTemporaryPassword(p);assert.equal(p.otherRoles.length,3);assert.equal(p.temporary,undefined);assert.equal(p.otherRoles[0].supervisorId,boss.id);assert.equal(store.meView(p).roles.filter(r=>r.temporary).length,2);
  store.issueTemporaryPassword(p);const profiles=store.loginProfiles(store.loginsForId(p.id)[0]);assert.equal(profiles.length,2);assert.match(profiles.find(x=>x.company==='HN Group').jobTitle,/Chief Operating Officer/); // Company profile keys remain stable.
  const projected=projection.publicPeople(store),person=projected.people.find(x=>x.id===p.id);assert.equal(person.roles.filter(r=>r.company==='HN Group').length,3);assert.equal(person.employeeNumber,undefined);
  const coo=projected.positions.find(x=>x.company==='HN Group'&&x.title==='Chief Operating Officer');assert.ok(coo.temporaryHolders.includes(p.id));const chair=projected.positions.find(x=>x.company==='HN Group'&&x.title==='Board Chairman');assert.ok(chair.holders.includes(p.id));assert.ok(!chair.temporaryHolders.includes(p.id));
  const number=p.employeeNumber;assert.match(number,/^HN-[A-F0-9]{10}$/);assert.equal(store.publicView(p).employeeNumber,number);
  assert.throws(()=>store.saveEmployee({...input,otherRoles:[{company:'HN Group',jobTitle:'board chairman'}]},p),/different/);assert.equal(p.otherRoles.length,3);
  assert.throws(()=>store.saveEmployee({...input,otherRoles:[{company:'HN Group',jobTitle:'Board Member'},{company:'HN Group',jobTitle:'board member'}]},p),/different/);
  store.saveAvatar(p,photo);const first=badges.mine(p.id).badge;badges.reissue({scope:'selected',personIds:[p.id]},'Fixture');assert.equal(badges.mine(p.id).badge.number,number);assert.equal(first.number,number);
  const art=badges.artwork(first.id).body.toString();assert.match(art,/id="badge-shield"/);assert.doesNotMatch(art,/STAFF IDENTIFICATION|Issued \d/);assert.match(art,/width="180" height="222"/);assert.match(art,/font-size="60"/);
  store.init(dir);assert.equal(store.employees().find(x=>x.id===p.id).otherRoles.length,3);assert.equal(store.employees().find(x=>x.id===p.id).employeeNumber,number);
 }finally{badges.reset();fs.rmSync(dir,{recursive:true,force:true});}
});
test('legacy current badge numbers become permanent employee numbers without reissuing',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-number-migrate-'));try{
  store.init(dir);const p=store.saveEmployee(input);store.saveAvatar(p,photo);const previous=badges.mine(p.id).badge;
  const registerFile=path.join(dir,'staff-badges.json'),register=JSON.parse(fs.readFileSync(registerFile));register.issues[0].number='HN-0123456789';fs.writeFileSync(registerFile,JSON.stringify(register));
  const peopleFile=path.join(dir,'people.json'),people=JSON.parse(fs.readFileSync(peopleFile));for(const person of people)delete person.employeeNumber;fs.writeFileSync(peopleFile,JSON.stringify(people));
  store.init(dir);const restored=store.employees().find(x=>x.id===p.id);assert.equal(restored.employeeNumber,'HN-0123456789');assert.equal(badges.mine(p.id).badge.id,previous.id);assert.equal(badges.mine(p.id).badge.issue,1);
  badges.reissue({scope:'all'},'Fixture');assert.equal(badges.mine(p.id).badge.number,'HN-0123456789');
 }finally{badges.reset();fs.rmSync(dir,{recursive:true,force:true});}
});
test('payroll reads the permanent staff number and leaves historical payslip numbers intact',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-number-payroll-'));try{
  store.init(dir);const p=store.saveEmployee(input),number=p.employeeNumber;
  const file=path.join(dir,'payslips.json');fs.writeFileSync(file,JSON.stringify({pensionRatesSet:true,payDetails:{[p.id]:{employeeNumber:'LEGACY-PAYROLL'}},payslips:[{id:'historical',personId:p.id,employeeNumber:'LEGACY-PAYROLL'}],payChanges:{},payHistory:{},bands:[],extras:{},settings:{requireApproval:true}}));
  const payroll=require('./lib/payslips');payroll.init(dir);assert.equal(payroll.payDetails(p.id).employeeNumber,number);assert.equal(JSON.parse(fs.readFileSync(file)).payslips[0].employeeNumber,'LEGACY-PAYROLL');
  const saved=payroll.savePayDetails(p.id,{...payroll.payDetails(p.id),employeeNumber:'CANNOT-OVERRIDE'},null);assert.equal(saved.employeeNumber,number);assert.equal(JSON.parse(fs.readFileSync(file)).payslips[0].employeeNumber,'LEGACY-PAYROLL');
 }finally{badges.reset();fs.rmSync(dir,{recursive:true,force:true});}
});
