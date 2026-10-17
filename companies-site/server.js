'use strict';
// Company Register — companies.hngroup.org.uk, branded as Horizon Holding Co and separate from the other group websites.
// Public search and records for group
// companies (overview, filing history, officers, persons with significant control and charges),
// customer accounts that anyone can create (document requests, mistake reports and filing
// submissions), and a staff administration area with its own staff accounts (lib/staff.js).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const store = require('./lib/store');
const staff = require('./lib/staff');
const customers = require('./lib/customers');
const forms = require('./lib/forms');

const PUBLIC = process.env.COMPANIES_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.COMPANIES_DATA_DIR || '/var/lib/hn-companies';
const ORIGIN = process.env.COMPANIES_ORIGIN || 'https://companies.hngroup.org.uk';
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
store.init(DATA_DIR);
staff.ensureDefault();

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }); };
const fmtTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const val = (v) => (v ? esc(v) : '<span class="muted">Not recorded</span>');
const fail = (status, message) => Object.assign(new Error(message), { status });
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

// ---------- Layout ----------

function layout(o) {
  const signedOut = !o.customer && !o.staffUser;
  const nav = o.staffUser
    ? '<a href="/admin">Administration</a><form method="post" action="/staff/logout"><input type="hidden" name="csrf" value="' + esc(o.staffUser.csrf) + '"><button class="nav-button" type="submit">Sign out</button></form>'
    : o.customer ? '<a href="/account">Your account</a><form method="post" action="/account/logout"><input type="hidden" name="csrf" value="' + esc(o.customer.csrf) + '"><button class="nav-button" type="submit">Sign out</button></form>'
      : '<a href="/account/login">Sign in</a><a href="/account/register">Create an account</a><a href="/staff/login" class="staff-link">Staff sign in</a>';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0c0c">' +
    '<title>' + esc(o.title) + ' – Company Register – Horizon Holding Co</title>' + (o.description ? '<meta name="description" content="' + esc(o.description) + '">' : '') + (o.noindex ? '<meta name="robots" content="noindex">' : '') +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/companies.css?v=2"><script src="/assets/companies.js?v=2" defer></script></head><body>' +
    '<a class="skip" href="#main">Skip to main content</a>' +
    '<header class="header"><div class="wrap header-inner"><a class="logo" href="/"><img src="/assets/brand/horizon-holding-co-logo-white.svg" alt="Horizon Holding Co" width="129" height="46"></a>' +
    '<a class="service" href="/">Company Register</a><nav class="header-nav" aria-label="Account">' + nav + '</nav></div></header>' +
    (o.searchBar === false ? '' : '<div class="wrap"><form class="search compact" action="/search" method="get" role="search"><label for="q" class="sr-only">Search for a company or officer</label><input id="q" name="q" type="search" placeholder="Search for a company or officer" value="' + esc(o.q || '') + '" autocomplete="off"><button type="submit" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></button></form></div>') +
    '<main id="main" class="wrap main">' + (o.flash ? '<div class="flash ' + (o.flash.error ? 'error' : '') + '" role="status">' + esc(o.flash.text) + '</div>' : '') + o.body + '</main>' +
    '<footer class="footer"><div class="wrap"><ul class="footer-links"><li><a href="/">Search the register</a></li><li><a href="/about">About this register</a></li>' + (signedOut ? '<li><a href="/account/register">Create an account</a></li>' : '') + '<li><a href="/staff/login">Staff sign in</a></li></ul>' +
    '<div class="footer-meta"><img src="/assets/brand/horizon-holding-co-logo.svg" alt="" width="112" height="40"><p>The Company Register is run by Horizon Holding Co Limited for the companies in its group. It is not the UK government’s Companies House register.</p><p>© ' + new Date().getFullYear() + ' Horizon Holding Co Limited</p></div></div></footer></body></html>';
}

function send(res, status, html, headers) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) });
  res.end(html);
}
function redirect(res, location, cookies) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...(cookies ? { 'Set-Cookie': cookies } : {}) });
  res.end();
}
function page(res, ctx, o, status) { send(res, status || 200, layout({ ...o, customer: ctx.customer, staffUser: ctx.staffUser })); }
function messagePage(res, ctx, status, title, text) {
  page(res, ctx, { title, noindex: true, body: '<section class="panel narrow"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p><p><a class="button" href="/">Go to the register</a></p></section>' }, status);
}
const field = (label, name, value, extra) => '<label>' + esc(label) + (extra && extra.hint ? '<span class="hint">' + esc(extra.hint) + '</span>' : '') +
  (extra && extra.textarea ? '<textarea name="' + name + '" rows="' + (extra.rows || 4) + '"' + (extra.required ? ' required' : '') + ' maxlength="' + (extra.max || 3000) + '">' + esc(value) + '</textarea>'
    : '<input name="' + name + '" type="' + ((extra && extra.type) || 'text') + '" value="' + esc(value) + '"' + (extra && extra.required ? ' required' : '') + (extra && extra.auto ? ' autocomplete="' + extra.auto + '"' : '') + ' maxlength="' + ((extra && extra.max) || 200) + '"' + (extra && extra.number ? ' min="0" max="100" step="0.01" inputmode="decimal"' : '') + '>') + '</label>';
const select = (label, name, options, value, blank) => '<label>' + esc(label) + '<select name="' + name + '">' + (blank !== undefined ? '<option value="">' + esc(blank) + '</option>' : '') +
  options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>';
const csrfField = (token) => '<input type="hidden" name="csrf" value="' + esc(token) + '">';

// ---------- Public pages ----------

function companyCard(c) {
  return '<a class="result" href="/company/' + esc(c.slug) + '"><span class="result-name">' + esc(c.legalName) + '</span>' +
    '<span class="result-meta">' + (c.number ? 'Company number ' + esc(c.number) + ' · ' : '') + (c.status ? esc(c.status) : 'Status not recorded') + (c.incorporated ? ' · Incorporated ' + esc(fmt(c.incorporated)) : '') + '</span>' +
    (c.registeredOffice ? '<span class="result-address">' + esc(c.registeredOffice.replace(/\n/g, ', ')) + '</span>' : '') + '</a>';
}

function homePage(res, ctx) {
  page(res, ctx, { title: 'Find company information', searchBar: false, description: 'Search the Horizon Holding Co Company Register for company records, filing history, officers and persons with significant control.',
    body: '<div class="grid-row"><div class="col-main"><h1 class="heading-xl">Find company information</h1>' +
      '<p class="lead">Search the register for a company’s details, filing history, officers, people with significant control and charges.</p>' +
      '<form class="search big" action="/search" method="get" role="search"><label for="q" class="label-l">Search for a company or officer</label><span class="hint">Enter a company name, company number or officer’s name</span><div class="search-row"><input id="q" name="q" type="search" autocomplete="off" required><button type="submit">Search</button></div></form>' +
      '<h2 class="heading-m">Other things you can do</h2><ul class="link-list">' +
      '<li>Request a copy of a filing or a certificate for a company</li><li>Report a mistake on a company record</li><li>File a change for a company, such as a new address, officer or person with significant control</li></ul>' +
      '<p class="body">Find the company first, then choose what you need from its page. ' + (ctx.customer ? 'You’re signed in, so you’re ready to go.' : 'You’ll need a free account: <a href="/account/register">create an account</a> or <a href="/account/login">sign in</a>.') + '</p></div>' +
      '<aside class="col-side"><div class="side-box"><h2 class="heading-s">Using this register</h2><ul><li><a href="/about">About this register</a></li>' + (ctx.customer ? '<li><a href="/account">Your requests and filings</a></li>' : '<li><a href="/account/login">Sign in to your account</a></li><li><a href="/account/register">Create an account</a></li>') + '<li><a href="/staff/login">Staff sign in</a></li></ul></div></aside></div>' });
}

function searchPage(res, ctx, q) {
  const r = store.search(q);
  const total = r.companies.length + r.officers.length;
  page(res, ctx, { title: q ? 'Search results for ' + q : 'Search', q,
    body: '<h1 class="page-title">Search results</h1><p class="muted">' + (q ? plural(total, 'result', 'results') + ' for “' + esc(q) + '”' : 'Enter a company name, company number or officer name.') + '</p>' +
      (r.companies.length ? '<h2 class="section">Companies</h2><div class="results">' + r.companies.map(companyCard).join('') + '</div>' : '') +
      (r.officers.length ? '<h2 class="section">Officers</h2><div class="results">' + r.officers.map((o) => '<a class="result" href="/company/' + esc(o.company.slug) + '/officers"><span class="result-name">' + esc(o.name) + '</span><span class="result-meta">' + esc(o.role) + ' of ' + esc(o.company.legalName) + (o.resigned ? ' · Resigned ' + esc(fmt(o.resigned)) : o.appointed ? ' · Appointed ' + esc(fmt(o.appointed)) : '') + '</span></a>').join('') + '</div>' : '') +
      (q && !total ? '<div class="panel"><p>No companies or officers match your search. Check the spelling, or try part of the name.</p></div>' : '') });
}

function companyHeader(c, tab, ctx) {
  const tabs = [['', 'Overview'], ['filing-history', 'Filing history'], ['officers', 'People'], ['charges', 'Charges'], ['related-companies', 'Related companies']];
  return '<div class="company-head"><h1 class="heading-l">' + esc(c.legalName) + '</h1>' +
    '<p class="company-number">Company number <strong>' + (c.number ? esc(c.number) : 'not recorded') + '</strong></p>' +
    (c.name && c.name !== c.legalName ? '<p class="muted">Known as ' + esc(c.name) + '</p>' : '') + '</div>' +
    '<nav class="tabs" aria-label="Company record">' + tabs.map(([p, label]) => { const active = tab === p || (p === 'officers' && tab === 'persons-with-significant-control'); return '<a href="/company/' + esc(c.slug) + (p ? '/' + p : '') + '"' + (active ? ' aria-current="page"' : '') + '>' + label + '</a>'; }).join('') + '</nav>' +
    '<div class="actions-row">' + ['request', 'report', 'file'].map((a) => '<a class="button ghost small" href="/company/' + esc(c.slug) + '/' + a + '">' + { request: 'Request a document', report: 'Report a mistake', file: 'File a change' }[a] + '</a>').join('') + '</div>';
}

// A parent company is linked to its own record when it's on the register.
function parentLink(name) {
  const c = store.companies().find((x) => x.legalName.toLowerCase() === String(name).toLowerCase());
  return c ? '<a href="/company/' + esc(c.slug) + '">' + esc(c.legalName) + '</a>' : esc(name);
}

function dl(rows) { return '<dl class="facts">' + rows.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>'; }
const companyLink = (slug) => { const c = store.company(slug); return c && !c.hidden ? '<a href="/company/' + esc(c.slug) + '">' + esc(c.legalName) + '</a>' : ''; };

function overviewPage(res, ctx, c) {
  const kids = store.children(c.slug);
  const managed = store.companies().filter((x) => x.managedBy === c.slug);
  const recent = store.filings(c.slug).slice(0, 3);
  page(res, ctx, { title: c.legalName, description: c.legalName + ': company overview, filing history, officers and persons with significant control.',
    body: companyHeader(c, '', ctx) +
      '<div class="two-col"><section class="panel"><h2>Company details</h2>' + dl([
        ['Registered office address', c.registeredOffice ? esc(c.registeredOffice).replace(/\n/g, '<br>') : val('')],
        ['Company status', c.status ? '<span class="status ' + (c.status === 'Active' ? 'ok' : 'warn') + '">' + esc(c.status) + '</span>' : val('')],
        ['Company type', val(c.type)],
        ['Incorporated on', val(fmt(c.incorporated))],
        ...(c.dissolved ? [['Dissolved on', esc(fmt(c.dissolved))]] : []),
        ['Nature of business (SIC)', c.sic.length ? c.sic.map(esc).join('<br>') : val('')],
        ...(c.previousNames.length ? [['Previous company names', c.previousNames.map((p) => esc(p.name)).join('<br>')]] : []),
      ]) + '</section>' +
      '<section class="panel"><h2>Accounts and confirmation statement</h2>' + dl([
        ['Accounts next due', val(fmt(c.accountsNextDue))], ['Last accounts made up to', val(fmt(c.accountsMadeUpTo))],
        ['Confirmation statement next due', val(fmt(c.confirmationNextDue))], ['Last statement dated', val(fmt(c.confirmationMadeUpTo))],
      ]) + '</section></div>' +
      '<section class="panel"><h2>Group</h2>' + dl([
        ['Parent company', c.parent ? companyLink(c.parent) || val('') : '<span class="muted">None recorded</span>'],
        ...(c.managedBy ? [['Managed by', companyLink(c.managedBy)]] : []),
        ...(kids.length ? [['Subsidiaries', kids.map((k) => companyLink(k.slug)).join('<br>')]] : []),
        ...(managed.length ? [['Manages', managed.map((k) => companyLink(k.slug)).join('<br>')]] : []),
        ...(c.divisions.length ? [['Divisions', c.divisions.map(esc).join('<br>')]] : []),
        ['Website', c.website ? '<a href="https://' + esc(c.website.replace(/^https?:\/\//, '')) + '" rel="noopener">' + esc(c.website.replace(/^https?:\/\//, '')) + '</a>' : val('')],
        ['Staff email domain', val(c.emailDomain)],
      ]) + (c.description ? '<p class="about">' + esc(c.description) + '</p>' : '') + '</section>' +
      '<section class="panel"><h2>Recent filings</h2>' + (recent.length ? filingTable(recent) + '<p><a href="/company/' + esc(c.slug) + '/filing-history">View the full filing history →</a></p>' : '<p class="muted">No filings have been added to the register for this company yet.</p>') + '</section>' });
}

function filingTable(list) {
  return '<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Description</th><th scope="col">Document</th></tr></thead><tbody>' +
    list.map((f) => '<tr><td>' + esc(fmt(f.date)) + '</td><td>' + esc(f.category) + '</td><td>' + esc(f.description) + '</td><td>' + (f.file ? '<a href="/document/' + f.id + '" target="_blank" rel="noopener">View PDF' + (f.pages ? ' (' + plural(f.pages, 'page', 'pages') + ')' : '') + '</a>' : '<span class="muted">No document</span>') + '</td></tr>').join('') + '</tbody></table></div>';
}

function filingsPage(res, ctx, c, category) {
  const all = store.filings(c.slug);
  const list = category ? all.filter((f) => f.category === category) : all;
  const used = store.FILING_CATEGORIES.filter((k) => all.some((f) => f.category === k));
  page(res, ctx, { title: 'Filing history · ' + c.legalName,
    body: companyHeader(c, 'filing-history', ctx) + '<section class="panel"><h2>Filing history</h2>' +
      (used.length > 1 ? '<form class="filter" method="get"><label>Show<select name="category" data-autosubmit><option value="">All filings</option>' + used.map((k) => '<option' + (k === category ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></label><noscript><button type="submit">Filter</button></noscript></form>' : '') +
      (list.length ? filingTable(list) : '<p class="muted">No filings ' + (category ? 'of this type ' : '') + 'have been added to the register for this company yet.</p>') + '</section>' });
}

function peoplePage(res, ctx, c, sub) {
  const psc = sub === 'persons-with-significant-control';
  const officers = [...c.officers].sort((a, b) => (!!a.resigned - !!b.resigned) || a.name.localeCompare(b.name));
  const active = officers.filter((o) => !o.resigned).length;
  const body = psc
    ? '<p class="muted">' + plural(c.psc.filter((p) => !p.ceased).length, 'active person', 'active persons') + ' with significant control</p>' +
      (c.psc.length ? c.psc.map((p) => '<article class="person"><h3>' + esc(p.name) + (p.ceased ? ' <span class="status warn">Ceased</span>' : '') + '</h3>' + dl([
        ['Type', esc(p.kind)], ...(p.kind === 'Parent company' ? [['Company', parentLink(p.name)]] : []), ['Shareholding', p.share ? esc(p.share) + '%' : val('')], ['Notified on', val(fmt(p.notified))], ...(p.ceased ? [['Ceased on', esc(fmt(p.ceased))]] : []),
        ['Nature of control', p.control.length ? p.control.map(esc).join('<br>') : val('')]]) + '</article>').join('') : '<p class="muted">No persons with significant control have been recorded.</p>')
    : '<p class="muted">' + plural(officers.length, 'officer', 'officers') + ' · ' + active + ' current' + (officers.length - active ? ' · ' + (officers.length - active) + ' resigned' : '') + '</p>' +
      (officers.length ? officers.map((o) => '<article class="person"><h3>' + esc(o.name) + (o.resigned ? ' <span class="status warn">Resigned</span>' : '') + '</h3>' + dl([
        ['Role', esc(o.role)], ['Appointed on', val(fmt(o.appointed))], ...(o.resigned ? [['Resigned on', esc(fmt(o.resigned))]] : []),
        ...(o.occupation ? [['Occupation', esc(o.occupation)]] : []), ...(o.nationality ? [['Nationality', esc(o.nationality)]] : []), ...(o.countryOfResidence ? [['Country of residence', esc(o.countryOfResidence)]] : [])]) + '</article>').join('') : '<p class="muted">No officers have been recorded.</p>');
  page(res, ctx, { title: (psc ? 'Persons with significant control' : 'Officers') + ' · ' + c.legalName,
    body: companyHeader(c, psc ? 'persons-with-significant-control' : 'officers', ctx) + '<section class="panel"><nav class="subtabs"><a href="/company/' + esc(c.slug) + '/officers"' + (psc ? '' : ' aria-current="page"') + '>Officers</a><a href="/company/' + esc(c.slug) + '/persons-with-significant-control"' + (psc ? ' aria-current="page"' : '') + '>Persons with significant control</a></nav>' + body + '</section>' });
}

// Companies connected to this one through ownership, management, significant control or shared officers.
function relatedCompanies(c) {
  const all = store.companies().filter((x) => x.slug !== c.slug);
  const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const out = new Map();
  const add = (x, reason) => { if (!out.has(x.slug)) out.set(x.slug, { company: x, reasons: [] }); if (!out.get(x.slug).reasons.includes(reason)) out.get(x.slug).reasons.push(reason); };
  for (const x of all) {
    if (x.slug === c.parent) add(x, 'Parent company');
    if (x.parent === c.slug) add(x, 'Subsidiary');
    if (c.parent && x.parent === c.parent) add(x, 'Fellow subsidiary of the same parent');
    if (x.slug === c.managedBy) add(x, 'Manages this company');
    if (x.managedBy === c.slug) add(x, 'Managed by this company');
    if (c.psc.some((p) => !p.ceased && same(p.name, x.legalName))) add(x, 'Has significant control over this company');
    if (x.psc.some((p) => !p.ceased && same(p.name, c.legalName))) add(x, 'This company has significant control over it');
    const shared = x.officers.filter((o) => !o.resigned && c.officers.some((m) => !m.resigned && same(m.name, o.name))).map((o) => o.name);
    if (shared.length) add(x, 'Shares ' + (shared.length === 1 ? 'an officer' : shared.length + ' officers') + ': ' + shared.join(', '));
  }
  return [...out.values()];
}

function relatedPage(res, ctx, c) {
  const list = relatedCompanies(c);
  page(res, ctx, { title: 'Related companies · ' + c.legalName,
    body: companyHeader(c, 'related-companies', ctx) + '<section class="panel"><h2>Related companies</h2><p class="muted">' + plural(list.length, 'related company', 'related companies') + ' on this register, connected through ownership, management, significant control or shared current officers.</p>' +
      (list.length ? '<div class="results">' + list.map((r) => '<a class="result" href="/company/' + esc(r.company.slug) + '"><span class="result-name">' + esc(r.company.legalName) + '</span>' +
        '<span class="result-meta">' + (r.company.number ? 'Company number ' + esc(r.company.number) + ' · ' : '') + (r.company.status ? esc(r.company.status) : 'Status not recorded') + '</span>' +
        r.reasons.map((x) => '<span class="result-address">' + esc(x) + '</span>').join('') + '</a>').join('') + '</div>'
        : '<p>No related companies are recorded on this register.</p>') + '</section>' });
}

function chargesPage(res, ctx, c) {
  const outstanding = c.charges.filter((x) => x.status !== 'Satisfied').length;
  page(res, ctx, { title: 'Charges · ' + c.legalName,
    body: companyHeader(c, 'charges', ctx) + '<section class="panel"><h2>Charges</h2><p class="muted">' + plural(c.charges.length, 'charge', 'charges') + ' registered · ' + outstanding + ' outstanding</p>' +
      (c.charges.length ? c.charges.map((x) => '<article class="person"><h3>' + (x.code ? 'Charge code ' + esc(x.code) : 'Charge') + ' <span class="status ' + (x.status === 'Satisfied' ? 'ok' : 'warn') + '">' + esc(x.status) + '</span></h3>' + dl([
        ['Created on', val(fmt(x.created))], ['Delivered on', val(fmt(x.delivered))], ...(x.satisfied ? [['Satisfied on', esc(fmt(x.satisfied))]] : []),
        ['Persons entitled', esc(x.entitled)], ...(x.description ? [['Brief description', esc(x.description)]] : [])]) + '</article>').join('') : '<p class="muted">No charges have been registered against this company.</p>') + '</section>' });
}

function aboutPage(res, ctx) {
  page(res, ctx, { title: 'About this register',
    body: '<section class="panel narrow"><h1>About the Company Register</h1><p>This register holds information about the companies in Horizon Holding Co’s group. Our staff keep it up to date.</p>' +
      '<p>It is a group register, not the UK government’s Companies House register. Some details may not be recorded yet. These show as “Not recorded”.</p>' +
      '<h2>What you can do</h2><ul><li>Search for a company or officer and view its records without an account.</li><li>Create a free account to request copies of filings or certificates, report a mistake, or submit a filing for review.</li></ul>' +
      '<h2>Your account</h2><p>Your account is only used for your requests and submissions. Our team replies on this site; we don’t send emails from the register. Don’t include sensitive personal information in messages or documents unless it’s needed.</p></section>' });
}

// ---------- Customer pages ----------

function needCustomer(res, ctx, back) {
  if (ctx.customer) return false;
  redirect(res, '/account/login?return=' + encodeURIComponent(back));
  return true;
}
const safeBack = (p) => (typeof p === 'string' && /^\/(company|account)\/[^\s\\]*$/.test(p) && !p.startsWith('//') ? p : '/account');

function registerPage(res, ctx, values, error) {
  page(res, ctx, { title: 'Create an account', noindex: true, flash: error && { error: true, text: error },
    body: '<section class="panel narrow"><h1>Create an account</h1><p class="muted">Anyone can create an account. Use it to request documents, report mistakes and submit filings.</p>' +
      '<form method="post" action="/account/register" class="form">' + field('Your name', 'name', values.name, { required: true, max: 80, auto: 'name' }) + field('Email address', 'email', values.email, { type: 'email', required: true, max: 160, auto: 'email' }) +
      field('Password', 'password', '', { type: 'password', required: true, hint: 'At least 10 characters.', auto: 'new-password' }) + field('Confirm password', 'confirm', '', { type: 'password', required: true, auto: 'new-password' }) +
      '<input type="hidden" name="return" value="' + esc(values.return || '') + '"><button class="button" type="submit">Create account</button></form><p>Already have an account? <a href="/account/login">Sign in</a></p></section>' });
}
function loginPage(res, ctx, values, error) {
  page(res, ctx, { title: 'Sign in', noindex: true, flash: error && { error: true, text: error },
    body: '<section class="panel narrow"><h1>Sign in</h1><form method="post" action="/account/login" class="form">' + field('Email address', 'email', values.email, { type: 'email', required: true, max: 160, auto: 'email' }) +
      field('Password', 'password', '', { type: 'password', required: true, auto: 'current-password' }) + '<input type="hidden" name="return" value="' + esc(values.return || '') + '"><button class="button" type="submit">Sign in</button></form>' +
      '<p>New here? <a href="/account/register' + (values.return ? '?return=' + encodeURIComponent(values.return) : '') + '">Create an account</a></p><p class="muted small">Staff managing the register should use <a href="/staff/login">staff sign in</a>.</p></section>' });
}

function accountPage(res, ctx, flash) {
  const me = ctx.customer.account;
  const reqs = store.db.requests.filter((r) => r.customer === me.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const subs = store.db.submissions.filter((s) => s.customer === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  page(res, ctx, { title: 'Your account', noindex: true, flash,
    body: '<h1 class="page-title">Your account</h1><p class="muted">Signed in as ' + esc(me.name) + ' (' + esc(me.email) + ') · <a href="/account/settings">Change password</a></p>' +
      '<section class="panel"><h2>Your requests and reports</h2>' + (reqs.length ? '<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Company</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead><tbody>' +
        reqs.map((r) => '<tr><td><a href="/account/requests/' + r.id + '">' + esc(r.ref) + '</a></td><td>' + esc(store.company(r.company)?.legalName || r.company) + '</td><td>' + esc(store.REQUEST_KINDS[r.kind]) + '</td><td><span class="status ' + (r.status === 'Answered' ? 'ok' : r.status === 'Open' ? 'warn' : '') + '">' + esc(r.status) + '</span></td><td>' + esc(fmtTime(r.updatedAt)) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">You haven’t made any requests yet. Find a company, then choose Request a document or Report a mistake.</p>') + '</section>' +
      '<section class="panel"><h2>Your filing submissions</h2>' + (subs.length ? '<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Company</th><th>Filing</th><th>Status</th><th>Submitted</th></tr></thead><tbody>' +
        subs.map((s) => '<tr><td>' + esc(s.ref) + '</td><td>' + esc(store.company(s.company)?.legalName || s.company) + '</td><td>' + esc(s.description) + (s.staffNote ? '<br><span class="muted small">Note from Horizon Holding Co: ' + esc(s.staffNote) + '</span>' : '') + '</td><td><span class="status ' + (s.status === 'Accepted' ? 'ok' : s.status === 'Pending' ? 'warn' : 'bad') + '">' + esc(s.status) + '</span></td><td>' + esc(fmtTime(s.createdAt)) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">You haven’t submitted any filings.</p>') + '</section>' });
}

function requestThread(r, ctx, staffView) {
  const c = store.company(r.company);
  const f = r.filing && store.filing(r.filing);
  return '<section class="panel"><p class="eyebrow">' + esc(store.REQUEST_KINDS[r.kind]) + ' · ' + esc(r.ref) + '</p><h1>' + esc(c ? c.legalName : r.company) + '</h1>' +
    '<p>Status: <span class="status ' + (r.status === 'Answered' ? 'ok' : r.status === 'Open' ? 'warn' : '') + '">' + esc(r.status) + '</span>' + (f ? ' · About the filing “' + esc(f.description) + '” (' + esc(fmt(f.date)) + ')' : '') + '</p>' +
    '<ol class="thread">' + r.messages.map((m) => '<li class="' + (m.from === 'staff' ? 'staff' : '') + '"><p class="who">' + esc(m.from === 'staff' ? m.name + ' · Horizon Holding Co' : m.name) + ' <span class="muted small">' + esc(fmtTime(m.at)) + '</span></p><p class="text">' + esc(m.text) + '</p></li>').join('') + '</ol>' +
    (r.status === 'Closed' && !staffView ? '<p class="muted">This request is closed. Start a new request from the company’s page if you need anything else.</p>'
      : '<form method="post" class="form">' + csrfField((staffView ? ctx.staffUser : ctx.customer).csrf) + field('Reply', 'text', '', { textarea: true, required: true }) +
        (staffView ? select('Status after replying', 'status', ['Answered', 'Open', 'Closed'], 'Answered') : '') + '<button class="button" type="submit">Send reply</button></form>') + '</section>';
}

function requestForm(res, ctx, c, kind, values, error) {
  const list = store.filings(c.slug);
  const mistake = kind === 'mistake';
  page(res, ctx, { title: (mistake ? 'Report a mistake' : 'Request a document') + ' · ' + c.legalName, noindex: true, flash: error && { error: true, text: error },
    body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>' + (mistake ? 'Report a mistake' : 'Request a document') + '</h1>' +
      '<p class="muted">' + (mistake ? 'Tell us what looks wrong on this company’s record and what it should say. Our team will check it and reply here.' : 'Ask for a copy of a filing or a certificate for this company. Our team will reply here.') + '</p>' +
      '<form method="post" class="form">' + csrfField(ctx.customer.csrf) + (mistake ? '<input type="hidden" name="kind" value="mistake">' : select('What do you need?', 'kind', [['copy', 'Copy of a filing'], ['certificate', 'Certificate'], ['other', 'Something else']], values.kind || 'copy')) +
      (list.length ? select(mistake ? 'Is it about a particular filing? (optional)' : 'Which filing? (optional)', 'filing', list.map((f) => [f.id, fmt(f.date) + ' · ' + f.description]), values.filing, 'Not a particular filing') : '') +
      field(mistake ? 'What’s wrong?' : 'Details', 'message', values.message, { textarea: true, required: true, rows: 6 }) + '<button class="button" type="submit">Send</button> <a class="button ghost" href="/company/' + esc(c.slug) + '">Cancel</a></form></section>' });
}

// Filing a change: first choose what to file, then fill in that change's form.
function submitForm(res, ctx, c, values, error, kind) {
  kind = Object.hasOwn(store.CHANGE_TYPES, kind) ? kind : '';
  const base = '/company/' + esc(c.slug) + '/file';
  if (!kind) return page(res, ctx, { title: 'File a change · ' + c.legalName, noindex: true, flash: error && { error: true, text: error },
    body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>What do you want to file?</h1><p class="muted">Our staff review every filing. When it’s accepted, the company’s record is updated and the filing appears in its filing history.</p>' +
      '<ul class="choice-list">' + Object.entries(store.CHANGE_TYPES).map(([k, t]) => '<li><a href="' + base + '?type=' + k + '">' + esc(t.label) + '</a></li>').join('') + '</ul>' +
      '<a class="button secondary" href="/company/' + esc(c.slug) + '">Cancel</a></section>' });
  const v = values || {};
  const current = (list, label) => list.length ? list.map((x) => [x.id, x.name + (x.role ? ' (' + x.role + ')' : '')]) : null;
  let fields = '';
  switch (kind) {
    case 'address': fields = '<p>Current address: <strong>' + (c.registeredOffice ? esc(c.registeredOffice).replace(/\n/g, ', ') : 'not recorded') + '</strong></p>' + field('New registered office address', 'registeredOffice', v.registeredOffice, { textarea: true, rows: 4, required: true, max: 300 }); break;
    case 'appoint': fields = ITEM_FIELDS.officers(v) + '<p class="hint">The date of appointment is required.</p>'; break;
    case 'terminate': { const list = current(c.officers.filter((o) => !o.resigned)); fields = list ? select('Officer', 'officer', list, v.officer) + field('Date they stopped being an officer', 'resigned', v.resigned, { type: 'date', required: true }) : '<p>There are no current officers recorded for this company.</p>'; break; }
    case 'psc_add': fields = ITEM_FIELDS.psc(v) + '<p class="hint">The notified date is required.</p>'; break;
    case 'psc_cease': { const list = current(c.psc.filter((p) => !p.ceased)); fields = list ? select('Person with significant control', 'psc', list, v.psc) + field('Date they ceased', 'ceased', v.ceased, { type: 'date', required: true }) : '<p>There are no current persons with significant control recorded for this company.</p>'; break; }
    case 'name': fields = '<p>Current name: <strong>' + esc(c.legalName) + '</strong></p>' + field('New company name', 'newName', v.newName, { required: true, max: 160 }); break;
    case 'sic': fields = field('Nature of business (SIC)', 'sic', v.sic !== undefined ? v.sic : c.sic.join('\n'), { textarea: true, rows: 4, required: true, max: 700, hint: 'One per line, up to four. For example: 62020 - Information technology consultancy activities.' }); break;
    case 'confirmation': fields = '<p>The statement confirms the company’s current details on this register are correct. Report a mistake first if anything needs changing.</p>' + field('Date the statement is made up to', 'madeUpTo', v.madeUpTo, { type: 'date', required: true }); break;
    case 'document': fields = select('Type of filing', 'category', store.FILING_CATEGORIES, v.category || 'Other') + field('Description', 'description', v.description, { required: true, max: 300 }); break;
  }
  const pdfField = kind === 'document' ? '<label>Document (PDF)<input type="file" name="document" accept="application/pdf,.pdf" required></label>'
    : '<label>Supporting document (PDF, optional)<span class="hint">If you attach one, it becomes the filing’s document. Otherwise we create one from these details.</span><input type="file" name="document" accept="application/pdf,.pdf"></label>';
  page(res, ctx, { title: store.CHANGE_TYPES[kind].label + ' · ' + c.legalName, noindex: true, flash: error && { error: true, text: error },
    body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>' + esc(store.CHANGE_TYPES[kind].label) + '</h1>' +
      '<form method="post" action="' + base + '" class="form" enctype="multipart/form-data">' + csrfField(ctx.customer.csrf) + '<input type="hidden" name="kind" value="' + kind + '">' + fields + pdfField +
      field('Note for our team (optional)', 'note', v.note, { textarea: true, max: 2000 }) +
      '<div class="form-actions"><button class="button" type="submit">Submit for review</button><a class="button secondary" href="' + base + '">Back</a></div></form></section>' });
}

// ---------- Staff administration ----------

function adminNav(active, me) {
  const items = [['/admin', 'Overview'], ['/admin/submissions', 'Submissions'], ['/admin/requests', 'Requests'], ['/admin/customers', 'Customers'], ...(me && me.admin ? [['/admin/staff', 'Staff']] : []), ['/admin/audit', 'Activity'], ['/admin/password', 'Your password']];
  return '<nav class="tabs admin-tabs" aria-label="Administration">' + items.map(([h, l]) => '<a href="' + h + '"' + (h === active ? ' aria-current="page"' : '') + '>' + l + '</a>').join('') + '</nav>';
}

function adminHome(res, ctx, flash) {
  const pending = store.db.submissions.filter((s) => s.status === 'Pending').length;
  const open = store.db.requests.filter((r) => r.status === 'Open').length;
  const all = store.companies(true);
  page(res, ctx, { title: 'Administration', noindex: true, flash,
    body: '<h1 class="page-title">Register administration</h1>' + adminNav('/admin', ctx.staffUser) +
      '<div class="grid-3"><a class="tile stat" href="/admin/submissions"><strong>' + pending + '</strong><span>filings to review</span></a><a class="tile stat" href="/admin/requests"><strong>' + open + '</strong><span>open requests</span></a><a class="tile stat" href="/admin/customers"><strong>' + store.db.customers.length + '</strong><span>customer accounts</span></a></div>' +
      '<section class="panel"><div class="panel-head"><h2>Companies</h2><a class="button small" href="/admin/companies/new">Add a company</a></div><div class="table-wrap"><table><thead><tr><th>Company</th><th>Number</th><th>Status</th><th>Filings</th><th></th></tr></thead><tbody>' +
      all.map((c) => '<tr><td>' + esc(c.legalName) + (c.hidden ? ' <span class="status">Hidden</span>' : '') + '</td><td>' + val(c.number) + '</td><td>' + val(c.status) + '</td><td>' + store.filings(c.slug).length + '</td><td><a href="/admin/company/' + esc(c.slug) + '">Edit</a> · <a href="/company/' + esc(c.slug) + '">View</a></td></tr>').join('') + '</tbody></table></div></section>' });
}

// Renames a form fragment's fields so several record types can share one form.
const prefixed = (prefix, html) => html.replace(/ name="(?!csrf)/g, ' name="' + prefix);
const unprefix = (fields, prefix) => Object.fromEntries(Object.entries(fields).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));

function companyForm(c, ctx, values) {
  values = values || {};
  const others = store.companies(true).filter((x) => !c || x.slug !== c.slug).map((x) => [x.slug, x.legalName]);
  const v = c || { sic: [], divisions: [], ...(values.company || {}) };
  return '<form method="post" action="' + (c ? '/admin/company/' + esc(c.slug) : '/admin/companies/new') + '" class="form grid-form">' + csrfField(ctx.staffUser.csrf) +
    field('Registered name', 'legalName', v.legalName, { required: true, max: 160 }) + field('Name it’s known by', 'name', v.name, { max: 120 }) +
    field('Company number', 'number', v.number, { max: 20 }) + select('Company status', 'status', store.STATUSES, v.status, 'Not recorded') +
    field('Company type', 'type', v.type, { max: 80, hint: 'For example: Private limited company.' }) + field('Incorporated on', 'incorporated', v.incorporated, { type: 'date' }) +
    field('Dissolved on', 'dissolved', v.dissolved, { type: 'date' }) + field('Registered office address', 'registeredOffice', v.registeredOffice, { textarea: true, rows: 3, max: 300 }) +
    field('Nature of business (SIC)', 'sic', (v.sic || []).join('\n'), { textarea: true, rows: 3, max: 700, hint: 'One per line, for example: 62020 - Information technology consultancy activities.' }) +
    field('Last accounts made up to', 'accountsMadeUpTo', v.accountsMadeUpTo, { type: 'date' }) + field('Accounts next due', 'accountsNextDue', v.accountsNextDue, { type: 'date' }) +
    field('Last confirmation statement dated', 'confirmationMadeUpTo', v.confirmationMadeUpTo, { type: 'date' }) + field('Confirmation statement next due', 'confirmationNextDue', v.confirmationNextDue, { type: 'date' }) +
    select('Parent company', 'parent', others, v.parent, 'None') + select('Managed by', 'managedBy', others, v.managedBy, 'Not managed by another company') +
    field('Divisions', 'divisions', (v.divisions || []).join('\n'), { textarea: true, rows: 2, max: 1000, hint: 'One per line.' }) +
    field('Website', 'website', v.website, { max: 120 }) + field('Staff email domain', 'emailDomain', v.emailDomain, { max: 80 }) +
    field('About the company', 'description', v.description, { textarea: true, rows: 3, max: 1000 }) +
    '<label class="check"><input type="checkbox" name="hidden"' + (v.hidden ? ' checked' : '') + '> Hide this company from the public register</label>' +
    (c ? '' : prefixed('officer_', '<h2 class="form-section">First officer</h2><p class="hint form-section">Every company needs at least one officer. If you leave the appointment date blank, the incorporation date is used.</p>' + ITEM_FIELDS.officers(values.officer || {})) +
      prefixed('psc_', '<h2 class="form-section">First person with significant control</h2><p class="hint form-section">Every company needs at least one person with significant control. If you leave the notified date blank, the incorporation date is used.</p>' + ITEM_FIELDS.psc(values.psc || {}))) +
    '<div class="form-actions"><button class="button" type="submit">' + (c ? 'Save company details' : 'Add company') + '</button></div></form>';
}

const ITEM_FIELDS = {
    officers: (o) => field('Name', 'name', o.name, { required: true, max: 120 }) + select('Role', 'role', store.OFFICER_ROLES, o.role || 'Director') + field('Appointed on', 'appointed', o.appointed, { type: 'date' }) + field('Resigned on', 'resigned', o.resigned, { type: 'date' }) + field('Occupation', 'occupation', o.occupation, { max: 80 }) + field('Nationality', 'nationality', o.nationality, { max: 60 }) + field('Country of residence', 'countryOfResidence', o.countryOfResidence, { max: 60 }),
    psc: (p) => field('Name', 'name', p.name, { required: true, max: 160, hint: 'For a parent company, use its registered name exactly as it appears on the register.' }) + select('Type', 'kind', store.PSC_KINDS, p.kind || 'Individual') + field('Share percentage', 'share', p.share, { type: 'number', number: true, max: 6, hint: 'The percentage of shares held, from 0 to 100. Leave blank if not known.' }) + field('Notified on', 'notified', p.notified, { type: 'date' }) + field('Ceased on', 'ceased', p.ceased, { type: 'date' }) + field('Nature of control', 'control', (p.control || []).join('\n'), { textarea: true, rows: 3, max: 1000, hint: 'One per line.' }),
    charges: (x) => field('Charge code', 'code', x.code, { max: 40 }) + select('Status', 'status', ['Outstanding', 'Part satisfied', 'Satisfied'], x.status || 'Outstanding') + field('Created on', 'created', x.created, { type: 'date' }) + field('Delivered on', 'delivered', x.delivered, { type: 'date' }) + field('Satisfied on', 'satisfied', x.satisfied, { type: 'date' }) + field('Persons entitled', 'entitled', x.entitled, { required: true, max: 200 }) + field('Brief description', 'description', x.description, { textarea: true, rows: 2, max: 600 }),
};
function itemForms(c, ctx, list) {
  const items = c[list];
  const forms = ITEM_FIELDS;
  const title = { officers: 'Officers', psc: 'Persons with significant control', charges: 'Charges' }[list];
  const label = (x) => list === 'charges' ? (x.code ? 'Charge ' + x.code : 'Charge for ' + x.entitled) : x.name;
  const base = '/admin/company/' + esc(c.slug) + '/' + list;
  return '<section class="panel"><h2>' + title + '</h2>' + items.map((x) => '<details class="item"><summary>' + esc(label(x)) + '</summary><form method="post" action="' + base + '/' + x.id + '" class="form grid-form">' + csrfField(ctx.staffUser.csrf) + forms[list](x) +
    '<div class="form-actions"><button class="button small" type="submit">Save</button><button class="button small danger" type="submit" formaction="' + base + '/' + x.id + '/delete" data-confirm="Remove this entry?">Remove</button></div></form></details>').join('') +
    '<details class="item add"><summary>Add ' + (list === 'officers' ? 'an officer' : list === 'psc' ? 'a person with significant control' : 'a charge') + '</summary><form method="post" action="' + base + '" class="form grid-form">' + csrfField(ctx.staffUser.csrf) + forms[list]({}) + '<div class="form-actions"><button class="button small" type="submit">Add</button></div></form></details></section>';
}

function adminCompany(res, ctx, c, flash) {
  const list = store.filings(c.slug);
  page(res, ctx, { title: 'Edit ' + c.legalName, noindex: true, flash,
    body: '<p><a href="/admin">← Administration</a></p><h1 class="page-title">' + esc(c.legalName) + '</h1><p><a href="/company/' + esc(c.slug) + '">View the public record →</a></p>' +
      '<section class="panel"><h2>Company details</h2>' + companyForm(c, ctx) + '</section>' + itemForms(c, ctx, 'officers') + itemForms(c, ctx, 'psc') + itemForms(c, ctx, 'charges') +
      '<section class="panel"><h2>Filing history</h2>' + (list.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Document</th><th></th></tr></thead><tbody>' + list.map((f) => '<tr><td>' + esc(fmt(f.date)) + '</td><td>' + esc(f.category) + '</td><td>' + esc(f.description) + (f.source === 'customer' ? ' <span class="muted small">(customer submission)</span>' : '') + '</td><td>' + (f.file ? '<a href="/document/' + f.id + '" target="_blank" rel="noopener">PDF</a>' : '—') + '</td><td><form method="post" action="/admin/filing/' + f.id + '/delete">' + csrfField(ctx.staffUser.csrf) + '<button class="link danger-text" type="submit" data-confirm="Delete this filing and its document?">Delete</button></form></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No filings yet.</p>') +
      '<details class="item add"><summary>Add a filing</summary><form method="post" action="/admin/company/' + esc(c.slug) + '/filings" class="form grid-form" enctype="multipart/form-data">' + csrfField(ctx.staffUser.csrf) + field('Date', 'date', new Date().toISOString().slice(0, 10), { type: 'date' }) + select('Type', 'category', store.FILING_CATEGORIES, 'Other') + field('Description', 'description', '', { required: true, max: 300 }) + '<label>Document (PDF, optional)<input type="file" name="document" accept="application/pdf,.pdf"></label><div class="form-actions"><button class="button small" type="submit">Add filing</button></div></form></details></section>' +
      '<section class="panel danger-zone"><h2>Delete company</h2><p class="muted">This removes the company, its people, charges and all its filings from the register. It can’t be undone.</p><form method="post" action="/admin/company/' + esc(c.slug) + '/delete">' + csrfField(ctx.staffUser.csrf) + '<button class="button danger" type="submit" data-confirm="Delete ' + esc(c.legalName) + ' and all its records?">Delete company</button></form></section>' });
}

// The details of a filed change, as staff need to review it.
function changeDetails(s) {
  const ch = s.change || {};
  const rows = [];
  if (s.kind === 'appoint' && ch.officer) { const o = ch.officer; rows.push(['Name', o.name], ['Role', o.role], ['Appointed on', fmt(o.appointed)], ['Occupation', o.occupation], ['Nationality', o.nationality], ['Country of residence', o.countryOfResidence]); }
  else if (s.kind === 'psc_add' && ch.psc) { const p = ch.psc; rows.push(['Name', p.name], ['Type', p.kind], ['Shareholding', p.share ? p.share + '%' : ''], ['Nature of control', (p.control || []).join('; ')], ['Notified on', fmt(p.notified)]); }
  else if (s.kind === 'sic') rows.push(['New nature of business', ch.sic.join('; ')]);
  if (!rows.length) return '';
  return dl(rows.filter((r) => r[1]).map(([k, x]) => [k, esc(x)]));
}

function adminSubmissions(res, ctx, flash) {
  const list = [...store.db.submissions].sort((a, b) => (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)).slice(0, 300);
  page(res, ctx, { title: 'Submissions', noindex: true, flash,
    body: '<h1 class="page-title">Filing submissions</h1>' + adminNav('/admin/submissions', ctx.staffUser) + '<section class="panel">' + (list.length ? list.map((s) => {
      const cust = store.customer(s.customer);
      return '<article class="item-card"><h3>' + esc(s.ref) + ' · ' + esc(store.company(s.company)?.legalName || s.company) + ' <span class="status ' + (s.status === 'Accepted' ? 'ok' : s.status === 'Pending' ? 'warn' : 'bad') + '">' + esc(s.status) + '</span></h3>' +
        '<p><strong>' + esc((store.CHANGE_TYPES[s.kind || 'document'] || {}).label || s.category) + ':</strong> ' + esc(s.description) + '</p>' + changeDetails(s) + '<p class="muted small">From ' + esc(cust ? cust.name + ' (' + cust.email + ')' : 'a deleted account') + ' · ' + esc(fmtTime(s.createdAt)) + '</p>' + (s.note ? '<p class="note">' + esc(s.note) + '</p>' : '') +
        (s.status === 'Pending' ? (s.file ? '<p><a href="/admin/submission-file/' + s.id + '" target="_blank" rel="noopener">Open the PDF' + (s.pages ? ' (' + plural(s.pages, 'page', 'pages') + ')' : '') + '</a></p>' : '<p class="muted small">No PDF attached; one will be created from these details.</p>') + '<form method="post" action="/admin/submissions/' + s.id + '" class="form">' + csrfField(ctx.staffUser.csrf) + field('Note to the customer (optional)', 'note', '', { max: 1000 }) +
          '<div class="form-actions"><button class="button small" type="submit" name="decision" value="accept">Accept and publish</button><button class="button small danger" type="submit" name="decision" value="reject">Reject</button></div></form>' : (s.staffNote ? '<p class="muted small">Note: ' + esc(s.staffNote) + '</p>' : '')) + '</article>';
    }).join('') : '<p class="muted">No filings have been submitted.</p>') + '</section>' });
}

function adminRequests(res, ctx) {
  const list = [...store.db.requests].sort((a, b) => (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 300);
  page(res, ctx, { title: 'Requests', noindex: true,
    body: '<h1 class="page-title">Requests and reports</h1>' + adminNav('/admin/requests', ctx.staffUser) + '<section class="panel">' + (list.length ? '<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Company</th><th>Type</th><th>From</th><th>Status</th><th>Updated</th></tr></thead><tbody>' +
      list.map((r) => '<tr><td><a href="/admin/requests/' + r.id + '">' + esc(r.ref) + '</a></td><td>' + esc(store.company(r.company)?.legalName || r.company) + '</td><td>' + esc(store.REQUEST_KINDS[r.kind]) + '</td><td>' + esc(store.customer(r.customer)?.name || 'Deleted account') + '</td><td><span class="status ' + (r.status === 'Open' ? 'warn' : r.status === 'Answered' ? 'ok' : '') + '">' + esc(r.status) + '</span></td><td>' + esc(fmtTime(r.updatedAt)) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No requests yet.</p>') + '</section>' });
}

function adminCustomers(res, ctx, flash) {
  const list = [...store.db.customers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500);
  page(res, ctx, { title: 'Customers', noindex: true, flash,
    body: '<h1 class="page-title">Customer accounts</h1>' + adminNav('/admin/customers', ctx.staffUser) + '<section class="panel"><p class="muted">' + plural(store.db.customers.length, 'account', 'accounts') + '. Customers can only see their own requests and submissions.</p>' + (list.length ? '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Created</th><th>Last sign-in</th><th></th></tr></thead><tbody>' +
      list.map((c) => '<tr><td>' + esc(c.name) + (c.disabled ? ' <span class="status bad">Disabled</span>' : '') + '</td><td>' + esc(c.email) + '</td><td>' + esc(fmtTime(c.createdAt)) + '</td><td>' + (c.lastLoginAt ? esc(fmtTime(c.lastLoginAt)) : '—') + '</td><td><form method="post" action="/admin/customers/' + c.id + '">' + csrfField(ctx.staffUser.csrf) + '<button class="link" type="submit" name="disabled" value="' + (c.disabled ? '0' : '1') + '">' + (c.disabled ? 'Enable' : 'Disable') + '</button></form></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Nobody has created an account yet.</p>') + '</section>' });
}

function adminAudit(res, ctx) {
  const list = store.db.audit.slice(-300).reverse();
  page(res, ctx, { title: 'Activity', noindex: true,
    body: '<h1 class="page-title">Activity</h1>' + adminNav('/admin/audit', ctx.staffUser) + '<section class="panel"><div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead><tbody>' +
      list.map((a) => '<tr><td>' + esc(fmtTime(a.at)) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.detail) + '</td></tr>').join('') + '</tbody></table></div></section>' });
}

// ---------- Files ----------

function serveStatic(res, route) {
  const file = path.normalize(path.join(PUBLIC, route));
  if (!file.startsWith(path.join(PUBLIC, 'assets') + path.sep) && route !== '/robots.txt') return false;
  let stat; try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'public, max-age=3600' });
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}
function servePdf(res, name, download) {
  const file = store.filePath(name);
  let stat; try { stat = file && fs.statSync(file); } catch { stat = null; }
  if (!stat) return false;
  // Uploaded PDFs are shown in the browser's PDF viewer, sandboxed from the site.
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': stat.size, 'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="document.pdf"', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'private, max-age=300' });
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}

// ---------- Routing ----------

const clientIp = (req) => String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === ORIGIN || (process.env.COMPANIES_ALLOW_ORIGIN && origin === process.env.COMPANIES_ALLOW_ORIGIN);
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { throw fail(400, 'That address isn’t valid.'); }
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end('{"ok":true}'); }
  if (req.method === 'GET' && (p.startsWith('/assets/') || p === '/robots.txt') && serveStatic(res, p)) return;
  if (req.method === 'POST' && !sameOrigin(req)) throw fail(403, 'That request came from another website.');

  const ctx = { customer: customers.current(req), staffUser: null };
  if (p === '/staff/login') {
    const back = safeAdmin(url.searchParams.get('return'));
    if (req.method === 'GET') return staff.current(req) ? redirect(res, back) : staffLoginPage(res, ctx, { return: back });
    if (req.method === 'POST') {
      const { fields } = await forms.parse(req);
      try { const s = staff.login(fields.email, fields.password, clientIp(req)); return redirect(res, s.mustChange ? '/admin/password' : safeAdmin(fields.return), [staff.start(s)]); }
      catch (e) { if (e.status !== 400 && e.status !== 429) throw e; return staffLoginPage(res, ctx, fields, e.message); }
    }
  }
  if (p === '/staff/logout' && req.method === 'POST') {
    const { fields } = await forms.parse(req);
    const me = staff.current(req);
    if (me && fields.csrf !== me.csrf) throw fail(403, 'Your session has changed. Refresh the page and try again.');
    return redirect(res, '/', [staff.end(req)]);
  }

  // Public register.
  if (req.method === 'GET' && p === '/') return homePage(res, ctx);
  if (req.method === 'GET' && p === '/search') return searchPage(res, ctx, String(url.searchParams.get('q') || '').slice(0, 120));
  if (req.method === 'GET' && p === '/about') return aboutPage(res, ctx);
  let m = /^\/document\/([a-f0-9]{24})$/.exec(p);
  if (req.method === 'GET' && m) {
    const f = store.filing(m[1]);
    const c = f && store.company(f.company);
    if (!f || !c || (c.hidden && !(await staffAdmin(req, ctx))) || !servePdf(res, f.file, url.searchParams.has('download'))) return messagePage(res, ctx, 404, 'Document not found', 'That document isn’t on the register.');
    return;
  }
  m = /^\/company\/([a-z0-9-]+)(?:\/([a-z-]+))?$/.exec(p);
  if (m) {
    const c = store.company(m[1]);
    if (!c || (c.hidden && !(await staffAdmin(req, ctx)))) return messagePage(res, ctx, 404, 'Company not found', 'There’s no company with that address on the register.');
    const sub = m[2] || '';
    if (req.method === 'GET') {
      if (!sub) return overviewPage(res, ctx, c);
      if (sub === 'filing-history') return filingsPage(res, ctx, c, store.FILING_CATEGORIES.includes(url.searchParams.get('category')) ? url.searchParams.get('category') : '');
      if (sub === 'officers' || sub === 'persons-with-significant-control') return peoplePage(res, ctx, c, sub);
      if (sub === 'charges') return chargesPage(res, ctx, c);
      if (sub === 'related-companies') return relatedPage(res, ctx, c);
    }
    if (sub === 'request' || sub === 'report' || sub === 'file') {
      if (needCustomer(res, ctx, p)) return;
      if (req.method === 'GET') return sub === 'file' ? submitForm(res, ctx, c, {}, null, url.searchParams.get('type')) : requestForm(res, ctx, c, sub === 'report' ? 'mistake' : 'copy', {});
      if (req.method === 'POST') {
        const { fields, file } = await forms.parse(req);
        if (fields.csrf !== ctx.customer.csrf) throw fail(403, 'Your session has changed. Go back, refresh the page and try again.');
        try {
          if (sub === 'file') { const s = store.addSubmission(ctx.customer.account, c.slug, fields, file); return accountPage(res, ctx, { text: 'Thanks. Your filing ' + s.ref + ' has been sent for review.' }); }
          const r = store.addRequest(ctx.customer.account, c.slug, { ...fields, kind: sub === 'report' ? 'mistake' : ['copy', 'certificate', 'other'].includes(fields.kind) ? fields.kind : 'copy' });
          return redirect(res, '/account/requests/' + r.id);
        } catch (e) {
          if (e.status !== 400 && e.status !== 429) throw e;
          return sub === 'file' ? submitForm(res, ctx, c, fields, e.message, fields.kind) : requestForm(res, ctx, c, sub === 'report' ? 'mistake' : fields.kind, fields, e.message);
        }
      }
    }
    return messagePage(res, ctx, 404, 'Page not found', 'That page isn’t part of this company’s record.');
  }

  // Customer accounts.
  if (p === '/account/register') {
    if (req.method === 'GET') return ctx.customer ? redirect(res, '/account') : registerPage(res, ctx, { return: url.searchParams.get('return') || '' });
    if (req.method === 'POST') {
      const { fields } = await forms.parse(req);
      try { const c = store.createCustomer(fields); return redirect(res, safeBack(fields.return), [customers.start(c)]); } catch (e) { if (e.status !== 400 && e.status !== 503) throw e; return registerPage(res, ctx, fields, e.message); }
    }
  }
  if (p === '/account/login') {
    if (req.method === 'GET') return ctx.customer ? redirect(res, '/account') : loginPage(res, ctx, { return: url.searchParams.get('return') || '' });
    if (req.method === 'POST') {
      const { fields } = await forms.parse(req);
      try { const c = customers.login(fields.email, fields.password, clientIp(req)); return redirect(res, safeBack(fields.return), [customers.start(c)]); } catch (e) { if (e.status !== 400 && e.status !== 429) throw e; return loginPage(res, ctx, fields, e.message); }
    }
  }
  if (p === '/account/logout' && req.method === 'POST') {
    const { fields } = await forms.parse(req);
    if (ctx.customer && fields.csrf !== ctx.customer.csrf) throw fail(403, 'Your session has changed. Refresh the page and try again.');
    return redirect(res, '/', [customers.end(req)]);
  }
  if (p.startsWith('/account')) {
    if (needCustomer(res, ctx, p)) return;
    if (p === '/account' && req.method === 'GET') return accountPage(res, ctx);
    if (p === '/account/settings') {
      let flash;
      if (req.method === 'POST') {
        const { fields } = await forms.parse(req);
        if (fields.csrf !== ctx.customer.csrf) throw fail(403, 'Your session has changed. Refresh the page and try again.');
        if (fields.password !== fields.confirm) flash = { error: true, text: 'The new passwords don’t match.' };
        else try { store.changePassword(ctx.customer.account, fields.current, fields.password); flash = { text: 'Your password has been changed.' }; } catch (e) { if (e.status !== 400) throw e; flash = { error: true, text: e.message }; }
      }
      return page(res, ctx, { title: 'Change password', noindex: true, flash, body: '<section class="panel narrow"><h1>Change password</h1><form method="post" class="form">' + csrfField(ctx.customer.csrf) + field('Current password', 'current', '', { type: 'password', required: true, auto: 'current-password' }) + field('New password', 'password', '', { type: 'password', required: true, hint: 'At least 10 characters.', auto: 'new-password' }) + field('Confirm new password', 'confirm', '', { type: 'password', required: true, auto: 'new-password' }) + '<button class="button" type="submit">Change password</button> <a class="button ghost" href="/account">Back</a></form></section>' });
    }
    m = /^\/account\/requests\/([a-f0-9]{24})$/.exec(p);
    if (m) {
      const r = store.request(m[1]);
      if (!r || r.customer !== ctx.customer.account.id) return messagePage(res, ctx, 404, 'Request not found', 'We couldn’t find that request on your account.');
      if (req.method === 'POST') {
        const { fields } = await forms.parse(req);
        if (fields.csrf !== ctx.customer.csrf) throw fail(403, 'Your session has changed. Refresh the page and try again.');
        if (r.status === 'Closed') throw fail(400, 'This request is closed.');
        try { store.replyRequest(r, 'customer', ctx.customer.account.name, fields.text); } catch (e) { if (e.status !== 400) throw e; }
        return redirect(res, p);
      }
      return page(res, ctx, { title: 'Request ' + r.ref, noindex: true, body: '<p><a href="/account">← Your account</a></p>' + requestThread(r, ctx, false) });
    }
    return messagePage(res, ctx, 404, 'Page not found', 'That page isn’t here.');
  }

  // Staff administration.
  if (p === '/admin' || p.startsWith('/admin/')) {
    const user = staff.current(req);
    if (!user) { if (req.method === 'GET') return redirect(res, '/staff/login?return=' + encodeURIComponent(p + url.search)); throw fail(401, 'Your staff sign-in has expired. Sign in again.'); }
    ctx.staffUser = user; ctx.customer = null;
    const actor = 'staff:' + (user.email || user.name);
    let fields = {}, file = null;
    if (req.method === 'POST') {
      ({ fields, file } = await forms.parse(req));
      if (fields.csrf !== user.csrf) throw fail(403, 'Your session has changed. Refresh the page and try again.');
    }
    // Your own password: required first when it's the default or a temporary one.
    if (p === '/admin/password') {
      let flash = user.mustChange ? { error: true, text: 'Choose a new password before you continue.' } : null;
      if (req.method === 'POST') {
        if (fields.password !== fields.confirm) flash = { error: true, text: 'The new passwords don’t match.' };
        else try { staff.changeOwnPassword(user.account, fields.current, fields.password); return adminHome(res, { ...ctx, staffUser: staff.current(req) }, { text: 'Your password has been changed.' }); } catch (e) { if (e.status !== 400) throw e; flash = { error: true, text: e.message }; }
      }
      return page(res, ctx, { title: 'Change your password', noindex: true, flash, body: '<section class="panel narrow"><h1>Change your password</h1>' + (user.mustChange ? '<p>You’re using a default or temporary password. Choose your own to continue.</p>' : '') + '<form method="post" class="form">' + csrfField(user.csrf) + field('Current password', 'current', '', { type: 'password', required: true, auto: 'current-password' }) + field('New password', 'password', '', { type: 'password', required: true, hint: 'At least 10 characters.', auto: 'new-password' }) + field('Confirm new password', 'confirm', '', { type: 'password', required: true, auto: 'new-password' }) + '<button class="button" type="submit">Change password</button>' + (user.mustChange ? '' : ' <a class="button secondary" href="/admin">Cancel</a>') + '</form></section>' });
    }
    if (user.mustChange) return redirect(res, '/admin/password');
    // Staff accounts: administrators only.
    if (p === '/admin/staff' || p.startsWith('/admin/staff/')) {
      if (!user.admin) return messagePage(res, ctx, 403, 'Administrators only', 'Only administrators can manage staff accounts.');
      let flash;
      const sm = /^\/admin\/staff\/([a-f0-9]{24})\/(remove|role|reset)$/.exec(p);
      if (req.method === 'POST') {
        try {
          if (p === '/admin/staff') { const s = staff.add(fields, actor); flash = { text: s.name + ' has been added. Give them their temporary password; they’ll choose their own when they first sign in.' }; }
          else if (sm && sm[2] === 'remove') { staff.remove(sm[1], user, actor); flash = { text: 'Staff account removed.' }; }
          else if (sm && sm[2] === 'role') { staff.setRole(sm[1], fields.role, user, actor); flash = { text: 'Role updated.' }; }
          else if (sm && sm[2] === 'reset') { staff.resetPassword(sm[1], fields.password, actor); flash = { text: 'Temporary password set. They’ll choose their own when they next sign in.' }; }
        } catch (e) { if (e.status !== 400) throw e; flash = { error: true, text: e.message }; }
      }
      return adminStaff(res, ctx, flash);
    }
    if (req.method === 'GET' && p === '/admin') return adminHome(res, ctx);
    if (p === '/admin/companies/new') {
      const addPage = (values, flash) => page(res, ctx, { title: 'Add a company', noindex: true, flash, body: '<p><a href="/admin">← Administration</a></p><section class="panel"><h1>Add a company</h1>' + companyForm(null, ctx, values) + '</section>' });
      if (req.method === 'GET') return addPage({});
      const officer = unprefix(fields, 'officer_'), psc = unprefix(fields, 'psc_');
      try { const c = store.saveCompany('', fields, actor, { officer, psc }); return redirect(res, '/admin/company/' + c.slug); }
      catch (e) { if (e.status !== 400) throw e; return addPage({ company: { ...fields, sic: String(fields.sic || '').split('\n'), divisions: String(fields.divisions || '').split('\n'), hidden: fields.hidden === 'on' }, officer, psc }, { error: true, text: e.message }); }
    }
    m = /^\/admin\/company\/([a-z0-9-]+)(?:\/(officers|psc|charges|filings|delete))?(?:\/([a-f0-9]{24}))?(\/delete)?$/.exec(p);
    if (m) {
      const c = store.company(m[1]);
      if (!c) return messagePage(res, ctx, 404, 'Company not found', 'That company isn’t on the register.');
      if (req.method === 'GET' && !m[2]) return adminCompany(res, ctx, c);
      if (req.method === 'POST') {
        try {
          if (!m[2]) { store.saveCompany(c.slug, fields, actor); return adminCompany(res, ctx, c, { text: 'Company details saved.' }); }
          if (m[2] === 'delete') { store.deleteCompany(c.slug, actor); return adminHome(res, ctx, { text: c.legalName + ' has been deleted.' }); }
          if (m[2] === 'filings') { store.addFiling(c.slug, fields, file, actor); return adminCompany(res, ctx, c, { text: 'Filing added.' }); }
          if (m[4]) { store.deleteItem(c.slug, m[2], m[3], actor); return adminCompany(res, ctx, c, { text: 'Entry removed.' }); }
          store.saveItem(c.slug, m[2], m[3], fields, actor); return adminCompany(res, ctx, c, { text: 'Saved.' });
        } catch (e) { if (e.status !== 400) throw e; return adminCompany(res, ctx, c, { error: true, text: e.message }); }
      }
    }
    m = /^\/admin\/filing\/([a-f0-9]{24})\/delete$/.exec(p);
    if (m && req.method === 'POST') { const f = store.filing(m[1]); store.deleteFiling(m[1], actor); return f ? redirect(res, '/admin/company/' + f.company) : redirect(res, '/admin'); }
    if (p === '/admin/submissions' && req.method === 'GET') return adminSubmissions(res, ctx);
    m = /^\/admin\/submissions\/([a-f0-9]{24})$/.exec(p);
    if (m && req.method === 'POST') {
      const s = store.submission(m[1]);
      if (!s) return messagePage(res, ctx, 404, 'Not found', 'That submission doesn’t exist.');
      try { store.decideSubmission(s, fields.decision === 'accept', fields.note, actor); } catch (e) { if (e.status !== 409 && e.status !== 400) throw e; return adminSubmissions(res, ctx, { error: true, text: s.ref + ': ' + e.message }); }
      return adminSubmissions(res, ctx, { text: s.ref + (s.status === 'Accepted' ? ' accepted. The company record has been updated and the filing published.' : ' rejected.') });
    }
    m = /^\/admin\/submission-file\/([a-f0-9]{24})$/.exec(p);
    if (m && req.method === 'GET') { const s = store.submission(m[1]); if (s && servePdf(res, s.file)) return; return messagePage(res, ctx, 404, 'Not found', 'That document is no longer stored.'); }
    if (p === '/admin/requests' && req.method === 'GET') return adminRequests(res, ctx);
    m = /^\/admin\/requests\/([a-f0-9]{24})$/.exec(p);
    if (m) {
      const r = store.request(m[1]);
      if (!r) return messagePage(res, ctx, 404, 'Not found', 'That request doesn’t exist.');
      if (req.method === 'POST') { try { store.replyRequest(r, 'staff', user.name, fields.text, fields.status); store.audit(actor, 'request.reply', r.ref); store.save(); } catch (e) { if (e.status !== 400) throw e; } return redirect(res, p); }
      const cust = store.customer(r.customer);
      return page(res, ctx, { title: 'Request ' + r.ref, noindex: true, body: '<p><a href="/admin/requests">← Requests</a></p><p class="muted">From ' + esc(cust ? cust.name + ' (' + cust.email + ')' : 'a deleted account') + '</p>' + requestThread(r, ctx, true) });
    }
    if (p === '/admin/customers' && req.method === 'GET') return adminCustomers(res, ctx);
    m = /^\/admin\/customers\/([a-f0-9]{24})$/.exec(p);
    if (m && req.method === 'POST') { store.setCustomerDisabled(m[1], fields.disabled === '1', actor); if (fields.disabled === '1') customers.endAllFor(m[1]); return adminCustomers(res, ctx, { text: 'Account updated.' }); }
    if (p === '/admin/audit' && req.method === 'GET') return adminAudit(res, ctx);
    return messagePage(res, ctx, 404, 'Page not found', 'That page isn’t part of the administration area.');
  }
  return messagePage(res, ctx, 404, 'Page not found', 'That page isn’t on the register.');
}

// Hidden companies are visible to signed-in staff only.
async function staffAdmin(req, ctx) {
  const u = staff.current(req);
  if (u && !u.mustChange) { ctx.staffUser = ctx.staffUser || u; return true; }
  return false;
}
const safeAdmin = (p) => (typeof p === 'string' && /^\/admin(\/[^\s\\]*)?(\?[^\s\\]*)?$/.test(p) ? p : '/admin');

function staffLoginPage(res, ctx, values, error) {
  page(res, ctx, { title: 'Staff sign in', noindex: true, flash: error && { error: true, text: error },
    body: '<section class="panel narrow"><h1>Staff sign in</h1><p class="muted">For staff who manage the Company Register. Customers should use <a href="/account/login">customer sign in</a>.</p><form method="post" action="/staff/login" class="form">' +
      field('Email address', 'email', values.email, { type: 'email', required: true, max: 160, auto: 'username' }) + field('Password', 'password', '', { type: 'password', required: true, auto: 'current-password' }) +
      '<input type="hidden" name="return" value="' + esc(values.return || '/admin') + '"><button class="button" type="submit">Sign in</button></form></section>' });
}

function adminStaff(res, ctx, flash) {
  const me = ctx.staffUser;
  const list = [...staff.list()].sort((a, b) => a.name.localeCompare(b.name));
  page(res, ctx, { title: 'Staff accounts', noindex: true, flash,
    body: '<h1 class="page-title">Staff accounts</h1>' + adminNav('/admin/staff', me) + '<section class="panel"><p class="muted">Staff can manage companies, filings, requests and customers. Administrators can also add and remove staff.</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Actions</th></tr></thead><tbody>' +
      list.map((s) => '<tr><td>' + esc(s.name) + (s.id === me.id ? ' <span class="status">You</span>' : '') + (s.mustChange ? ' <span class="status warn">Password to change</span>' : '') + '</td><td>' + esc(s.email) + '</td>' +
        '<td><form method="post" action="/admin/staff/' + s.id + '/role" class="inline">' + csrfField(me.csrf) + '<select name="role" data-autosubmit aria-label="Role for ' + esc(s.name) + '"' + (s.id === me.id ? ' disabled' : '') + '>' + Object.entries(staff.ROLES).map(([k, v]) => '<option value="' + k + '"' + (s.role === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><noscript><button type="submit">Save</button></noscript></form></td>' +
        '<td>' + (s.lastLoginAt ? esc(fmtTime(s.lastLoginAt)) : 'Never') + '</td><td>' + (s.id === me.id ? '<a href="/admin/password">Change your password</a>' :
          '<details class="mini"><summary>Reset password</summary><form method="post" action="/admin/staff/' + s.id + '/reset" class="form">' + csrfField(me.csrf) + field('Temporary password', 'password', '', { type: 'password', required: true, hint: 'At least 10 characters.', auto: 'new-password' }) + '<button class="button small" type="submit">Set password</button></form></details>' +
          '<form method="post" action="/admin/staff/' + s.id + '/remove" class="inline">' + csrfField(me.csrf) + '<button class="link danger-text" type="submit" data-confirm="Remove ' + esc(s.name) + '’s staff account?">Remove</button></form>') + '</td></tr>').join('') + '</tbody></table></div></section>' +
      '<section class="panel"><h2>Add a staff member</h2><form method="post" action="/admin/staff" class="form grid-form">' + csrfField(me.csrf) + field('Name', 'name', '', { required: true, max: 80 }) + field('Email address', 'email', '', { type: 'email', required: true, max: 160 }) +
      field('Temporary password', 'password', '', { type: 'password', required: true, hint: 'At least 10 characters. They’ll choose their own when they first sign in.', auto: 'new-password' }) + select('Role', 'role', Object.entries(staff.ROLES), 'staff') +
      '<div class="form-actions"><button class="button" type="submit">Add staff member</button></div></form></section>' });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (!res.hasHeader('Content-Security-Policy')) res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  try { await route(req, res); } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) messagePage(res, { customer: null, staffUser: null }, err.status || 500, err.status ? 'Something needs attention' : 'Something went wrong', err.status ? err.message : 'The register couldn’t complete that request. Please try again.');
    else res.destroy();
  }
});

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 4900;
  server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('Company register on ' + PORT));
}
module.exports = { server };
