'use strict';
// HN Group People (people.hngroup.org.uk; the user's request, 7 November 2026: "a people site … a staff list for all
// companies, org charts, overall org chart that has them all in one, and a place for staff to write little about me's.
// About mes will be written in the staff portal and all info will sync … The site will also be fully public").
// Only what a public staff list needs: display name, every role (company, position, department, who it reports to),
// About me (unless they untick "Show my About me on HN Group People"), skills, languages and whether they have a picture.
// Never emails, phone numbers, locations, birthdays or anything else from the record.
function boardLabel(company) { return company === 'Horizon Network' ? 'Board of Directors' : company + ' Board of Directors'; }
function listed(store, p) {
  // Employment status controls the directory; sign-in access is managed separately.
  return !!p && !p.system && !p.offboardedAt;
}
function people(store) {
  return store.employees().filter((p) => listed(store, p));
}
function rolesOf(p) {
  return [{ company: p.company, jobTitle: p.jobTitle || '', department: p.department || '', supervisorId: p.supervisorId || null, supervisorCompany: p.supervisorCompany || null, supervisorPosition: p.supervisorPosition, temporary:!!p.temporary, main: true },
    ...(p.otherRoles || []).map((r) => ({ company: r.company, jobTitle: r.jobTitle || p.jobTitle || '', department: r.department || p.department || '', supervisorId: r.supervisorId || null, supervisorCompany: r.supervisorCompany || null, supervisorPosition: r.supervisorPosition, temporary:!!r.temporary, main: false }))]
    .filter((r) => r.company);
}
function publicPeople(store) {
  return projectPeople(store, people(store));
}
// Both directories use active employment records and the same public-safe fields.
function staffOrgChart(store) {
  return projectPeople(store, people(store));
}
function projectPeople(store, list) {
  const ids = new Set(list.map((p) => p.id));
  const out = list.map((p) => ({
    id: p.id,
    name: p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' '),
    roles: rolesOf(p).map((r) => ({ company: r.company, jobTitle: r.jobTitle, department: r.department, main: r.main, temporary:r.temporary,
      reportsTo: r.supervisorPosition?.kind === 'board' ? {...r.supervisorPosition,board:true} : r.supervisorId && r.supervisorId !== p.id && ids.has(r.supervisorId) ? { id: r.supervisorId, company: r.supervisorCompany || r.company } : null })),
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
        to = to ? { company: to.company, title: to.title, ...(to.kind === 'board'?{kind:'board'}:{}) } : null;
        const key = JSON.stringify(to);
        if (!groups.has(key)) groups.set(key, { reportsTo: to, holders: [], temporaryHolders: [] });
        const holders = groups.get(key).holders;
        if (!holders.includes(p.id)) holders.push(p.id);
        if (r.temporary && !groups.get(key).temporaryHolders.includes(p.id)) groups.get(key).temporaryHolders.push(p.id);
      }
      if (!groups.size) groups.set('vacant', { reportsTo: usual, holders: [], temporaryHolders: [] });
      // Holders of the same position may report to different positions. Separate those branches
      // instead of silently moving every holder when only one person's supervisor changed.
      for (const [key, group] of groups) out.push({ company, title, ...group,
        key: company + '\n' + title.toLowerCase() + '\n' + key, listed: (lists[company] || []).includes(title) });
    }
  }
  for(const node of out.slice())if(node.reportsTo?.kind==='board'&&!out.some(x=>x.company===node.reportsTo.company&&x.title===node.reportsTo.title)){
    const company=node.reportsTo.company;
    out.push({company,title:node.reportsTo.title,displayTitle:boardLabel(company),key:company+'\n'+node.reportsTo.title.toLowerCase(),collective:true,holders:[],temporaryHolders:[],reportsTo:null,listed:true});
  }
  return out;
}
function avatarOf(store, id) {
  const p = people(store).find((x) => x.id === id);
  return p ? store.avatarFile(p) : null;
}
module.exports = { publicPeople, staffOrgChart, avatarOf, listed, boardLabel };
