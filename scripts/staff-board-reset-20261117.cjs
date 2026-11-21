'use strict';
// Explicit, one-time operator migration. Run only while hn-accounts is stopped.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const appointments=[
 ['d12bb6db2c0f12a4','Echo','Board Chairman'],
 ['cd8a97f132143f38','Dion','Board Director'],
 ['ef04f2111850e59f','Evan','Board Director'],
 ['eac52e61236f7105','Jack','Board Director'],
 ['42a1713b0c9ffa9b','Ash','Board Member'],
 ['7eedf3a79eac537c','Human','Board Member'],
 ['87f5491899ffa81d','Vee','Board Member'],
];
const duplicateId='9335d216dc526d9f',testCharlieId='fbece33ac7584936';
function plan(input,logins,configuration,now=new Date().toISOString()){
 const people=structuredClone(input),settings=structuredClone(configuration);
 const duplicate=people.find(p=>p.id===duplicateId);
 if(duplicate){
  assert.equal(duplicate.displayName,'Val G','Unexpected duplicate identity');
  assert.equal(duplicate.temporary,true,'Only the temporary Val record may be removed');
  // Do not silently sever a testing account. Current production Val has no linked accounts.
  assert.ok(!logins.some(l=>l.primaryFor===duplicateId||(l.profiles||[]).some(p=>p.personId===duplicateId)),'Duplicate has a linked account; preserve and explicitly relink it before removal');
 }
 const testing=people.find(p=>p.id===testCharlieId);assert.ok(testing,'Testing Charlie must remain');
 for(const [id,name,title] of appointments){
  const p=people.find(p=>p.id===id);assert.equal(p?.displayName,name,'Staff identity mismatch: '+name);
  p.company='Horizon Network';p.jobTitle=title;p.department='Board of Directors';p.temporary=false;
  p.supervisorPosition=title==='Board Chairman'?{company:'HN Group',title:'Board of HN Group',kind:'board'}:{company:'Horizon Network',title:'Board Chairman'};
  p.supervisorId=title==='Board Chairman'?null:appointments[0][0];p.supervisorCompany=title==='Board Chairman'?null:'Horizon Network';p.updatedAt=now;
 }
 for(const p of people)if(!p.system)p.otherRoles=[];
 settings.positions||={};settings.positions['Horizon Network']=[...new Set(['Board Chairman','Board Director','Board Member',...(settings.positions['Horizon Network']||[])])];
 settings.positionReports||={};const reports=settings.positionReports['Horizon Network']||={};
 reports['Board Chairman']={company:'HN Group',title:'Board of HN Group',kind:'board'};
 for(const t of ['Board Director','Board Member'])reports[t]={company:'Horizon Network',title:'Board Chairman'};
 return {people:people.filter(p=>p.id!==duplicateId),settings,removed:duplicate||null};
}
if(require.main===module){
 const [dir,backup]=process.argv.slice(2);if(!dir||!backup)throw Error('Usage: node scripts/staff-board-reset-20261117.cjs DATA_DIR BACKUP_DIR (stop hn-accounts first)');
 const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json')));
 const original=read('people'),logins=read('logins'),settings=read('settings');
 const result=plan(original,logins,settings);
 fs.mkdirSync(backup,{recursive:true,mode:0o700});
 for(const name of ['people','logins','settings'])fs.copyFileSync(path.join(dir,name+'.json'),path.join(backup,name+'.json'));
 if(result.removed)fs.writeFileSync(path.join(backup,'removed-temporary-val.json'),JSON.stringify(result.removed,null,2),{mode:0o600});
 for(const name of ['people','settings']){
  const file=path.join(dir,name+'.json'),tmp=file+'.board-reset.tmp';fs.writeFileSync(tmp,JSON.stringify(result[name],null,2),{mode:0o600});fs.renameSync(tmp,file);
 }
 assert.deepEqual(read('logins'),logins,'Sign-in accounts must remain untouched');
 console.log(JSON.stringify({staff:result.people.filter(p=>!p.system).length,assigned:appointments.length,removedTemporaryDuplicate:!!result.removed,accountsPreserved:logins.length}));
}
module.exports={plan,appointments,duplicateId,testCharlieId};
