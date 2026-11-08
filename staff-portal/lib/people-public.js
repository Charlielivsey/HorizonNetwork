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
  return [{ company: p.company, jobTitle: p.jobTitle || '', department: p.department || '', supervisorId: p.supervisorId || null, supervisorCompany: p.supervisorCompany || null, supervisorPosition: p.supervisorPosition, main: true },
    ...(p.otherRoles || []).map((r) => ({ company: r.company, jobTitle: r.jobTitle || p.jobTitle || '', department: r.department || p.department || '', supervisorId: r.supervisorId || null, supervisorCompany: r.supervisorCompany || null, supervisorPosition: r.supervisorPosition, main: false }))]
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
    temporary: p.temporary === true,
    updatedAt: p.updatedAt || null,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { companies: store.COMPANIES.slice(), people: out, positions: positionsOf(store, list) };
}
// Every position at every company, held or vacant (the user's request, 7 November 2026: "this should show all roles
// and positions for all companies, not just the taken ones"), with who it reports to (People → Job descriptions →
// Positions) and who holds it. Titles people hold that aren't in a company's list are added at the end.
function positionsOf(store, list) {
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const lists = store.positions ? store.positions() : {}, reports = store.positionReports ? store.positionReports() : {};
  const out = [];
  for (const company of store.COMPANIES) {
    const titles = (lists[company] || []).slice();
    for (const p of list) for (const r of rolesOf(p)) if (r.company === company && r.jobTitle && !titles.some((t) => same(t, r.jobTitle))) titles.push(r.jobTitle);
    for (const title of titles) {
      const usual = (reports[company] || {})[title] || null;
      const groups = new Map();
      for (const p of list) for (const r of rolesOf(p)) {
        if (r.company !== company || !same(r.jobTitle, title)) continue;
        let to = usual;
        // A saved employee override takes precedence, including an explicit "no supervisor".
        // Keep a position link when its supervisor is vacant; old person-based links still resolve too.
        if (r.supervisorPosition !== undefined) to = r.supervisorPosition;
        else if (r.supervisorId) {
          const boss = list.find((x) => x.id === r.supervisorId);
          const role = boss && rolesOf(boss).find((x) => x.company === (r.supervisorCompany || company));
          to = role ? { company: role.company, title: role.jobTitle } : null;
        }
        to = to ? { company: to.company, title: to.title } : null;
        const key = JSON.stringify(to);
        if (!groups.has(key)) groups.set(key, { reportsTo: to, holders: [] });
        const holders = groups.get(key).holders;
        if (!holders.includes(p.id)) holders.push(p.id);
      }
      if (!groups.size) groups.set('vacant', { reportsTo: usual, holders: [] });
      // Holders of the same position may report to different positions. Separate those branches
      // instead of silently moving every holder when only one person's supervisor changed.
      for (const [key, group] of groups) out.push({ company, title, ...group,
        key: company + '\n' + title.toLowerCase() + '\n' + key, listed: (lists[company] || []).includes(title) });
    }
  }
  return out;
}
function avatarOf(store, id) {
  const p = people(store).find((x) => x.id === id);
  return p ? store.avatarFile(p) : null;
}
module.exports = { publicPeople, avatarOf, listed };
