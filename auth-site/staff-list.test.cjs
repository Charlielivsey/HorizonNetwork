'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createBotManager}=require('./bot-manager');
const {directoryFields}=require('./staff-list');
const layout=require('./hn-roles.json');
test('staff list reads fresh data, paginates every role, defers and suppresses mentions',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-staff-list-')),calls=[];let requests=0,fail=false;
 const people=Array.from({length:12},(_,i)=>({name:'Staff '+i,roles:[{company:'Horizon Network',title:'President',supervisor:{name:'Supervisor',title:'Director'}}],access:{owner:'system',roles:['Super Admin']}}));
 const manager=createBotManager({file:path.join(dir,'bot.json'),config:()=>({id:'1564969421800472698',bot:'fake'}),staff:async(endpoint)=>{assert.equal(endpoint,'/api/auth/discord-staff-list');requests++;if(fail)throw Error('secret backend error');return{value:{people}};},fetcher:async(url,opts)=>{calls.push({url,method:opts.method,body:JSON.parse(opts.body||'{}')});return Response.json([]);}});
 let id=100000000000000000n;
 const event=page=>({id:String(id++),token:'fake',type:2,guild_id:'222222222222222222',member:{user:{id:'333333333333333333'},permissions:'0'},data:{name:'staff-list',options:[{name:'page',value:page}]}});
 try{
  for(let page=1;page<=3;page++){
   await manager.interaction(event(page));
   assert.equal(calls.at(-2).body.type,5);const reply=calls.at(-1).body;
   assert.equal(reply.flags,undefined);assert.equal(reply.embeds[0].fields.length,4);
   assert.deepEqual(reply.allowed_mentions,{parse:[]});assert.ok(JSON.stringify(reply).length<6000);
   assert.match(JSON.stringify(reply),/Network Permission Level 5/);assert.match(JSON.stringify(reply),/Supervisor · Director/);assert.match(JSON.stringify(reply),/System owner, Super Admin/);
  }
  assert.equal(requests,3);await manager.interaction(event(4));assert.match(JSON.stringify(calls.at(-1)),/between 1 and 3/);
  const replay=event(1);await manager.interaction(replay);const count=calls.length;await manager.interaction(replay);assert.equal(calls.length,count);
  people.length=0;await manager.interaction(event(1));assert.match(JSON.stringify(calls.at(-1)),/No current staff/);
  fail=true;await manager.interaction(event(1));assert.match(JSON.stringify(calls.at(-1)),/could not be loaded/);assert.doesNotMatch(JSON.stringify(calls.at(-1)),/secret/);
  await manager.registerBuiltins();assert.ok(calls.some(c=>c.body.name==='staff-list'));
  await manager.handle('save-commands',{commands:[{name:'staff-list',response:'override'}]});const published=calls.findLast(c=>c.method==='PUT').body;assert.equal(published.filter(c=>c.name==='staff-list').length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('all companies and long records remain available without unsafe formatting or oversized fields',()=>{
 const fields=directoryFields([{name:'@everyone **Name**',roles:Array.from({length:40},(_,i)=>({company:'Company '+i,title:'Role '+i,supervisor:null}))}],layout);
 assert.ok(fields.length>1);assert.ok(fields.every(f=>f.name.length<=256&&f.value.length<=1024));
 const text=fields.map(f=>f.value).join('');for(let i=0;i<40;i++)assert.ok(text.includes('Role '+i));assert.match(text,/None assigned/);assert.match(text,/Not assigned/);
 assert.ok(fields[0].name.includes('\\*'));
});
