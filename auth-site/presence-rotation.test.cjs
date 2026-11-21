'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {startPresence,ROTATING_ACTIVITIES}=require('./discord-gateway');
const {DEFAULTS,settings}=require('./bot-manager');
test('approved activities rotate every thirty seconds, wrap, preserve DND and stop on disconnect',t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const sent=[];let cb;const config={enabled:true,status:'dnd',activityRotation:true};
 const controller=startPresence(()=>'fixture',{settings:()=>config,log:{log(){}},transport:(_gateway,callbacks)=>{cb=callbacks;return{send:s=>sent.push(JSON.parse(s)),close(){}};}});
 const ready=()=>{cb.onMessage(JSON.stringify({op:10,d:{heartbeat_interval:60000}}));cb.onMessage(JSON.stringify({op:0,t:'READY',d:{user:{id:'444444444444444444'}}}));};
 try{
  ready();assert.deepEqual(sent[0].d.presence.activities,[{name:'over Horizon Network',type:3}]);assert.equal(sent[0].d.presence.status,'dnd');
  t.mock.timers.tick(29999);assert.equal(sent.filter(s=>s.op===3).length,0);
  t.mock.timers.tick(1);assert.deepEqual(sent.at(-1).d.activities,[ROTATING_ACTIVITIES[1]]);
  for(let i=2;i<=6;i++){cb.onMessage(JSON.stringify({op:11}));t.mock.timers.tick(30000);assert.deepEqual(sent.filter(s=>s.op===3).at(-1).d.activities,[ROTATING_ACTIVITIES[i%6]]);assert.equal(sent.filter(s=>s.op===3).at(-1).d.status,'dnd');}
  config.activityRotation=false;config.activity='Custom activity';config.activityType=2;controller.apply();assert.deepEqual(sent.at(-1).d.activities,[{name:'Custom activity',type:2}]);const count=sent.length;t.mock.timers.tick(30000);assert.equal(sent.filter(s=>s.op===3).at(-1).d.activities[0].name,'Custom activity');
  controller.stop();assert.equal(sent.at(-1).d.status,'invisible');const stopped=sent.length;t.mock.timers.tick(90000);assert.equal(sent.length,stopped);
 }finally{controller.stop();t.mock.timers.reset();}
 assert.equal(DEFAULTS.status,'dnd');assert.equal(DEFAULTS.activityRotation,true);assert.deepEqual(settings({activityRotation:false}),{activityRotation:false});
});
