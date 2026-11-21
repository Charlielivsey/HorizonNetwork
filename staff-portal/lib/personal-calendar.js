'use strict';
// Read-through calendar projection. HR leave.json and events.json remain authoritative.
const crypto = require('node:crypto');
const store = require('./store');
const calendar = require('./calendar');
const leave = require('./leave');
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
const normal = value => String(value || '').trim().toLowerCase();
const teamKey = role => crypto.createHash('sha256').update(role.company+'\0'+normal(role.department)).digest('hex').slice(0,16);
function roles(person) {
  return [{company:person.company,department:person.department || '',jobTitle:person.jobTitle || '',supervisorId:person.supervisorId || null,supervisorCompany:person.supervisorCompany || null}].concat((person.otherRoles || []).map(r=>({
    company:r.company,department:r.department || person.department || '',jobTitle:r.jobTitle || person.jobTitle || '',
    supervisorId:Object.prototype.hasOwnProperty.call(r,'supervisorPosition') ? r.supervisorId || null : r.supervisorId || person.supervisorId || null,supervisorCompany:r.supervisorId ? r.supervisorCompany || null : Object.prototype.hasOwnProperty.call(r,'supervisorPosition') ? null : person.supervisorCompany || null,
  })));
}
function access(viewer) {
  const record = store.getPerson(viewer.id);
  // Availability follows all saved roles and linked company profiles, regardless
  // of the company selected at sign-in. Never trust requested person/team IDs.
  const ownRoles = new Map();
  const add = (person, role) => ownRoles.set(person.id+'\0'+role.company,{...role,personId:person.id,record:person});
  if(record)roles(record).forEach(role=>add(record,role));
  const login = viewer.loginId && store.getLogin(viewer.loginId);
  if(login)for(const profile of store.loginProfiles(login)){
    const person = store.getPerson(profile.personId);
    if(person && !person.leftAt)for(const role of roles(person))if(role.company===profile.company)add(person,role);
  }
  const own = [...ownRoles.values()],selfIds = new Set(own.map(r=>r.personId));
  const people = store.employees().filter(p=>!p.leftAt);
  const full = store.hasOwnerAccess(viewer) || store.can(viewer,'system.admin');
  const teams = [...new Map(own.filter(r=>/\bteam\s+(?:leader|lead)\b/i.test(r.jobTitle)).map(r=>[teamKey(r),{
    id:teamKey(r),company:r.company,department:r.department,label:r.company+(r.department ? ' · '+r.department : ''),
  }])).values()];
  const reports = people.filter(p=>!selfIds.has(p.id) && roles(p).some(r=>own.some(b=>{
    if(r.supervisorId!==b.personId)return false;
    const supervisorCompany=r.supervisorCompany || (roles(b.record).some(role=>role.company===r.company) ? r.company : b.record.company);
    return b.company===supervisorCompany;
  })));
  const teamMembers = team => people.filter(p=>!selfIds.has(p.id) && roles(p).some(r=>r.company===team.company && (!team.department || normal(r.department)===normal(team.department))));
  return {full,teams,reports,teamMembers,people};
}
function read(viewer,query) {
  const from=query.get('from') || new Date().toISOString().slice(0,10),to=query.get('to') || from;
  const valid=day=>/^\d{4}-\d{2}-\d{2}$/.test(day) && !isNaN(Date.parse(day+'T00:00:00Z')) && new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
  if(!valid(from)||!valid(to)||to<from)fail(400,'Choose a valid date range.');
  if((Date.parse(to)-Date.parse(from))/86400000>120)fail(400,'Choose a shorter date range.');
  const permissions=access(viewer),requested=query.get('person') || query.get('personId');
  const view=query.get('view') || (requested && requested!==viewer.id ? 'person' : 'personal');
  if(!['personal','person','reports','team'].includes(view))fail(400,'Choose a valid calendar view.');
  if(query.has('team') && view!=='team')fail(403,'Choose one of your permitted team calendars.');
  if(requested && !['personal','person'].includes(view))fail(400,'Choose either a person or an availability calendar.');
  let subjects=[],availability=false,label='My calendar';
  if(view==='personal'){
    if(requested && requested!==viewer.id)fail(403,'You cannot open that personal calendar.');
    subjects=[viewer];
  }else if(view==='person'){
    if(!requested)fail(400,'Choose a person.');
    const subject=store.getPerson(requested);
    if(!subject)fail(403,'You cannot open that calendar.');
    if(subject.id===viewer.id)subjects=[viewer];
    else if(permissions.full){subjects=[subject];label=subject.displayName+'’s calendar';}
    else if(permissions.reports.some(p=>p.id===subject.id)||permissions.teams.some(t=>permissions.teamMembers(t).some(p=>p.id===subject.id))){
      subjects=[subject];availability=true;label=subject.displayName+' · annual leave';
    }else fail(403,'You cannot open that calendar.');
  }else if(view==='reports'){
    if(!permissions.reports.length)fail(403,'No direct-report calendar is available to this profile.');
    subjects=permissions.reports;availability=true;label='Direct reports · annual leave';
  }else{
    const team=permissions.teams.find(t=>t.id===(query.get('team') || (permissions.teams.length===1?permissions.teams[0].id:'')));
    if(!team)fail(403,'You cannot open that team calendar.');
    subjects=permissions.teamMembers(team);availability=true;label=team.label+' · annual leave';
  }
  let items=[];
  for(const subject of subjects){
    if(!availability)items.push(...calendar.itemsBetween(subject,from,to).filter(item => item.kind !== 'event' || item.visibility === 'private' || !(item.companies || []).length || roles(subject).some(role => item.companies.includes(role.company))).map(item=>({...item,canEdit:item.kind==='event' && store.can(viewer,'events.manage')})));
    items.push(...leave.personalCalendarItems(subject.id,from,to,{annualOnly:availability}));
  }
  items.sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.startTime||'').localeCompare(b.startTime||'')||a.title.localeCompare(b.title));
  const brief=p=>({id:p.id,displayName:p.displayName,company:p.company});
  return {items,canManage:store.can(viewer,'events.manage')&&!availability,types:calendar.EVENT_TYPES,
    scope:{view,access:availability?'annual-only':'personal',label,person:subjects.length===1?brief(subjects[0]):null},
    calendars:{canViewOthers:permissions.full,people:permissions.full?permissions.people.map(brief).sort((a,b)=>a.displayName.localeCompare(b.displayName)):[],reports:permissions.reports.length,teams:permissions.teams},
    eventPeople:store.can(viewer,'events.manage')?permissions.people.map(brief):[],
  };
}
module.exports={read,access,roles};
