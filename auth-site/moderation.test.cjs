'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createModeration,COMMAND,ECHO_ID,LOGO}=require('./moderation');
const G='111111111111111111',ACTOR='222222222222222222',TARGET='333333333333333333',BOT='444444444444444444',TOP='555555555555555555',MOD='666666666666666666',LOW='777777777777777777',EVENT='888888888888888888';
function fixture(change={}){
 const calls=[],audit=[],seen=[];let permissions='2',targetPosition=1,botPosition=8,blockDm=false,denyKick=false,dmCreates=0;
 const fetcher=async(url,o={})=>{const p=new URL(url).pathname.replace('/api/v10',''),body=o.body?JSON.parse(o.body):undefined;calls.push({p,...o,body});
  if(p.startsWith('/interactions/'))return new Response(null,{status:204});if(p.startsWith('/webhooks/'))return Response.json({ok:true});
  if(p==='/guilds/'+G)return Response.json({id:G,name:'Fixture server',owner_id:'999999999999999999'});
  if(p==='/guilds/'+G+'/roles')return Response.json([{id:G,position:0,permissions:'0'},{id:TOP,position:botPosition,permissions:'2'},{id:MOD,position:5,permissions},{id:LOW,position:targetPosition,permissions:'0'}]);
  if(p==='/users/@me')return Response.json({id:BOT,username:'Auth bot'});
  if(p==='/guilds/'+G+'/members/'+ACTOR)return Response.json({user:{id:ACTOR,username:'Moderator'},roles:[MOD]});
  if(p==='/guilds/'+G+'/members/'+BOT)return Response.json({user:{id:BOT},roles:[TOP]});
  if(p==='/guilds/'+G+'/members/'+TARGET){if(o.method==='DELETE')return new Response(null,{status:denyKick?403:204});return Response.json({user:{id:TARGET,username:'Member'},roles:[LOW]});}
  if(p==='/users/@me/channels'){dmCreates++;return Response.json({id:body.recipient_id});}
  if(p.startsWith('/channels/'))return blockDm&&p.includes(TARGET)?Response.json({message:'DM closed'},{status:403}):Response.json({id:EVENT});
  if(p.startsWith('/users/'))return Response.json({id:p.split('/').at(-1),username:'Other moderator'});
  throw Error('Unexpected Discord request '+p);
 };
 const config=()=>({id:BOT,bot:'fixture-token'}),moderation=createModeration({config,fetcher,record:(actor,action,details)=>audit.push({actor,action,details}),seen:()=>seen,markSeen:id=>seen.push(id)});
 return{moderation,calls,audit,seen,config,fetcher,set(patch){if(patch.permissions!==undefined)permissions=patch.permissions;if(patch.targetPosition!==undefined)targetPosition=patch.targetPosition;if(patch.botPosition!==undefined)botPosition=patch.botPosition;if(patch.blockDm!==undefined)blockDm=patch.blockDm;if(patch.denyKick!==undefined)denyKick=patch.denyKick;},get dmCreates(){return dmCreates;}};
}
const event=(reason='Repeated spam')=>({id:EVENT,token:'fixture-interaction',type:2,guild_id:G,member:{user:{id:ACTOR,username:'Moderator'},permissions:'8'},data:{name:'kick',options:[{name:'member',value:TARGET},{name:'reason',value:reason}]}});
test('kick requires reason, rechecks permission and both role hierarchies before any removal or DM',async()=>{
 assert.equal(COMMAND.default_member_permissions,'2');assert.deepEqual(COMMAND.contexts,[0]);assert.ok(COMMAND.options.every(o=>o.required));
 for(const patch of [{permissions:'0'},{targetPosition:6},{botPosition:0}]){const f=fixture();f.set(patch);await f.moderation.interaction(event());assert.ok(!f.calls.some(c=>c.method==='DELETE'));assert.equal(f.dmCreates,0);assert.ok(f.calls.at(-1).body.embeds[0].title==='Member not kicked');}
 const f=fixture();await f.moderation.interaction(event('   '));assert.equal(f.dmCreates,0);assert.ok(!f.calls.some(c=>c.method==='DELETE'));
 for(const target of [ACTOR,BOT,'999999999999999999']){const f=fixture(),e=event();e.data.options[0].value=target;await f.moderation.interaction(e);assert.ok(!f.calls.some(c=>c.method==='DELETE'));}
});
test('successful kick has a Discord audit reason, branded reason DM and Echo log; replays do not repeat it',async()=>{
 const f=fixture();await f.moderation.interaction(event('Spam @everyone'));await f.moderation.interaction(event());
 const kicks=f.calls.filter(c=>c.method==='DELETE');assert.equal(kicks.length,1);assert.match(decodeURIComponent(kicks[0].headers['X-Audit-Log-Reason']),/Spam @everyone/);
 const messages=f.calls.filter(c=>c.p.startsWith('/channels/'));assert.equal(messages.length,2);assert.equal(messages[0].p,'/channels/'+TARGET+'/messages');assert.match(messages[0].body.embeds[0].description,/Spam @everyone/);assert.match(messages[0].body.embeds[0].description,/appeals@hngroup.org.uk/);assert.deepEqual(messages[1].body.embeds[0].fields.map(x=>x.name),['Member kicked','Kicked by','Server','Reason','Time']);assert.doesNotMatch(JSON.stringify(messages[1].body.embeds[0]),/Delivered|Member DM/);assert.equal(messages[1].p,'/channels/'+ECHO_ID+'/messages');
 for(const m of messages){assert.equal(m.body.embeds[0].thumbnail.url,LOGO);assert.deepEqual(m.body.allowed_mentions,{parse:[]});}
 const auditReason=decodeURIComponent(kicks[0].headers['X-Audit-Log-Reason']);await f.moderation.audit({id:EVENT,guild_id:G,target_id:TARGET,user_id:BOT,action_type:20,reason:auditReason});assert.equal(f.dmCreates,2,'own kick audit event is not sent twice');assert.ok(f.seen.includes(EVENT));assert.ok(f.audit.some(r=>r.action==='member.kick.notifications'&&r.details.ownerDm));
});
test('closed DMs cannot cancel a successful kick and failed kicks send no success notification',async()=>{
 const f=fixture();f.set({blockDm:true});await f.moderation.interaction(event());assert.equal(f.calls.filter(c=>c.method==='DELETE').length,1);assert.doesNotMatch(f.calls.at(-1).body.embeds[0].description,/DM|delivered/);assert.equal(f.audit.find(r=>r.action==='member.kick.notifications').details.memberDm,false);
 const failed=fixture();failed.set({denyKick:true});await failed.moderation.interaction(event());assert.equal(failed.dmCreates,0);assert.equal(failed.calls.at(-1).body.embeds[0].title,'Member not kicked');
});
test('external server kicks log and DM once, with an explicit fallback when no reason was recorded',async()=>{
 const f=fixture(),entry={id:EVENT,guild_id:G,target_id:TARGET,user_id:ACTOR,action_type:20};await f.moderation.audit(entry);await f.moderation.audit(entry);assert.equal(f.dmCreates,2);assert.match(f.calls.find(c=>c.p==='/channels/'+TARGET+'/messages').body.embeds[0].description,/No reason was recorded/);assert.equal(f.audit.find(r=>r.action==='member.kick').details.source,'server-audit');await f.moderation.audit({...entry,id:'999999999999999998',action_type:22});assert.equal(f.dmCreates,2,'bans and voluntary leaves are not kicks');
});
test('gateway requests only moderation events and forwards audit entries',()=>{
 const {startPresence}=require('./discord-gateway');let cb;const sent=[],events=[];
 const controller=startPresence(()=>'fixture',{transport:(g,callbacks)=>{cb=callbacks;return{send:s=>sent.push(JSON.parse(s)),close(){}};},onAuditLog:e=>events.push(e),log:{log(){}}});
 try{cb.onMessage(JSON.stringify({op:10,d:{heartbeat_interval:60000}}));assert.equal(sent[0].d.intents,4);cb.onMessage(JSON.stringify({op:0,t:'GUILD_AUDIT_LOG_ENTRY_CREATE',d:{action_type:20}}));assert.equal(events[0].action_type,20);}finally{controller.stop();}
});

test('long Unicode reasons fit Discord audit headers while DMs keep the full explanation',async()=>{
 const f=fixture(),reason='猫'.repeat(400);await f.moderation.interaction(event(reason));
 const kick=f.calls.find(c=>c.method==='DELETE');assert.ok(kick);assert.ok(kick.headers['X-Audit-Log-Reason'].length<=512);assert.ok(f.calls.find(c=>c.p==='/channels/'+TARGET+'/messages').body.embeds[0].description.includes(reason));
});

