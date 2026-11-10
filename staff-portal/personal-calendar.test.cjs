'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('personal calendar privacy and live reporting/team-profile access',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-personal-calendar-'));
 const store=require('./lib/store'),calendar=require('./lib/calendar'),leave=require('./lib/leave'),service=require('./lib/personal-calendar');
 try{
  store.init(dir);calendar.init(dir);leave.init(dir);
  const make=(name,company='HN Group',department='Operations',jobTitle='Member',extra={})=>store.saveEmployee({firstName:name,lastName:'Fixture',displayName:name,company,department,jobTitle,emails:[{local:name.toLowerCase(),domain:'hngroup.org.uk',primary:true}],...extra});
  const manager=make('Manager'),leader=make('Leader','HN Group','Operations','Team Leader'),staff=make('Staff','HN Group','Operations','Member',{supervisorId:manager.id}),peer=make('Peer'),outsider=make('Outsider','Horizon Network'),otherDept=make('Different','HN Group','Sales');
  const admin=make('Administrator'),eventEditor=make('Editor'),hr=make('HumanResources');
  for(const [name,permissions,person] of [['Fixture administrator',['system.admin'],admin],['Fixture editor',['events.manage'],eventEditor],['Fixture HR',['leave.manage','staff.manage'],hr]]){const role=store.saveRole({name,permissions});store.setRoleMembers(role,[person.id]);}
  const owner=store.allPeople().find(p=>p.system);
  const annual=leave.createRequest(staff,{type:'annual',startDate:'2026-11-12',endDate:'2026-11-13'},owner);
  const sick=leave.createRequest(staff,{type:'sick',startDate:'2026-11-16',endDate:'2026-11-16',note:'Private medical reason'},staff);
  leave.createRequest(peer,{type:'annual',startDate:'2026-11-17',endDate:'2026-11-17'},owner);
  leave.createRequest(outsider,{type:'annual',startDate:'2026-11-18',endDate:'2026-11-18'},owner);
  leave.createRequest(otherDept,{type:'annual',startDate:'2026-11-19',endDate:'2026-11-19'},owner);
  const shared=calendar.saveEvent({title:'Group meeting',type:'meeting',startDate:'2026-11-12',companies:['HN Group']},owner);
  const privateEvent=calendar.saveEvent({title:'Private staff meeting',type:'meeting',startDate:'2026-11-13',visibility:'private',attendeeIds:[staff.id],description:'Private meeting details'},outsider);
  calendar.saveEvent({title:'Other company meeting',startDate:'2026-11-14',companies:['Horizon Network']},owner);
  const read=(person,extra='')=>service.read(person,new URLSearchParams('from=2026-11-01&to=2026-11-30&'+extra));
  const mine=read(staff);assert.equal(mine.scope.view,'personal');assert.ok(mine.items.some(x=>x.id==='lv-'+annual.id));assert.ok(mine.items.some(x=>x.id==='lv-'+sick.id&&x.kind==='sick'));assert.ok(mine.items.some(x=>x.id===privateEvent.id));assert.ok(mine.items.some(x=>x.id===shared.id));assert.ok(mine.items.filter(x=>x.kind==='leave'||x.kind==='sick').every(x=>x.personId===staff.id));assert.doesNotMatch(JSON.stringify(mine),/Private medical reason|Other company meeting/);
  assert.equal(read(manager).items.some(x=>x.personId===staff.id),false,'manager defaults to own calendar');
  const reports=read(manager,'view=reports');assert.ok(reports.items.length);assert.ok(reports.items.every(x=>x.kind==='leave'&&x.leaveType==='annual'&&x.status==='approved'&&x.personId===staff.id));assert.equal(reports.scope.access,'annual-only');
  assert.equal(read(manager,'person='+staff.id).items.some(x=>x.kind==='sick'||x.kind==='event'),false);
  for(const viewer of [manager,leader,hr,eventEditor,peer])assert.throws(()=>read(viewer,'person='+outsider.id),e=>e.status===403);
  assert.equal(read(hr).calendars.canViewOthers,false,'HR permissions alone do not expose personal calendars');assert.equal(read(eventEditor).calendars.canViewOthers,false,'event management alone is not system administration');assert.equal(read(eventEditor).items.some(x=>x.id===privateEvent.id),false);
  const team=read(leader).calendars.teams[0];const availability=read(leader,'view=team&team='+team.id);assert.ok(availability.items.some(x=>x.personId===peer.id));assert.ok(availability.items.every(x=>x.leaveType==='annual'&&[staff.id,peer.id].includes(x.personId)));
  assert.throws(()=>read(leader,'view=team&team=forged'),e=>e.status===403);assert.throws(()=>read(peer,'view=team&team='+team.id),e=>e.status===403);assert.throws(()=>read(peer,'team='+team.id),e=>e.status===403);assert.throws(()=>read(peer,'view=personal&person='+staff.id),e=>e.status===403);
  for(const viewer of [admin,owner]){assert.equal(read(viewer).calendars.canViewOthers,true);const other=read(viewer,'view=person&person='+staff.id);assert.ok(other.items.some(x=>x.kind==='sick'));assert.ok(other.items.some(x=>x.id===privateEvent.id));assert.doesNotMatch(JSON.stringify(other),/Private medical reason/);}
  staff.supervisorId=peer.id;assert.throws(()=>read(manager,'view=reports'),e=>e.status===403,'report reassignment immediately revokes access');staff.supervisorId=manager.id;
  leader.jobTitle='Member';assert.throws(()=>read(leader,'view=team&team='+team.id),e=>e.status===403,'role change revokes team access');leader.jobTitle='Team Leader';
  const multi=make('Multi','Horizon Advertising','Design','Member',{otherRoles:[{company:'HN Group',department:'Operations',jobTitle:'Team Leader'}]});
  assert.equal(read(multi).calendars.teams.length,1);const ownLogin=store.createLogin({displayName:'Profile fixture',username:'profile.fixture@hngroup.org.uk',profiles:[{personId:multi.id,company:'Horizon Advertising'},{personId:multi.id,company:'HN Group'}]}).login;
  const profiles=store.loginProfiles(ownLogin);assert.equal(read(store.viewOf(ownLogin,profiles.find(p=>p.company==='Horizon Advertising'))).calendars.teams.length,0);assert.equal(read(store.viewOf(ownLogin,profiles.find(p=>p.company==='HN Group'))).calendars.teams.length,1);
  const cross=make('Cross','Horizon Network','Operations','Member',{supervisorId:manager.id,supervisorCompany:'HN Group'});
  assert.ok(read(manager).calendars.reports>=2);
  const noInherited=make('Independent','HN Group','Sales','Member',{supervisorId:manager.id,otherRoles:[{company:'Horizon Network',jobTitle:'Member'}]});
  noInherited.otherRoles[0].supervisorPosition=null;noInherited.otherRoles[0].supervisorId=null;
  assert.equal(service.roles(noInherited).find(r=>r.company==='Horizon Network').supervisorId,null,'explicit no-supervisor profiles never inherit another company manager');
  assert.throws(()=>service.read(staff,new URLSearchParams('from=2026-02-01&to=2026-02-31')),e=>e.status===400);assert.throws(()=>service.read(staff,new URLSearchParams('from=2026-11-01&to=2027-12-01')),e=>e.status===400);
  assert.throws(()=>calendar.saveEvent({title:'Bad attendees',startDate:'2026-11-20',visibility:'private',attendeeIds:['forged']},owner),/current staff/);
  calendar.saveEvent({title:'Edited private meeting',startDate:'2026-11-13'},owner,privateEvent);assert.equal(privateEvent.visibility,'private','legacy partial updates do not publish private meetings');assert.deepEqual(privateEvent.attendeeIds,[staff.id]);
  leave.cancel(annual,staff);assert.equal(read(staff).items.some(x=>x.id==='lv-'+annual.id),false,'HR cancellation disappears without a copied calendar');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
