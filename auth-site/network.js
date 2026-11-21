'use strict';
const crypto=require('node:crypto');
const {embed}=require('./server-setup');
const API='https://discord.com/api/v10',ID=/^\d{15,22}$/;
const input=(name,description,max_length)=>({name,description,type:3,required:true,min_length:1,max_length});
const COMMAND={name:'network',description:'Create, list, join, leave or delete a server network.',type:1,default_member_permissions:null,contexts:[0],integration_types:[0],options:[
 {name:'create',description:'Create a network and enrol this server.',type:1,options:[input('name','Network name.',100),input('appeals','Appeals server Discord invite link.',200),input('acronym','Network acronym.',20),input('staff-server','Staff server Discord ID.',22),input('hq','HQ server Discord ID.',22)]},
 {name:'list',description:'List recorded networks and their join codes.',type:1,options:[{name:'page',description:'Page of networks to display.',type:4,min_value:1}]},
 {name:'join',description:'Join this server to a network using its join code.',type:1,options:[input('code','Network join code.',32)]},
 {name:'leave',description:'Remove this server from its network using the system admin code.',type:1,options:[input('admin-code','System admin code.',20)]},
 {name:'delete',description:'Permanently delete a network and clear all its server memberships.',type:1,options:[input('code','Join code of the network to delete.',32),input('admin-code','System admin code.',20)]}
]};
const safe=value=>String(value).replace(/[\\`*_{}\[\]()<>#|~]/g,'\\$&');
function createNetwork({config,fetcher=fetch,state,commit,record=()=>{}}){
 const seen=new Set();
 const memberOf=guild=>state().find(n=>n.guilds.includes(guild));
 async function send(event,payload,edit=false){
  const url=edit?'/webhooks/'+config().id+'/'+encodeURIComponent(event.token)+'/messages/@original':'/interactions/'+event.id+'/'+encodeURIComponent(event.token)+'/callback';
  const r=await fetcher(API+url,{method:edit?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(edit?10000:2500),redirect:'error'});
  if(!r.ok)throw Error('Discord refused the network response.');
 }
 const card=(description,title='HN Utilities · Networks',tone='info')=>({embeds:[{...embed({title,description,tone}),thumbnail:{url:'https://branding.hngroup.org.uk/assets/brand/png/hn-group-wordmark-white.png'}}],allowed_mentions:{parse:[]}});
 const respond=(event,message,edit=false)=>send(event,edit?card(message):{type:4,data:card(message)},edit);
 function change(event,action,fields){
  const rows=state(),current=memberOf(event.guild_id),actor=event.member?.user?.id||event.user?.id;
  if(action==='create'){
   if(current)throw Error('This server already belongs to '+current.name+'. Leave that network first.');
   const name=fields.name||'',acronym=fields.acronym||'';
   if(!name||name.length>100||!acronym||acronym.length>20||/[\x00-\x1f\x7f]/.test(name+acronym))throw Error('Enter a network name (1–100 characters) and acronym (1–20 characters).');
   if(rows.some(n=>n.name.toLowerCase()===name.toLowerCase()||n.acronym.toLowerCase()===acronym.toLowerCase()))throw Error('A network with that name or acronym already exists.');
   if(!/^https:\/\/(?:discord\.gg\/|(?:www\.)?discord\.com\/invite\/)[A-Za-z0-9-]+\/?$/.test(fields.appeals||''))throw Error('Enter a valid HTTPS Discord invite link for the appeals server.');
   if(!ID.test(fields.staff||'')||!ID.test(fields.hq||''))throw Error('Enter valid Discord server IDs for Staff and HQ. Enable Developer Mode in Discord, then use Copy Server ID.');
   let code;do{code=crypto.randomBytes(9).toString('hex').toUpperCase();}while(rows.some(n=>n.code===code));
   const network={id:crypto.randomUUID(),name,acronym,appeals:fields.appeals,staff:fields.staff,hq:fields.hq,code,guilds:[event.guild_id],createdAt:new Date().toISOString(),createdBy:actor};
   commit([...rows,network]);record({email:'Discord '+actor},'network.create',{network:network.id,name:network.name,acronym:network.acronym,staff:network.staff,hq:network.hq,guild:event.guild_id});
   return 'Created **'+safe(name)+' ('+safe(acronym)+')**. This server has joined the network.\nJoin code: `'+code+'`\nAppeals: '+network.appeals+'\nStaff server: '+network.staff+'\nHQ server: '+network.hq+'\nOther servers, including Staff and HQ, can enrol with `/network join`.';
  }
  if(action==='join'){
   if(current)throw Error('This server already belongs to '+current.name+'. Leave that network first.');
   const target=rows.find(n=>n.code===(fields.code||'').toUpperCase());if(!target)throw Error('That network join code was not found. Use /network list to see the recorded networks.');
   commit(rows.map(n=>n.id===target.id?{...n,guilds:[...n.guilds,event.guild_id]}:n));record({email:'Discord '+actor},'network.join',{network:target.id,name:target.name,guild:event.guild_id});
   return 'This server has joined **'+safe(target.name)+' ('+safe(target.acronym)+')**.';
  }
  if(action==='leave'){
   if(fields.admin!=='0103')throw Error('The system admin code is incorrect.');
   if(!current)throw Error('This server does not belong to a network.');
   commit(rows.map(n=>n.id===current.id?{...n,guilds:n.guilds.filter(g=>g!==event.guild_id)}:n));record({email:'Discord '+actor},'network.leave',{network:current.id,name:current.name,guild:event.guild_id});
   return 'This server has left **'+safe(current.name)+'**. The network and its join code remain recorded.';
  }
  if(action==='delete'){
   if(fields.admin!=='0103')throw Error('The system admin code is incorrect.');
   const target=rows.find(n=>n.code===(fields.code||'').toUpperCase());if(!target)throw Error('That network join code was not found. Use /network list to see the recorded networks.');
   commit(rows.filter(n=>n.id!==target.id));record({email:'Discord '+actor},'network.delete',{network:target.id,name:target.name,guild:event.guild_id,count:target.guilds.length});
   return 'Deleted **'+safe(target.name)+'** and cleared '+target.guilds.length+' server membership(s). Its join code is no longer valid. The bot remains in all Discord servers.';
  }
  throw Error('Choose create, list, join, leave or delete.');
 }
 async function interaction(event){
  if(!ID.test(String(event?.id))||typeof event.token!=='string'||seen.has(event.id))return;
  seen.add(event.id);if(seen.size>2000)seen.delete(seen.values().next().value);
  if(!ID.test(String(event.guild_id)))return respond(event,'Use /network in a Discord server.');
  if(event.type===5)return respond(event,'Network fields now belong in the slash command. Run /network again.');
  const option=event.data?.options?.[0],action=option?.name;
  if(action==='list'){
   const rows=state(),pages=Math.max(1,Math.ceil(rows.length/5)),page=option.options?.find(o=>o.name==='page')?.value||1;
   if(!Number.isInteger(page)||page<1||page>pages)return respond(event,'Choose a page between 1 and '+pages+'.');
   const data=card(rows.length?rows.length+' network(s) recorded. Page '+page+' of '+pages+'. Use `/network list page:<number>` for another page.':'No networks have been recorded. Use /network create to add one.');
   data.embeds[0].fields=rows.slice((page-1)*5,page*5).map(n=>({name:n.name+' ('+n.acronym+')',value:'Join code: `'+n.code+'`\nAppeals: '+n.appeals+'\nStaff server: '+n.staff+'\nHQ server: '+n.hq+'\nMember servers: '+n.guilds.length}));
   record({email:'Discord '+(event.member?.user?.id||event.user?.id)},'network.list',{guild:event.guild_id,page,count:rows.length});
   return send(event,{type:4,data});
  }
  await send(event,{type:5});
  const fields=Object.fromEntries((option?.options||[]).filter(o=>typeof o.value==='string').map(o=>[o.name,String(o.value).trim()]));
  fields.staff=fields['staff-server'];fields.admin=fields['admin-code'];
  let message;try{message=change(event,action,fields);}catch(e){message=e.message;record({email:'Discord '+(event.member?.user?.id||event.user?.id)},'network.failed',{action,guild:event.guild_id,error:message});}
  return respond(event,message,true);
 }
 return {interaction};
}
module.exports={COMMAND,createNetwork};
