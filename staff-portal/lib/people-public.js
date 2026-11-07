'use strict';
// HN Group People (people.hngroup.org.uk; the user's request, 7 November 2026: "a people site … a staff list for all
// companies, org charts, overall org chart that has them all in one, and a place for staff to write little about me's.
// About mes will be written in the staff portal and all info will sync … The site will also be fully public").
// Only what a public staff list needs: display name, every role (company, position, department, who it reports to),
// About me (unless they untick "Show my About me on HN Group People"), skills, languages and whether they have a picture.
// Never emails, phone numbers, locations, birthdays or anything else from the record.
function listed(store, p) {
  if (!p || p.system) return false;
  const logins = store.loginsForId ? store.loginsForId(p.id) : [];
  // Someone whose sign-in accounts are all switched off has left; records without an account are still staff.
  return !logins.length || logins.some((l) => l.account && l.account.enabled);
}
function people(store) {
  return store.employees().filter((p) => listed(store, p));
}
function rolesOf(p) {
  return [{ company: p.company, jobTitle: p.jobTitle || '', department: p.department || '', supervisorId: p.supervisorId || null, supervisorCompany: p.supervisorCompany || null, main: true },
    ...(p.otherRoles || []).map((r) => ({ company: r.company, jobTitle: r.jobTitle || p.jobTitle || '', department: r.department || p.department || '', supervisorId: r.supervisorId || null, supervisorCompany: r.supervisorCompany || null, main: false }))]
    .filter((r) => r.company);
}
function publicPeople(store) {
  const list = people(store), ids = new Set(list.map((p) => p.id));
  const out = list.map((p) => ({
    id: p.id,
    name: p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' '),
    roles: rolesOf(p).map((r) => ({ company: r.company, jobTitle: r.jobTitle, department: r.department, main: r.main,
      reportsTo: r.supervisorId && r.supervisorId !== p.id && ids.has(r.supervisorId) ? { id: r.supervisorId, company: r.supervisorCompany || r.company } : null })),
    about: p.peopleBio === false ? '' : String(p.bio || ''),
    skills: p.skills || [], languages: p.languages || [],
    photo: !!store.avatarFile(p),
    updatedAt: p.updatedAt || null,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { companies: store.COMPANIES.slice(), people: out };
}
function avatarOf(store, id) {
  const p = people(store).find((x) => x.id === id);
  return p ? store.avatarFile(p) : null;
}
module.exports = { publicPeople, avatarOf, listed };
