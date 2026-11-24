'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const{createPositionSync,loadRoles}=require('./position-sync');
const{reconcilePositionRoles}=require('./position-roles');
const G='222222222222222222',U='333333333333333333',BOT='444444444444444444',company='Horizon Network',file=path.join(__dirname,'hn-roles.json');
function fixture(){
 let catalog=[{id:'a'.repeat(24),title:'President',aliases:[]}],people=[{id:U,titles:[{company,title:'President'}]}],registry={},serial=700000000000000000n,writes=[],failCreate=false;
 const networks=[{name:'Fixture',guilds:[G]}],layout=()=>loadRoles(file,networks,{[company]:catalog.map(p=>p.title)},{[company]:catalog})[0];
 let roles=layout().roles.filter(r=>r.name!=='President').map((r,i)=>({...r,id:String(serial++),managed:false,position:100-i}));
 const custom={id:String(serial++),name:'Unrelated community access',permissions:'8',position:2};roles.push(custom);const botRole={id:String(serial++),name:'Utilities integration',managed:true,position:1000,permissions:'8'};roles.push(botRole);
 const member={user:{id:U},roles:[custom.id]};
 const setup={busy:()=>false,request:async(method,url,body)=>{
  assert.ok(url==='/users/@me'||url.startsWith('/guilds/'+G+'/'),'Never touches an unregistered guild');
  if(url==='/users/@me')return{id:BOT};
  if(method==='GET'&&url.endsWith('/members/'+BOT))return{user:{id:BOT,bot:true},roles:[botRole.id]};
  if(method!=='GET')writes.push({method,url,body});
  if(method==='GET'&&url.endsWith('/roles'))return structuredClone(roles);
  if(method==='POST'&&url.endsWith('/roles')){if(failCreate)throw Error('Fixture Discord outage');for(const r of roles)if(r.position>0)r.position++;const r={...body,id:String(serial++),managed:false,position:1};roles.push(r);return structuredClone(r);}
  if(method==='PATCH'&&url.endsWith('/roles')){for(const p of body)roles.find(r=>r.id===p.id).position=p.position;return structuredClone(roles);}
  const role=/\/roles\/(\d+)$/.exec(url);
  if(role&&!url.includes('/members/')){
   if(method==='DELETE'){roles=roles.filter(r=>r.id!==role[1]);member.roles=member.roles.filter(id=>id!==role[1]);return;}
   if(method==='PATCH'){Object.assign(roles.find(r=>r.id===role[1]),body);return;}
  }
  if(url.includes('/members/')){
   if(method==='GET')return structuredClone(member);
   if(method==='PATCH'){member.roles=body.roles;return;}
   if(method==='PUT'){member.roles.push(role[1]);return;}
   if(method==='DELETE'){member.roles=member.roles.filter(id=>id!==role[1]);return;}
  }
  throw Error('Unexpected request '+method+' '+url);
 }};
 const make=()=>createPositionSync({setup,staff:async()=>({value:{positions:{[company]:catalog.map(p=>p.title)},positionCatalog:{[company]:catalog},people}}),rolesFile:file,networks:()=>networks,requireCatalog:true,positionRoles:()=>registry,commitPositionRoles:(g,value)=>{registry={...registry,[g]:structuredClone(value)};}});
 return{make,setup,layout,get catalog(){return catalog;},set catalog(v){catalog=v;},set people(v){people=v;},get roles(){return roles;},member,custom,writes,get registry(){return registry;},set failCreate(v){failCreate=v;}};
}
test('automatic create, stable-ID rename, new positions and deletion update linked staff without resetting unrelated roles',async()=>{
 const f=fixture();let sync=f.make();let result=await sync.sync(true);assert.deepEqual(result.errors,[]);
 const president=f.roles.find(r=>r.name==='President');assert.ok(president);assert.ok(f.member.roles.includes(president.id));assert.equal(president.permissions,'0');
 f.catalog=[{id:'a'.repeat(24),title:'Chief Executive Officer',aliases:['President']},{id:'b'.repeat(24),title:'Coordinator',aliases:[]}];
 f.people=[{id:U,titles:[{company,title:'Chief Executive Officer'},{company,title:'Coordinator'}]}];
 sync=f.make();result=await sync.sync(true);assert.deepEqual(result.errors,[]);
 assert.equal(f.roles.find(r=>r.name==='Chief Executive Officer').id,president.id,'Rename preserves Discord role identity');
 assert.ok(f.member.roles.includes(f.roles.find(r=>r.name==='Coordinator').id));
 assert.ok(f.member.roles.includes(f.roles.find(r=>r.name==='Network Permission Level 5').id),'Renamed position retains its technical grants');
 const before=f.writes.length;await sync.sync(true);assert.equal(f.writes.length,before,'Repeated sync is idempotent');
 const coordinator=f.roles.find(r=>r.name==='Coordinator');f.catalog=f.catalog.slice(0,1);f.people=[{id:U,titles:[{company,title:'Chief Executive Officer'}]}];
 result=await sync.sync(true);assert.deepEqual(result.errors,[]);assert.ok(!f.roles.some(r=>r.id===coordinator.id));assert.ok(!f.member.roles.includes(coordinator.id));
 assert.ok(f.member.roles.includes(f.custom.id));assert.equal(f.roles.find(r=>r.id===f.custom.id).permissions,'8');
 assert.ok(!f.writes.some(w=>w.url.includes('/channels')),'No channel/layout reset');for(const w of f.writes.filter(w=>w.url.endsWith('/roles')&&w.method==='PATCH'))assert.ok(w.body.every(p=>p.id!==f.custom.id),'Only listed roles are arranged');
});
test('failed creation retries safely; incomplete identities cause no role writes',async()=>{
 const f=fixture();f.failCreate=true;const sync=f.make();assert.ok((await sync.sync(true)).errors.length);f.failCreate=false;assert.deepEqual((await sync.sync(true)).errors,[]);
 assert.equal(f.roles.filter(r=>r.name==='President').length,1);const before=f.writes.length;
 await assert.rejects(reconcilePositionRoles({layout:f.layout(),catalog:[],live:f.roles,state:f.registry[G],commit:()=>{},request:f.setup.request}),/identities/);
 assert.equal(f.writes.length,before);
});
test('CEO adopts the former President role on first sync, and all four chiefs receive NPL5 and Network Administration',async()=>{
 const f=fixture(),legacy={id:'888888888888888888',name:'President',permissions:'0',position:500,managed:false,color:0};f.roles.push(legacy);
 const chiefs=['Chief Executive Officer','Chief Operating Officer','Chief Compliance Officer','Chief Technology Officer'];
 f.catalog=chiefs.map((title,i)=>({id:String(i+1).repeat(24),title,aliases:[]}));f.people=[{id:U,titles:[{company,title:'Chief Operating Officer'}]}];
 const npl=f.roles.find(r=>r.name==='Network Permission Level 5');npl.permissions='0';
 const result=await f.make().sync(true);assert.deepEqual(result.errors,[]);
 assert.equal(f.roles.find(r=>r.name===chiefs[0]).id,legacy.id);assert.ok(!f.writes.some(w=>w.method==='DELETE'&&w.url.endsWith(legacy.id)));
 assert.equal(f.roles.find(r=>r.id===npl.id).permissions,'8','Repairs the configured Administrator permission on NPL5');
 assert.ok(f.member.roles.includes(npl.id));assert.ok(f.member.roles.includes(f.roles.find(r=>r.name==='NA | Network Administration').id));
 const layout=f.layout();for(const title of chiefs){const mapping=layout.positions.titles.find(p=>p.title===title);assert.ok(mapping.roles.includes('Network Permission Level 5'));assert.ok(mapping.roles.includes('NA | Network Administration'));}
 const ordered=layout.roles.map(spec=>f.roles.find(r=>r.name===spec.name));assert.ok(ordered.every((r,i)=>i===0||ordered[i-1].position>r.position),'Applies the full current role-list order');
 assert.equal(f.roles.find(r=>r.name===chiefs[0]).color,parseInt('B99AF2',16));assert.equal(f.roles.find(r=>r.name===chiefs[1]).color,parseInt('9674D4',16));
});
test('hierarchy failures are detected before changing any roles',async()=>{
 const f=fixture();const na=f.roles.find(r=>r.name==='NA | Network Administration');na.position=2000;
 const result=await f.make().sync(true);assert.ok(result.errors.some(e=>/Move the Utilities/.test(e)));assert.deepEqual(f.writes,[]);
});
test('only known legacy position roles are retired; managed integration roles survive',async()=>{
 const f=fixture();const old={id:'888888888888888888',name:'Former Position',managed:false},integration={id:'999999999999999999',name:'Integration Position',managed:true};
 const live=[...f.roles,old,integration];const writes=[];
 const result=await reconcilePositionRoles({layout:{...f.layout(),legacyPositionTitles:['Former Position','Integration Position']},catalog:f.catalog,live,state:{},commit:()=>{},request:async(method,url,body)=>{writes.push({method,url});if(method==='POST')return{id:'777777777777777777',...body};}});
 assert.ok(writes.some(w=>w.method==='DELETE'&&w.url.endsWith(old.id)));assert.ok(!writes.some(w=>w.url.endsWith(integration.id)));assert.ok(result.live.some(r=>r.id===integration.id));
});

test('duplicate low Discord positions use ID tie-breaking within the bot hierarchy',async()=>{
 const f=fixture();f.catalog=['Chief Executive Officer','Chief Operating Officer','Chief Compliance Officer','Chief Technology Officer'].map((title,i)=>({id:String(i+1).repeat(24),title,aliases:[]}));
 for(const r of f.roles)r.position=r.managed?20:1;
 const result=await f.make().sync(true);assert.deepEqual(result.errors,[]);
 const ordered=f.layout().roles.map(s=>f.roles.find(r=>r.name===s.name));assert.ok(ordered.every((r,i)=>i===0||ordered[i-1].position>r.position||(ordered[i-1].position===r.position&&BigInt(ordered[i-1].id)<BigInt(r.id))));for(const w of f.writes.filter(w=>w.method==='PATCH'&&w.url.endsWith('/roles')))assert.ok(w.body.every(r=>r.position<f.roles.find(r=>r.managed).position));
});
