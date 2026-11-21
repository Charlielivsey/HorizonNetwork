'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createOwnerAudit,OWNER_ID,isBotLog}=require('./owner-audit'),{createBotManager}=require('./bot-manager'),{startPresence}=require('./discord-gateway');
const CHANNEL='222222222222222222',APP='333333333333333333',USER='444444444444444444';
function fixture(){let db={queue:[]},fail=null;const calls=[],config=()=>({id:APP,bot:'private-bot-token',secret:'private-oauth-secret',ownerAuditRecipient:OWNER_ID});
 const fetcher=async(url,opts={})=>{const body=opts.body?JSON.parse(opts.body):undefined;calls.push({url,...opts,body});if(fail&&url.endsWith('/messages'))return Response.json(fail.body,{status:fail.status});if(url.endsWith('/users/@me/channels'))return Response.json({id:CHANNEL});return Response.json({id:'555555555555555555'});};
 const build=()=>createOwnerAudit({config,fetcher,state:()=>db,commit:value=>{db=value;}});let audit=build();
 return{calls,fetcher,config,get audit(){return audit;},get db(){return db;},setFailure(value){fail=value;},clearRetry(){db.retryAt=0;},restart(){audit.close();audit=build();},close(){audit.close();}};
}
const event=(action,details={})=>({at:new Date().toISOString(),action,actor:'Discord '+USER,details});
test('every audit event is its own branded owner DM; delivery cannot create recursive events',async()=>{const f=fixture();try{
 for(const name of ['network.create','network.list','member.kick'])f.audit.enqueue(event(name,{guild:APP}));await Promise.all([f.audit.flush(),f.audit.flush()]);
 const dms=f.calls.filter(c=>c.url.endsWith('/messages'));assert.equal(dms.length,3);assert.equal(f.calls.filter(c=>c.url.endsWith('/users/@me/channels')).length,1);assert.equal(f.calls[0].body.recipient_id,OWNER_ID);
 assert.deepEqual(dms.map(c=>c.body.embeds[0].title),['HN Utilities · Network created','HN Utilities · Network list viewed','HN Utilities · Member kicked']);assert.equal(new Set(dms.map(c=>c.body.nonce)).size,3);
 for(const c of dms){assert.deepEqual(c.body.allowed_mentions,{parse:[]});assert.equal(c.body.enforce_nonce,true);assert.ok(c.body.nonce.length<=25);assert.equal(c.body.embeds.length,1);assert.ok(c.body.embeds[0].thumbnail.url.endsWith('hn-group-wordmark-white.png'));}
 assert.equal(f.db.queue.length,0);assert.ok(f.db.lastDeliveryAt);assert.equal(f.db.lastError,null);
}finally{f.close();}});
test('blocked DMs and rate limits preserve each queued event across restart and retry separately',async()=>{const f=fixture();try{
 f.setFailure({status:403,body:{message:'Closed DMs'}});f.audit.enqueue(event('network.create'));f.audit.enqueue(event('network.join'));await f.audit.flush();assert.equal(f.db.queue.length,2);assert.match(f.db.lastError,/403/);const first=f.db.queue[0].id;
 f.restart();await f.audit.flush();assert.equal(f.db.queue.length,2);f.clearRetry();f.setFailure({status:429,body:{retry_after:2}});await f.audit.flush();assert.ok(f.db.retryAt>=Date.now()+1500);assert.equal(f.db.queue[0].id,first);
 f.setFailure(null);f.clearRetry();await f.audit.flush();assert.equal(f.db.queue.length,0);const successes=f.calls.filter(c=>c.url.endsWith('/messages')).slice(-2);assert.equal(successes[0].body.nonce,BigInt('0x'+first).toString());
}finally{f.close();}});
test('technical events are never DMed and pending technical events are removed on restart',async()=>{const f=fixture();try{
 for(const action of ['gateway.connect','gateway.send','gateway.receive','gateway.event','discord.request','discord.request.failed','command.received','command.completed','profiles.sync','profiles.lookup.completed','positions.sync']){assert.equal(isBotLog(action),false);f.audit.enqueue(event(action));}
 assert.equal(f.db.queue.length,0);f.audit.enqueue(event('network.create'));f.db.queue.push({...event('gateway.send'),id:'old-technical'});f.restart();assert.deepEqual(f.db.queue.map(e=>e.action),['network.create']);await f.audit.flush();assert.equal(f.calls.filter(c=>c.url.endsWith('/messages')).length,1);
 f.audit.enqueue(event('network.failed',{password:'hidden-password',token:'hidden-token',adminCode:'0103',code:'JOINCODE',appeals:'https://discord.gg/private-invite'}));await f.audit.flush();const bodies=JSON.stringify(f.calls.filter(c=>c.url.endsWith('/messages')).map(c=>c.body));for(const secret of ['hidden-password','hidden-token','0103','JOINCODE','private-invite'])assert.ok(!bodies.includes(secret),secret);
}finally{f.close();}});
test('manager persists network logs while excluding general commands and transport',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-owner-log-'));const f=fixture();let manager;
 try{
 const file=path.join(dir,'bot.json'),build=()=>createBotManager({file,configFile:path.join(dir,'config.json'),config:f.config,fetcher:f.fetcher});
 manager=build();f.setFailure({status:403,body:{}});await manager.interaction({id:'666666666666666666',token:'secret-callback',type:2,guild_id:APP,member:{user:{id:USER}},data:{name:'network',options:[{name:'list',type:1}]}});await manager.flushOwnerLogs();
 let saved=JSON.parse(fs.readFileSync(file));assert.ok(saved.ownerLog.queue.some(e=>e.action==='network.list'));assert.ok(!saved.ownerLog.queue.some(e=>e.action==='command.received'));assert.ok(!saved.ownerLog.queue.some(e=>e.action==='discord.request'));assert.ok(!JSON.stringify(saved).includes('secret-callback'));
 manager.closeOwnerLogs();saved.ownerLog.retryAt=0;fs.writeFileSync(file,JSON.stringify(saved));f.setFailure(null);manager=build();await manager.flushOwnerLogs();assert.equal(JSON.parse(fs.readFileSync(file)).ownerLog.queue.length,0);
 const before=f.calls.filter(c=>c.url.endsWith('/messages')).length;await manager.interaction({id:'666666666666666667',token:'secret-ping',type:2,user:{id:USER},data:{name:'ping'}});await manager.flushOwnerLogs();assert.equal(f.calls.filter(c=>c.url.endsWith('/messages')).length,before,'ping and command transport do not produce owner DMs');
 }finally{manager?.closeOwnerLogs();f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('gateway actions include presence, heartbeat, reconnect and shutdown without the identify token',()=>{let callbacks;const events=[];const controller=startPresence(()=> 'private-gateway-token',{onAction:(action,details)=>events.push({action,details}),log:{log(){}},transport:(_url,cb)=>{callbacks=cb;return{send(){},close(){}};}});
 try{callbacks.onMessage(JSON.stringify({op:10,d:{heartbeat_interval:60000}}));callbacks.onMessage(JSON.stringify({op:0,t:'READY',d:{user:{id:USER}}}));controller.apply();callbacks.onMessage(JSON.stringify({op:1}));callbacks.onMessage(JSON.stringify({op:11}));callbacks.onMessage(JSON.stringify({op:7}));controller.stop();
 assert.ok(events.some(e=>e.action==='gateway.send'&&e.details.opcode===2));assert.ok(events.some(e=>e.action==='gateway.send'&&e.details.opcode===3));assert.ok(events.some(e=>e.action==='gateway.send'&&e.details.opcode===1));assert.ok(events.some(e=>e.action==='gateway.reconnect'));assert.ok(events.some(e=>e.action==='gateway.disconnect'));assert.ok(!JSON.stringify(events).includes('private-gateway-token'));
 }finally{controller.stop();}
});
test('manager forwards server moderation once as a readable event DM',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-server-owner-')),f=fixture();let manager;try{
 manager=createBotManager({file:path.join(dir,'bot.json'),configFile:path.join(dir,'config.json'),config:f.config,fetcher:f.fetcher});
 const entry={id:'666666666666666669',guild_id:APP,user_id:USER,target_id:'777777777777777777',action_type:22,reason:'Repeated abuse'};
 await manager.onAuditLog(entry);await manager.onAuditLog(entry);await manager.flushOwnerLogs();
 const dms=f.calls.filter(c=>c.url.endsWith('/messages'));assert.equal(dms.length,1);const card=dms[0].body.embeds[0];assert.equal(card.title,'HN Utilities · Member banned');assert.equal(card.fields.find(x=>x.name==='Reason').value,'Repeated abuse');assert.ok(!JSON.stringify(card).includes('```'));assert.equal(card.fields.find(x=>x.name==='By').value,'<@'+USER+'>');
 }finally{manager?.closeOwnerLogs();f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('existing Utilities queue uses only the registered Logs bot, retaining events until it is configured',async()=>{
 const {logsDeliveryConfig}=require('./owner-audit'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-logs-delivery-')),f=fixture();let manager;
 try{
  const file=path.join(dir,'discord-bot.json'),folder=path.join(dir,'managed-bots','hn-logs'),configFile=path.join(folder,'discord.json');
  fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(dir,'managed-bots.json'),JSON.stringify({bots:[{id:'hn-logs'}]}));
  const queued={...event('network.join',{guild:APP}),id:'1234567890abcdef1234',recipient:OWNER_ID};
  fs.writeFileSync(file,JSON.stringify({ownerLog:{queue:[queued]}}));
  const build=()=>createBotManager({file,configFile:path.join(dir,'discord.json'),config:f.config,ownerAuditConfig:logsDeliveryConfig(dir),fetcher:f.fetcher});
  manager=build();await manager.flushOwnerLogs();assert.equal(f.calls.length,0,'never falls back to Utilities');
  let saved=JSON.parse(fs.readFileSync(file));assert.deepEqual(saved.ownerLog.queue,[queued]);manager.closeOwnerLogs();
  const logsToken='logs-bot-token-'+ 'x'.repeat(60);
  fs.writeFileSync(configFile,JSON.stringify({client_id:APP,bot_token:logsToken}));assert.equal(logsDeliveryConfig(dir)(),null,'reject a different bot application');
  fs.writeFileSync(configFile,JSON.stringify({client_id:'1571216218449248377',bot_token:logsToken}));
  saved.ownerLog.retryAt=0;fs.writeFileSync(file,JSON.stringify(saved));manager=build();await manager.flushOwnerLogs();
  assert.equal(JSON.parse(fs.readFileSync(file)).ownerLog.queue.length,0);assert.equal(f.calls.length,2);
  assert.ok(f.calls.every(c=>c.headers.Authorization==='Bot '+logsToken));
  const sent=f.calls[1].body;assert.equal(sent.embeds[0].title,'HN Utilities · Server joined a network');assert.equal(sent.nonce,BigInt('0x'+queued.id).toString());assert.equal(f.calls[0].body.recipient_id,OWNER_ID);
  manager.record(null,'server.audit.ban',{event:'Member banned',guild:APP});await manager.flushOwnerLogs();
  assert.equal(f.calls.filter(c=>c.url.endsWith('/messages')).length,2);assert.ok(f.calls.every(c=>c.headers.Authorization==='Bot '+logsToken));
 }finally{manager?.closeOwnerLogs();f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
