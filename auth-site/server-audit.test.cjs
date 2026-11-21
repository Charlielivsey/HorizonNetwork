'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict');
const{createServerAudit}=require('./server-audit');
const{createModeration}=require('./moderation');
const GUILD='222222222222222222',USER='333333333333333333',ACTOR='444444444444444444';
function fixture(){const logs=[],seen=[];let id=500000000000000000n;const audit=createServerAudit({record:(actor,action,details)=>logs.push({actor,action,details}),seen:()=>seen,markSeen:value=>seen.push(value)});return{logs,seen,audit,event:(type,changes=[])=>({id:String(id++),guild_id:GUILD,user_id:ACTOR,target_id:USER,action_type:type,changes})};}
test('bans, unbans, timeouts and voice mute changes each create a clear server log',()=>{const f=fixture();
 for(const [type,changes,label] of [[22,[],'Member banned'],[23,[],'Member unbanned'],[24,[{key:'communication_disabled_until',new_value:'2099-01-01T00:00:00Z'}],'Member timed out'],[24,[{key:'communication_disabled_until',new_value:null}],'Member timeout removed'],[24,[{key:'mute',new_value:true}],'Member voice muted'],[24,[{key:'mute',new_value:false}],'Member voice unmuted']]){f.audit(f.event(type,changes));assert.equal(f.logs.at(-1).details.event,label);assert.equal(f.logs.at(-1).actor.email,'Discord '+ACTOR);assert.equal(f.logs.at(-1).details.target,USER);}
 assert.equal(f.logs.length,6);
});
test('server role/channel changes are logged once, invite codes are redacted and kicks use the existing handler',()=>{const f=fixture();const role=f.event(30,[{key:'name',new_value:'Moderator'}]);f.audit(role);f.audit(role);assert.equal(f.logs.length,1);assert.equal(f.logs[0].details.targetName,'Moderator');
 f.audit(f.event(11,[{key:'name',old_value:'old',new_value:'new'}]));assert.equal(f.logs.at(-1).details.event,'Channel changed');
 const invite=f.event(40,[{key:'code',new_value:'PRIVATECODE'},{key:'token',new_value:'PRIVATETOKEN'}]);invite.target_id='PRIVATECODE';f.audit(invite);assert.ok(!JSON.stringify(f.logs).includes('PRIVATECODE'));assert.ok(!JSON.stringify(f.logs).includes('PRIVATETOKEN'));
 const before=f.logs.length;f.audit(f.event(20));assert.equal(f.logs.length,before,'kick notices are not duplicated');
});
test('central owner kick log replaces the former separate Echo kick DM',async()=>{const calls=[],records=[];const config=()=>({id:'777777777777777777',bot:'fixture',ownerAuditRecipient:'1256504335110635531'});
 const fetcher=async(url,opts)=>{calls.push({url,body:opts.body?JSON.parse(opts.body):null});if(url.endsWith('/channels'))return Response.json({id:'666666666666666666'});if(url.includes('/guilds/'))return Response.json({id:GUILD,name:'Fixture server'});if(url.includes('/users/'))return Response.json({id:url.split('/').at(-1),username:'Fixture user'});return Response.json({});};
 const moderation=createModeration({config,fetcher,record:(actor,action,details)=>records.push({action,details}),seen:()=>[],markSeen:()=>{}});
 // External kick lookups need only the member and guild; all HTTP remains mocked.
 const data={id:'888888888888888888',action_type:20,guild_id:GUILD,user_id:ACTOR,target_id:USER,reason:'Rule violation'};
 await moderation.audit(data);
 assert.ok(records.some(r=>r.action==='member.kick'));assert.equal(records.find(r=>r.action==='member.kick.notifications').details.ownerDm,'queued');assert.equal(calls.filter(c=>c.body?.recipient_id===USER).length,1);assert.ok(calls.filter(c=>c.body?.recipient_id==='1256504335110635531').length===0,'no second direct Echo DM is sent');
});
