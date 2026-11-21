'use strict';
const crypto=require('node:crypto'),{embed}=require('./server-setup');
const ID=/^\d{15,22}$/;
const COMMAND={name:'welcome',description:'Configure this server’s member welcome messages.',type:1,contexts:[0],integration_types:[0],default_member_permissions:'32',options:[{name:'setup',description:'Set the welcome channel, rules channel and message for this server.',type:1,options:[{name:'channel',description:'Where new members are welcomed.',type:7,channel_types:[0,5],required:true},{name:'rules',description:'This server’s rules channel.',type:7,channel_types:[0,5],required:true},{name:'message',description:'Optional template: {user}, {server}, {count}, {rules}.',type:3,max_length:1200}]},{name:'show',description:'Show this server’s welcome settings.',type:1},{name:'disable',description:'Disable welcome messages for this server.',type:1},{name:'test',description:'Send a welcome message for yourself using this server’s settings.',type:1}]};
const DEFAULT='Welcome {user} to **{server}**! We now have **{count}** members! Please make sure to read {rules}. Thank you for joining us!';
const safe=s=>String(s||'').replace(/[\\`*_{}\[\]()<>#|~]/g,'\\$&').slice(0,160);
function createWelcome({state,commit,api,callback,record=()=>{},defer=async()=>{},membersEnabled=()=>false}){
 let busy=false;const counts=new Map();
 const snapshot=()=>structuredClone(state()||{guilds:{},seen:[],pending:[]});
 async function channel(id,guild){if(!ID.test(String(id)))throw Error('Choose a text channel.');const c=await api('GET','/channels/'+id);if(c.guild_id!==guild||![0,5].includes(c.type))throw Error('Both channels must be text channels in this server.');return c;}
 async function send(event,settings,key){
  const guild=await api('GET','/guilds/'+event.guild_id+'?with_counts=true'),user=event.user,id=String(user.id),count=counts.get(event.guild_id)??guild.approximate_member_count??guild.member_count??'a new';
  const description=(settings.message||DEFAULT).replaceAll('{user}','<@'+id+'>').replaceAll('{server}',safe(guild.name)).replaceAll('{count}',String(count)).replaceAll('{rules}','<#'+settings.rules+'>');
  const card=embed({tone:'success',title:'User Joined!',description});const created=Number((BigInt(id)>>22n)+1420070400000n);
  card.fields=[{name:'User Info',value:'**User’s Name:** '+safe(user.username)+'\n**User’s ID:** '+id+'\n**Account Creation:** <t:'+Math.floor(created/1000)+':D> (<t:'+Math.floor(created/1000)+':R>)'}];
  if(user.avatar)card.thumbnail={url:'https://cdn.discordapp.com/avatars/'+id+'/'+user.avatar+'.png?size=256'};
  await api('POST','/channels/'+settings.channel+'/messages',{content:'<@'+id+'>',embeds:[card],allowed_mentions:{parse:[],users:[id]},nonce:crypto.createHash('sha256').update(key).digest('hex').slice(0,24),enforce_nonce:true});
 }
 async function flush(){if(busy||!membersEnabled())return;busy=true;try{for(const pending of snapshot().pending||[]){if(pending.retryAt>Date.now())continue;const current=snapshot(),settings=current.guilds[pending.event.guild_id];if(!settings?.enabled){current.pending=current.pending.filter(p=>p.key!==pending.key);commit(current);continue;}try{await send(pending.event,settings,pending.key);const next=snapshot();next.pending=next.pending.filter(p=>p.key!==pending.key);next.seen=[...(next.seen||[]),pending.key].slice(-5000);commit(next);record(null,'welcome.delivered',{guild:pending.event.guild_id,user:pending.event.user.id});}catch{const next=snapshot(),p=next.pending.find(p=>p.key===pending.key);if(p){p.attempts=(p.attempts||0)+1;p.retryAt=Date.now()+Math.min(3600000,30000*2**Math.min(p.attempts,6));commit(next);}record(null,'welcome.delivery.failed',{guild:pending.event.guild_id});}}}finally{busy=false;}}
 async function member(event){if(!ID.test(String(event?.guild_id))||!ID.test(String(event?.user?.id)))return;const s=snapshot();if(!s.guilds?.[event.guild_id]?.enabled)return;const key=event.guild_id+':'+event.user.id+':'+String(event.joined_at||'');if((s.seen||[]).includes(key)||(s.pending||[]).some(p=>p.key===key))return;if(counts.has(event.guild_id))counts.set(event.guild_id,counts.get(event.guild_id)+1);s.pending=[...(s.pending||[]),{key,event:{guild_id:event.guild_id,user:event.user,joined_at:event.joined_at},retryAt:0}];commit(s);await flush();}
 async function interaction(event){
  await defer(event);
  let text;try{
   if(!event.guild_id)throw Error('Use this command in a server.');const permissions=BigInt(event.member?.permissions||0);if(!(permissions&32n)&&!(permissions&8n))throw Error('Manage Server permission is required.');
   const sub=event.data.options?.[0],s=snapshot();s.guilds ||= {};s.pending ||= [];s.seen ||= [];
   if(sub?.name==='setup'){
    const fields=Object.fromEntries((sub.options||[]).map(o=>[o.name,o.value]));await channel(fields.channel,event.guild_id);await channel(fields.rules,event.guild_id);
    s.guilds[event.guild_id]={enabled:true,channel:fields.channel,rules:fields.rules,message:fields.message||DEFAULT};commit(s);
    text='Welcome messages are configured for <#'+fields.channel+'>, with rules in <#'+fields.rules+'>.'+(!membersEnabled()?' Enable Server Members Intent for HN Utilities in the Discord Developer Portal, then reconnect the bot to receive member joins.':' New members will be welcomed automatically.');
   }else if(sub?.name==='disable'){if(s.guilds[event.guild_id])s.guilds[event.guild_id].enabled=false;s.pending=s.pending.filter(p=>p.event.guild_id!==event.guild_id);commit(s);text='Welcome messages are disabled for this server.';}
   else if(sub?.name==='test'){const config=s.guilds[event.guild_id];if(!config?.enabled)throw Error('Configure /welcome setup first.');await send({guild_id:event.guild_id,user:event.member.user},config,'test:'+event.id);text='A welcome message was sent to the configured channel.';}
   else{const config=s.guilds[event.guild_id];text=config?.enabled?'Welcome channel: <#'+config.channel+'>\nRules: <#'+config.rules+'>\nTemplate: '+config.message:'Welcome messages are not configured. Use /welcome setup.';}
  }catch(e){text=e.message||'Welcome settings could not be changed.';}
  await callback(event,{embeds:[embed({title:'Server welcomes',description:text})],flags:64,allowed_mentions:{parse:[]}});
 }
 const timer=setInterval(()=>flush().catch(()=>{}),60000);timer.unref();
 return{interaction,member,flush,guild:event=>{if(ID.test(String(event.id))&&Number.isInteger(event.member_count))counts.set(event.id,event.member_count);},remove:event=>{if(counts.has(event.guild_id))counts.set(event.guild_id,Math.max(0,counts.get(event.guild_id)-1));},close:()=>clearInterval(timer)};
}
module.exports={COMMAND,DEFAULT,createWelcome};
