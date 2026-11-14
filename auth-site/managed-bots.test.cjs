'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createManagedBots}=require('./managed-bots');
test('managed bots isolate settings, Discord credentials, commands and state',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-managed-'));const folder=path.join(dir,'managed-bots','logs');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(dir,'managed-bots.json'),JSON.stringify({bots:[{id:'logs',label:'HN Logs'}]}));const secret='SECONDARY_TOKEN_'+ 'x'.repeat(60),id='1571216218449248377';fs.writeFileSync(path.join(folder,'discord.json'),JSON.stringify({client_id:id,bot_token:secret}));
 const calls=[],primaryCalls=[];let stopped=false;let registered;
 const fleet=createManagedBots({dir,primary:{handle:async(...args)=>{primaryCalls.push(args);return{primary:true};}},primaryConfig:()=>({id:'111111111111111111'}),fetcher:async(url,o={})=>{calls.push({url,token:o.headers.Authorization,body:o.body});return Response.json({id,username:'HN Logs'});},gateway:(token,options)=>{assert.equal(token(),secret);registered=options;return{snapshot:()=>({phase:'online',username:'HN Logs'}),stop:()=>{stopped=true;},apply(){}};}});
 try{
  const list=await fleet.handle('bots');assert.deepEqual(list.map(b=>b.label),['HN Utilities','HN Logs']);assert.ok(!JSON.stringify(list).includes(secret));
  await fleet.handle('overview',{},{});assert.equal(primaryCalls.length,1);
  await fleet.handle('overview',{},{},'logs');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.token==='Bot '+secret));assert.equal(primaryCalls.length,1);
  const state=await fleet.handle('state',{},{},'logs');assert.equal(state.settings.syncEnabled,false);assert.ok(!JSON.stringify(state).includes(secret));
  await fleet.handle('settings',{activity:'for events'},{},'logs');assert.equal((await fleet.handle('state',{},{},'logs')).settings.activity,'for events');assert.equal(primaryCalls.length,1);
  await registered.onReady();const definitions=calls.filter(c=>c.url.endsWith('/commands')).map(c=>JSON.parse(c.body).name);assert.deepEqual(definitions,['stats','ping']);
  await registered.onInteraction({type:2,id:'999999999999999999',token:'test-reply-ticket',data:{name:'ping'},user:{id:'888888888888888888',username:'test'}});const pong=JSON.parse(calls.find(c=>c.url.includes('/interactions/')).body);assert.match(pong.data.embeds[0].description,/Pong!/);assert.deepEqual(pong.data.allowed_mentions,{parse:[]});
  await assert.rejects(fleet.handle('sync',{},{},'logs'),{status:403});await assert.rejects(fleet.handle('state',{},{},'../discord'),{status:400});await assert.rejects(fleet.handle('state',{},{},'missing'),{status:404});await assert.rejects(fleet.handle('credentials',{bot_token:'y'.repeat(70)},{owner:false},'logs'),{status:403});
  assert.equal(fs.statSync(path.join(folder,'state.json')).mode&0o777,0o600);
 }finally{fleet.stop();assert.equal(stopped,true);fs.rmSync(dir,{recursive:true,force:true});}
});
