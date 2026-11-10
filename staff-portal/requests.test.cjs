'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('requests preserve legacy tickets and enforce team, company, handler, internal-note and routing privacy',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-requests-unit-'));const store=require('./lib/store'),desk=require('./lib/helpdesk');
 try{
  store.init(dir);const make=(name)=>store.saveEmployee({firstName:name,lastName:'Fixture',company:'HN Group',jobTitle:'Member',emails:[{local:name.toLowerCase(),domain:'hngroup.org.uk',primary:true}]});
  const requester=make('Requester'),other=make('Other'),it=make('Technology'),hr=make('HumanResources'),compliance=make('Compliance'),leadership=make('Leadership'),admin=make('AdminOnly');
  const grant=(person,key)=>{store.issueTemporaryPassword(person);const role=store.saveRole({name:key,permissions:[key]});store.setRoleMembers(role,[person.id]);return role;};
  grant(it,'helpdesk.manage');const hrRole=grant(hr,'requests.hr');grant(compliance,'requests.compliance');grant(leadership,'requests.leadership');grant(admin,'system.admin');const owner=store.allPeople().find(p=>p.system);
  const legacy={id:'0123456789abcdef',number:1001,subject:'Existing ticket',category:'hardware',priority:'normal',status:'waiting',createdBy:requester.id,assigneeId:it.id,createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z',closedAt:null,messages:[{id:'old-message',authorId:requester.id,body:'Existing history',internal:false,at:'2026-11-01T12:00:00Z',attachments:[{id:'legacy-attachment',name:'existing.png'}]}]};
  fs.writeFileSync(path.join(dir,'helpdesk.json'),JSON.stringify({tickets:[legacy],nextNumber:1002}));desk.init(dir);
  assert.equal(desk.fullView(desk.getTicket(legacy.id),it).team,'technology');assert.equal(desk.list(hr).length,0);assert.equal(desk.list(admin).length,0);
  assert.deepEqual(Object.values(desk.routing()).map(x=>x.label),['Leadership Team','Human Resources Team','Internal Technology Team','Compliance Team']);
  const handlers={leadership,hr,technology:it,compliance},tickets={};
  for(const team of Object.keys(handlers)){
   const ticket=desk.createTicket(requester,{team,company:'Horizon Network',subject:'Private '+team,body:'Request details',category:'other',priority:'high'});tickets[team]=ticket;
   assert.equal(ticket.company,'Horizon Network');assert.ok(desk.canSee(handlers[team],ticket));assert.ok(desk.canSee(owner,ticket));assert.ok(desk.canSee(requester,ticket));
   assert.equal(desk.canSee(other,ticket),false);assert.equal(desk.canSee(admin,ticket),false,'System Admin permission alone does not grant private queue access');
   for(const [otherTeam,person] of Object.entries(handlers))if(otherTeam!==team){assert.equal(desk.canSee(person,ticket),false);assert.throws(()=>desk.reply(ticket,person,{body:'Forged reply'}),e=>e.status===403);assert.throws(()=>desk.update(ticket,person,{status:'resolved'}),e=>e.status===403);assert.equal(desk.recipients(ticket).includes(person.id),false);}
   assert.equal(desk.fullView(ticket,handlers[team]).agents.some(x=>x.id===other.id),false);
  }
  const ticket=tickets.hr;
  desk.reply(ticket,hr,{body:'Private handler note',internal:true});assert.doesNotMatch(JSON.stringify(desk.fullView(ticket,requester)),/Private handler note/);assert.equal(desk.list(requester).find(x=>x.id===ticket.id).lastBy,'Requester Fixture','internal author is not exposed through list metadata');
  assert.throws(()=>desk.reply(ticket,requester,{body:'Forged note',internal:true}),e=>e.status===403);
  assert.throws(()=>desk.update(ticket,requester,{assigneeId:hr.id}),e=>e.status===403);
  assert.throws(()=>desk.update(ticket,hr,{team:'technology'}),/cannot be changed/);assert.throws(()=>desk.update(ticket,hr,{company:'HN Group'}),/cannot be changed/);
  assert.throws(()=>desk.update(ticket,hr,{status:'resolved',assigneeId:it.id}),/authorized handler/);assert.equal(ticket.status,'open','validation does not partly mutate a request');
  desk.update(ticket,hr,{assigneeId:hr.id,status:'waiting'});assert.deepEqual(desk.replyRecipients(ticket,requester),[hr.id]);desk.reply(ticket,requester,{body:'Additional information'});assert.equal(ticket.status,'open');
  desk.createTicket(requester,{team:'hr',company:'HN Group',subject:'Another private request',body:'Details'});
  assert.ok(desk.badgeCount(hr)>0);assert.equal(desk.badgeCount(other),0);store.setRoleMembers(hrRole,[]);assert.equal(desk.canSee(hr,ticket),false);assert.equal(desk.replyRecipients(ticket,requester).includes(hr.id),false,'revoked assignees receive no new notifications');assert.equal(desk.badgeCount(hr),0);
  for(const input of [{team:'it',company:'HN Group'},{team:'hr'},{team:'hr',company:'Invented company'},{team:'hr',company:'HN Group',category:'hardware'},{team:'hr',company:'HN Group',priority:'invalid'},{team:'__proto__',company:'HN Group'}])assert.throws(()=>desk.createTicket(requester,{subject:'Invalid',body:'Details',...input}),e=>e.status===400);
  const sharedRole=store.saveRole({name:'Linked HR handler',permissions:['requests.hr']});
  const sharedLogin=store.createLogin({displayName:'Linked handler',username:'linked.handler@hngroup.org.uk',roleIds:[sharedRole.id],profiles:[{personId:other.id,company:'HN Group'}]}).login;
  const sharedViewer=store.viewOf(sharedLogin,store.loginProfiles(sharedLogin)[0]);assert.ok(desk.canSee(sharedViewer,ticket));assert.ok(desk.recipients(ticket).includes(other.id),'enabled handler accounts on linked staff profiles receive routing');desk.update(ticket,owner,{assigneeId:other.id});
  sharedLogin.account.enabled=false;assert.equal(desk.recipients(ticket).includes(other.id),false,'disabled handler accounts are not notification recipients');assert.equal(desk.replyRecipients(ticket,requester).includes(other.id),false);
  assert.equal(desk.statsBetween('2026-01-01','2027-01-01',it).opened,2,'IT reports count only tickets it can see');
  const automatic=desk.createTicket(requester,{subject:'Legacy/security client',body:'Details',category:'access'});assert.equal(automatic.team,'technology');assert.equal(automatic.company,'HN Group');
  desk.init(dir);assert.deepEqual(desk.getTicket(legacy.id),legacy,'legacy message and attachment metadata stays intact');assert.equal(desk.getTicket(ticket.id).team,'hr');assert.equal(desk.getTicket(ticket.id).company,'Horizon Network');
  for(const key of ['requests.leadership','requests.hr','requests.compliance'])assert.ok(store.GUARDED_PERMISSIONS.includes(key));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
