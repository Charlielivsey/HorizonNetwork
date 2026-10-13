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
function publicMembers(store) {
  return members(store).map(person => ({name:person.displayName,jobTitle:networkRole(person).jobTitle || '',avatarUrl:store.avatarFile(person)?'/api/leadership/avatar/'+person.id:null}));
}
module.exports={networkRole,members,publicMembers};
