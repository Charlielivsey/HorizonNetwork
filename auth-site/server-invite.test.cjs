'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createModeration,INVITE_COMMAND,ECHO_ID,LOGO}=require('./moderation');
const TARGET='333333333333333333',BOT='444444444444444444',EVENT='888888888888888888';
function fixture({denyGuild=false,blockDm=false}={}){
 const calls=[],audit=[],guilds=Array.from({length:4},(_,i)=>({id:String(111111111111111110n+BigInt(i)),name:'Server '+i}));
 const fetcher=async(url,o={})=>{const u=new URL(url),p=u.pathname.replace('/api/v10',''),body=o.body?JSON.parse(o.body):null;calls.push({p,method:o.method,body});
  if(p.startsWith('/interactions/'))return new Response(null,{status:204});
  if(p.startsWith('/webhooks/'))return Response.json({});
  if(p==='/users/@me/guilds')return Response.json(guilds);
  if(p.startsWith('/guilds/')){const g=guilds.find(g=>p.includes(g.id));return Response.json(p.endsWith('/channels')?[{id:g.id,type:0,position:0,nsfw:true},{id:String(BigInt(g.id)+100n),type:0,position:1,nsfw:false}]:g);}
  if(p.endsWith('/invites'))return denyGuild?Response.json({},{status:403}):Response.json({code:'invite-'+p.split('/')[2]});
  if(p==='/users/@me/channels')return Response.json({id:TARGET});
  if(p.endsWith('/messages'))return blockDm?Response.json({},{status:403}):Response.json({id:EVENT});
  throw Error('Unexpected request '+p);
 };
 const moderation=createModeration({config:()=>({id:BOT,bot:'fixture'}),fetcher,record:(_,action,details)=>audit.push({action,details})});
 const event={id:EVENT,token:'fixture',type:2,guild_id:guilds[0].id,member:{user:{id:ECHO_ID}},data:{name:'server-invite',options:[{name:'user',value:TARGET}]}};
 return {calls,audit,moderation,event};
}
test('server invites are admin restricted, required-user, private, branded and cover every joined server',async()=>{
 assert.equal(INVITE_COMMAND.options[0].required,true);assert.equal(INVITE_COMMAND.default_member_permissions,'8');
 const f=fixture();await f.moderation.interaction(f.event);await f.moderation.interaction(f.event);
 assert.equal(f.calls[0].body.data.flags,64);assert.equal(f.calls.filter(c=>c.p.endsWith('/invites')).length,4);
 for(const c of f.calls.filter(c=>c.p.endsWith('/invites'))){assert.equal(c.body.max_age,604800);assert.equal(c.body.max_uses,0);assert.ok(BigInt(c.p.split('/')[2])>111111111111111200n,'NSFW channels excluded');}
 const messages=f.calls.filter(c=>c.p.endsWith('/messages'));assert.equal(messages.length,1);assert.equal(messages[0].body.embeds[0].fields.length,4);assert.equal(messages[0].body.embeds[0].thumbnail.url,LOGO);assert.match(LOGO,/wordmark-white\.png$/);assert.deepEqual(messages[0].body.allowed_mentions,{parse:[]});
 assert.ok(!JSON.stringify(f.calls.at(-1).body).includes('discord.gg'));assert.ok(!JSON.stringify(f.audit).includes('discord.gg'));
});
test('unauthorised callers and bot recipients never generate or receive invites',async()=>{
 for(const kind of ['unauthorised','bot','missing']){const f=fixture();if(kind==='unauthorised')f.event.member.user.id=TARGET;if(kind==='bot')f.event.data.resolved={users:{[TARGET]:{bot:true}}};if(kind==='missing')f.event.data.options=[];await f.moderation.interaction(f.event);assert.ok(!f.calls.some(c=>c.p.startsWith('/guilds/')||c.p==='/users/@me/guilds'));assert.equal(f.calls.at(-1).body.embeds[0].title,'Server invites not completed');}
});
test('missing server invite permissions prevent an incomplete DM; closed DMs report failure',async()=>{
 const f=fixture({denyGuild:true});await f.moderation.interaction(f.event);assert.ok(!f.calls.some(c=>c.p.endsWith('/messages')));assert.match(f.calls.at(-1).body.embeds[0].description,/No DM was sent/);assert.ok(!f.audit.some(a=>a.action==='server.invites.sent'));
 const blocked=fixture({blockDm:true});await blocked.moderation.interaction(blocked.event);assert.match(blocked.calls.at(-1).body.embeds[0].description,/could not send the DM/);assert.ok(!blocked.audit.some(a=>a.action==='server.invites.sent'));
});
