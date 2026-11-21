'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const{createBotManager,safePath,settings,image}=require('./bot-manager'),{startPresence}=require('./discord-gateway');
const APP='1564969421800472698',GUILD='222222222222222222',CHANNEL='333333333333333333',BOT='444444444444444444';
function fixture(refresh=async()=>3,latency=null){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-bot-manager-')),file=path.join(dir,'bot.json'),configFile=path.join(dir,'discord.json'),secret='bot-token-'+ 'x'.repeat(70),clientSecret='oauth-secret-123';fs.writeFileSync(configFile,JSON.stringify({client_id:APP,client_secret:clientSecret,bot_token:secret}));let calls=[],savedCommands=[];const presence={snapshot:()=>({phase:'online',latency}),apply(){calls.push({apply:true});},restart(){calls.push({restart:true});}};
 const fetcher=async(url,opts={})=>{const p=url.replace('https://discord.com/api/v10','');calls.push({path:p,...opts});if(p.startsWith('/interactions/'))return new Response(null,{status:204});if(p==='/users/@me')return Response.json({id:BOT,username:'HN Group Auth',bot:true});if(p==='/applications/@me')return Response.json({id:APP,name:'HN Group Auth',description:'Sign-ins',tags:[]});if(p==='/users/@me/guilds?limit=200')return Response.json([{id:GUILD,name:'HN Group',permissions:'8'}]);if(p==='/applications/'+APP+'/guilds/'+GUILD+'/commands')return Response.json([{id:'123456789012345671',name:'welcome'},{id:'123456789012345672',name:'npl-override'},{id:'123456789012345673',name:'other-command'}]);if(p==='/applications/'+APP+'/commands'){if(opts.method==='PUT')savedCommands=JSON.parse(opts.body);return Response.json(savedCommands);}if(p==='/channels/'+CHANNEL+'/messages'&&opts.method==='POST')return Response.json({id:'555555555555555555'});if(p==='/channels/'+CHANNEL+'/messages/555555555555555555')return Response.json({author:{id:'999999999999999999'}});return Response.json({ok:true});};
 const config=()=>{const raw=JSON.parse(fs.readFileSync(configFile));return{id:raw.client_id,secret:raw.client_secret,bot:raw.bot_token};};
 const manager=createBotManager({file,configFile,config,fetcher,presence:()=>presence,refresh,staff:async()=>({value:{ids:[BOT]}})});return{dir,manager,calls,configFile,secret,clientSecret,get commands(){return savedCommands;},close(){fs.rmSync(dir,{recursive:true,force:true});}};
}
test('path and settings allowlists refuse external URLs, other applications and unknown settings',()=>{for(const p of['https://evil.test','//evil.test','/oauth2/token','/../users/@me','/applications/'+GUILD+'/commands','/guilds/'+GUILD+'/../token','/users/@me#fragment'])assert.throws(()=>safePath(p,APP));assert.equal(safePath('/channels/'+CHANNEL+'/messages?limit=25',APP),'/channels/'+CHANNEL+'/messages?limit=25');assert.throws(()=>settings({bot_token:'abc'}));assert.throws(()=>settings({syncMinutes:1}));assert.throws(()=>image('data:image/png;base64,SGVsbG8='));assert.deepEqual(settings({enabled:false,status:'invisible'}),{enabled:false,status:'invisible'});});
test('state never exposes credentials; persistent settings, control, synchronisation and audit work',async()=>{const f=fixture();try{const s=await f.manager.handle('state');assert.equal(s.credentials.botTokenSet,true);assert.ok(!JSON.stringify(s).includes(f.secret));await f.manager.handle('settings',{activity:'Staff sign-ins',status:'idle',syncMinutes:10},{email:'owner@hngroup.org.uk'});await f.manager.handle('connection',{operation:'stop'});assert.equal(f.manager.settings().enabled,false);await f.manager.handle('connection',{operation:'restart'});assert.equal(f.manager.settings().enabled,true);assert.equal((await f.manager.handle('sync')).changed,3);assert.ok(f.calls.some(c=>c.restart));const audit=await f.manager.handle('audit');assert.ok(audit.some(e=>e.action==='settings.update'));assert.ok(!JSON.stringify(audit).includes(f.clientSecret));assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'bot.json'))).settings.syncMinutes,10);}finally{f.close();}});
test('message composer blocks mentions and refuses deleting someone else’s message',async()=>{const f=fixture();try{await f.manager.handle('send',{channel:CHANNEL,content:'Hello @everyone'});assert.deepEqual(JSON.parse(f.calls.find(c=>c.path==='/channels/'+CHANNEL+'/messages').body).allowed_mentions,{parse:[]});await assert.rejects(f.manager.handle('delete-message',{channel:CHANNEL,message:'555555555555555555'}),/Only this bot/);}finally{f.close();}});
test('commands publish actual definitions and answer interactions without leaking their ticket',async()=>{const f=fixture();try{await f.manager.handle('save-commands',{commands:[{name:'hello',description:'Say hello',response:'Hello {user}',ephemeral:true}]});assert.equal(f.commands[0].response,undefined);assert.equal(f.commands[0].name,'hello');await f.manager.interaction({id:'666666666666666666',token:'one-use-ticket',type:2,data:{name:'hello'},user:{username:'Catnap'}});const call=f.calls.find(c=>c.path?.startsWith('/interactions/'));assert.equal(JSON.parse(call.body).data.embeds[0].description,'Hello Catnap');assert.equal(JSON.parse(call.body).data.flags,undefined,'visible to everyone');assert.ok(!JSON.stringify(await f.manager.handle('audit')).includes('one-use-ticket'));assert.equal((await f.manager.handle('commands'))[0].response,'Hello {user}');}finally{f.close();}});
test('credentials require owner access, verify matching application and remain hidden',async()=>{const f=fixture();try{await assert.rejects(f.manager.handle('credentials',{bot_token:'a'.repeat(70)},{owner:false}),/owner-level/);await assert.rejects(f.manager.handle('credentials',{client_id:GUILD},{owner:true}),/does not match/);await f.manager.handle('credentials',{client_id:APP,bot_token:'a'.repeat(70)},{owner:true});const raw=JSON.parse(fs.readFileSync(f.configFile));assert.equal(raw.bot_token,'a'.repeat(70));assert.equal(raw.client_secret,f.clientSecret);assert.equal(fs.statSync(f.configFile).mode&0o777,0o600);assert.ok(!JSON.stringify(await f.manager.handle('state')).includes('a'.repeat(70)));}finally{f.close();}});
test('gateway can change presence, stop and restart; stale close callbacks cannot break the new connection',()=>{let settingsValue={enabled:true,status:'online',activity:'HN Group sign-ins',activityType:3};const connections=[],controller=startPresence(()=> 'token',{settings:()=>settingsValue,log:{log(){}},transport(_url,callbacks){const socket={sent:[],send(v){socket.sent.push(JSON.parse(v));},close(){}};connections.push({socket,callbacks});return socket;}});try{const first=connections[0];first.callbacks.onMessage(JSON.stringify({op:10,d:{heartbeat_interval:60000}}));first.callbacks.onMessage(JSON.stringify({op:0,t:'READY',d:{user:{id:BOT,username:'HN Group Auth'}}}));assert.equal(controller.snapshot().phase,'online');settingsValue.status='dnd';controller.apply();assert.equal(first.socket.sent.at(-1).op,3);assert.equal(first.socket.sent.at(-1).d.status,'dnd');controller.restart();first.callbacks.onClose(1000);assert.equal(controller.snapshot().phase,'connecting');assert.equal(connections.length,2);settingsValue.enabled=false;controller.apply();assert.equal(controller.snapshot().phase,'offline');}finally{controller.stop();}});

test('failed synchronisation records the attempt and reports a failure instead of a successful zero',async()=>{const f=fixture(async()=>{throw Object.assign(new Error('Discord is unavailable. Please try again later.'),{status:503});});try{await assert.rejects(f.manager.handle('sync'),/unavailable/);const state=await f.manager.handle('state');assert.ok(state.sync.lastAttemptAt);assert.match(state.sync.error,/unavailable/);assert.ok((await f.manager.handle('audit')).some(e=>e.action==='profiles.sync.failed'));}finally{f.close();}});
test('stopping the gateway turns the bot invisible and closes the connection',()=>{const sent=[];let closed=false;const controller=startPresence(()=>'token',{log:{log(){}},transport(_g,cb){setImmediate(()=>{cb.onMessage(JSON.stringify({op:10,d:{heartbeat_interval:60000}}));cb.onMessage(JSON.stringify({op:0,t:'READY',d:{user:{id:BOT,username:'HN Group Auth'}}}));});return{send(v){sent.push(JSON.parse(v));},close(){closed=true;}};}});return new Promise(r=>setImmediate(r)).then(()=>{assert.equal(controller.snapshot().phase,'online');controller.stop();assert.deepEqual(sent.at(-1),{op:3,d:{status:'invisible',afk:false,since:null,activities:[]}});assert.ok(closed,'normal close sent to Discord');assert.equal(controller.snapshot().phase,'offline');});});
test('when Auth is stopped (pm2 stop sends SIGTERM) the bot is taken offline before the process exits',async()=>{const{spawn}=require('node:child_process');const code=`const{goOfflineOnStop}=require(${JSON.stringify(path.join(__dirname,'discord.js'))});let phase='online';goOfflineOnStop({snapshot:()=>({phase}),stop(){phase='offline';console.log('bot-offline');}});console.log('ready');setInterval(()=>{},1000);`;const child=spawn(process.execPath,['-e',code],{stdio:['ignore','pipe','inherit']});let out='';child.stdout.on('data',d=>{out+=d;if(out.includes('ready')&&!child.signalled){child.signalled=true;child.kill('SIGTERM');}});const exit=await new Promise(r=>child.on('exit',(c,s)=>r({c,s})));assert.match(out,/bot-offline/);assert.deepEqual(exit,{c:0,s:null},'exits cleanly after going offline');});

test('/ping reports measured gateway latency, remains built-in and handles no heartbeat yet',async()=>{
 for(const latency of [42.4,null]){
  const f=fixture(undefined,latency);
  try{
   await f.manager.registerBuiltins();
   assert.ok(f.calls.some(c=>c.method==='POST'&&c.path==='/applications/'+APP+'/commands'&&JSON.parse(c.body).name==='ping'));
   await f.manager.handle('save-commands',{commands:[{name:'ping',description:'override',response:'wrong'}]});
   assert.equal(f.commands.filter(c=>c.name==='ping').length,1,'dashboard updates preserve exactly one built-in ping');
   await f.manager.interaction({id:'666666666666666666',token:'ping-ticket',type:2,data:{name:'ping'},user:{username:'Test'}});
   const reply=JSON.parse(f.calls.find(c=>c.path?.startsWith('/interactions/')).body);
   assert.equal(reply.type,4);assert.match(reply.data.embeds[0].description,/Pong!/);
   assert.match(reply.data.embeds[0].description,latency===null?/being measured/:/42 ms/);
   assert.deepEqual(reply.data.allowed_mentions,{parse:[]});
  }finally{f.close();}
 }
});

test('/kick stays built-in when dashboard command definitions are replaced',async()=>{
 const f=fixture();try{await f.manager.registerBuiltins();const kick=JSON.parse(f.calls.find(c=>c.method==='POST'&&c.path==='/applications/'+APP+'/commands'&&JSON.parse(c.body).name==='kick').body);assert.equal(kick.options.find(o=>o.name==='reason').required,true);await f.manager.handle('save-commands',{commands:[{name:'kick',description:'Override',response:'wrong'}]});assert.equal(f.commands.filter(c=>c.name==='kick').length,1);assert.deepEqual(f.commands.find(c=>c.name==='kick'),kick);assert.ok(!(await f.manager.handle('commands')).some(c=>c.name==='kick'));}finally{f.close();}
});

test('/server-invite is registered and survives dashboard replacement without exposing its definition for editing',async()=>{
 const f=fixture();try{await f.manager.registerBuiltins();const definition=JSON.parse(f.calls.find(c=>c.method==='POST'&&c.path==='/applications/'+APP+'/commands'&&JSON.parse(c.body).name==='server-invite').body);assert.equal(definition.options[0].name,'user');await f.manager.handle('save-commands',{commands:[{name:'server-invite',description:'Override',response:'wrong'}]});assert.equal(f.commands.filter(c=>c.name==='server-invite').length,1);assert.deepEqual(f.commands.find(c=>c.name==='server-invite'),definition);assert.ok(!(await f.manager.handle('commands')).some(c=>c.name==='server-invite'));}finally{f.close();}
});

test('/help stays built-in and answers with a branded command menu without changing the server',async()=>{
 const f=fixture();try{
  await f.manager.registerBuiltins();
  const registered=f.calls.filter(c=>c.method==='POST'&&c.path==='/applications/'+APP+'/commands').map(c=>JSON.parse(c.body));
  assert.equal(registered.filter(c=>c.name==='help').length,1);
  await f.manager.handle('save-commands',{commands:[{name:'help',description:'Override',response:'wrong'},{name:'hello',description:'Say hello',response:'Hi'}]});
  assert.equal(f.commands.filter(c=>c.name==='help').length,1);
  assert.deepEqual(f.commands.find(c=>c.name==='help'),registered.find(c=>c.name==='help'));
  assert.ok(!(await f.manager.handle('commands')).some(c=>c.name==='help'));
  for(const guild of [GUILD,undefined]){
   const start=f.calls.length;
   await f.manager.interaction({id:'666666666666666666',token:'help-ticket',type:2,data:{name:'help'},guild_id:guild,user:{id:'999999999999999999',username:'Member'}});
   const calls=f.calls.slice(start);
   assert.equal(calls.length,1,'help only answers the interaction');
   const reply=JSON.parse(calls[0].body),card=reply.data.embeds[0],text=JSON.stringify(card);
   assert.equal(reply.type,4);assert.equal(card.title,'HN Utilities · Command guide');assert.equal(card.color,0x5514B4);
   assert.equal(reply.data.components[0].components.length,5);const ids=reply.data.components[0].components.map(b=>b.custom_id);assert.equal(new Set(ids).size,ids.length,'Discord rejects duplicate help button IDs');assert.equal(reply.data.components[0].components[0].disabled,true);
   assert.match(text,/\/ticket/);assert.match(text,/\/help/);
   const pages=[];for(let page=1;page<5;page++){const at=f.calls.length;await f.manager.interaction({id:String(666666666666666670n+BigInt(page)),token:'help-page',type:3,data:{custom_id:'hn-help:next:'+page},user:{id:'999999999999999999'}});const response=JSON.parse(f.calls[at].body);assert.equal(response.type,7);const ids=response.data.components.flatMap(r=>r.components).map(b=>b.custom_id);assert.equal(new Set(ids).size,ids.length,'Discord requires unique button IDs');pages.push(response.data.embeds[0]);}const all=JSON.stringify([card,...pages]);for(const name of registered.map(c=>c.name))assert.ok(all.includes('/'+name),'documents /'+name);assert.match(all,/Kick Members/);assert.match(all,/Deletes other editable roles/);
   assert.deepEqual(reply.data.allowed_mentions,{parse:[]});assert.equal(reply.data.flags,undefined);
   assert.ok(card.fields.every(field=>field.name.length<=256&&field.value.length<=1024));
   assert.ok(card.title.length+card.description.length+card.footer.text.length+card.fields.reduce((n,field)=>n+field.name.length+field.value.length,0)<6000);
   assert.ok(!text.includes('wrong'));assert.ok(!text.includes(f.secret));
  }
 }finally{f.close();}
});

test('/stats reports measured health, handles first sync and hides credentials and errors',async()=>{
 for(const latency of [35.8,null]){
  const f=fixture(undefined,latency);try{
   await f.manager.registerBuiltins();
   const definition=JSON.parse(f.calls.find(c=>c.method==='POST'&&c.path==='/applications/'+APP+'/commands'&&JSON.parse(c.body).name==='stats').body);
   await f.manager.handle('save-commands',{commands:[{name:'stats',response:'wrong'}]});
   assert.deepEqual(f.commands.find(c=>c.name==='stats'),definition);
   assert.equal(f.commands.filter(c=>c.name==='stats').length,1);
   assert.ok(!(await f.manager.handle('commands')).some(c=>c.name==='stats'));
   await f.manager.interaction({id:'666666666666666666',token:'stats-ticket',type:2,data:{name:'stats'},user:{username:'Member'}});
   const reply=JSON.parse(f.calls.find(c=>c.path?.startsWith('/interactions/')).body),card=reply.data.embeds[0];
   const fields=Object.fromEntries(card.fields.map(f=>[f.name,f.value]));
   assert.equal(card.title,'HN Utilities · Bot statistics');assert.equal(fields.Connection,'online');
   assert.equal(fields['Gateway ping'],latency===null?'Measuring…':'36 ms');
   assert.match(fields['Process uptime'],/^\d+d \d+h \d+m \d+s$/);assert.match(fields['Memory (RSS)'],/^\d+\.\d MB$/);
   assert.equal(fields['Connected since'],'Not yet');assert.match(fields['Profile sync'],/Waiting for first sync/);
   assert.match(fields['Staff role sync'],/Waiting for first sync/);assert.deepEqual(reply.data.allowed_mentions,{parse:[]});
   assert.ok(!JSON.stringify(reply).includes(f.secret));assert.ok(!JSON.stringify(reply).includes(f.clientSecret));
   await f.manager.handle('sync');
   await f.manager.interaction({id:'666666666666666667',token:'stats-ticket',type:2,data:{name:'stats'},user:{username:'Member'}});
   const synced=JSON.parse(f.calls.at(-1).body).data.embeds[0].fields.find(f=>f.name==='Profile sync').value;
   assert.match(synced,/Ready\nLast success: <t:\d+:R>/);
  }finally{f.close();}
 }
});

test('/ticket remains a protected built-in and dashboard publication cannot replace it',async()=>{
 const f=fixture();try{await f.manager.registerBuiltins();const definition=JSON.parse(f.calls.find(c=>c.method==='POST'&&c.path==='/applications/'+APP+'/commands'&&JSON.parse(c.body).name==='ticket').body);assert.equal(definition.options.find(s=>s.name==='create').options.find(o=>o.name==='log-channel').required,true);await f.manager.handle('save-commands',{commands:[{name:'ticket',description:'Override',response:'wrong'}]});assert.equal(f.commands.filter(c=>c.name==='ticket').length,1);assert.deepEqual(f.commands.find(c=>c.name==='ticket'),definition);assert.ok(!(await f.manager.handle('commands')).some(c=>c.name==='ticket'));}finally{f.close();}
});

test('ticket commands and component replies defer publicly and never set ephemeral flags',async()=>{
 const f=fixture();try{
  for(const type of [2,3]){
   const start=f.calls.length;
   await f.manager.interaction({id:type===2?'666666666666666661':'666666666666666662',token:'ticket-public',type,member:{user:{id:BOT}},data:type===2?{name:'ticket',options:[{name:'send'}]}:{custom_id:'ticket:publish:'+CHANNEL,values:['support']}});
   const calls=f.calls.slice(start),ack=JSON.parse(calls.find(c=>c.path.startsWith('/interactions/')).body),reply=JSON.parse(calls.find(c=>c.path.startsWith('/webhooks/')).body);
   assert.equal(ack.type,5);assert.equal(ack.data.flags,undefined);assert.equal(reply.flags,undefined);
  }
 }finally{f.close();}
});

test('Utilities keeps global commands and removes only duplicate guild welcome/NPL copies',async()=>{const f=fixture();try{await f.manager.registerBuiltins();const url='/applications/'+APP+'/guilds/'+GUILD+'/commands';assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path===url).length,0);const removed=f.calls.filter(c=>c.method==='DELETE'&&c.path.startsWith(url+'/')).map(c=>c.path.split('/').at(-1));assert.deepEqual(removed,['123456789012345671','123456789012345672']);for(const name of ['welcome','npl-override'])assert.ok(f.calls.some(c=>c.method==='POST'&&c.path==='/applications/'+APP+'/commands'&&JSON.parse(c.body).name===name));}finally{f.close();}});

test('Utilities publishes COC/servers globally once and prevents custom overrides',async()=>{const f=fixture();try{await f.manager.registerBuiltins();for(const name of ['coc','servers']){assert.ok(f.calls.some(c=>c.method==='POST'&&c.path==='/applications/'+APP+'/commands'&&JSON.parse(c.body).name===name));await f.manager.handle('save-commands',{commands:[{name,description:'Override',response:'wrong'}]});assert.equal(f.commands.filter(c=>c.name===name).length,1);assert.ok(!(await f.manager.handle('commands')).some(c=>c.name===name));}}finally{f.close();}});
