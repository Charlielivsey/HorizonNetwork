'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSetupRequests}=require('./discord-setup-requests');
test('setup writes are serial and paced, and Discord cooldowns over 60 seconds are fully honoured',async()=>{
 let clock=0,calls=0,inFlight=0,peak=0;const delays=[],times=[],worker={controller:new AbortController(),lastActivity:0,waitingUntil:0};
 const request=createSetupRequests({config:()=>({bot:'fixture'}),context:()=>worker,now:()=>clock,sleep:async ms=>{assert.ok(worker.waitingUntil>=clock+ms);delays.push(ms);clock+=ms;},fetcher:async()=>{times.push(clock);inFlight++;peak=Math.max(peak,inFlight);await Promise.resolve();inFlight--;return ++calls===1?new Response(JSON.stringify({retry_after:125}),{status:429}):new Response(null,{status:204});}});
 await Promise.all([request('POST','/guilds/fixture/roles',{}),request('POST','/guilds/fixture/roles',{})]);assert.equal(peak,1);assert.ok(delays.some(ms=>ms>=125000),'No truncated Discord retry window');assert.ok(times[2]-times[1]>=1500,'Paced successive mutations');
});
test('a stalled setup restarts from a saved checkpoint without deleting or recreating completed roles',async()=>{
 const {createServerSetup,parseLayout}=require('./server-setup');
 const G='222222222222222222',B='333333333333333333',BR='444444444444444444',OLD='555555555555555555';let next=666666666666666660n,checkpoint=null,hang=true;
 const roles=[{id:G,name:'@everyone',permissions:'0',position:0},{id:BR,name:'Bot',permissions:'8',position:100,managed:true},{id:OLD,name:'Old role',permissions:'0',position:1,managed:false}],deleted=[],created=[],events=[];
 const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
 const fetcher=async(url,opt)=>{const p=new URL(url).pathname.replace('/api/v10','');if(p==='/guilds/'+G)return json({id:G,name:'Fixture'});if(p==='/users/@me')return json({id:B});if(p==='/guilds/'+G+'/members/'+B)return json({roles:[BR]});if(p.endsWith('/channels'))return json([]);
  if(p==='/guilds/'+G+'/roles'){
   if(opt.method==='GET')return json(roles);
   const body=JSON.parse(opt.body);if(opt.method==='PATCH'){for(const r of body)roles.find(x=>x.id===r.id).position=r.position;return json(roles);}
   const r={...body,id:String(next++),position:1,managed:false};roles.push(r);created.push(r.name);if(hang){hang=false;return new Promise(()=>{});}return json(r);
  }
  if(opt.method==='DELETE'){const id=p.split('/').at(-1);deleted.push(id);roles.splice(roles.findIndex(r=>r.id===id),1);return new Response(null,{status:204});}
  throw Error('Unexpected request '+p);
 };
 const layout=parseLayout({server:'Fixture',guildId:G,roles:[{name:'One'},{name:'Two'}],channels:[]},'fixture');
 const setup=createServerSetup({config:()=>({bot:'fixture'}),fetcher,sleep:async()=>{},checkpoint:()=>checkpoint,saveCheckpoint:s=>checkpoint=s,record:(u,e)=>events.push(e),staleAfter:30,watchdogEvery:5,requestTimeout:500});
 const result=await setup.autoApply(G,layout,{force:true});assert.equal(result.applied,true);assert.deepEqual(result.errors,[]);assert.deepEqual(deleted,[OLD]);assert.deepEqual(created,['One','Two']);assert.ok(events.includes('server-setup.recovering'));assert.ok(events.includes('server-setup.auto.resumed'));assert.equal(checkpoint,null);assert.equal(setup.busy(),false);
});
