'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const{createBotManager}=require('./bot-manager'),{COMMAND}=require('./network');
const APP='1564969421800472698',GUILD='222222222222222222',OTHER='333333333333333333',USER='444444444444444444';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-network-')),file=path.join(dir,'bot.json'),calls=[];let seq=500000000000000000n;
 const fetcher=async(url,opts)=>{calls.push({url,...opts,body:opts.body?JSON.parse(opts.body):undefined});return Response.json(url.endsWith('/commands')?[]:{});};
 const build=()=>createBotManager({file,configFile:path.join(dir,'discord.json'),config:()=>({id:APP,bot:'test-token'}),fetcher});let manager=build();
 const event=(action,fields={},guild=GUILD)=>({id:String(seq++),token:'test-interaction',type:2,guild_id:guild,member:{user:{id:USER},permissions:'0'},data:{name:'network',options:[{name:action,type:1,options:Object.entries(fields).map(([name,value])=>({name,value,type:typeof value==='number'?4:3}))}]}});
 async function command(action,fields={},guild=GUILD){await manager.interaction(event(action,fields,guild));return calls.at(-1).body;}
 return{file,calls,event,command,get manager(){return manager;},restart(){manager=build();},read:()=>JSON.parse(fs.readFileSync(file)),close(){fs.rmSync(dir,{recursive:true,force:true});}};
}
const fields={name:'Test Network',acronym:'TN',appeals:'https://discord.gg/appeals','staff-server':'555555555555555555',hq:'666666666666666666'};
const text=body=>JSON.stringify(body);
test('all fields are required slash-command options and no command opens a modal',async()=>{const f=fixture();try{
 assert.deepEqual(COMMAND.options.find(o=>o.name==='create').options.map(o=>o.name),['name','appeals','acronym','staff-server','hq']);
 for(const name of ['create','join','leave','delete'])assert.ok(COMMAND.options.find(o=>o.name===name).options.every(o=>o.type===3&&o.required));
 assert.match(text(await f.command('create',fields)),/Created/);assert.ok(f.calls.every(c=>c.body?.type!==9));
 assert.deepEqual(f.read().networks[0].guilds,[GUILD]);assert.equal(f.read().networks[0].staff,fields['staff-server']);assert.equal(f.read().networks[0].hq,fields.hq);
}finally{f.close();}});
test('unrestricted public lifecycle persists creation, join, leave and reusable codes',async()=>{const f=fixture();try{
 assert.match(text(await f.command('list')),/No networks/);await f.command('create',fields);const network=f.read().networks[0];assert.match(network.code,/^[A-F0-9]{18}$/);
 f.restart();assert.match(text(await f.command('list')),new RegExp(network.code));assert.match(text(await f.command('create',fields)),/already belongs/);
 assert.match(text(await f.command('join',{code:'missing'},OTHER)),/not found/);assert.deepEqual(f.read().networks[0].guilds,[GUILD]);
 assert.match(text(await f.command('join',{code:network.code.toLowerCase()},OTHER)),/has joined/);assert.deepEqual(f.read().networks[0].guilds,[GUILD,OTHER]);
 assert.match(text(await f.command('join',{code:network.code},OTHER)),/already belongs/);
 assert.match(text(await f.command('leave',{'admin-code':'103'},OTHER)),/incorrect/);assert.equal(f.read().networks[0].guilds.length,2);
 assert.match(text(await f.command('leave',{'admin-code':'0103'},OTHER)),/has left/);await f.command('leave',{'admin-code':'0103'});assert.deepEqual(f.read().networks[0].guilds,[]);
 assert.match(text(await f.command('list')),new RegExp(network.code));await f.command('join',{code:network.code},OTHER);assert.deepEqual(f.read().networks[0].guilds,[OTHER]);
 for(const call of f.calls){assert.ok(!text(call.body).includes('"flags":64'));if(call.body?.embeds||call.body?.data?.embeds)assert.deepEqual((call.body.data||call.body).allowed_mentions,{parse:[]});}
 assert.ok(!text(f.read().audit).includes('0103'));assert.ok(!text(f.read().audit).includes(network.code));assert.equal(fs.statSync(f.file).mode&0o777,0o600);
}finally{f.close();}});
test('invalid data, duplicate names and replayed interactions never mutate network membership',async()=>{const f=fixture();try{
 for(const patch of [{appeals:'http://discord.gg/test'},{'staff-server':'invalid'},{hq:'invalid'},{name:''},{acronym:'a'.repeat(21)}]){assert.ok(!text(await f.command('create',{...fields,...patch})).includes('Created'));assert.equal(f.read().networks,undefined);}
 const event=f.event('create',fields);await f.manager.interaction(event);await f.manager.interaction(event);assert.equal(f.read().networks.length,1);
 assert.match(text(await f.command('create',{...fields,name:'test network'},OTHER)),/already exists/);assert.equal(f.read().networks.length,1);
}finally{f.close();}});
test('list paginates all networks within embed limits and definitions survive republishing',async()=>{const f=fixture();try{
 await f.command('create',fields);const db=f.read();db.networks=Array.from({length:12},(_,i)=>({...db.networks[0],id:String(i),name:'Network '+i,acronym:'N'+i,code:'CODE'+i,guilds:[]}));fs.writeFileSync(f.file,JSON.stringify(db));f.restart();
 for(const page of [1,2,3]){const reply=await f.command('list',{page});assert.equal(reply.data.embeds[0].fields.length,page===3?2:5);assert.ok(text(reply).length<6000);assert.equal(reply.data.flags,undefined);}
 assert.match(text(await f.command('list',{page:4})),/between 1 and 3/);
 await f.manager.registerBuiltins();const definition=f.calls.find(c=>c.body?.name==='network').body;assert.equal(definition.default_member_permissions,null);
 await f.manager.handle('save-commands',{commands:[{name:'network',response:'override'}]});const published=f.calls.findLast(c=>c.method==='PUT').body;assert.equal(published.filter(c=>c.name==='network').length,1);assert.deepEqual(published.find(c=>c.name==='network'),definition);
}finally{f.close();}});

test('delete requires the exact admin code, clears all memberships and invalidates the join code across restarts',async()=>{const f=fixture();try{
 await f.command('create',fields);const target=f.read().networks[0];await f.command('join',{code:target.code},OTHER);
 const third='777777777777777777';await f.command('create',{...fields,name:'Other Network',acronym:'ON'},third);const other=f.read().networks[1];
 for(const admin of ['', '103', 'wrong'])assert.match(text(await f.command('delete',{code:target.code,'admin-code':admin},third)),/incorrect/);
 assert.match(text(await f.command('delete',{code:'missing','admin-code':'0103'},third)),/not found/);assert.equal(f.read().networks.length,2);
 const event=f.event('delete',{code:target.code.toLowerCase(),'admin-code':'0103'},third);await f.manager.interaction(event);await f.manager.interaction(event);
 assert.match(text(f.calls.at(-1).body),/cleared 2 server/);assert.deepEqual(f.read().networks,[other]);
 f.restart();assert.match(text(await f.command('join',{code:target.code})),/not found/);assert.ok(!text(await f.command('list')).includes(target.code));
 const audit=f.read().audit.filter(e=>e.action==='network.delete');assert.equal(audit.length,1);assert.equal(audit[0].details.count,2);assert.ok(!text(f.read().audit).includes(target.code));assert.ok(!text(f.read().audit).includes('0103'));
 await f.command('leave',{'admin-code':'0103'},third);assert.match(text(await f.command('delete',{code:other.code,'admin-code':'0103'})),/cleared 0 server/);f.restart();assert.deepEqual(f.read().networks,[]);
 assert.ok(f.calls.every(c=>!c.url.includes('/guilds/')));assert.ok(f.calls.every(c=>!text(c.body).includes('"flags":64')));
}finally{f.close();}});
