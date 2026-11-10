'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('74-day migration and requested supervisor-only extra allowance, capped per person per year',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-leave-extra-'));
 try{
  const store=require('./lib/store'),calendar=require('./lib/calendar'),leave=require('./lib/leave');store.init(dir);calendar.init(dir);
  const make=firstName=>store.saveEmployee({firstName,lastName:'Test',jobTitle:'Tester',company:store.COMPANIES[0],emails:[{domain:'hngroup.org.uk',auto:true,primary:true}]});
  const boss=make('Boss'),staff=make('Staff'),other=make('Other');staff.supervisorId=boss.id;
  fs.writeFileSync(path.join(dir,'leave.json'),JSON.stringify({requests:[],allowances:{[other.id]:80},defaultAllowance:25}));
  leave.init(dir);const year=new Date().getFullYear();
  assert.equal(leave.allowances().defaultAllowance,74);assert.equal(leave.summary(staff.id,year).allowance,74);assert.equal(leave.summary(other.id,year).base,80,'preserve explicit HR overrides');
  assert.throws(()=>leave.requestExtra(staff,{year,days:2}),/Explain/);
  assert.throws(()=>leave.requestExtra(staff,{year,days:11,reason:'Reason'}),/10/);
  const r=leave.requestExtra(staff,{year,days:6,reason:'Family arrangements'});
  assert.equal(leave.summary(staff.id,year).allowance,74,'pending requests do not change balance');
  assert.throws(()=>leave.decideExtra(r.id,'approve',staff,''),/direct supervisor/);
  assert.throws(()=>leave.decideExtra(r.id,'approve',other,''),/direct supervisor/);
  assert.throws(()=>leave.requestExtra(staff,{year,days:5,reason:'More'}),/10/);
  assert.equal(leave.extraApprovals(boss).length,1);
  leave.decideExtra(r.id,'approve',boss,'Approved');assert.equal(leave.summary(staff.id,year).allowance,80);
  assert.throws(()=>leave.decideExtra(r.id,'approve',boss,''),/no longer pending/);
  const second=leave.requestExtra(staff,{year,days:4,reason:'More'});leave.decideExtra(second.id,'approve',boss,'');assert.equal(leave.summary(staff.id,year).allowance,84);
  assert.throws(()=>leave.requestExtra(staff,{year,days:.5,reason:'More'}),/10/);
  const next=leave.requestExtra(staff,{year:year+1,days:2,reason:'Next year'});staff.supervisorId=other.id;
  assert.throws(()=>leave.decideExtra(next.id,'approve',boss,''),/direct supervisor/);
  leave.decideExtra(next.id,'decline',other,'');assert.equal(leave.extraGranted(staff.id,year+1),0);
  const cancelled=leave.requestExtra(staff,{year:year+1,days:10,reason:'Next year'});leave.decideExtra(cancelled.id,'cancel',staff,'');assert.equal(leave.extraGranted(staff.id,year+1),0);
  const auto=leave.requestExtra(boss,{year});assert.equal(auto.status,'approved');assert.equal(auto.days,10);assert.equal(auto.automatic,true);assert.equal(leave.summary(boss.id,year).additional,10);
  assert.throws(()=>leave.requestExtra(boss,{year}),/already received/);
  const partial=make('Partial');partial.supervisorId=boss.id;
  const six=leave.requestExtra(partial,{year,days:6,reason:'Reason'});leave.decideExtra(six.id,'approve',boss,'');
  partial.supervisorId=null;const topup=leave.requestExtra(partial,{year,days:10});assert.equal(topup.days,4);assert.equal(leave.extraGranted(partial.id,year),10,'auto request tops up rather than granting another ten');
  partial.supervisorId=boss.id;const pending=leave.requestExtra(partial,{year:year+1,days:2,reason:'Reason'});partial.supervisorId=null;
  const replaced=leave.requestExtra(partial,{year:year+1});assert.equal(replaced.days,10);assert.equal(leave.extraMine(partial).find(r=>r.id===pending.id).status,'cancelled');
  leave.init(dir);assert.equal(leave.extraGranted(staff.id,year),10,'restart preserves approved extras');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
