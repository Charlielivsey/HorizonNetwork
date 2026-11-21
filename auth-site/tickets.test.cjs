'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createTickets,overwrites,WRITE,COMMAND}=require('./tickets');
const G='222222222222222222',B='111111111111111111',U='333333333333333333',A='444444444444444444',S='555555555555555555',O='666666666666666666',R='777777777777777777',D='888888888888888888',C='999999999999999999',OPEN='123456789012345678',CLOSED='123456789012345679',LOG='123456789012345680',PANEL='123456789012345681';
function fixture(withAcknowledgements=false){
 let db={guilds:{}},seq=200000000000000000n,actor=A,foreign=false,flags=1<<19,failLogAt=0,logCount=0;
 const dismissed=[],scheduled=[];
 const channels=new Map([[OPEN,{id:OPEN,type:4,guild_id:G}],[CLOSED,{id:CLOSED,type:4,guild_id:G}],[LOG,{id:LOG,type:0,guild_id:G}],[PANEL,{id:PANEL,type:0,guild_id:G}]]),messages=new Map(),calls=[],replies=[];
 const roles=[{id:G,name:'@everyone',permissions:'0'},{id:R,name:'Support',permissions:'0'},{id:D,name:'Human Resources',permissions:'0'},{id:'123456789012345682',name:'Managers',permissions:'32'}];
 const memberships={[A]:['123456789012345682'],[S]:[R],[O]:[R],[U]:[]};
 let holdHistory;
 const api=async(method,url,body)=>{
  if(holdHistory&&method==='GET'&&url.includes('/messages?limit=100'))await holdHistory;
  calls.push({method,url,body:structuredClone(body)});
  if(url==='/applications/@me')return {flags};
  if(url==='/guilds/'+G)return {owner_id:A};
  if(url.endsWith('/roles'))return roles;
  if(url.includes('/members/'))return {roles:memberships[url.split('/').at(-1)]||[]};
  if(url==='/guilds/'+G+'/channels'){
   if(method==='GET')return [...channels.values()];
   const c={id:C,guild_id:G,...structuredClone(body)};channels.set(C,c);messages.set(C,[]);return c;
  }
  const m=/^\/channels\/(\d+)(?:\/messages(?:\/(\d+))?)?(?:\?(.*))?$/.exec(url);if(!m)throw Error('Unexpected path '+url);
  const id=m[1],message=m[2],query=new URLSearchParams(m[3]||'');
  if(!url.includes('/messages')){
   if(method==='GET')return {...channels.get(id),...(foreign?{guild_id:'000000000000000000'}:{})};
   if(method==='PATCH'){Object.assign(channels.get(id),structuredClone(body));return channels.get(id);}
   if(method==='DELETE'){channels.delete(id);return null;}
  }
  const list=messages.get(id)||[];messages.set(id,list);
  if(method==='GET'){
   if(message){const found=list.find(m=>m.id===message);if(!found)throw Error('Unknown Message');return found;}
   return list.filter(m=>!query.get('before')||BigInt(m.id)<BigInt(query.get('before'))).sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:1).slice(0,Number(query.get('limit')||50));
  }
  if(method==='POST'){
   if(id===LOG){logCount++;if(failLogAt===logCount)throw Error('Mock log failure');}
   const prior=body.nonce&&list.find(m=>m.nonce===body.nonce);if(prior)return prior;
   const msg={id:String(++seq),timestamp:'2026-11-17T21:00:00Z',author:{id:B,username:'Utilities'},...structuredClone(body)};list.push(msg);return msg;
  }
  if(method==='PATCH'){const msg=list.find(m=>m.id===message);if(!msg)throw Error('Unknown Message');Object.assign(msg,structuredClone(body));return msg;}
  throw Error('Unexpected operation');
 };
 const staff=async()=>({value:{people:[{discordId:O,roles:[{company:'Horizon Network',department:'Human Resources',title:'HR Officer'}]}]}});
 const engine=createTickets({state:()=>db,commit:v=>db=structuredClone(v),api,staff,botId:()=>B,schedule:(fn,ms)=>scheduled.push({fn,ms}),
 dismiss:async e=>{dismissed.push(e.id);if(withAcknowledgements){const list=messages.get(e.channel_id)||[],index=list.findIndex(m=>m.interaction_metadata?.id===e.id);if(index>=0)list.splice(index,1);}},
 defer:async e=>{if(withAcknowledgements&&messages.has(e.channel_id))messages.get(e.channel_id).push({id:String(++seq),timestamp:'2026-11-17T22:00:00Z',author:{id:B,username:'Utilities'},flags:128,type:20,interaction_metadata:{id:e.id},content:''});},
 respond:async(e,p)=>{replies.push(p);if(withAcknowledgements){const msg=(messages.get(e.channel_id)||[]).find(m=>m.interaction_metadata?.id===e.id);if(msg)Object.assign(msg,p,{flags:0});}},record:()=>{}});
 let eventId=300000000000000000n;
 const event=(action,fields={},user=actor)=>({id:String(++eventId),token:'fixture',type:2,guild_id:G,channel_id:C,member:{user:{id:user}},data:{name:'ticket',options:[{name:action,options:Object.entries(fields).map(([name,value])=>({name,value}))}]}});
 const command=async(action,fields={},user=actor)=>{await engine.interaction(event(action,fields,user));return replies.at(-1);};
 const click=async(action,user=S,extra={})=>{const t=db.guilds[G]?.tickets[C],e={...event('',{},user),type:3,channel_id:action.startsWith('open:')?PANEL:C,message:{id:action.startsWith('open:')?db.guilds[G].panels.support.published.message:t?.message},data:{custom_id:'ticket:'+action},...extra};await engine.interaction(e);return replies.at(-1);};
 const setup=async()=>{await command('create',{panel:'support',title:'General Support Tickets',description:'Select the team you would like.', 'closed-category':CLOSED,'log-channel':LOG,'button-1':'General Support','category-1':OPEN,'roles-1':'<@&'+R+'> <@&'+D+'>'});await command('send',{channel:PANEL});await click('publish:'+PANEL,A,{data:{custom_id:'ticket:publish:'+PANEL,values:['support']}});};
 const open=async()=>{await setup();await click('open:support:button-1',U);return db.guilds[G].tickets[C];};
 return{holdHistory:promise=>holdHistory=promise,command,click,setup,open,calls,replies,dismissed,scheduled,channels,messages,get state(){return db;},get ticket(){return db.guilds[G]?.tickets[C];},get engine(){return engine;},set foreign(v){foreign=v;},set flags(v){flags=v;},set failLogAt(v){failLogAt=v;},add(content='hello'){const msg={id:String(++seq),author:{id:U,username:'Member'},timestamp:'2026-11-17T21:01:00Z',content};messages.get(C).push(msg);return msg;}};
}
test('configuration enforces Manage Server, validates channels, publishes labelled buttons and explicit multi-role mentions',async()=>{
 const f=fixture();assert.match((await f.command('create',{panel:'x'},U)).embeds[0].description,/Manage Server/);assert.equal(f.state.guilds[G],undefined);
 f.foreign=true;assert.match((await f.command('create',{panel:'x',title:'T',description:'D','open-category':OPEN})).embeds[0].description,/correct channel/);f.foreign=false;
 await f.setup();const published=f.messages.get(PANEL)[0];assert.equal(published.embeds[0].title,'General Support Tickets');assert.equal(published.embeds[0].author,undefined);assert.equal(published.embeds[0].footer.text,'HN Utilities');assert.equal(published.components[0].components[0].label,'General Support');
 await f.click('open:support:button-1',U);const initial=f.messages.get(C)[0];assert.equal(initial.embeds[0].title,'Ticket 1: General Support');assert.equal(initial.components.flatMap(r=>r.components).length,6);assert.deepEqual(initial.allowed_mentions,{parse:[],roles:[R,D]});
 assert.equal(f.channels.get(C).name,'general-support-0001');assert.equal(f.channels.get(C).parent_id,OPEN);await f.click('open:support:button-1',U);assert.equal(Object.keys(f.state.guilds[G].tickets).length,1);
 const before=f.calls.length;await f.click('claim',U);assert.match(f.replies.at(-1).embeds[0].description,/Only the assigned/);assert.ok(!f.calls.slice(before).some(c=>c.method==='PATCH'));
});
test('claim reserves staff replies, retains opener replies, blocks other support actions and close/reopen persists correct access',async()=>{
 const f=fixture();await f.open();const replyCount=f.replies.length;await f.click('claim');assert.equal(f.replies.length,replyCount);assert.equal(f.dismissed.length,1);assert.equal(f.ticket.claimant,S);
 const perms=f.channels.get(C).permission_overwrites;assert.equal(BigInt(perms.find(p=>p.id===R).deny)&WRITE,WRITE);assert.ok(BigInt(perms.find(p=>p.id===U).allow)&2048n);assert.ok(BigInt(perms.find(p=>p.id===S).allow)&2048n);
 assert.match(f.messages.get(C).at(-1).embeds[0].description,new RegExp(S));assert.match((await f.click('close',O)).embeds[0].description,/Only its claimant/);
 await f.click('close');assert.equal(f.ticket.closed,true);assert.ok(BigInt(f.channels.get(C).permission_overwrites.find(p=>p.id===U).deny)&2048n);assert.equal(f.channels.get(C).parent_id,CLOSED);
 await f.click('reopen');assert.equal(f.ticket.closed,false);assert.equal(f.channels.get(C).parent_id,OPEN);assert.ok(BigInt(f.channels.get(C).permission_overwrites.find(p=>p.id===U).allow)&2048n);
});
test('transfers use fresh Staff Portal departments, replace access, ping destination roles and clear claim',async()=>{
 const f=fixture();await f.open();await f.click('claim');await f.command('department',{name:'Horizon Network / Human Resources',roles:D});
 await f.click('transfer');const menu=f.replies.at(-1);assert.equal(menu.components[0].components[0].options[0].label,'Horizon Network / Human Resources');
 await f.click('choose',S,{data:{custom_id:'ticket:choose',values:['0']}});assert.equal(f.ticket.claimant,null);assert.deepEqual(f.ticket.roles,[D]);assert.deepEqual(f.ticket.members,[O]);assert.equal(f.channels.get(C).permission_overwrites.some(p=>p.id===R),false);assert.deepEqual(f.messages.get(C).at(-1).allowed_mentions,{parse:[],roles:[D]});
 assert.match((await f.click('close',S)).embeds[0].description,/Only the assigned/);
});
test('logging paginates complete history into bounded embeds, retries partial failure and gates deletion until complete',async()=>{
 const f=fixture();await f.open();for(let i=0;i<105;i++)f.add('message '+i+' '+('x'.repeat(95)));f.failLogAt=2;
 await f.click('log');assert.equal(f.ticket.logged,false);assert.equal(f.ticket.log.sent.length,1);assert.match((await f.click('delete')).embeds[0].description,/Log the entire/);
 const firstId=f.ticket.log.sent[0];f.failLogAt=0;await f.click('log');assert.equal(f.ticket.logged,true);assert.equal(f.channels.get(C).parent_id,CLOSED);assert.equal(f.messages.get(LOG).filter(m=>m.id===firstId).length,1);
 const logs=f.messages.get(LOG),text=logs.map(m=>m.embeds[0].description).join('');assert.match(text,/message 0 /);assert.match(text,/message 104 /);assert.ok(logs.every(m=>m.embeds[0].description.length<=4096));assert.ok(f.calls.some(c=>c.url.includes('&before=')));
 await f.click('delete');assert.equal(f.ticket.deleted,true);assert.equal(f.channels.has(C),false);
});
test('missing content access never permits deletion; reopening clears logged state and requires another log',async()=>{
 const f=fixture();await f.open();f.flags=0;assert.match((await f.click('log')).embeds[0].description,/Message Content Intent/);assert.equal(f.ticket.logged,false);assert.match((await f.click('delete')).embeds[0].description,/Log the entire/);
 f.flags=1<<19;await f.click('log');assert.equal(f.ticket.logged,true);await f.click('reopen');assert.equal(f.ticket.logged,false);assert.equal(f.ticket.log,undefined);assert.match((await f.click('delete')).embeds[0].description,/Log the entire/);
});
test('new or edited messages and missing transcript messages prevent deletion',async()=>{
 for(const mode of ['new','edit','missing']){const f=fixture();await f.open();const msg=f.add('original');await f.click('log');assert.equal(f.ticket.logged,true);
 if(mode==='new')f.add('later');if(mode==='edit')msg.content='changed';if(mode==='missing')f.messages.set(LOG,[]);
 const result=await f.click('delete');assert.equal(f.channels.has(C),true);assert.match(result.embeds[0].description,/changed after|edited after|saved transcript/);
 }
});
test('stale and forged panel controls cannot open tickets; repeated interaction IDs do not repeat mutations',async()=>{
 const f=fixture();await f.setup();await f.click('open:support:button-1',U,{message:{id:'123456789012345699'}});assert.match(f.replies.at(-1).embeds[0].description,/no longer active/);assert.equal(f.channels.has(C),false);
 await f.click('open:support:button-1',U);const e={id:'999111222333444555',token:'fixture',type:2,guild_id:G,channel_id:C,member:{user:{id:S}},data:{name:'ticket',options:[{name:'claim'}]}};await f.engine.interaction(e);const count=f.calls.length;await f.engine.interaction(e);assert.equal(f.calls.length,count);
});
test('Discord command schema limits and permission overwrite limits are respected',()=>{
 assert.ok(COMMAND.options.length<=25);for(const cmd of COMMAND.options){assert.ok(cmd.description.length<=100);let optional=false;for(const o of cmd.options||[]){if(!o.required)optional=true;else assert.equal(optional,false,'required options precede optional');}}
 assert.throws(()=>overwrites({guild:G,opener:U,roles:[],members:Array.from({length:101},(_,i)=>String(100000000000000000n+BigInt(i)))},B),/100 permission/);
});

test('create accepts four complete button/category/role groups atomically and rejects incomplete groups or a fifth button',async()=>{
 const f=fixture();
 const fields={panel:'multi',title:'All teams',description:'Choose a team','closed-category':CLOSED,'log-channel':LOG};
 for(let i=1;i<=4;i++){const id=String(123456789012345690n+BigInt(i));f.channels.set(id,{id,type:4,guild_id:G});fields['button-'+i]='Team '+i;fields['category-'+i]=id;fields['roles-'+i]=R;}
 const broken={...fields,panel:'broken'};delete broken['roles-3'];assert.match((await f.command('create',broken)).embeds[0].description,/Button 3 needs/);assert.equal(f.state.guilds[G]?.panels.broken,undefined);
 await f.command('create',fields);assert.equal(Object.keys(f.state.guilds[G].panels.multi.types).length,4);
 assert.match((await f.command('button',{panel:'multi',key:'fifth',label:'Fifth',roles:R,category:OPEN})).embeds[0].description,/maximum of 4/);
 await f.command('send',{channel:PANEL});assert.equal(f.replies.at(-1).components[0].components[0].options[0].value,'multi');
 await f.click('publish:'+PANEL,A,{data:{custom_id:'ticket:publish:'+PANEL,values:['multi']}});
 assert.equal(f.messages.get(PANEL)[0].components[0].components.length,4);
 for(const [k,t]of Object.entries(f.state.guilds[G].panels.multi.published.types))assert.equal(t.openCategory,fields['category-'+k.split('-')[1]]);
});
test('each button opens in its own category and close/reopen uses the shared closed category and original button category',async()=>{
 for(let i=1;i<=4;i++){
  const f=fixture(),fields={panel:'support',title:'All teams',description:'Choose a team','closed-category':CLOSED,'log-channel':LOG};
  for(let j=1;j<=4;j++){const id=String(123456789012345690n+BigInt(j));f.channels.set(id,{id,type:4,guild_id:G});fields['button-'+j]='Team '+j;fields['category-'+j]=id;fields['roles-'+j]=R;}
  await f.command('create',fields);await f.command('send',{channel:PANEL});await f.click('publish:'+PANEL,A,{data:{custom_id:'ticket:publish:'+PANEL,values:['support']}});
  await f.click('open:support:button-'+i,U);assert.equal(f.channels.get(C).name,'team-'+i+'-0001');assert.equal(f.channels.get(C).parent_id,fields['category-'+i]);await f.click('close');assert.equal(f.channels.get(C).parent_id,CLOSED);await f.click('reopen');assert.equal(f.channels.get(C).parent_id,fields['category-'+i]);
 }
});
test('send lists all saved panels across pages, defaults to this channel and rejects non-managers',async()=>{
 const f=fixture();await f.setup();
 for(let i=0;i<27;i++)await f.command('create',{panel:'panel-'+i,title:'Panel '+i,description:'Choose a team','closed-category':CLOSED,'log-channel':LOG,'button-1':'Support','category-1':OPEN,'roles-1':R});
 const result=await f.command('send',{channel:PANEL});assert.equal(result.components[0].components[0].options.length,25);assert.equal(result.components[0].components[0].options[0].label,'panel-0');assert.match(result.components[0].components[0].options[0].description,/Panel 0/);assert.equal(result.components[1].components[0].label,'Next');
 const next=await f.click('panels:'+PANEL+':1',A);assert.equal(next.components[0].components[0].options.length,3);
 assert.match((await f.click('publish:'+PANEL,U,{data:{custom_id:'ticket:publish:'+PANEL,values:['support']}})).embeds[0].description,/Manage Server/);
 await f.open();const local=await f.command('send');assert.match(local.embeds[0].description,new RegExp(C));
});

test('transcripts read as named conversations with local times, readable embeds, attachments and continued long messages',()=>{
 const {transcript}=require('./tickets');
 const parts=transcript([{id:'100000000000000001',timestamp:'2026-11-17T22:00:00Z',author:{id:U,global_name:'DogDay',username:'dogday'},content:'Hello <@'+S+'>, I need help.',mentions:[{id:S,global_name:'Support Agent',username:'support'}],attachments:[{filename:'details.txt',url:'https://cdn.discordapp.com/attachments/details.txt'}],embeds:[{title:'Details',description:'A readable explanation',fields:[{name:'Status',value:'Open'}]}],components:[{type:1,components:[{type:2,label:'Claim',custom_id:'ticket:claim'}]}]},{id:'100000000000000002',timestamp:'2026-11-17T22:01:00Z',author:{id:S,global_name:'Support Agent',username:'support'},content:'x'.repeat(8000),message_reference:{message_id:'100000000000000001'}}],{guild:G,channel:C});
 const text=parts.join('\n');assert.match(text,/\*\*DogDay\*\*/);assert.match(text,/22:00 London/);assert.match(text,/Hello @Support Agent/);assert.match(text,/\*\*Status:\*\* Open/);assert.match(text,/Attachment:\*\* \[details.txt\]/);assert.match(text,/Reply to DogDay/);assert.match(text,/continued/);assert.doesNotMatch(text,/custom_id|"type":|Embed: \{/);assert.equal((text.match(/x{10,}/g)||[]).join('').length,8000);assert.ok(parts.every(p=>p.length<=3500));
});

test('close then log then delete succeeds with real-style deferred replies and public error replies in channel history',async()=>{
 const f=fixture(true);await f.open();f.add('Please help with this issue.');await f.click('close');assert.equal(f.ticket.closed,true);
 await f.click('claim',U);assert.ok(f.replies.at(-1).embeds[0].description.includes('Only the assigned'));
 await f.click('log');assert.equal(f.ticket.logged,true);assert.equal(f.ticket.closed,true);assert.equal(f.ticket.log.count,3,'opening, real message and close notice only');
 assert.ok(f.messages.get(LOG).every(m=>!JSON.stringify(m).includes('Only the assigned')));
 await f.click('delete');assert.equal(f.channels.has(C),false);assert.equal(f.ticket.deleted,true);
});
test('changed conversation can be re-logged and deleted while remaining closed throughout',async()=>{
 const f=fixture(true);await f.open();f.add('First message');await f.click('close');await f.click('log');f.add('Later message');
 await f.click('delete');assert.equal(f.ticket.closed,true);assert.equal(f.ticket.logged,false);const error=f.replies.at(-1);assert.equal(error.content,'');assert.match(error.embeds[0].description,/still closed/);assert.doesNotMatch(error.embeds[0].description,/reopen/i);
 const buttons=f.messages.get(C).find(m=>m.id===f.ticket.message).components.flatMap(r=>r.components);assert.equal(buttons.find(b=>b.custom_id==='ticket:log').disabled,false);
 await f.click('log');assert.equal(f.ticket.logged,true);assert.equal(f.ticket.closed,true);await f.click('delete');assert.equal(f.ticket.deleted,true);
});
test('busy notices identify the actual operation and ticket in an embed',async()=>{
 const f=fixture(true);await f.open();await f.click('close');let release;const gate=new Promise(resolve=>release=resolve);f.holdHistory(gate);
 const logging=f.click('log');while(!f.calls.some(c=>c.method==='PATCH'&&c.body?.permission_overwrites&&!c.body?.parent_id))await new Promise(r=>setImmediate(r));
 const reply=await f.click('delete');assert.equal(reply.content,'');assert.match(reply.embeds[0].description,/Logging ticket 1 is in progress/);assert.match(reply.embeds[0].description,/Reading the conversation/);release();await logging;assert.equal(f.ticket.logged,true);
});

test('opening can notify only the chosen administration role while preserving both access roles, and confirmation self-deletes',async()=>{const f=fixture();await f.setup();f.state.guilds[G].panels.support.published.types['button-1'].pingRoles=[R];await f.click('open:support:button-1',U);const initial=f.messages.get(C)[0];assert.equal(initial.content,'<@&'+R+'>');assert.deepEqual(initial.allowed_mentions,{parse:[],roles:[R]});assert.deepEqual(f.ticket.roles,[R,D]);assert.equal(f.scheduled[0].ms,5000);assert.equal(f.dismissed.length,0);await f.scheduled[0].fn();assert.equal(f.dismissed.length,1);assert.equal(initial.components.flatMap(r=>r.components).length,6);});
