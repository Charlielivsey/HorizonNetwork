'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('HN Group leadership: holders of HN Group positions, in position order, public fields only',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-gl-'));
 try{
  const store=require('./lib/store');store.init(dir);const net=require('./lib/network-leadership');
  const make=(first,company,title,extra)=>store.saveEmployee({firstName:first,lastName:'Test',jobTitle:title,company,emails:[{domain:store.COMPANY_DOMAINS[company],auto:true,primary:true}],...extra},null);
  make('Exa','HN Group','Executive Assistant');make('Cha','HN Group','Board Chairman');make('Pat','Horizon Network','President');
  make('Ceo','Horizon Network','Advisor',{otherRoles:[{company:'HN Group',jobTitle:'Chief Executive Officer'}]});make('Des','HN Group','Designer');
  const list=net.groupPublicMembers(store);
  assert.deepEqual(list.map(p=>[p.name,p.jobTitle]),[['Cha Test','Board Chairman'],['Ceo Test','Chief Executive Officer'],['Exa Test','Executive Assistant']]);
  assert.ok(list.every(p=>!('emails' in p)&&!('id' in p)));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
