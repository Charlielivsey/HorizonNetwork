'use strict';
// What an investor holds, worked out from the Company Register. An investor is linked to the names
// they're recorded under on the register (a person, a company, or several). Their direct holdings are
// the companies where one of those names is a current person with significant control. A holding's
// value is its share of the company's latest valuation, which staff record on this site (the
// register doesn't hold valuations). Companies owned through a direct holding are listed as
// interests held through it; their value is part of the direct holding's, so it isn't added again.
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
        valuation: latest, value: latest && share !== null ? Math.round(latest.amount * share) / 100 : null,
        previousValue: previous && share !== null ? Math.round(previous.amount * share) / 100 : null,
        history: share === null ? [] : history.map((v) => ({ asOf: v.asOf, value: Math.round(v.amount * share) / 100 })),
      });
    }
  }
  return out.sort((a, b) => (b.value || 0) - (a.value || 0) || register.displayName(a.company).localeCompare(register.displayName(b.company)));
}

// Companies owned through the investor's direct holdings, with the effective share where every step
// in the chain records an exact percentage.
function indirectInterests(direct) {
  const out = [], seen = new Set(direct.map((h) => h.company.slug));
  const walk = (parent, fraction, path) => {
    for (const c of register.all()) {
      for (const o of c.owners || []) {
        const owner = o.kind === 'Individual' ? null : register.companyNamed(o.name);
        if (!owner || owner.slug !== parent.slug || seen.has(c.slug)) continue;
        seen.add(c.slug);
        const share = register.sharePercent(o), effective = fraction !== null && share !== null ? fraction * share / 100 : null;
        out.push({ company: c, through: path.concat(parent), share: effective, shareText: effective !== null ? round(effective) + '%' : 'Not recorded' });
        walk(c, effective, path.concat(parent));
      }
    }
  };
  for (const h of direct) walk(h.company, h.share, []);
  return out;
}
const round = (n) => Math.round(n * 100) / 100;

function summary(names, valuations) {
  const direct = directHoldings(names, valuations);
  const valued = direct.filter((h) => h.value !== null);
  const total = valued.reduce((s, h) => s + h.value, 0);
  const previous = valued.every((h) => h.previousValue !== null) && valued.length ? valued.reduce((s, h) => s + h.previousValue, 0) : null;
  // Portfolio value at each valuation date (each holding counts at its latest valuation on or before it).
  const dates = [...new Set(valued.flatMap((h) => h.history.map((p) => p.asOf)))].sort();
  const series = dates.map((d) => ({ asOf: d, value: round(valued.reduce((s, h) => { const p = h.history.filter((x) => x.asOf <= d).pop(); return s + (p ? p.value : 0); }, 0)) }));
  return { direct, indirect: indirectInterests(direct), total: round(total), previous, unvalued: direct.length - valued.length, series };
}

module.exports = { summary, directHoldings, indirectInterests };
