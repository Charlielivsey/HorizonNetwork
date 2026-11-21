'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict');
const{syncHqStaffAccess}=require('./hq-staff-access');
const guild='1360208008755413227',roles=[{id:'staff',name:'Network Staff'}];
test('HQ staff access follows network appointments across companies without granting NPL authority',async()=>{
 const writes=[],people=[{id:'network',titles:[{company:'Horizon Network'}]},{id:'ads',titles:[{company:'Horizon Advertising'}]},{id:'dev',titles:[{company:'Horizon Development'}]},{id:'group',titles:[{company:'HN Group'}]}];
 const members=['network','ads','dev','group','offboarded'].map(id=>({user:{id},roles:id==='offboarded'?['staff']:[]}));members.push({user:{id:'bot',bot:true},roles:['staff']});
 const changed=await syncHqStaffAccess({guild,roles,people,request:async(method,url)=>{if(method==='GET')return members;writes.push({method,url});}});
 assert.equal(changed,4);assert.equal(writes.filter(w=>w.method==='PUT').length,3);assert.ok(writes.some(w=>w.method==='DELETE'&&w.url.includes('/offboarded/')));assert.ok(writes.every(w=>w.url.endsWith('/roles/staff')));
});
test('No role creation or access changes outside HQ or without the explicit staff role',async()=>{
 const request=async()=>assert.fail('Must not call Discord');
 assert.equal(await syncHqStaffAccess({guild:'other',roles,people:[],request}),0);
 assert.equal(await syncHqStaffAccess({guild,roles:[],people:[],request}),0);
});
test('Unchanged staff memberships are silent',async()=>{
 assert.equal(await syncHqStaffAccess({guild,roles,people:[{id:'member',titles:[{company:'Horizon Network'}]}],request:async(method)=>{assert.equal(method,'GET');return[{user:{id:'member'},roles:['staff']}];}}),0);
});
