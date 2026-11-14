'use strict';
// Multi-bot routing stays in Auth. The public Bots proxy never receives credentials.
const fs=require('node:fs'),path=require('node:path');
const {createBotManager}=require('./bot-manager'),{startPresence}=require('./discord-gateway');
const ID=/^[a-z0-9][a-z0-9-]{0,63}$/;
function createManagedBots({dir,primary,primaryConfig,fetcher=fetch,gatewayEnabled=true,gateway=startPresence}){
 const instances=new Map();
 let records=[];try{records=JSON.parse(fs.readFileSync(path.join(dir,'managed-bots.json'),'utf8')).bots||[];}catch{}
 for(const item of records){
  if(!ID.test(item.id)||item.id==='utilities'||instances.has(item.id))throw Error('Invalid managed bot identifier.');
  const folder=path.join(dir,'managed-bots',item.id),configFile=path.join(folder,'discord.json'),file=path.join(folder,'state.json');
  const config=()=>{try{const raw=JSON.parse(fs.readFileSync(configFile,'utf8'));return{id:raw.client_id,bot:raw.bot_token,secret:raw.client_secret||null};}catch{return null;}};
  if(!fs.existsSync(file)){fs.mkdirSync(folder,{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify({settings:{syncEnabled:false}}),{mode:0o600});}
  let presence=null;
  const manager=createBotManager({file,configFile,config,fetcher,presence:()=>presence,utilities:false});
  if(gatewayEnabled)presence=gateway(()=>config()?.bot||null,{settings:manager.settings,onInteraction:manager.interaction,onReady:()=>manager.registerBuiltins(),onAction:(action,details)=>manager.record(null,action,details),log:{log:message=>manager.record(null,'gateway.event',{message})}});
  instances.set(item.id,{id:item.id,label:String(item.label||item.id).slice(0,80),manager,config,presence});
 }
 const list=()=>[{id:'utilities',label:'HN Utilities',clientId:primaryConfig()?.id||'',profileSync:true},...Array.from(instances.values(),b=>({id:b.id,label:b.label,clientId:b.config()?.id||'',profileSync:false}))];
 const fleet=Object.create(primary);
 fleet.handle=async(action,payload={},actor={},botId='utilities')=>{
  if(action==='bots')return list();
  if(typeof botId!=='string'||!ID.test(botId))throw Object.assign(Error('Choose a valid bot.'),{status:400});
  if(botId==='utilities')return primary.handle(action,payload,actor);
  const selected=instances.get(botId);if(!selected)throw Object.assign(Error('That bot is not registered.'),{status:404});
  if(['accounts','sync'].includes(action)||action==='settings'&&payload.syncEnabled===true)throw Object.assign(Error('Staff profile synchronisation is handled by HN Utilities.'),{status:403});
  if(action==='credentials'&&payload.client_id&&payload.client_id!==selected.config()?.id)throw Object.assign(Error('Keep the selected bot’s application ID. A different application must be registered separately.'),{status:400});
  return selected.manager.handle(action,payload,actor);
 };
 fleet.stop=()=>{for(const b of instances.values()){b.presence?.stop();b.manager.closeOwnerLogs();}};
 fleet.live=()=>Array.from(instances.values()).some(b=>['online','connecting','reconnecting'].includes(b.presence?.snapshot().phase));
 return fleet;
}
module.exports={createManagedBots};
