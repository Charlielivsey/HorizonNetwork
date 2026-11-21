'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {embed}=require('./server-setup');
// Confirmed by the user: Charlie Livsey's system-owner record, displayed as Echo.
const OWNER_ID='1256504335110635531',API='https://discord.com/api/v10',ID=/^\d{15,22}$/;
// Owner DMs are Discord activity logs, never transport, heartbeat, terminal or sync diagnostics.
const isBotLog=action=>/^(?:network\.|server\.audit\.|server\.invites\.|server-setup\.(?:start|done|partial|refused))/.test(action)||['member.kick','member.kick.failed'].includes(action);
const TITLES={'network.create':'Network created','network.delete':'Network deleted','network.join':'Server joined a network','network.leave':'Server left a network','network.list':'Network list viewed','network.failed':'Network command refused','member.kick':'Member kicked','member.kick.failed':'Kick refused','server.invites.sent':'Server invites sent','server.invites.failed':'Server invites could not be sent','server-setup.start':'Server setup started','server-setup.done':'Server setup completed','server-setup.partial':'Server setup partially completed','server-setup.refused':'Server setup refused'};
const text=value=>String(value).replace(/[`*_<>]/g,'').slice(0,1000);
const who=value=>/^Discord \d{15,22}$/.test(value)?'<@'+value.slice(8)+'>':value==='Auth service'?'HN Utilities':text(value||'HN Utilities');
function logCard(item){
 const d=item.details||{},card={...embed({title:'HN Utilities · '+(TITLES[item.action]||d.event||'Server activity')}),timestamp:item.at,thumbnail:{url:'https://branding.hngroup.org.uk/assets/brand/png/hn-group-wordmark-white.png'}};
 const fields=[{name:'By',value:who(item.actor)}],add=(name,value)=>{if(value!==undefined&&value!==null&&value!=='')fields.push({name,value:text(value)});};
 if(d.guild)add('Server',d.guildName?d.guildName+' ('+d.guild+')':d.guild);
 if(d.target)add(d.targetKind||'Member',d.targetName?d.targetName+' ('+d.target+')':d.target);
 if(d.moderator)add('Moderator',d.moderator);
 if(d.name)add('Network',d.name);
 if(d.acronym)add('Acronym',d.acronym);
 if(d.staff)add('Staff server',d.staff);
 if(d.hq)add('HQ server',d.hq);
 if(d.channel)add('Channel',d.channel);
 if(d.target&&!d.targetName&&d.targetKind==='Member'&&ID.test(d.target))fields.find(f=>f.name==='Member').value='<@'+d.target+'>';
 add('Reason',d.reason);add('Result',d.error);add('Page',d.page);add(item.action==='network.list'?'Networks recorded':'Count',d.count);add('Layout',d.layout);if(typeof d.changes==='number')add('Changes made',d.changes);
 if(Array.isArray(d.changes)&&d.changes.length){const display=value=>value===undefined?'not set':value===null?'cleared':Array.isArray(value)?value.map(v=>v?.name||v?.id||String(v)).join(', '):typeof value==='object'?JSON.stringify(value):String(value);add('Changes',d.changes.map(c=>c.key.replaceAll('_',' ')+': '+display(c.before)+' → '+display(c.after)).join('\n'));}
 if(d.servers)add('Servers included',Array.isArray(d.servers)?d.servers.join(', '):d.servers);
 card.fields=fields;return card;
}
const hidden=/token|secret|password|credential|authorization|cookie|invite|^code$|admin.?code|^pin$/i;
function clean(value,key='',depth=0){
 if(hidden.test(key))return '[redacted]';
 if(depth>6)return '[omitted]';
 if(Array.isArray(value))return value.slice(0,30).map(v=>clean(v,'',depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,40).map(([k,v])=>[k,clean(v,k,depth+1)]));
 if(typeof value==='string')return value.replace(/https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)[^\s]+/gi,'[invite redacted]').replace(/\/(interactions|webhooks)\/([^/\s]+)\/[^/\s]+/g,'/$1/$2/[redacted]').slice(0,1800);
 return value;
}
function route(url){
 const u=new URL(url);return u.pathname.replace(/^\/api\/v\d+/,'').replace(/\/(interactions|webhooks)\/([^/]+)\/[^/]+/g,'/$1/$2/[redacted]').replace(/\/invites\/[^/]+/g,'/invites/[redacted]');
}
// Resolve only the registered HN Logs application; never fall back to Utilities.
function logsDeliveryConfig(dir){
 return()=>{
  try{
   const records=JSON.parse(fs.readFileSync(path.join(dir,'managed-bots.json'),'utf8')).bots||[];
   for(const item of records){
    if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(item.id))continue;
    const raw=JSON.parse(fs.readFileSync(path.join(dir,'managed-bots',item.id,'discord.json'),'utf8'));
    if(raw.client_id==='1571216218449248377'&&typeof raw.bot_token==='string'&&raw.bot_token.trim().length>=50)return{id:raw.client_id,bot:raw.bot_token.trim()};
   }
  }catch{}
  return null;
 };
}
function createOwnerAudit({config,deliveryConfig=config,fetcher=fetch,state,commit}){
 let timer=null,working=null,channel=null,channelOwner=null,channelBot=null,closed=false;
 const enabled=()=>ID.test(String(config()?.ownerAuditRecipient||''));
 // Remove technical entries queued by the previous broad logger before scheduling delivery.
 if(state().queue?.some(item=>!isBotLog(item.action)))commit({...state(),queue:state().queue.filter(item=>isBotLog(item.action)),retryAt:0});
 function schedule(delay=0){if(closed||timer||!enabled())return;timer=setTimeout(()=>{timer=null;flush().catch(()=>{});},delay);timer.unref();}
 function enqueue(event){
  if(!enabled()||!isBotLog(event.action))return;
  const item={...clean(event),id:crypto.randomBytes(10).toString('hex'),recipient:config().ownerAuditRecipient};
  commit({...state(),queue:[...(state().queue||[]),item]});schedule();
 }
 async function request(method,path,body,bot){
  const response=await fetcher(API+path,{method,headers:{Authorization:'Bot '+bot,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok){let delay=60000;if(response.status===429){const data=await response.json().catch(()=>({}));delay=Math.max(1000,Math.min(3600000,Number(data.retry_after)*1000||60000));}throw Object.assign(Error('Owner log delivery returned HTTP '+response.status),{delay});}
  return response.json();
 }
 async function drain(){
  if(!enabled()||closed)return;
  if((state().retryAt||0)>Date.now()){schedule(state().retryAt-Date.now());return;}
  while(state().queue?.length&&!closed){
   const item=state().queue[0];
   try{
    const sender=deliveryConfig();
    if(!sender?.bot)throw Error('HN Logs is not configured.');
    if(!channel||channelOwner!==item.recipient||channelBot!==sender.bot){const dm=await request('POST','/users/@me/channels',{recipient_id:item.recipient},sender.bot);if(!ID.test(String(dm.id)))throw Error('Discord did not open the owner DM channel.');channel=dm.id;channelOwner=item.recipient;channelBot=sender.bot;}
    const card=logCard(item);
    const sent=await request('POST','/channels/'+channel+'/messages',{embeds:[card],allowed_mentions:{parse:[]},nonce:BigInt('0x'+item.id).toString(),enforce_nonce:true},sender.bot);
    if(!ID.test(String(sent.id)))throw Error('Discord did not confirm the owner log message.');
    commit({...state(),queue:state().queue.filter(e=>e.id!==item.id),lastDeliveryAt:new Date().toISOString(),lastMessageId:sent.id,lastRecipient:item.recipient,delivered:(state().delivered||0)+1,lastError:null,retryAt:0});
   }catch(e){
    channel=null;channelOwner=null;channelBot=null;
    try{commit({...state(),lastError:e.delay?e.message:'Owner log delivery failed; queued for retry.',retryAt:Date.now()+(e.delay||60000)});}catch{}
    schedule(e.delay||60000);return;
   }
  }
 }
 function flush(){if(working)return working;working=drain().finally(()=>{working=null;});return working;}
 function observe(base){return base;}

 schedule();
 return{enqueue,observe,flush,close(){closed=true;clearTimeout(timer);timer=null;}};
}
module.exports={OWNER_ID,createOwnerAudit,clean,route,isBotLog,logsDeliveryConfig};
