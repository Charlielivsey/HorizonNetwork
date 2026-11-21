'use strict';
const {embed,ALLOWED_USERS}=require('./server-setup');
const ID=/^\d{15,22}$/;
const COMMAND={name:'npl-override',description:'Override a member’s Network Permission Level in this server.',type:1,contexts:[0],integration_types:[0],default_member_permissions:'8',options:[
 {name:'set',description:'Keep a member at a chosen NPL until the override is cleared.',type:1,options:[{name:'member',description:'Member to override.',type:6,required:true},{name:'level',description:'Network Permission Level.',type:4,required:true,min_value:1,max_value:5},{name:'reason',description:'Why the override is needed.',type:3,max_length:300}]},
 ...['show','clear'].map(name=>({name,description:name==='show'?'Show a member’s server override.':'Clear the override and resume normal staff role sync.',type:1,options:[{name:'member',description:'Member.',type:6,required:true}]}))]};
function createNpl({api,state,commit,defer,respond,stopSync=async()=>{},sync=async()=>{},record=()=>{}}){
 const active=new Set(),seen=new Set();
 async function interaction(event){if(seen.has(event.id))return;seen.add(event.id);if(seen.size>2000)seen.delete(seen.values().next().value);await defer(event);
  const card=(text,tone='info')=>({embeds:[{...embed({title:'HN Utilities · NPL override',description:text,tone}),footer:{text:'HN Utilities'}}],allowed_mentions:{parse:[]}});
  try{const guild=event.guild_id,actor=event.member?.user?.id||event.user?.id,sub=event.data?.options?.[0],opts=Object.fromEntries((sub?.options||[]).map(x=>[x.name,x.value]));if(!ID.test(guild||'')||!ID.test(opts.member||''))throw Error('Choose a server member.');
   const [g,roles,who]=await Promise.all([api('GET','/guilds/'+guild),api('GET','/guilds/'+guild+'/roles'),api('GET','/guilds/'+guild+'/members/'+actor)]);
   const admin=g.owner_id===actor||ALLOWED_USERS.has(actor)||roles.some(r=>(who.roles||[]).includes(r.id)&&(BigInt(r.permissions||0)&8n));if(!admin)throw Error('Only server administrators or authorised bot administrators can change NPL overrides.');
   const old=state()[guild]?.[opts.member];if(sub.name==='show')return respond(event,card(old?'This member is overridden to **NPL '+old.level+'** in this server.\nReason: '+(old.reason||'Not provided'):'This member has no NPL override in this server.'));
   if(sub.name==='clear'&&!old)return respond(event,card('This member has no NPL override to clear.'));
   if(!['set','clear'].includes(sub.name))throw Error('Choose set, show or clear.');if(active.size)throw Error('Another NPL override update is running. Try again shortly.');active.add(guild);
   try{await stopSync();const target=await api('GET','/guilds/'+guild+'/members/'+opts.member);if(target.user?.bot)throw Error('NPL overrides apply to people, not bots.');const level=sub.name==='clear'?1:Number(opts.level);if(sub.name==='set'&&(!Number.isInteger(level)||level<1||level>5))throw Error('Choose an NPL from 1 to 5.');
    const all=structuredClone(state()),rows=all[guild]||{};{
     const role=roles.find(r=>r.name==='Network Permission Level '+level),base=roles.find(r=>r.name==='Network Permission Level 1');if(!role||!base)throw Error('That NPL role is missing. Run the manual /setup-server command first.');
     const me=await api('GET','/users/@me'),bot=await api('GET','/guilds/'+guild+'/members/'+me.id),top=Math.max(0,...roles.filter(r=>(bot.roles||[]).includes(r.id)).map(r=>r.position));const npl=roles.filter(r=>/^Network Permission Level [1-5]$/.test(r.name));if(g.owner_id===opts.member||Math.max(0,...roles.filter(r=>(target.roles||[]).includes(r.id)).map(r=>r.position))>=top||npl.some(r=>(target.roles||[]).includes(r.id)&&r.position>=top)||role.position>=top||role.managed)throw Error('Move the Utilities role above the member and NPL roles before changing this override.');
     const ids=new Set(npl.map(r=>r.id));await api('PATCH','/guilds/'+guild+'/members/'+opts.member,{roles:[...new Set([...(target.roles||[]).filter(id=>!ids.has(id)),base.id,role.id])]},'Set NPL override');if(sub.name==='set')rows[opts.member]={level,reason:String(opts.reason||'').slice(0,300),by:actor,at:new Date().toISOString()};
    }if(sub.name==='clear')delete rows[opts.member];all[guild]=rows;commit(all);record({email:'Discord '+actor},'npl.override.'+sub.name,{guild,member:opts.member,level:sub.name==='set'?level:null});
    if(sub.name==='clear'){active.delete(guild);await sync(true);}await respond(event,card(sub.name==='set'?'NPL **'+level+'** is now fixed for this member in this server until `/npl-override clear` is used.':'Override cleared. Normal staff role sync applies again.','ok'));
   }finally{active.delete(guild);}
  }catch(e){await respond(event,card(e.message,'error'));}
 }
 return{interaction,busy:()=>active.size>0};
}
module.exports={COMMAND,createNpl};
