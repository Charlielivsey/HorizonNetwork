'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createServerBranding,assetKey}=require('./server-branding');
test('network server icons follow approved assets, including Appeals service icon; cache detects drift',async()=>{
 const data=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('fixture')]),sha256=crypto.createHash('sha256').update(data).digest('hex');let saved={},writes=0;
 const guilds={a:{id:'a',name:'HQ',icon:'old'},b:{id:'b',name:'HN Appeals',icon:'old'}};
 const sync=createServerBranding({networks:()=>[{hq:'a',guilds:['a','b']}],state:()=>saved,commit:s=>saved=s,
 request:async(method,url,body)=>{const g=guilds[url.split('/').at(-1)];assert.ok(g,'Only current network guilds');if(method==='PATCH'){assert.equal(body.icon,'data:image/png;base64,'+data.toString('base64'));g.icon='new'+(++writes);}return {...g};},
 fetcher:async url=>url.endsWith('/api/discord-server-branding')?{ok:true,json:async()=>({assets:['horizon-network-hq','appeals'].map(key=>({key,url:'https://branding.hngroup.org.uk/assets/brand/png/'+(key==='appeals'?'hn-appeals-app-icon':key)+'.png',sha256}))})}:{ok:true,arrayBuffer:async()=>data}});
 assert.equal(await sync(),2);assert.equal(saved.b.key,'appeals');assert.equal(await sync(),0);guilds.b.icon='external';assert.equal(await sync(),1);assert.equal(writes,3);
 assert.equal(assetKey({id:'x',name:'Unknown'},{guilds:['x']}),null);
});
test('unapproved origins and corrupted artwork cannot change Discord',async()=>{
 for(const url of ['https://evil.example/assets/brand/png/a.png','https://branding.hngroup.org.uk/assets/brand/png/a.png']){
 let writes=0;const sync=createServerBranding({networks:()=>[{hq:'a',guilds:['a']}],state:()=>({}),commit:()=>{},request:async(method)=>{if(method==='PATCH')writes++;return{id:'a',name:'HQ'};},fetcher:async u=>u.endsWith('/api/discord-server-branding')?{ok:true,json:async()=>({assets:[{key:'horizon-network-hq',url,sha256:'a'.repeat(64)}]})}:{ok:true,arrayBuffer:async()=>Buffer.from('bad')}});await assert.rejects(sync());assert.equal(writes,0);
 }
});
