'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createPositionSync,loadRoles}=require('./position-sync');
test('HR owns position titles and order, Board roles are colourless, background sync never creates/reorders/deletes roles',async()=>{
 const G='222222222222222222',titles=['Board Chairman','Board Director','Board Member','President','Vice President (Systems)','Vice President (Relations)'];
 const policy=path.join(__dirname,'hn-roles.json'),layout=loadRoles(policy,[{name:'Fixture',guilds:[G]}],{'Horizon Network':titles})[0];
 assert.deepEqual(layout.positions.titles.map(x=>x.title),titles);assert.ok(!layout.roles.some(r=>r.name==='Vice President'));for(const r of layout.roles.filter(r=>r.name.startsWith('Board ')))assert.equal(r.color,0);
 const writes=[];const sync=createPositionSync({setup:{busy:()=>false,request:async(method,url,body)=>{if(method!=='GET')writes.push({method,url,body});if(url.endsWith('/roles'))return[{id:G,name:'@everyone',position:0}];throw Error('Unexpected '+url);}},requireCatalog:true,rolesFile:policy,networks:()=>[{name:'Fixture',guilds:[G]}],staff:async()=>({value:{positions:{'Horizon Network':titles},people:[]}})});
 const result=await sync.sync(true);assert.match(result.errors.join(' '),/run \/setup-server/);assert.deepEqual(writes,[],'Only the explicit command sets up roles');
});
