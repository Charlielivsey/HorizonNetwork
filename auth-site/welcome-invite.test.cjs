'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWelcome}=require('./welcome'),{message}=require('./bot-invite');
test('welcomes are isolated by server, require management permission, restrict mentions, and retry joins without duplicates',async()=>{
 const G='222222222222222222',H='333333333333333333',C='444444444444444444',R='555555555555555555',U='666666666666666666';
 let state={guilds:{},seen:[],pending:[]},fail=false;const messages=[],replies=[];
 const w=createWelcome({state:()=>state,commit:s=>state=s,membersEnabled:()=>true,callback:async(e,d)=>replies.push(d),api:async(method,url,body)=>{if(url.startsWith('/channels/')&&method==='GET')return {guild_id:G,type:0};if(url.startsWith('/guilds/'))return {name:'Fixture',approximate_member_count:21};if(fail)throw Error('offline');messages.push(body);}});
 const event=(guild,permissions,sub,options=[])=>({id:'777777777777777777',guild_id:guild,member:{permissions,user:{id:U,username:'Fixture'}},data:{options:[{name:sub,options}]}});
 try{const opts=[{name:'channel',value:C},{name:'rules',value:R}];await w.interaction(event(G,'0','setup',opts));assert.equal(state.guilds[G],undefined);
 await w.interaction(event(H,'32','setup',opts));assert.equal(state.guilds[H],undefined,'foreign channels refused');
 await w.interaction(event(G,'32','setup',opts));assert.equal(state.guilds[G].channel,C);
 const join={guild_id:G,user:{id:U,username:'@everyone'},joined_at:'2026-11-17T00:00:00Z'};
 await w.member({...join,guild_id:H});assert.equal(messages.length,0);fail=true;await w.member(join);assert.equal(state.pending.length,1);fail=false;state.pending[0].retryAt=0;await w.flush();await w.member(join);
 assert.equal(messages.length,1);assert.deepEqual(messages[0].allowed_mentions,{parse:[],users:[U]});assert.match(messages[0].embeds[0].description,/21/);assert.match(messages[0].embeds[0].fields[0].value,/Account Creation/);assert.equal(state.pending.length,0);
 await w.interaction(event(G,'32','disable'));await w.member({...join,joined_at:'later'});assert.equal(messages.length,1);
 }finally{w.close();}
});
test('bot invite links contain both correct application IDs and never request Administrator',()=>{
 const ids=['1564969421800472698','1571216218449248377'];const links=message(...ids).components[0].components;
 links.forEach((b,i)=>{const url=new URL(b.url);assert.equal(url.searchParams.get('client_id'),ids[i]);assert.match(url.searchParams.get('scope'),/applications.commands/);assert.equal(BigInt(url.searchParams.get('permissions'))&8n,0n);});
});
test('setup role templates use current network membership instead of the old server list',()=>{
 const {loadRoles,COMMANDS}=require('./position-sync');const file=require('node:path').join(__dirname,'hn-roles.json');
 assert.equal(loadRoles(file,[]).length,0);const guild='999999999999999999';assert.deepEqual(loadRoles(file,[{name:'New network',guilds:[guild]}]).map(l=>l.guildId),[guild]);
 assert.deepEqual(COMMANDS.find(c=>c.name==='setup-server').options[0].choices,[{name:'HN administration roles',value:'hn-administration'}]);
});
