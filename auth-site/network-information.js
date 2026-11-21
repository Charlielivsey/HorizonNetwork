'use strict';
const {embed}=require('./server-setup');
const ID=/^\d{15,22}$/;
const COC={name:'coc',description:'Show Horizon Network’s current chain of command.',type:1,contexts:[0],integration_types:[0],options:[{name:'page',description:'Page of the chain of command.',type:4,min_value:1}]};
const SERVERS={name:'servers',description:'List Horizon Network’s servers (excluding the staff server).',type:1,contexts:[0],integration_types:[0],options:[{name:'page',description:'Page of network servers.',type:4,min_value:1}]};
const safe=v=>String(v||'').replace(/[\r\n\t]/g,' ').replace(/[\\`*_{}\[\]()<>#|~]/g,'\\$&');
const norm=v=>String(v||'').trim().toLowerCase();
function chainFields(data){
 if(!Array.isArray(data?.people)||!Array.isArray(data?.positions?.['Horizon Network']))throw Error('Staff directory unavailable');
 const groups=new Map();
 for(const person of data.people)for(const role of person.roles||[]){if(role.company!=='Horizon Network'||!role.title)continue;const key=norm(role.title);if(!groups.has(key))groups.set(key,{title:role.title,lines:[]});const name=safe(person.name)||'Unnamed staff member',supervisor=role.supervisor;const line='**'+name+'**'+(supervisor?'\nReports to: '+safe(supervisor.name)+(supervisor.title&&supervisor.title!=='Collective board'?' · '+safe(supervisor.title):''):'\nNo supervisor recorded');if(!groups.get(key).lines.includes(line))groups.get(key).lines.push(line);}
 const order=data.positions['Horizon Network'].map(norm),fields=[];
 for(const g of [...groups.values()].sort((a,b)=>{const x=order.indexOf(norm(a.title)),y=order.indexOf(norm(b.title));return(x<0?Infinity:x)-(y<0?Infinity:y)||a.title.localeCompare(b.title);})){const value=g.lines.join('\n\n');for(let i=0;i<value.length;i+=950)fields.push({name:safe(g.title).slice(0,230)+(i?' (continued)':''),value:value.slice(i,i+950)});}
 return fields;
}
function pageCard(title,fields,page,size=25){const batches=[[]];let length=0;for(const field of fields){const cost=field.name.length+field.value.length;if(batches.at(-1).length&&(batches.at(-1).length>=Math.min(size,25)||length+cost>5000)){batches.push([]);length=0;}batches.at(-1).push(field);length+=cost;}const pages=batches.length,card=embed({title,description:fields.length?'Current information · Page '+page+' of '+pages:'No current records are available.'});card.footer={text:'HN Utilities · Refreshed from the current records'};if(!Number.isInteger(page)||page<1||page>pages)card.description='Choose a page from 1 to '+pages+'.';else card.fields=batches[page-1];return{embeds:[card],allowed_mentions:{parse:[]}};}

function createNetworkInformation({staff,networks,request,defer,respond,reply}){
 const seen=new Set();
 async function interaction(event){if(!ID.test(String(event?.id))||typeof event.token!=='string'||seen.has(event.id))return;seen.add(event.id);if(seen.size>2000)seen.delete(seen.values().next().value);if(!ID.test(String(event.guild_id)))return reply(event,{embeds:[embed({description:'Use this command in a Discord server.'})],allowed_mentions:{parse:[]}});
 await defer(event);const command=event.data.name,page=event.data.options?.find(o=>o.name==='page')?.value??1;let payload;
 try{if(command==='coc'){const result=await staff('/api/auth/discord-staff-list',{});payload=pageCard('Horizon Network · Chain of command',chainFields(result?.value),page);if(payload.embeds[0].description.startsWith('Current'))payload.embeds[0].description+=' · From HR and the Staff Portal. Use `/coc page:<number>` for further pages.';}
 else{const rows=networks().filter(n=>norm(n.name)==='horizon network');if(rows.length!==1)throw Error('Network unavailable');const network=rows[0],staffIds=new Set(networks().map(n=>String(n.staff))),ids=[...new Set(network.guilds||[])].filter(g=>ID.test(String(g))&&!staffIds.has(String(g))),fields=[];for(const id of ids){let guild;try{guild=await request('GET','/guilds/'+id);}catch{guild=null;}fields.push({name:safe(guild?.name||'Network server').slice(0,256),value:(id===network.hq?'Headquarters\n':'')+'Server ID: `'+id+'`'+(guild?.vanity_url_code&&/^[\w-]+$/.test(guild.vanity_url_code)?'\nhttps://discord.gg/'+guild.vanity_url_code:'')});}payload=pageCard('Horizon Network · Servers',fields,page,8);if(payload.embeds[0].description.startsWith('Current'))payload.embeds[0].description+=' · Staff servers are excluded. Use `/servers page:<number>` for further pages.';}
 }catch{payload={embeds:[embed({title:command==='coc'?'Horizon Network · Chain of command':'Horizon Network · Servers',description:'The current information could not be loaded. Please try again shortly.'})],allowed_mentions:{parse:[]}};}
 return respond(event,payload);
 }
 return{interaction};
}
module.exports={COC,SERVERS,createNetworkInformation,chainFields,pageCard};
