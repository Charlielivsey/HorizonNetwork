'use strict';
// Moderation stays inside Auth. No bot credential is exposed to a website or command caller.
const {embed,ALLOWED_USERS}=require('./server-setup');
const API='https://discord.com/api/v10',ID=/^\d{15,22}$/;
const ECHO_ID='1256504335110635531'; // Echo's linked staff Discord account.
const LOGO='https://branding.hngroup.org.uk/assets/brand/png/hn-group-wordmark-white.png';
const COMMAND={name:'kick',type:1,description:'Kick a server member and record the reason.',default_member_permissions:'2',contexts:[0],integration_types:[0],options:[{name:'member',description:'The server member to kick.',type:6,required:true},{name:'reason',description:'Why this member is being kicked.',type:3,required:true,min_length:1,max_length:400}]};
const INVITE_COMMAND={name:'server-invite',type:1,description:'DM a selected user invites to every server the bot is in.',default_member_permissions:'8',contexts:[0],integration_types:[0],options:[{name:'user',description:'Who should receive the server invites.',type:6,required:true}]};
const fail=message=>new Error(message);
const label=user=>user?.global_name||user?.username||user?.id||'Unknown member';
const safeText=text=>String(text).replace(/[\\`*_{}\[\]()<>#|~]/g,'\\$&');
function createModeration({config,fetcher=fetch,record=()=>{},seen=()=>[],markSeen=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const own=new Map(),interactions=new Set(),working=new Set();
 const branded=options=>({...embed(options),thumbnail:{url:LOGO}});
 async function request(method,path,body,reason){
  const c=config();if(!c?.bot)throw fail('The bot is not configured.');
  for(let attempt=0;attempt<3;attempt++){
   const r=await fetcher(API+path,{method,headers:{Authorization:'Bot '+c.bot,'Content-Type':'application/json',...(reason?{'X-Audit-Log-Reason':encodeURIComponent(reason)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(r.status===204)return null;
   const data=await r.json().catch(()=>({}));
   if(r.status===429&&attempt<2&&Number(data.retry_after)<=5){await sleep(Math.max(100,Number(data.retry_after)*1000||1000));continue;}
   if(!r.ok){const message=r.status===403?'Discord refused this action. Check the bot’s permissions, role position or DM privacy settings.':r.status===404?'The member or server is no longer available.':r.status===429?'Discord is rate-limiting the bot. Please try again shortly.':'Discord could not complete this action. Please try again.';throw fail(message);}
   return data;
  }
 }
 async function reply(event,data,initial=false,ephemeral=false){
  const url=initial?'/interactions/'+event.id+'/'+encodeURIComponent(event.token)+'/callback':'/webhooks/'+config().id+'/'+encodeURIComponent(event.token)+'/messages/@original';
  const r=await fetcher(API+url,{method:initial?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(initial?{type:5,data:ephemeral?{flags:64}:{}}:{embeds:[branded(data)],allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(initial?2500:10000),redirect:'error'});
  if(!r.ok)throw fail('Discord refused the command response.');
 }
 async function dm(id,card){
  try{const channel=await request('POST','/users/@me/channels',{recipient_id:id});if(!ID.test(String(channel?.id)))throw fail('Discord did not open a DM channel.');await request('POST','/channels/'+channel.id+'/messages',{embeds:[card],allowed_mentions:{parse:[]}});return true;}
  catch{ return false; }
 }
 async function notify({guild,user,actor,reason,source,occurredAt=new Date()}){
  const details={guild:guild.id,guildName:guild.name,target:user.id,targetName:label(user),moderator:actor.id,reason,source};
  record({email:'Discord '+actor.id},'member.kick',details);
  const memberDm=await dm(user.id,branded({tone:'warn',title:'You have been kicked from '+guild.name,description:'You have been removed from **'+safeText(guild.name)+'**.\n\n**Reason**\n'+safeText(reason)+'\n\nTo appeal this decision, please contact appeals@hngroup.org.uk.'}));
  const card=branded({tone:'warn',title:'Server kick log'});
  card.timestamp=occurredAt.toISOString();
  card.fields=[{name:'Member kicked',value:safeText(label(user)),inline:true},{name:'Kicked by',value:safeText(label(actor)),inline:true},{name:'Server',value:safeText(guild.name)},{name:'Reason',value:safeText(reason)},{name:'Time',value:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'long',timeStyle:'long'}).format(occurredAt)}];
  const ownerDm=config()?.ownerAuditRecipient===ECHO_ID?'queued':await dm(ECHO_ID,card);
  record({email:'Discord '+actor.id},'member.kick.notifications',{...details,memberDm,ownerDm});
  return {memberDm,ownerDm};
 }
 const hasKick=permissions=>{try{return (BigInt(permissions)&10n)!==0n;}catch{return false;}};
 function highest(member,roles,guild){
  return roles.filter(r=>r.id!==guild&&member.roles?.includes(r.id)).sort((a,b)=>b.position-a.position||(BigInt(a.id)<BigInt(b.id)?-1:1))[0]||{position:0,id:guild};
 }
 function above(left,right){return left.position>right.position||(left.position===right.position&&left.id!==right.id&&BigInt(left.id)<BigInt(right.id));}
 async function invite(event){
  const actor=event.member?.user||event.user||{};
  await reply(event,{},true,true);
  try{
   if(!ALLOWED_USERS.has(String(actor.id)))throw fail('Only authorised bot administrators can send server invites.');
   const target=event.data?.options?.find(o=>o.name==='user')?.value;
   if(!ID.test(String(target)))throw fail('Choose the user who should receive the invites.');
   if(event.data?.resolved?.users?.[target]?.bot)throw fail('Choose a person rather than a bot.');
   const guilds=[];let after='';
   for(;;){
    const page=await request('GET','/users/@me/guilds?limit=200'+(after?'&after='+after:''));
    if(!Array.isArray(page))throw fail('Discord could not list the bot’s servers.');
    guilds.push(...page);if(page.length<200)break;
    const next=page.at(-1)?.id;if(!ID.test(String(next))||next===after)throw fail('Discord could not finish listing the servers.');after=next;
   }
   if(!guilds.length)throw fail('The bot is not connected to any servers.');
   const links=[],failed=[];
   for(const guild of guilds){
    try{
     const details=await request('GET','/guilds/'+guild.id);
     const channels=await request('GET','/guilds/'+guild.id+'/channels');
     const eligible=channels.filter(c=>[0,5].includes(c.type)&&!c.nsfw).sort((a,b)=>(Number(b.id===details.system_channel_id)-Number(a.id===details.system_channel_id))||(a.position-b.position));
     let code;
     for(const channel of eligible){try{const result=await request('POST','/channels/'+channel.id+'/invites',{max_age:604800,max_uses:0,temporary:false,unique:false},'HN server invites requested by '+actor.id);if(/^[a-zA-Z0-9_-]{1,128}$/.test(result?.code)){code=result.code;break;}}catch{}}
     if(!code)throw fail('No channel allows invites.');
     links.push({name:safeText(guild.name).slice(0,256),value:'https://discord.gg/'+code});
    }catch{failed.push(safeText(guild.name));}
   }
   if(failed.length)throw fail('No DM was sent because invites could not be prepared for: '+failed.join(', ')+'. Check the bot’s Create Invite permission and channel access, then try again.');
   for(let i=0;i<links.length;i+=10){
    const card=branded({title:'Your HN Group server invites',description:'You have been invited to the following servers. These links expire in seven days. Joining does not grant staff roles or additional permissions.'});card.fields=links.slice(i,i+10);
    if(!await dm(target,card))throw fail(i?'Some invites were sent, but Discord could not deliver the remaining links.':'Discord could not send the DM. Ask the selected user to allow direct messages, then try again.');
   }
   record({email:'Discord '+actor.id},'server.invites.sent',{target,servers:guilds.map(g=>g.id)});
   await reply(event,{tone:'ok',title:'Server invites sent',description:'Invites for '+links.length+' servers have been sent to the selected user by DM.'});
  }catch(e){record({email:'Discord '+actor.id},'server.invites.failed',{error:e.message});await reply(event,{tone:'error',title:'Server invites not completed',description:e.message.slice(0,4000)});}
 }
 async function interaction(event){
  if(!ID.test(String(event?.id))||typeof event.token!=='string'||interactions.has(event.id))return;
  interactions.add(event.id);if(interactions.size>2000)interactions.delete(interactions.values().next().value);
  if(event.data?.name===INVITE_COMMAND.name)return invite(event);
  await reply(event,{},true);
  let removed=false;
  const actor=event.member?.user||event.user||{};
  try{
   if(!ID.test(String(event.guild_id))||!event.member)throw fail('Use /kick inside a server.');
   const opts=event.data?.options||[],target=opts.find(o=>o.name==='member')?.value,raw=opts.find(o=>o.name==='reason')?.value,reason=typeof raw==='string'?raw.trim():'';
   if(!ID.test(String(target))||!reason||reason.length>400)throw fail('Choose a member and give a reason of 1–400 characters.');
   if(!ID.test(String(actor.id)))throw fail('Discord could not identify the moderator.');
   const guild=await request('GET','/guilds/'+event.guild_id);
   const moderator=await request('GET','/guilds/'+guild.id+'/members/'+actor.id);
   const roles=await request('GET','/guilds/'+guild.id+'/roles');
   const permissions=roles.filter(r=>r.id===guild.id||moderator.roles?.includes(r.id)).reduce((bits,r)=>bits|BigInt(r.permissions||0),0n);
   if(actor.id!==guild.owner_id&&!hasKick(permissions))throw fail('You need Kick Members permission to use this command.');
   const bot=await request('GET','/users/@me');
   if(target===actor.id||target===bot.id||target===guild.owner_id)throw fail('You cannot kick yourself, this bot or the server owner.');
   const member=await request('GET','/guilds/'+guild.id+'/members/'+target);
   const botMember=await request('GET','/guilds/'+guild.id+'/members/'+bot.id);
   const botPermissions=roles.filter(r=>r.id===guild.id||botMember.roles?.includes(r.id)).reduce((bits,r)=>bits|BigInt(r.permissions||0),0n);
   if(!hasKick(botPermissions))throw fail('The bot needs Kick Members permission in this server.');
   const targetRole=highest(member,roles,guild.id);
   if(actor.id!==guild.owner_id&&!above(highest(moderator,roles,guild.id),targetRole))throw fail('You can only kick members whose highest role is below yours.');
   if(!above(highest(botMember,roles,guild.id),targetRole))throw fail('Move the bot’s role above this member’s highest role before kicking them.');
   const auditPrefix='[HN kick '+event.id+'] '+actor.id+': ';
   const auditChars=Array.from(reason);while(encodeURIComponent(auditPrefix+auditChars.join('')).length>512)auditChars.pop();
   const auditReason=auditPrefix+auditChars.join('');
   let settle;const ownKick={at:Date.now(),guild:guild.id,target,bot:bot.id,done:new Promise(resolve=>{settle=resolve;})};
   own.set(auditReason,ownKick);for(const [key,entry]of own)if(Date.now()-entry.at>600000)own.delete(key);
   try{await request('DELETE','/guilds/'+guild.id+'/members/'+target,undefined,auditReason);removed=true;settle(true);}catch(e){settle(false);own.delete(auditReason);throw e;}
   await notify({guild,user:member.user||{id:target},actor,reason,source:'command'});
   await reply(event,{tone:'ok',title:'Member kicked',description:safeText(label(member.user||{id:target}))+' has been kicked from **'+safeText(guild.name)+'**.\n\n**Reason**\n'+safeText(reason)});
  }catch(e){record({email:'Discord '+actor.id},removed?'member.kick.reporting-failed':'member.kick.failed',{guild:event.guild_id,error:e.message});await reply(event,{tone:removed?'warn':'error',title:removed?'Member kicked; notification problem':'Member not kicked',description:removed?'The member was removed, but a notification or command response could not be completed. Check the bot audit log.':e.message});}
 }
 async function audit(event){
  if(event?.action_type!==20||![event.id,event.guild_id,event.target_id,event.user_id].every(v=>ID.test(String(v)))||seen().includes(event.id)||working.has(event.id))return;
  working.add(event.id);
  try{
   const entry=own.get(event.reason);
   if(entry&&entry.guild===event.guild_id&&entry.target===event.target_id&&entry.bot===event.user_id&&await entry.done){markSeen(event.id);return;}
   const guild=await request('GET','/guilds/'+event.guild_id);
   const lookup=async id=>{try{return await request('GET','/users/'+id);}catch{return{id};}};
   const [user,actor]=await Promise.all([lookup(event.target_id),lookup(event.user_id)]);
   await notify({guild,user,actor,reason:typeof event.reason==='string'&&event.reason.trim()?event.reason.slice(0,512):'No reason was recorded by the moderator.',source:'server-audit',occurredAt:new Date(Number((BigInt(event.id)>>22n)+1420070400000n))});
   markSeen(event.id);
  }catch(e){record(null,'member.kick.audit-failed',{event:event.id,guild:event.guild_id,error:e.message});}finally{working.delete(event.id);}
 }
 return {interaction,audit,command:COMMAND};
}
module.exports={createModeration,COMMAND,INVITE_COMMAND,ECHO_ID,LOGO};
