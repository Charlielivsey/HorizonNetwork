'use strict';
// What an investor holds, worked out from the Company Register. An investor is linked to the names
// they're recorded under on the register (a person, a company, or several). Their direct holdings are
// the companies where one of those names is a current person with significant control. A holding's
// value is its share of the company's latest valuation, which staff record on this site (the
// register doesn't hold valuations). Companies owned through a direct holding are listed as
// interests held through it. Each company's valuation is its own value, so the investor's value also
// includes their effective share of every company their holdings own, all the way down (the user's
// request, 7 November 2026: "Value should show percentage of the value of subsidiaries and everything").
// A company owned along several routes (for example 51% through one company and 49% through another)
// counts the shares of all of them.
const register = require('./register');

function directHoldings(names, valuations) {
  const wanted = names.map((n) => String(n).trim().toLowerCase()).filter(Boolean);
  const out = [];
  for (const c of register.all()) {
    for (const o of c.owners || []) {
      if (!wanted.includes(String(o.name || '').trim().toLowerCase())) continue;
      const share = register.sharePercent(o), history = (valuations[c.slug] || []).slice().sort((a, b) => a.asOf.localeCompare(b.asOf) || a.at.localeCompare(b.at));
      const latest = history[history.length - 1] || null, previous = history[history.length - 2] || null;
      out.push({
        company: c, holder: o.name, kind: o.kind, share, shareText: register.shareText(o), control: o.control || [], notified: o.notified || '',
        classes: o.classes || null, classCIssuedBy: o.classCIssuedBy || '', votes: typeof o.votes === 'number' ? o.votes : null, votingControl: !!o.votingControl, sharedVotingControl: !!o.sharedVotingControl, sharedWith: Array.isArray(o.sharedWith) ? o.sharedWith.map(String) : [],
        valuation: latest, value: latest && share !== null ? Math.round(latest.amount * share) / 100 : null,
        previousValue: previous && share !== null ? Math.round(previous.amount * share) / 100 : null,
        history: share === null ? [] : history.map((v) => ({ asOf: v.asOf, value: Math.round(v.amount * share) / 100 })),
      });
    }
  }
  return out.sort((a, b) => (b.value || 0) - (a.value || 0) || register.displayName(a.company).localeCompare(register.displayName(b.company)));
}

// Companies owned through the investor's direct holdings, with the effective share: the sum, over every route from a
// direct holding, of the shares multiplied along the route (null when a step has no exact percentage).
function indirectInterests(direct, valuations) {
  const all = register.all(), directSlugs = new Set(direct.map((h) => h.company.slug));
  const owned = (parent) => {
    const out = [];
    for (const c of all) for (const o of c.owners || []) {
      const owner = o.kind === 'Individual' ? null : register.companyNamed(o.name);
      if (owner && owner.slug === parent.slug) out.push({ company: c, share: register.sharePercent(o) });
    }
    return out;
  };
  const found = new Map();
  const walk = (parent, fraction, path) => {
    for (const { company: c, share } of owned(parent)) {
      if (path.some((p) => p.slug === c.slug) || c.slug === parent.slug) continue; // never round in circles
      const effective = fraction !== null && share !== null ? fraction * share / 100 : null;
      const route = path.concat(parent);
      const f = found.get(c.slug) || { company: c, through: route, routes: [], share: 0, unknown: false };
      f.routes.push(route);
      if (effective === null) f.unknown = true; else f.share += effective;
      found.set(c.slug, f);
      walk(c, effective, route);
    }
  };
  for (const h of direct) walk(h.company, h.share, []);
  return [...found.values()].filter((f) => !directSlugs.has(f.company.slug) || f.share > 0).map((f) => {
    const share = f.unknown && !f.share ? null : f.share;
    const v = valued(f.company, share, valuations || {});
    return { company: f.company, through: f.through, routes: f.routes, share, shareText: share !== null ? round(share) + '%' : 'Not recorded', ...v };
  });
}
// A holding's value at the company's latest valuation, the one before it, and at every valuation.
function valued(c, share, valuations) {
  const history = (valuations[c.slug] || []).slice().sort((a, b) => a.asOf.localeCompare(b.asOf) || a.at.localeCompare(b.at));
  const latest = history[history.length - 1] || null, previous = history[history.length - 2] || null;
  return { valuation: latest, value: latest && share !== null ? Math.round(latest.amount * share) / 100 : null,
    previousValue: previous && share !== null ? Math.round(previous.amount * share) / 100 : null,
    history: share === null ? [] : history.map((v) => ({ asOf: v.asOf, value: Math.round(v.amount * share) / 100 })) };
}
const round = (n) => Math.round(n * 100) / 100;

function summary(names, valuations) {
  const direct = directHoldings(names, valuations), indirect = indirectInterests(direct, valuations);
  // Everything counts: direct holdings and the share of every company owned through them.
  const all = direct.concat(indirect.filter((i) => i.share !== null && i.share > 0));
  const valuedAll = all.filter((h) => h.value !== null);
  const total = valuedAll.reduce((s, h) => s + h.value, 0);
  const previous = valuedAll.length && valuedAll.every((h) => h.previousValue !== null) ? valuedAll.reduce((s, h) => s + h.previousValue, 0) : null;
  // Portfolio value at each valuation date (each holding counts at its latest valuation on or before it).
  const dates = [...new Set(valuedAll.flatMap((h) => h.history.map((p) => p.asOf)))].sort();
  const series = dates.map((d) => ({ asOf: d, value: round(valuedAll.reduce((s, h) => { const p = h.history.filter((x) => x.asOf <= d).pop(); return s + (p ? p.value : 0); }, 0)) }));
  const directTotal = round(direct.filter((h) => h.value !== null).reduce((s, h) => s + h.value, 0));
  return { direct, indirect, total: round(total), directTotal, indirectTotal: round(total - directTotal), previous, unvalued: all.length - valuedAll.length, series };
}

module.exports = { summary, directHoldings, indirectInterests };
