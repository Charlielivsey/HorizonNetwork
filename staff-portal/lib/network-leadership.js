'use strict';
// Public Horizon Network leadership only. Match company and department on the SAME role.
function networkRole(person) {
  if (person.system) return null;
  return [{company:person.company,department:person.department,jobTitle:person.jobTitle}, ...(person.otherRoles || [])]
    .find(role => role.company === 'Horizon Network' && String(role.department || '').trim().toLowerCase() === 'network leadership') || null;
}
function members(store) {
  return store.employees().filter(person => networkRole(person)).sort((a,b)=>a.displayName.localeCompare(b.displayName));
}
// "About me" is published too, unless the person has unticked "Show on the Horizon Network website".
function publicMembers(store) {
  return members(store).map(person => ({name:person.displayName,jobTitle:networkRole(person).jobTitle || '',phone:person.phone || '',location:person.location || '',timezone:person.timezone || '',skills:person.skills || [],languages:person.languages || [],bio:person.bioPublic === false ? '' : String(person.bio || ''),avatarUrl:store.avatarFile(person)?'/api/leadership/avatar/'+person.id:null}));
}
// HN Group's leadership (the user's request, 7 November 2026: the same cards "but for the main hngroup website"):
// everyone holding one of HN Group's positions (People → Job descriptions → Positions; Board Chairman, Board Director,
// Board Member, Chief Executive Officer, Chief Operating Officer, Executive Assistant …) on a role at HN Group, ordered
// as that list is. The same public fields and "About me" rule as Horizon Network's.
function groupRole(person, store) {
  if (person.system) return null;
  const titles = ((store.positions && store.positions()['HN Group']) || []).map(t => t.trim().toLowerCase());
  return [{company:person.company,jobTitle:person.jobTitle}, ...(person.otherRoles || []).map(r => ({company:r.company,jobTitle:r.jobTitle || person.jobTitle}))]
    .find(role => role.company === 'HN Group' && titles.includes(String(role.jobTitle || '').trim().toLowerCase())) || null;
}
function groupMembers(store) {
  const titles = ((store.positions && store.positions()['HN Group']) || []).map(t => t.trim().toLowerCase());
  const rank = p => titles.indexOf(String(groupRole(p, store).jobTitle).trim().toLowerCase());
  return store.employees().filter(p => groupRole(p, store)).sort((a,b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
}
function groupPublicMembers(store) {
  return groupMembers(store).map(person => ({name:person.displayName,jobTitle:groupRole(person, store).jobTitle || '',phone:person.phone || '',location:person.location || '',timezone:person.timezone || '',skills:person.skills || [],languages:person.languages || [],bio:person.bioPublic === false ? '' : String(person.bio || ''),avatarUrl:store.avatarFile(person)?'/api/leadership/avatar/'+person.id:null}));
}
module.exports={networkRole,members,publicMembers,groupRole,groupMembers,groupPublicMembers};
