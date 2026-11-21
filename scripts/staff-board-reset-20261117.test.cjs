'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {plan,appointments,duplicateId,testCharlieId}=require('./staff-board-reset-20261117.cjs');
function fixture(){return {people:[...appointments.map(([id,displayName])=>({id,displayName,company:'HN Group',jobTitle:'Old role',employeeNumber:id,otherRoles:[{company:'Horizon Advertising',jobTitle:'Old extra role'}]})),{id:duplicateId,displayName:'Val G',temporary:true},{id:testCharlieId,displayName:'Charlie Livsey',company:'HN Group',jobTitle:'Chief Executive Officer',temporary:true,employeeNumber:'TEST',otherRoles:[]},{id:'system',system:true}],logins:[{id:'echo-login',primaryFor:appointments[0][0],account:{enabled:true,passwordHash:'unchanged'},roleIds:['owner-test']},{id:'testing-login',primaryFor:testCharlieId,account:{enabled:true,passwordHash:'testing-password',pinHash:'testing-pin'}}],settings:{positions:{'Horizon Network':['President']}}};}
test('assigns only Echo and named permanent records, removes only duplicate Val, preserves all test accounts and numbers',()=>{
 const input=fixture(),before=structuredClone(input),result=plan(input.people,input.logins,input.settings,'2026-11-17T00:00:00Z');
 assert.deepEqual(input,before,'Planning never mutates input');
 assert.equal(result.people.filter(p=>!p.system).length,8);assert.equal(result.removed.id,duplicateId);
 for(const [id,,title] of appointments){const p=result.people.find(p=>p.id===id);assert.equal(p.company,'Horizon Network');assert.equal(p.jobTitle,title);assert.equal(p.employeeNumber,id);assert.deepEqual(p.otherRoles,[]);assert.equal(p.temporary,false);}
 assert.deepEqual(result.people.find(p=>p.id===testCharlieId),before.people.find(p=>p.id===testCharlieId));
 assert.equal(result.people.find(p=>p.id===appointments[0][0]).supervisorPosition.kind,'board');
 assert.deepEqual(plan(result.people,input.logins,result.settings,'2026-11-17T00:00:00Z'),{...result,removed:null},'Repeat is safe');
});
test('refuses mistaken identities or silently orphaning a test account linked to duplicate Val',()=>{
 const input=fixture();input.logins.push({id:'duplicate-test-login',primaryFor:duplicateId,account:{enabled:true}});
 assert.throws(()=>plan(input.people,input.logins,input.settings),/linked account/);
 input.logins.pop();input.people.find(p=>p.id===duplicateId).temporary=false;assert.throws(()=>plan(input.people,input.logins,input.settings),/temporary Val/);
});
