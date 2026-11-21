'use strict';
const fs=require('node:fs'),path=require('node:path');
const {embed}=require('./server-setup');
const API='https://discord.com/api/v10',ID=/^\d{15,22}$/;
const COMMAND={name:'staff-list',description:'List current staff, their roles, permission levels and supervisors.',type:1,default_member_permissions:null,contexts:[0],integration_types:[0],options:[{name:'page',description:'Page of staff to display.',type:4,min_value:1}]};
const safe=v=>String(v||'').replace(/[\r\n\t]/g,' ').replace(/[\\`*_{}\[\]()<>#|~]/g,'\\$&');
function directoryFields(people,layout){
 const fields=[];
 for(const person of people){
  const lines=[];
  for(const role of person.roles||[]){
   const grants=role.company===layout.positions?.company?(layout.positions.titles?layout.positions.titles.map(t=>[t.title,t.roles]):Object.entries(layout.positions.roles||{})).find(([title])=>title.toLowerCase()===String(role.title).toLowerCase())?.[1]||[]:[];
   const levels=grants.filter(n=>/^Network Permission Level \d+$/.test(n));
   lines.push('**'+safe(role.company||'Company not recorded')+'** · '+safe(role.title||'Role not recorded'),
    'Permission level: '+(levels.length?levels.map(safe).join(', '):'Not assigned in the HN role configuration'),
    'Supervisor: '+(role.supervisor?safe(role.supervisor.name||'Name not recorded')+(role.supervisor.title&&role.supervisor.title!=='Collective board'?' · '+safe(role.supervisor.title):''):'None assigned'));
  }
  const access=person.access;
  const labels=[...(access?.owner?[access.owner==='system'?'System owner':'Owner-level']:[]),...(access?.roles||[])];
  if(labels.length)lines.push('Account permissions: '+labels.map(safe).join(', '));
  // Split long records into continuation fields so every role remains available.
  const value=lines.join('\n')||'No roles recorded.';
  for(let offset=0;offset<value.length;offset+=1000)fields.push({name:(safe(person.name)||'Unnamed staff member').slice(0,230)+(offset?' (continued)':''),value:value.slice(offset,offset+1000)});
 }
 return fields;
}
function createStaffList({config,fetcher=fetch,staff,rolesFile=path.join(__dirname,'hn-roles.json')}){
 const seen=new Set();
 async function send(event,body,edit=false){
  const endpoint=edit?'/webhooks/'+config().id+'/'+encodeURIComponent(event.token)+'/messages/@original':'/interactions/'+event.id+'/'+encodeURIComponent(event.token)+'/callback';
  const response=await fetcher(API+endpoint,{method:edit?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(edit?10000:2500),redirect:'error'});
  if(!response.ok)throw Error('Discord refused the staff-list response.');
 }
 async function interaction(event){
  if(!ID.test(String(event?.id))||typeof event.token!=='string'||seen.has(event.id))return;
  seen.add(event.id);if(seen.size>2000)seen.delete(seen.values().next().value);
  const card=description=>({embeds:[{...embed({title:'HN Utilities · Staff list',description}),thumbnail:{url:'https://branding.hngroup.org.uk/assets/brand/png/hn-group-wordmark-white.png'}}],allowed_mentions:{parse:[]}});
  if(!ID.test(String(event.guild_id)))return send(event,{type:4,data:card('Use /staff-list in a Discord server.')});
  await send(event,{type:5,data:{allowed_mentions:{parse:[]}}});
  let payload;
  try{
   if(!staff)throw Error('unavailable');
   const result=await staff('/api/auth/discord-staff-list',{});
   if(!Array.isArray(result?.value?.people))throw Error('unavailable');
   const people=result.value.people,fields=directoryFields(people,result.value.positions?require('./position-sync').loadRoles(rolesFile,[{name:'Staff list',guilds:[event.guild_id]}],result.value.positions)[0]:JSON.parse(fs.readFileSync(rolesFile,'utf8'))),pages=Math.max(1,Math.ceil(fields.length/4));
   const page=event.data?.options?.find(o=>o.name==='page')?.value??1;
   if(!Number.isInteger(page)||page<1||page>pages)payload=card('Choose a page between 1 and '+pages+'.');
   else{payload=card(people.length?people.length+' current staff · Page '+page+' of '+pages+' · Use `/staff-list page:<number>` for another page.':'No current staff records.');payload.embeds[0].fields=fields.slice((page-1)*4,page*4);}
  }catch{payload=card('The current staff list could not be loaded. Please try again shortly.');}
  await send(event,payload,true);
 }
 return{interaction};
}
module.exports={COMMAND,createStaffList,directoryFields};
