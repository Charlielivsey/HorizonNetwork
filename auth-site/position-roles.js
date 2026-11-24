'use strict';
// Manage only the current role list and roles previously claimed by this synchroniser.
const {roleName}=require('./server-setup');
const ID=/^\d{15,22}$/;
const above=(a,b)=>Number(a.position)>Number(b.position)||(Number(a.position)===Number(b.position)&&BigInt(a.id)<BigInt(b.id));
const invalid=message=>Object.assign(new Error(message),{layout:true});
async function reconcilePositionRoles({layout,catalog,live,state,commit,request,check=()=>{},botRoleIds=null}){
 const titles=layout.positions.titles.map(p=>p.title);
 if(!Array.isArray(catalog)||catalog.length!==titles.length)throw invalid('Position identities are incomplete; no roles changed.');
 const keys=new Set(),names=new Set();
 for(const p of catalog){
  if(!p||!/^[a-f0-9]{24}$/.test(p.id)||typeof p.title!=='string'||keys.has(p.id)||names.has(roleName(p.title))||!titles.includes(p.title))throw invalid('Position identities do not match the staff catalogue; no roles changed.');
  keys.add(p.id);names.add(roleName(p.title));
 }
 const entries=layout.roles.map(spec=>{
  const p=catalog.find(p=>roleName(p.title)===roleName(spec.name));
  return {key:p?p.id:'policy:'+roleName(spec.name),spec,aliases:p?[...(p.aliases||[]),...(layout.positionAliases?.[p.title]||[])]:[]};
 });
 const desiredKeys=new Set(entries.map(e=>e.key)),owned=structuredClone(state||{});let changed=0;
 const persist=()=>commit(layout.guildId,structuredClone(owned));
 const find=name=>live.filter(r=>roleName(r.name)===roleName(name));
 const top=()=>botRoleIds?Math.max(0,...live.filter(r=>botRoleIds.includes(r.id)).map(r=>Number(r.position)||0)):Infinity;
 const usable=r=>r&&ID.test(String(r.id))&&r.id!==layout.guildId&&!r.managed;
 const editable=r=>usable(r)&&(!botRoleIds||Number(r.position)<top());
 if(botRoleIds&&top()===0)throw invalid('Utilities has no manageable role hierarchy in this server.');
 if(botRoleIds){const permissions=live.filter(r=>r.id===layout.guildId||botRoleIds.includes(r.id)).reduce((bits,r)=>bits|BigInt(r.permissions||'0'),0n);if(!(permissions&8n)&&!(permissions&268435456n))throw invalid('Utilities needs Manage Roles permission before syncing.');}
 // Claim current/explicitly renamed roles first. CEO adopts President's existing ID.
 for(const e of entries){
  let r=live.find(r=>r.id===owned[e.key]?.id);
  if(!r){
   const candidates=find(e.spec.name);
   if(candidates.length>1)throw invalid('Multiple Discord roles match '+e.spec.name+'.');
   r=candidates[0];
   if(!r){const aliases=[...new Set(e.aliases)].reverse();for(const alias of aliases){const matches=find(alias);if(matches.length>1)throw invalid('Multiple roles match former position '+alias+'.');if(matches[0]){r=matches[0];break;}}}
   if(r){
    if(!editable(r))throw invalid('Move the Utilities bot role above '+r.name+' before syncing.');
    if(Object.entries(owned).some(([key,value])=>key!==e.key&&desiredKeys.has(key)&&value.id===r.id))throw invalid('Discord role '+r.name+' is already assigned to another position.');
    owned[e.key]={id:r.id,title:r.name};
   }
  }else if(!editable(r))throw invalid('Move the Utilities bot role above '+r.name+' before syncing.');
 }
 // Known old position names may be retired on the first run. Other custom roles remain untouched.
 for(const title of layout.legacyPositionTitles||[]){
  if(names.has(roleName(title)))continue;
  const matches=find(title);
  if(matches.length>1)throw invalid('Multiple roles match retired position '+title+'.');
  const r=matches[0];
  if(usable(r)&&!Object.values(owned).some(p=>p.id===r.id))owned['legacy:'+roleName(title)]={id:r.id,title};
 }
 for(const [key,p] of Object.entries(owned)){
  if(desiredKeys.has(key))continue;
  const r=live.find(r=>r.id===p.id);
  if(r&&!Object.entries(owned).some(([key,v])=>desiredKeys.has(key)&&v.id===r.id)&&!editable(r))throw invalid('Move the Utilities bot role above retired role '+r.name+' before syncing.');
 }
 persist();
 for(const [key,p] of Object.entries(owned)){
  if(desiredKeys.has(key))continue;
  const r=live.find(r=>r.id===p.id),reused=Object.entries(owned).some(([k,v])=>desiredKeys.has(k)&&v.id===p.id);
  if(r&&!reused){check();await request('DELETE','/guilds/'+layout.guildId+'/roles/'+r.id,undefined,'Removed staff position or retired listed role');live=live.filter(x=>x.id!==r.id);changed++;}
  delete owned[key];persist();
 }
 for(const e of entries){
  const {spec}=e;let r=live.find(r=>r.id===owned[e.key]?.id);
  if(!r){
   check();r=await request('POST','/guilds/'+layout.guildId+'/roles',{name:spec.name,permissions:spec.permissions||'0',color:spec.color||0,hoist:!!spec.hoist,mentionable:!!spec.mentionable},'New listed staff role');
   if(!usable(r))throw invalid('Discord did not return a valid role for '+spec.name+'.');
   live.push(r);owned[e.key]={id:r.id,title:r.name};persist();changed++;
  }
  const body={};
  if(r.name!==spec.name){
   const collision=find(spec.name).find(x=>x.id!==r.id&&!Object.values(owned).some(v=>v.id===x.id));
   if(collision)throw invalid('An unrelated Discord role already uses '+spec.name+'.');
   body.name=spec.name;
  }
  if(String(r.permissions||'0')!==String(spec.permissions||'0'))body.permissions=String(spec.permissions||'0');
  if(spec.color!==undefined&&r.color!==spec.color)body.color=spec.color;
  if(spec.hoist!==undefined&&!!r.hoist!==spec.hoist)body.hoist=spec.hoist;
  if(spec.mentionable!==undefined&&!!r.mentionable!==spec.mentionable)body.mentionable=spec.mentionable;
  if(Object.keys(body).length){check();await request('PATCH','/guilds/'+layout.guildId+'/roles/'+r.id,body,'Synchronised listed role policy');Object.assign(r,body);changed++;}
  if(owned[e.key]?.title!==spec.name){owned[e.key]={id:r.id,title:spec.name};persist();}
 }
 if(botRoleIds){
  // Re-read after creations: Discord shifts existing positions when inserting roles.
  if(changed)live=await request('GET','/guilds/'+layout.guildId+'/roles');
  const ordered=entries.map(e=>live.find(r=>r.id===owned[e.key]?.id));
  if(ordered.some(r=>!r||!editable(r)))throw invalid('Utilities cannot arrange every listed role below its own role.');
  const inOrder=ordered.every((r,i)=>i===0||above(ordered[i-1],r));
  if(!inOrder){
   let slots=ordered.map(r=>Number(r.position)).sort((a,b)=>b-a);
   if(new Set(slots).size!==slots.length||slots.some(p=>p<=0)){
    // Equal numeric positions are ordered by ascending snowflake ID in Discord.
    // Pack compatible neighbours together while keeping every target below the
    // bot's numeric position; never try to move a listed role above Utilities.
    let slot=top()-1;
    slots=ordered.map((r,i)=>{if(i&&BigInt(ordered[i-1].id)>BigInt(r.id))slot--;return slot;});
   }
   if(slots.some(p=>p<=0))throw invalid('Utilities cannot determine the listed role order.');
   const order=ordered.map((r,i)=>({id:r.id,position:slots[i]}));check();await request('PATCH','/guilds/'+layout.guildId+'/roles',order,'Staff Portal role order');
   live=await request('GET','/guilds/'+layout.guildId+'/roles');
   const result=order.map(x=>live.find(r=>r.id===x.id));
   if(result.some((r,i)=>!r||i>0&&!above(result[i-1],r)))throw invalid('Discord did not apply the requested role order; Utilities will retry.');
   changed++;
  }
 }
 return {live,changed};
}
module.exports={reconcilePositionRoles};
