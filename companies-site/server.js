'use strict';
// Company Register — companies.hngroup.org.uk, branded as HN Group (its logo, not its website theme) and separate from the other group websites.
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
const priv = require('./lib/private');

const PUBLIC = process.env.COMPANIES_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.COMPANIES_DATA_DIR || '/var/lib/hn-companies';
const ORIGIN = process.env.COMPANIES_ORIGIN || 'https://companies.hngroup.org.uk';
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
store.init(DATA_DIR);
// The private register (lib/private.js) signs everyone in through HN Group Auth instead of the register's own accounts.
if (priv.ENABLED) priv.install(customers, staff); else staff.ensureDefault();
const SERVICE = priv.ENABLED ? 'Private Company Register' : 'Company Register';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }); };
const fmtTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const val = (v) => (v ? esc(v) : '<span class="muted">Not recorded</span>');
const fail = (status, message) => Object.assign(new Error(message), { status });
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

// ---------- Layout ----------

function layout(o) {
  const signedOut = !o.customer && !o.staffUser;
  const signOut = (csrf) => '<form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="' + esc(csrf) + '"><button class="nav-button" type="submit">Sign out</button></form>';
  const nav = priv.ENABLED
    ? (o.staffUser ? '<a href="/admin">Administration</a>' : '') + (o.customer ? '<a href="/account">Your account</a>' : '') + (o.customer || o.staffUser ? signOut((o.customer || o.staffUser).csrf) : '<a href="/auth/login">Sign in with HN Group</a>')
    : o.staffUser
    ? '<a href="/admin">Administration</a><form method="post" action="/staff/logout"><input type="hidden" name="csrf" value="' + esc(o.staffUser.csrf) + '"><button class="nav-button" type="submit">Sign out</button></form>'
    : o.customer ? '<a href="/account">Your account</a><form method="post" action="/account/logout"><input type="hidden" name="csrf" value="' + esc(o.customer.csrf) + '"><button class="nav-button" type="submit">Sign out</button></form>'
      : '<a href="/account/login">Sign in</a><a href="/account/register">Create an account</a><a href="/staff/login" class="staff-link">Staff sign in</a>';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0c0c">' +
    '<title>' + esc(o.title) + ' – ' + SERVICE + ' – HN Group</title>' + (o.description ? '<meta name="description" content="' + esc(o.description) + '">' : '') + (o.noindex ? '<meta name="robots" content="noindex">' : '') +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/companies.css?v=6"><script src="/assets/companies.js?v=6" defer></script></head><body>' +
    '<a class="skip" href="#main">Skip to main content</a>' +
    '<header class="header"><div class="wrap header-inner"><a class="logo" href="/"><img src="/assets/brand/hn-group-wordmark-white.svg" alt="HN Group" width="126" height="44"></a>' +
    '<a class="service" href="/">' + SERVICE + '</a><nav class="header-nav" aria-label="Account">' + nav + '</nav></div></header>' +
    (o.back ? '<div class="wrap"><a class="back-link" href="' + esc(o.back) + '">Back</a></div>' : '') +
    (o.searchBar === false || o.back ? '' : '<div class="wrap"><form class="search compact" action="/search" method="get" role="search"><label for="q" class="sr-only">Search for a company or officer</label><input id="q" name="q" type="search" placeholder="Search for a company or officer" value="' + esc(o.q || '') + '" autocomplete="off"><button type="submit" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></button></form></div>') +
    '<main id="main" class="wrap main' + (o.back ? ' after-back' : '') + '">' + (o.flash ? (o.flash.error ? '<div class="error-summary" role="alert" tabindex="-1" data-focus><h2>There is a problem</h2><p>' + esc(o.flash.text) + '</p></div>' : '<div class="flash" role="status">' + esc(o.flash.text) + '</div>') : '') + o.body + '</main>' +
    '<footer class="footer"><div class="wrap"><ul class="footer-links"><li><a href="/">Search the register</a></li><li><a href="/about">About this register</a></li>' + (priv.ENABLED ? '' : (signedOut ? '<li><a href="/account/register">Create an account</a></li>' : '') + '<li><a href="/staff/login">Staff sign in</a></li>') + '</ul>' +
    '<div class="footer-meta"><img src="/assets/brand/hn-group-wordmark.svg" alt="" width="115" height="40"><p>' + (priv.ENABLED ? 'The Private Company Register is run by HN Group Limited and is separate from the public Company Register. Only HN Group accounts can sign in. ' : 'The Company Register is run by HN Group Limited for the companies in HN Group. ') + 'It is not the UK government’s Companies House register.</p><p>© ' + new Date().getFullYear() + ' HN Group Limited</p></div></div></footer></body></html>';
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
let uid = 0;
const nextId = () => 'f' + (++uid);
// A labelled input or textarea. extra: { type, required, hint, max, rows, textarea, auto, number, optional: false, width }
function field(label, name, value, extra) {
  const x = extra || {}, id = nextId(), type = x.type || 'text';
  const width = x.width || (type === 'date' ? 'date' : x.number ? 'num' : (type === 'email' || type === 'password') ? 'm' : x.max && x.max <= 20 ? 's' : '');
  const optional = !x.required && x.optional !== false ? ' <span class="optional">(optional)</span>' : '';
  const described = x.hint ? ' aria-describedby="' + id + '-hint"' : '';
  const control = x.textarea
    ? '<textarea id="' + id + '" name="' + name + '" rows="' + (x.rows || 4) + '"' + (x.required ? ' required' : '') + ' maxlength="' + (x.max || 3000) + '"' + described + ((x.max || 3000) >= 300 ? ' data-count' : '') + '>' + esc(value) + '</textarea>'
    : '<input id="' + id + '" name="' + name + '" type="' + type + '" value="' + esc(value) + '"' + (x.required ? ' required' : '') + (x.auto ? ' autocomplete="' + x.auto + '"' : '') + ' maxlength="' + (x.max || 200) + '"' + (x.number ? ' min="0" max="100" step="0.01" inputmode="decimal"' : '') + described + (width ? ' class="w-' + width + '"' : '') + '>';
  return '<div class="field' + (x.textarea ? ' wide' : '') + '"><label for="' + id + '">' + esc(label) + optional + '</label>' + (x.hint ? '<span class="hint" id="' + id + '-hint">' + esc(x.hint) + '</span>' : '') +
    (x.number ? '<span class="suffix-wrap">' + control + '<span class="suffix" aria-hidden="true">%</span></span>' : control) + '</div>';
}
function select(label, name, options, value, blank, hint) {
  const id = nextId();
  return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + (hint ? '<span class="hint" id="' + id + '-hint">' + esc(hint) + '</span>' : '') + '<select id="' + id + '" name="' + name + '"' + (hint ? ' aria-describedby="' + id + '-hint"' : '') + '>' + (blank !== undefined ? '<option value="">' + esc(blank) + '</option>' : '') +
    options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>';
}
// A PDF upload. Required for plain filings; optional supporting evidence elsewhere.
function fileField(label, hint, required) {
  const id = nextId();
  return '<div class="field wide"><label for="' + id + '">' + esc(label) + (required ? '' : ' <span class="optional">(optional)</span>') + '</label>' + (hint ? '<span class="hint" id="' + id + '-hint">' + esc(hint) + '</span>' : '') +
    '<div class="upload"><input id="' + id + '" type="file" name="document" accept="application/pdf,.pdf"' + (required ? ' required' : '') + (hint ? ' aria-describedby="' + id + '-hint"' : '') + '><span class="upload-note">PDF only, up to 15 MB</span></div></div>';
}
// A titled group of fields; numbered when part of a longer form.
const fieldset = (title, hint, html, step) => '<fieldset class="fieldset">' + '<legend>' + (step ? '<span class="step">Part ' + step + '</span>' : '') + esc(title) + '</legend>' + (hint ? '<p class="hint">' + esc(hint) + '</p>' : '') + '<div class="fieldset-body">' + html + '</div></fieldset>';
// The current value of something being changed.
const inset = (label, html) => '<div class="inset"><span class="inset-label">' + esc(label) + '</span>' + html + '</div>';
const actions = (button, back, backLabel) => '<div class="form-actions"><button class="button" type="submit">' + esc(button) + '</button>' + (back ? '<a class="cancel" href="' + back + '">' + esc(backLabel || 'Cancel') + '</a>' : '') + '</div>';
// The standard natures of control, as checkboxes, plus any others one per line.
const NATURES = ['Ownership of shares – more than 25% but not more than 50%', 'Ownership of shares – more than 50% but less than 75%', 'Ownership of shares – 75% or more',
  'Ownership of voting rights – more than 25% but not more than 50%', 'Ownership of voting rights – more than 50% but less than 75%', 'Ownership of voting rights – 75% or more',
  'Right to appoint and remove directors', 'Has significant influence or control'];
function controlField(value) {
  const list = (Array.isArray(value) ? value : String(value || '').split('\n')).map((x) => x.trim()).filter(Boolean);
  const other = list.filter((x) => !NATURES.includes(x));
  return '<fieldset class="field wide checks"><legend>Nature of control <span class="optional">(optional)</span></legend><span class="hint">Choose all that apply.</span>' +
    NATURES.map((n) => { const id = nextId(); return '<div class="check"><input type="checkbox" id="' + id + '" name="control" value="' + esc(n) + '"' + (list.includes(n) ? ' checked' : '') + '><label for="' + id + '">' + esc(n) + '</label></div>'; }).join('') +
    '</fieldset>' + field('Other nature of control', 'control', other.join('\n'), { textarea: true, rows: 2, max: 1000, hint: 'Only if none of the above describe it. One per line.' });
}
const csrfField = (token) => '<input type="hidden" name="csrf" value="' + esc(token) + '">';

// ---------- Public pages ----------

function companyCard(c) {
  return '<a class="result" href="/company/' + esc(c.slug) + '"><span class="result-name">' + esc(c.legalName) + '</span>' +
    '<span class="result-meta">' + (c.number ? 'Company number ' + esc(c.number) + ' · ' : '') + (c.status ? esc(c.status) : 'Status not recorded') + (c.incorporated ? ' · Incorporated ' + esc(fmt(c.incorporated)) : '') + '</span>' +
    (c.registeredOffice ? '<span class="result-address">' + esc(c.registeredOffice.replace(/\n/g, ', ')) + '</span>' : '') + '</a>';
}

function homePage(res, ctx) {
  page(res, ctx, { title: 'Find company information', searchBar: false, description: 'Search the HN Group Company Register for company records, filing history, officers and persons with significant control.',
    body: '<div class="grid-row"><div class="col-main"><h1 class="heading-xl">Find company information</h1>' +
      '<p class="lead">Search the register for a company’s details, filing history, officers, people with significant control and charges.</p>' +
      '<form class="search big" action="/search" method="get" role="search"><label for="q" class="label-l">Search for a company or officer</label><span class="hint">Enter a company name, company number or officer’s name</span><div class="search-row"><input id="q" name="q" type="search" autocomplete="off" required><button type="submit">Search</button></div></form>' +
      '<h2 class="heading-m">Other things you can do</h2><ul class="link-list">' +
      '<li>Request a copy of a filing or a certificate for a company</li><li>Report a mistake on a company record</li><li>File a change for a company, such as a new address, officer or person with significant control</li></ul>' +
      '<p class="body">Find the company first, then choose what you need from its page. ' + (ctx.customer ? 'You’re signed in, so you’re ready to go.' : 'You’ll need a free account: <a href="/account/register">create an account</a> or <a href="/account/login">sign in</a>.') + '</p></div>' +
      '<aside class="col-side"><div class="side-box"><h2 class="heading-s">Using this register</h2><ul><li><a href="/about">About this register</a></li>' + (ctx.customer ? '<li><a href="/account">Your requests and filings</a></li>' : '<li><a href="/account/login">Sign in to your account</a></li><li><a href="/account/register">Create an account</a></li>') + (priv.ENABLED ? (ctx.staffUser ? '<li><a href="/admin">Administration</a></li>' : '') : '<li><a href="/staff/login">Staff sign in</a></li>') + '</ul></div></aside></div>' });
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
  const acts = companyActions(c, ctx);
  return '<div class="company-head"><div class="company-title"><h1 class="heading-xl">' + esc(c.legalName) + '</h1>' +
    '<p class="company-number">Company number <strong>' + (c.number ? esc(c.number) : 'not recorded') + '</strong></p>' +
    (c.name && c.name !== c.legalName ? '<p class="trading">Trading as ' + esc(c.name) + '</p>' : '') + '</div>' +
    '<div class="company-actions">' + acts.filter((a) => a[2]).map(([href, label]) => '<a class="button" href="' + esc(href) + '">' + label + '</a>').join('') + '</div></div>' +
    '<ul class="more-actions">' + acts.filter((a) => !a[2]).map(([href, label]) => '<li><a href="' + esc(href) + '">' + label + '</a></li>').join('') + '</ul>' +
    '<nav class="tabs" aria-label="Company record">' + tabs.map(([p, label]) => { const active = tab === p || (p === 'officers' && tab === 'persons-with-significant-control'); return '<a href="/company/' + esc(c.slug) + (p ? '/' + p : '') + '"' + (active ? ' aria-current="page"' : '') + '>' + label + '</a>'; }).join('') + '</nav>';
}

// Managers can file changes and register subsidiaries; everyone else can ask to manage the company.
function companyActions(c, ctx) {
  const base = '/company/' + c.slug;
  const manages = ctx.customer && store.canManage(c, ctx.customer.account.id);
  // The third value marks the main action, shown as a button; the rest are links.
  return [...(manages ? [[base + '/file', 'File for this company', true], ['/account/register-company?parent=' + c.slug, 'Register a subsidiary']] : [[base + '/claim', 'Manage this company', true]]),
    [base + '/group-report', 'Download a company report'], [base + '/request', 'Request a document'], [base + '/report', 'Report a mistake']];
}
const companyName = (s) => store.company(s.company)?.legalName || (s.change && s.change.details && s.change.details.legalName) || s.company;

// A parent company is linked to its own record when it's on the register.
function parentLink(name) {
  const c = store.companies().find((x) => x.legalName.toLowerCase() === String(name).toLowerCase());
  return c ? '<a href="/company/' + esc(c.slug) + '">' + esc(c.legalName) + '</a>' : esc(name);
}

function dl(rows, cls) { return '<dl class="' + (cls || 'facts') + '">' + rows.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>'; }
const companyLink = (slug) => { const c = store.company(slug); return c && !c.hidden ? '<a href="/company/' + esc(c.slug) + '">' + esc(c.legalName) + '</a>' : ''; };

function overviewPage(res, ctx, c) {
  const kids = store.children(c.slug);
  const managed = store.companies().filter((x) => x.managedBy === c.slug);
  const recent = store.filings(c.slug).slice(0, 3);
  page(res, ctx, { title: c.legalName, description: c.legalName + ': company overview, filing history, officers and persons with significant control.',
    body: companyHeader(c, '', ctx) + '<div class="tab-body">' +
      dl([['Registered office address', c.registeredOffice ? esc(c.registeredOffice).replace(/\n/g, '<br>') : val('')]], 'data') +
      dl([['Company status', c.status ? '<strong class="status-text">' + esc(c.status) + '</strong>' : val('')], ['Company type', val(c.type)], ['Incorporated on', val(fmt(c.incorporated))], ...(c.dissolved ? [['Dissolved on', esc(fmt(c.dissolved))]] : [])], 'data cols-3') +
      '<div class="cols-2"><section><h2 class="heading-m">Accounts</h2>' + dl([['Next accounts due by', val(fmt(c.accountsNextDue))], ['Last accounts made up to', val(fmt(c.accountsMadeUpTo))]], 'data') + '</section>' +
      '<section><h2 class="heading-m">Confirmation statement</h2>' + dl([['Next statement due by', val(fmt(c.confirmationNextDue))], ['Last statement dated', val(fmt(c.confirmationMadeUpTo))]], 'data') + '</section></div>' +
      '<h2 class="heading-m">Nature of business (SIC)</h2>' + (c.sic.length ? '<ul class="plain-list">' + c.sic.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="muted">Not recorded</p>') +
      (c.previousNames.length ? dl([['Previous company names', c.previousNames.map((p) => esc(p.name) + ' <span class="muted">(until ' + esc(fmt(p.until)) + ')</span>').join('<br>')]], 'data') : '') +
      '<h2 class="heading-m">Group</h2>' + dl([
        ['Parent company', c.parent ? companyLink(c.parent) || val('') : '<span class="muted">None recorded</span>'],
        ...(c.managedBy ? [['Managed by', companyLink(c.managedBy)]] : []),
        ...(kids.length ? [['Subsidiaries', kids.map((k) => companyLink(k.slug)).join('<br>')]] : []),
        ...(managed.length ? [['Manages', managed.map((k) => companyLink(k.slug)).join('<br>')]] : []),
        ...(c.divisions.length ? [['Divisions', c.divisions.map(esc).join('<br>')]] : []),
        ['Website', c.website ? '<a href="https://' + esc(c.website.replace(/^https?:\/\//, '')) + '" rel="noopener">' + esc(c.website.replace(/^https?:\/\//, '')) + '</a>' : val('')],
        ['Staff email domain', val(c.emailDomain)],
      ], 'data cols-3') + (c.description ? '<p class="about">' + esc(c.description) + '</p>' : '') +
      '<h2 class="heading-m">Recent filings</h2>' + (recent.length ? filingTable(recent) + '<p><a href="/company/' + esc(c.slug) + '/filing-history">View the full filing history</a></p>' : '<p class="muted">No filings have been added to the register for this company yet.</p>') + '</div>' });
}

function filingTable(list) {
  return '<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Description</th><th scope="col">Document</th></tr></thead><tbody>' +
    list.map((f) => '<tr><td>' + esc(fmt(f.date)) + '</td><td>' + esc(f.category) + '</td><td>' + esc(f.description) + '</td><td class="nowrap">' + (f.file ? '<a href="/document/' + f.id + '" target="_blank" rel="noopener">View PDF' + (f.pages ? ' (' + plural(f.pages, 'page', 'pages') + ')' : '') + '</a>' : '<span class="muted">No document</span>') + '</td></tr>').join('') + '</tbody></table></div>';
}

function filingsPage(res, ctx, c, category) {
  const all = store.filings(c.slug);
  const list = category ? all.filter((f) => f.category === category) : all;
  const used = store.FILING_CATEGORIES.filter((k) => all.some((f) => f.category === k));
  page(res, ctx, { title: 'Filing history · ' + c.legalName,
    body: companyHeader(c, 'filing-history', ctx) + '<section class="panel"><h2 class="heading-m">Filing history for ' + esc(c.legalName) + '</h2>' +
      (used.length > 1 ? '<form class="filter" method="get"><label>Show<select name="category" data-autosubmit><option value="">All filings</option>' + used.map((k) => '<option' + (k === category ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></label><noscript><button type="submit">Filter</button></noscript></form>' : '') +
      (list.length ? filingTable(list) : '<p class="muted">No filings ' + (category ? 'of this type ' : '') + 'have been added to the register for this company yet.</p>') + '</section>' });
}

function peoplePage(res, ctx, c, sub) {
  const psc = sub === 'persons-with-significant-control';
  const officers = [...c.officers].sort((a, b) => (!!a.resigned - !!b.resigned) || a.name.localeCompare(b.name));
  const active = officers.filter((o) => !o.resigned).length;
  const votes = store.votingPower(c), classes = store.shareClasses(c);
  const classLine = (p) => { const k = store.classesOf(p); return k.split ? [['A', p.classA], ['B', p.classB], ['C', p.classC]].filter(([, v]) => Number(v || 0) > 0).map(([n, v]) => 'Class ' + n + ' ' + esc(v) + '%').join('<br>') + (Number(p.classC || 0) > 0 ? '<br><span class="muted">Class C issued by ' + esc(p.classCIssuedBy) + '</span>' : '') : (p.share ? 'Not split into classes (counted as Class A)' : val('')); };
  const voteLine = (p) => { const v = votes[p.id]; return p.ceased ? val('') : v ? '<strong>' + esc(v.votes) + '%</strong>' + (v.control ? ' <span class="status">Voting control</span><br><span class="muted">Holds the most Class C shares (more than ' + store.CLASS_C_CONTROL + '% of them), so holds ' + store.CONTROL_VOTES + '% of the votes or more.</span>'
    : v.sharedControl ? ' <span class="status">Shared voting control</span><br><span class="muted">Holds the most Class C shares together with ' + esc(v.sharedWith.join(' and ')) + ', so together they hold ' + esc(v.together) + '% of the votes. ' + (v.sharedWith.length > 1 ? 'None of them' : 'Neither') + ' holds ' + store.CONTROL_VOTES + '% alone.</span>' : '') : val(''); };
  const body = psc
    ? '<h2 class="heading-m">' + plural(c.psc.filter((p) => !p.ceased).length, 'active person', 'active persons') + ' with significant control</h2>' +
      (classes ? '<div class="inset share-classes"><p><strong>Shares by class</strong> (recorded holdings): Class A ' + esc(classes.classA) + '% · Class B ' + esc(classes.classB) + '% · Class C ' + esc(classes.classC) + '%</p>' +
        '<details><summary>How share classes vote</summary><ul class="list"><li><strong>Class A</strong>: ordinary shares for the public and other companies. One vote each.</li><li><strong>Class B</strong>: staff shares, held by people only. Half the votes of Class A.</li><li><strong>Class C</strong>: special issue shares, issued only by one of the company’s officers. Double the votes of Class A. Of the holders with more than ' + store.CLASS_C_CONTROL + '% of all the Class C shares, the one holding the most holds ' + store.CONTROL_VOTES + '% of the votes; the others count double.</li><li>Only 100% of a company’s shares can be issued.</li></ul></details></div>' : '') +
      (c.psc.length ? c.psc.map((p) => '<article class="person"><h2 class="person-name">' + esc(p.name) + (p.ceased ? ' <span class="status warn">Ceased</span>' : '') + '</h2>' + dl([
        ['Type', esc(p.kind)], ...(p.kind === 'Parent company' ? [['Company', parentLink(p.name)]] : []), ['Shareholding', p.share ? esc(p.share) + '%' : val('')], ['Share classes', classLine(p)], ['Voting power', voteLine(p)], ['Notified on', val(fmt(p.notified))], ...(p.ceased ? [['Ceased on', esc(fmt(p.ceased))]] : []),
        ['Nature of control', p.control.length ? p.control.map(esc).join('<br>') : val('')]], 'data cols-3') + '</article>').join('') : '<p class="muted">No persons with significant control have been recorded.</p>')
    : '<h2 class="heading-m">' + plural(officers.length, 'officer', 'officers') + ' / ' + plural(officers.length - active, 'resignation', 'resignations') + '</h2>' +
      (officers.length ? officers.map((o) => '<article class="person"><h2 class="person-name">' + esc(o.name) + (o.resigned ? ' <span class="status warn">Resigned</span>' : '') + '</h2>' + dl([
        ['Role', esc(o.role)], ['Appointed on', val(fmt(o.appointed))], ...(o.resigned ? [['Resigned on', esc(fmt(o.resigned))]] : []),
        ...(o.occupation ? [['Occupation', esc(o.occupation)]] : []), ...(o.nationality ? [['Nationality', esc(o.nationality)]] : []), ...(o.countryOfResidence ? [['Country of residence', esc(o.countryOfResidence)]] : [])], 'data cols-3') + '</article>').join('') : '<p class="muted">No officers have been recorded.</p>');
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
    body: companyHeader(c, 'charges', ctx) + '<section class="panel"><h2 class="heading-m">' + plural(c.charges.length, 'charge', 'charges') + ' registered / ' + outstanding + ' outstanding</h2>' +
      (c.charges.length ? c.charges.map((x) => '<article class="person"><h2 class="person-name">' + (x.code ? 'Charge code ' + esc(x.code) : 'Charge') + ' <span class="status ' + (x.status === 'Satisfied' ? 'ok' : 'warn') + '">' + esc(x.status) + '</span></h2>' + dl([
        ['Created on', val(fmt(x.created))], ['Delivered on', val(fmt(x.delivered))], ...(x.satisfied ? [['Satisfied on', esc(fmt(x.satisfied))]] : []),
        ['Persons entitled', esc(x.entitled)], ...(x.description ? [['Brief description', esc(x.description)]] : [])], 'data cols-3') + '</article>').join('') : '<p class="muted">No charges have been registered against this company.</p>') + '</section>' });
}

function aboutPage(res, ctx) {
  page(res, ctx, { title: 'About this register',
    body: priv.ENABLED ? '<section class="panel narrow"><h1>About the Private Company Register</h1><p>This is a private register run by HN Group Limited, completely separate from the public Company Register: nothing is shared between them. Only HN Group accounts can sign in, through HN Group Auth.</p>' +
      '<h2>What you can do</h2><ul><li>Search for a company or officer and view its records.</li><li>Request copies of filings or certificates, report a mistake, or submit a filing for review, with the account you signed in with.</li></ul>' +
      '<h2>Administration</h2><p>The system owner, owner-level accounts and Super Admin members run the register’s staff area. Our team replies on this site; we don’t send emails from the register.</p></section>' :
      '<section class="panel narrow"><h1>About the Company Register</h1><p>This register holds information about the companies in HN Group. It is run by HN Group Limited. Our staff keep it up to date.</p>' +
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
  const mine = store.managedCompanies(me.id).filter((c) => !c.hidden);
  page(res, ctx, { title: 'Your account', noindex: true, flash,
    body: '<h1 class="page-title">Your account</h1><p class="muted">Signed in as ' + esc(me.name) + ' (' + esc(me.email) + ')' + (priv.ENABLED ? ' with your HN Group account' : ' · <a href="/account/settings">Change password</a>') + '</p>' +
      '<section class="panel"><div class="panel-head"><h2>Your companies</h2><a class="button small" href="/account/register-company">Register a new company</a></div>' + (mine.length
        ? '<p class="muted">You can file changes for these companies and register subsidiaries of them.</p><div class="results">' + mine.map((c) => '<a class="result" href="/company/' + esc(c.slug) + '"><span class="result-name">' + esc(c.legalName) + '</span><span class="result-meta">' + (c.number ? 'Company number ' + esc(c.number) + ' · ' : '') + (c.status ? esc(c.status) : 'Status not recorded') + (c.managers.includes(me.id) ? '' : ' · Managed through its parent company') + '</span></a>').join('') + '</div>'
        : '<p class="muted">You don’t manage any companies yet. Register a new company, or find a company on the register and choose Manage this company.</p>') + '</section>' +
      '<section class="panel"><h2>Your requests and reports</h2>' + (reqs.length ? '<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Company</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead><tbody>' +
        reqs.map((r) => '<tr><td><a href="/account/requests/' + r.id + '">' + esc(r.ref) + '</a></td><td>' + esc(store.company(r.company)?.legalName || r.company) + '</td><td>' + esc(store.REQUEST_KINDS[r.kind]) + '</td><td><span class="status ' + (r.status === 'Answered' ? 'ok' : r.status === 'Open' ? 'warn' : '') + '">' + esc(r.status) + '</span></td><td>' + esc(fmtTime(r.updatedAt)) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">You haven’t made any requests yet. Find a company, then choose Request a document or Report a mistake.</p>') + '</section>' +
      '<section class="panel"><h2>Your applications and filings</h2>' + (subs.length ? '<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Company</th><th>Filing</th><th>Status</th><th>Submitted</th></tr></thead><tbody>' +
        subs.map((s) => '<tr><td>' + esc(s.ref) + '</td><td>' + esc(companyName(s)) + '</td><td>' + esc(s.description) + (s.staffNote ? '<br><span class="muted small">Note from HN Group: ' + esc(s.staffNote) + '</span>' : '') + '</td><td><span class="status ' + (s.status === 'Accepted' ? 'ok' : s.status === 'Pending' ? 'warn' : 'bad') + '">' + esc(s.status) + '</span></td><td>' + esc(fmtTime(s.createdAt)) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">You haven’t submitted any filings.</p>') + '</section>' });
}

function requestThread(r, ctx, staffView) {
  const c = store.company(r.company);
  const f = r.filing && store.filing(r.filing);
  return '<section class="panel"><p class="eyebrow">' + esc(store.REQUEST_KINDS[r.kind]) + ' · ' + esc(r.ref) + '</p><h1>' + esc(c ? c.legalName : r.company) + '</h1>' +
    '<p>Status: <span class="status ' + (r.status === 'Answered' ? 'ok' : r.status === 'Open' ? 'warn' : '') + '">' + esc(r.status) + '</span>' + (f ? ' · About the filing “' + esc(f.description) + '” (' + esc(fmt(f.date)) + ')' : '') + '</p>' +
    '<ol class="thread">' + r.messages.map((m) => '<li class="' + (m.from === 'staff' ? 'staff' : '') + '"><p class="who">' + esc(m.from === 'staff' ? m.name + ' · HN Group' : m.name) + ' <span class="muted small">' + esc(fmtTime(m.at)) + '</span></p><p class="text">' + esc(m.text) + '</p></li>').join('') + '</ol>' +
    (r.status === 'Closed' && !staffView ? '<p class="muted">This request is closed. Start a new request from the company’s page if you need anything else.</p>'
      : '<form method="post" class="form">' + csrfField((staffView ? ctx.staffUser : ctx.customer).csrf) + field('Reply', 'text', '', { textarea: true, required: true }) +
        (staffView ? select('Status after replying', 'status', ['Answered', 'Open', 'Closed'], 'Answered') : '') + '<button class="button" type="submit">Send reply</button></form>') + '</section>';
}

function requestForm(res, ctx, c, kind, values, error) {
  const list = store.filings(c.slug);
  const mistake = kind === 'mistake';
  page(res, ctx, { title: (mistake ? 'Report a mistake' : 'Request a document') + ' · ' + c.legalName, noindex: true, flash: error && { error: true, text: error }, back: '/company/' + c.slug,
    body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>' + (mistake ? 'Report a mistake' : 'Request a document') + '</h1>' +
      '<p>' + (mistake ? 'Tell us what looks wrong on this company’s record and what it should say. Our team will check it and reply in your account.' : 'Ask for a copy of a filing or a certificate for this company. Our team will reply in your account.') + '</p>' +
      '<form method="post" class="form" data-once>' + csrfField(ctx.customer.csrf) + (mistake ? '<input type="hidden" name="kind" value="mistake">' : select('What do you need?', 'kind', [['copy', 'Copy of a filing'], ['certificate', 'Certificate'], ['other', 'Something else']], values.kind || 'copy')) +
      (list.length ? select(mistake ? 'Is it about a particular filing?' : 'Which filing?', 'filing', list.map((f) => [f.id, fmt(f.date) + ' · ' + f.description]), values.filing, 'Not a particular filing') : '') +
      field(mistake ? 'What’s wrong?' : 'Details', 'message', values.message, { textarea: true, required: true, rows: 6, max: 3000, hint: mistake ? 'Include what it should say instead, if you know.' : 'For example, which certificate you need and what it’s for.' }) + actions('Send', '/company/' + esc(c.slug)) + '</form></section>' });
}

// Filing a change: first choose what to file, then fill in that change's form.
const CHANGE_GROUPS = [
  ['Company details', [['address', 'Move the company’s registered office.'], ['name', 'Change the registered name, the trading name, or both.'], ['sic', 'Update what the company does.'], ['confirmation', 'Confirm the company’s details are up to date.']]],
  ['Officers', [['appoint', 'Add a director, secretary or other officer.'], ['terminate', 'Record that an officer has stepped down.']]],
  ['Persons with significant control', [['psc_add', 'Record a new person or company with significant control.'], ['psc_change', 'Update a shareholding, type or nature of control.'], ['psc_cease', 'Record that someone no longer has significant control.']]],
  ['Something else', [['document', 'Upload any other filing as a PDF.']]],
];
function submitForm(res, ctx, c, values, error, kind) {
  kind = Object.hasOwn(store.CHANGE_TYPES, kind) ? kind : '';
  const base = '/company/' + esc(c.slug) + '/file';
  const flash = error && { error: true, text: error };
  if (!kind) return page(res, ctx, { title: 'File a change · ' + c.legalName, noindex: true, flash, back: '/company/' + c.slug,
    body: '<section class="panel"><p class="eyebrow">' + esc(c.legalName) + '</p><h1 class="page-title">What do you want to file?</h1><p class="lead-s">Our staff review every filing. When it’s accepted, the company’s record is updated and the filing appears in its filing history.</p>' +
      CHANGE_GROUPS.map(([title, items]) => '<h2 class="choice-heading">' + esc(title) + '</h2><div class="choice-grid">' + items.map(([k, d]) => '<a class="choice-card" href="' + base + '?type=' + k + '"><strong>' + esc(store.CHANGE_TYPES[k].label) + '</strong><span>' + esc(d) + '</span></a>').join('') + '</div>').join('') +
      '<p><a class="cancel" href="/company/' + esc(c.slug) + '">Back to the company</a></p></section>' });
  const v = values || {};
  const current = (list) => list.length ? list.map((x) => [x.id, x.name + (x.role ? ' (' + x.role + ')' : '')]) : null;
  const none = (what) => '<div class="inset">There are no current ' + what + ' recorded for this company.</div>';
  let fields = '', blocked = false;
  switch (kind) {
    case 'address': fields = inset('Current registered office', c.registeredOffice ? esc(c.registeredOffice).replace(/\n/g, '<br>') : '<span class="muted">Not recorded</span>') + field('New registered office address', 'registeredOffice', v.registeredOffice, { textarea: true, rows: 4, required: true, max: 300, hint: 'Include the postcode. Put each line of the address on a new line.' }); break;
    case 'appoint': fields = fieldset('The new officer', '', ITEM_FIELDS.officers(v, { appointedRequired: true, noResigned: true })); break;
    case 'terminate': { const list = current(c.officers.filter((o) => !o.resigned)); blocked = !list; fields = list ? select('Which officer?', 'officer', list, v.officer) + field('Date they stopped being an officer', 'resigned', v.resigned, { type: 'date', required: true }) : none('officers'); break; }
    case 'psc_add': fields = fieldset('The person with significant control', 'This can be a person or a company (for example, a parent company).', prefixed('psc_', ITEM_FIELDS.psc(v.item || {}, { notifiedRequired: true, noCeased: true, company: c }))); break;
    case 'psc_change': {
      const now = c.psc.filter((p) => !p.ceased);
      const chosen = now.find((p) => p.id === v.psc);
      if (!now.length) { fields = none('persons with significant control'); blocked = true; break; }
      if (!chosen) return page(res, ctx, { title: store.CHANGE_TYPES[kind].label + ' · ' + c.legalName, noindex: true, flash, back: '/company/' + c.slug + '/file',
        body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>Whose details have changed?</h1><div class="choice-grid one">' + now.map((p) => '<a class="choice-card" href="' + base + '?type=psc_change&amp;psc=' + p.id + '"><strong>' + esc(p.name) + '</strong><span>' + esc(p.kind) + (p.share ? ' · ' + esc(p.share) + '%' : '') + '</span></a>').join('') + '</div><p><a class="cancel" href="' + base + '">Back</a></p></section>' });
      const item = v.item || chosen;
      fields = '<input type="hidden" name="psc" value="' + esc(chosen.id) + '">' + inset('Changing the details of', '<strong>' + esc(chosen.name) + '</strong><br>' + esc(chosen.kind) + (chosen.share ? ' · ' + esc(chosen.share) + '%' : '') + (store.votingPower(c)[chosen.id] ? ' · ' + esc(store.votingPower(c)[chosen.id].votes) + '% of votes' : '')) +
        prefixed('psc_', field('Name', 'name', item.name, { required: true, max: 160 }) + select('Type', 'kind', store.PSC_KINDS, item.kind) + field('Share percentage', 'share', item.share, { type: 'number', number: true, max: 6, hint: 'From 0 to 100. Leave blank if not known, or if you give the share classes below.' }) + classFields(item) + votePreview(c, chosen.id) + controlField(item.control)) +
        field('Date the details changed', 'changed', v.changed, { type: 'date', required: true });
      break;
    }
    case 'psc_cease': { const list = current(c.psc.filter((p) => !p.ceased)); blocked = !list; fields = list ? select('Who has ceased?', 'psc', list, v.psc) + field('Date they ceased', 'ceased', v.ceased, { type: 'date', required: true }) : none('persons with significant control'); break; }
    case 'name': {
      const trading = c.name && c.name !== c.legalName ? c.name : '';
      fields = inset('Current names', '<strong>' + esc(c.legalName) + '</strong><br>' + (trading ? 'Trading as ' + esc(trading) : '<span class="muted">Trades under its registered name</span>')) +
        field('Registered name', 'newName', v.newName !== undefined ? v.newName : c.legalName, { required: true, max: 160, hint: 'The company’s legal name. Leave it as it is if only the trading name is changing.' }) +
        field('Trading name', 'tradingName', v.tradingName !== undefined ? v.tradingName : trading, { max: 120, hint: 'The name the company is known by, if different. Leave blank if it trades under its registered name.' });
      break;
    }
    case 'sic': fields = field('Nature of business (SIC)', 'sic', v.sic !== undefined ? v.sic : c.sic.join('\n'), { textarea: true, rows: 4, required: true, max: 700, hint: 'One per line, up to four. For example: 62020 - Information technology consultancy activities.' }); break;
    case 'confirmation': fields = inset('Before you confirm', 'The statement confirms the company’s current details on this register are correct. If anything is wrong, <a href="/company/' + esc(c.slug) + '/report">report a mistake</a> or file the change first.') + field('Date the statement is made up to', 'madeUpTo', v.madeUpTo, { type: 'date', required: true }); break;
    case 'document': fields = select('Type of filing', 'category', store.FILING_CATEGORIES, v.category || 'Other') + field('Description', 'description', v.description, { required: true, max: 300, hint: 'This appears in the company’s filing history.' }); break;
  }
  const pdf = kind === 'document' ? fileField('The filing', '', true) : fileField('Supporting document', 'If you attach one, it becomes the filing’s document. Otherwise we create one from these details.', false);
  page(res, ctx, { title: store.CHANGE_TYPES[kind].label + ' · ' + c.legalName, noindex: true, flash, back: '/company/' + c.slug + '/file',
    body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>' + esc(store.CHANGE_TYPES[kind].label) + '</h1>' +
      (blocked ? fields + '<p><a class="cancel" href="' + base + '">Choose something else</a></p>' :
      '<form method="post" action="' + base + '" class="form" enctype="multipart/form-data" data-once>' + csrfField(ctx.customer.csrf) + '<input type="hidden" name="kind" value="' + kind + '">' + fields + pdf +
      field('Note for our team', 'note', v.note, { textarea: true, rows: 3, max: 2000 }) + actions('Submit for review', base, 'Back') + '</form>') + '</section>' });
}

// Applying to register a new company, or a subsidiary of a company the customer manages.
function registerCompanyPage(res, ctx, values, error) {
  const v = values || {};
  const mine = store.managedCompanies(ctx.customer.account.id);
  const parent = mine.find((c) => c.slug === v.parent);
  const psc = v.psc || (parent ? { name: parent.legalName, kind: 'Parent company', share: '100' } : {});
  page(res, ctx, { title: parent ? 'Register a subsidiary' : 'Register a company', noindex: true, flash: error && { error: true, text: error }, back: parent ? '/company/' + parent.slug : '/account',
    body: '<section class="panel form-page"><p class="eyebrow">' + (parent ? esc(parent.legalName) : 'Your account') + '</p><h1 class="page-title">' + (parent ? 'Register a subsidiary' : 'Register a company') + '</h1>' +
      '<p class="lead-s">Tell us about the company, its first officer and its first person with significant control. Our staff review every application. When it’s accepted, the company is added to the register with its incorporation filing, and you’ll manage it from your account.</p>' +
      '<form method="post" action="/account/register-company" class="form" data-once>' + csrfField(ctx.customer.csrf) +
      fieldset('Company details', '', '<div class="grid-form">' +
        field('Registered name', 'legalName', v.legalName, { required: true, max: 160, hint: 'The company’s full legal name, for example Example Trading Limited.' }) + field('Trading name', 'name', v.name, { max: 120, hint: 'Only if it trades under a different name.' }) +
        field('Company type', 'type', v.type, { max: 80, hint: 'For example: Private limited company.' }) + field('Incorporated on', 'incorporated', v.incorporated, { type: 'date', hint: 'Leave blank to use the date it’s accepted.' }) +
        (mine.length ? select('Parent company', 'parent', mine.map((c) => [c.slug, c.legalName]), v.parent, 'None: this isn’t a subsidiary', 'Only companies you manage are listed.') : '') +
        field('Website', 'website', v.website, { max: 120 }) +
        field('Registered office address', 'registeredOffice', v.registeredOffice, { textarea: true, rows: 3, required: true, max: 300, hint: 'Include the postcode. Put each line on a new line.' }) +
        field('Nature of business (SIC)', 'sic', v.sic, { textarea: true, rows: 3, max: 700, hint: 'One per line, up to four.' }) +
        field('About the company', 'description', v.description, { textarea: true, rows: 3, max: 1000 }) + '</div>', 1) +
      fieldset('First officer', 'Every company needs at least one officer. If you leave the appointment date blank, the incorporation date is used.', '<div class="grid-form">' + prefixed('officer_', ITEM_FIELDS.officers(v.officer || {}, { noResigned: true })) + '</div>', 2) +
      fieldset('First person with significant control', parent ? 'We’ve filled in the parent company. Change it if someone else controls this company.' : 'Every company needs at least one. If you leave the notified date blank, the incorporation date is used.', '<div class="grid-form">' + prefixed('psc_', ITEM_FIELDS.psc(psc, { noCeased: true })) + '</div>', 3) +
      fieldset('Anything else', '', field('Note for our team', 'note', v.note, { textarea: true, rows: 3, max: 2000 }), 4) +
      actions('Submit application', parent ? '/company/' + esc(parent.slug) : '/account') + '</form></section>' });
}

function claimPage(res, ctx, c, values, error) {
  const v = values || {};
  page(res, ctx, { title: 'Manage this company · ' + c.legalName, noindex: true, flash: error && { error: true, text: error }, back: '/company/' + c.slug,
    body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>Ask to manage this company</h1>' +
      '<p>People who manage a company can file changes for it and register its subsidiaries. Managing a company also covers its subsidiaries.</p>' +
      '<form method="post" class="form" enctype="multipart/form-data" data-once>' + csrfField(ctx.customer.csrf) + '<input type="hidden" name="kind" value="claim">' +
      field('Your connection to the company', 'note', v.note, { textarea: true, rows: 5, required: true, max: 2000, hint: 'For example, you’re a director or you act for the company. Our staff will check it and reply in your account.' }) +
      fileField('Supporting document', 'For example, a letter of authority.', false) + actions('Send request', '/company/' + esc(c.slug)) + '</form></section>' });
}

// Customers can download a report on a company, and on all its subsidiaries too.
function groupReportPage(res, ctx, c) {
  const group = store.groupOf(c.slug, false);
  const box = (name, label, hint) => { const id = 'r-' + name; return '<div class="check"><input type="checkbox" id="' + id + '" name="' + name + '" value="1" checked><label for="' + id + '">' + esc(label) + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label></div>'; };
  page(res, ctx, { title: 'Company report · ' + c.legalName, noindex: true, back: '/company/' + c.slug,
    body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>Download a company report</h1><p>Get a PDF of this company’s record' + (group.length > 1 ? ', and the records of its ' + plural(group.length - 1, 'subsidiary', 'subsidiaries') + ',' : '') + ' as it stands today.</p>' +
      (group.length > 1 ? inset('Companies in this group', group.map((g) => '<span class="tree" data-depth="' + Math.min(g.depth, 5) + '">' + esc(g.company.legalName) + '</span>').join('')) : '') +
      '<form method="get" class="form"><input type="hidden" name="generate" value="1"><fieldset class="field wide checks"><legend>What should it include?</legend>' +
      (group.length > 1 ? box('subsidiaries', 'All subsidiaries', 'Every company below this one, including subsidiaries of subsidiaries.') : '') +
      box('officers', 'Officers') + box('psc', 'Persons with significant control') + box('charges', 'Charges') + box('filings', 'Recent filings', 'The latest 10 for each company.') + '</fieldset>' +
      actions('Download PDF', '/company/' + esc(c.slug)) + '</form></section>' });
}

function notManagerPage(res, ctx, c) {
  page(res, ctx, { title: 'File a change · ' + c.legalName, noindex: true,
    body: '<section class="panel narrow"><p class="eyebrow">' + esc(c.legalName) + '</p><h1>You don’t manage this company</h1><p>Only people who manage a company can file changes for it. If you’re connected to the company, ask to manage it first.</p>' +
      '<div class="form-actions"><a class="button" href="/company/' + esc(c.slug) + '/claim">Ask to manage this company</a><a class="button secondary" href="/company/' + esc(c.slug) + '">Back</a></div></section>' }, 403);
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
    field('Registered name', 'legalName', v.legalName, { required: true, max: 160 }) + field('Trading name', 'name', v.name, { max: 120, hint: 'Leave blank if it trades under its registered name.' }) +
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
    '<div class="check wide"><input type="checkbox" id="hide-company" name="hidden"' + (v.hidden ? ' checked' : '') + '><label for="hide-company">Hide this company from the public register</label></div>' +
    (c ? '' : '<div class="wide">' + fieldset('First officer', 'Every company needs at least one officer. If you leave the appointment date blank, the incorporation date is used.', '<div class="grid-form">' + prefixed('officer_', ITEM_FIELDS.officers(values.officer || {}, { noResigned: true })) + '</div>') +
      fieldset('First person with significant control', 'Every company needs at least one. If you leave the notified date blank, the incorporation date is used.', '<div class="grid-form">' + prefixed('psc_', ITEM_FIELDS.psc(values.psc || {}, { noCeased: true })) + '</div>') + '</div>') +
    '<div class="form-actions"><button class="button" type="submit">' + (c ? 'Save company details' : 'Add company') + '</button></div></form>';
}

// Share classes: each as a percentage of all the company's shares (see lib/store.js for the rules).
const classFields = (p) => '<div class="wide"><p class="field-group-title">Share classes</p><p class="hint">Split the shareholding into classes, each as a percentage of all the company’s shares. Leave them blank if the shares aren’t split (they count as Class A).</p></div>' +
  field('Class A shares (%)', 'classA', p.classA, { type: 'number', number: true, max: 6, hint: 'Ordinary shares for the public and other companies. One vote each.' }) +
  field('Class B shares (%)', 'classB', p.classB, { type: 'number', number: true, max: 6, hint: 'Staff shares, held by people only. Half a vote each.' }) +
  field('Class C shares (%)', 'classC', p.classC, { type: 'number', number: true, max: 6, hint: 'Special issue by one of the company’s officers. Two votes each. The largest Class C holder, if they have more than 10% of the Class C shares, holds 51% of all votes.' }) +
  field('Class C issued by', 'classCIssuedBy', p.classCIssuedBy, { max: 120, hint: 'The officer who issued them. They must be a current officer of this company (any role).' });
// Shows the holder's voting power now and, as the share or classes are changed, what it would become and
// which "Ownership of voting rights" option matches (worked out in the browser by companies.js from the
// other current holdings; the register works out the real figure when the change is saved).
function votePreview(c, selfId) {
  const others = c ? c.psc.filter((p) => !p.ceased && p.id !== selfId).map((p) => store.classesOf(p)).filter((k) => k.known).map((k) => [k.a, k.b, k.c]) : [];
  const now = c && selfId ? store.votingPower(c)[selfId] : null;
  return '<div class="wide vote-preview" data-vote-preview data-others="' + esc(JSON.stringify(others)) + '" data-threshold="' + store.CLASS_C_CONTROL + '" data-control="' + store.CONTROL_VOTES + '">' +
    '<p class="field-group-title">Voting power</p>' + (now ? '<p>Now: <strong>' + esc(now.votes) + '% of the votes</strong>' + (now.control ? ' (voting control through Class C shares)' : now.sharedControl ? ' (voting control shared with ' + esc(now.sharedWith.join(' and ')) + ')' : '') + '.</p>' : '') +
    '<p class="vote-after" aria-live="polite">' + (now ? '' : 'Enter the shareholding or share classes to see the voting power.') + '</p></div>';
}
const ITEM_FIELDS = {
    officers: (o, opt) => { opt = opt || {}; return field('Full name', 'name', o.name, { required: true, max: 120 }) + select('Role', 'role', store.OFFICER_ROLES, o.role || 'Director') + field('Appointed on', 'appointed', o.appointed, { type: 'date', required: !!opt.appointedRequired }) + (opt.noResigned ? '' : field('Resigned on', 'resigned', o.resigned, { type: 'date' })) + field('Occupation', 'occupation', o.occupation, { max: 80 }) + field('Nationality', 'nationality', o.nationality, { max: 60 }) + field('Country of residence', 'countryOfResidence', o.countryOfResidence, { max: 60 }); },
    psc: (p, opt) => { opt = opt || {}; return field('Name', 'name', p.name, { required: true, max: 160, hint: 'A person’s full name, or a company’s registered name exactly as it appears on the register.' }) + select('Type', 'kind', store.PSC_KINDS, p.kind || 'Individual') + field('Share percentage', 'share', p.share, { type: 'number', number: true, max: 6, hint: 'From 0 to 100. Leave blank if not known, or if you give the share classes below.' }) + classFields(p) + field('Notified on', 'notified', p.notified, { type: 'date', required: !!opt.notifiedRequired }) + (opt.noCeased ? '' : field('Ceased on', 'ceased', p.ceased, { type: 'date' })) + votePreview(opt.company, opt.self) + controlField(p.control); },
    charges: (x) => field('Charge code', 'code', x.code, { max: 40 }) + select('Status', 'status', ['Outstanding', 'Part satisfied', 'Satisfied'], x.status || 'Outstanding') + field('Created on', 'created', x.created, { type: 'date' }) + field('Delivered on', 'delivered', x.delivered, { type: 'date' }) + field('Satisfied on', 'satisfied', x.satisfied, { type: 'date' }) + field('Persons entitled', 'entitled', x.entitled, { required: true, max: 200 }) + field('Brief description', 'description', x.description, { textarea: true, rows: 2, max: 600 }),
};
function itemForms(c, ctx, list) {
  const items = c[list];
  const forms = ITEM_FIELDS;
  const title = { officers: 'Officers', psc: 'Persons with significant control', charges: 'Charges' }[list];
  const label = (x) => list === 'charges' ? (x.code ? 'Charge ' + x.code : 'Charge for ' + x.entitled) : x.name;
  const base = '/admin/company/' + esc(c.slug) + '/' + list;
  return '<section class="panel"><h2>' + title + '</h2>' + items.map((x) => '<details class="item"><summary>' + esc(label(x)) + '</summary><form method="post" action="' + base + '/' + x.id + '" class="form grid-form">' + csrfField(ctx.staffUser.csrf) + forms[list](x, list === 'psc' ? { company: c, self: x.id } : undefined) +
    '<div class="form-actions"><button class="button small" type="submit">Save</button><button class="button small danger" type="submit" formaction="' + base + '/' + x.id + '/delete" data-confirm="Remove this entry?">Remove</button></div></form></details>').join('') +
    '<details class="item add"><summary>Add ' + (list === 'officers' ? 'an officer' : list === 'psc' ? 'a person with significant control' : 'a charge') + '</summary><form method="post" action="' + base + '" class="form grid-form">' + csrfField(ctx.staffUser.csrf) + forms[list]({}, list === 'psc' ? { company: c } : undefined) + '<div class="form-actions"><button class="button small" type="submit">Add</button></div></form></details></section>';
}

function adminCompany(res, ctx, c, flash) {
  const list = store.filings(c.slug);
  page(res, ctx, { title: 'Edit ' + c.legalName, noindex: true, flash,
    body: '<p><a href="/admin">← Administration</a></p><h1 class="page-title">' + esc(c.legalName) + '</h1><p><a href="/company/' + esc(c.slug) + '">View the public record →</a></p>' +
      '<section class="panel"><h2>Company details</h2>' + companyForm(c, ctx) + '</section>' + incorporationPanel(c, ctx) + managersPanel(c, ctx) + itemForms(c, ctx, 'officers') + itemForms(c, ctx, 'psc') + itemForms(c, ctx, 'charges') +
      '<section class="panel"><h2>Filing history</h2>' + (list.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Document</th><th></th></tr></thead><tbody>' + list.map((f) => '<tr><td>' + esc(fmt(f.date)) + '</td><td>' + esc(f.category) + '</td><td>' + esc(f.description) + (f.source === 'customer' ? ' <span class="muted small">(customer submission)</span>' : '') + '</td><td>' + (f.file ? '<a href="/document/' + f.id + '" target="_blank" rel="noopener">PDF</a>' : '—') + '</td><td><form method="post" action="/admin/filing/' + f.id + '/delete">' + csrfField(ctx.staffUser.csrf) + '<button class="link danger-text" type="submit" data-confirm="Delete this filing and its document?">Delete</button></form></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No filings yet.</p>') +
      '<details class="item add"><summary>Add a filing</summary><form method="post" action="/admin/company/' + esc(c.slug) + '/filings" class="form grid-form" enctype="multipart/form-data">' + csrfField(ctx.staffUser.csrf) + field('Date', 'date', new Date().toISOString().slice(0, 10), { type: 'date' }) + select('Type', 'category', store.FILING_CATEGORIES, 'Other') + field('Description', 'description', '', { required: true, max: 300 }) + fileField('Document', '', false) + '<div class="form-actions"><button class="button small" type="submit">Add filing</button></div></form></details></section>' +
      '<section class="panel danger-zone"><h2>Delete company</h2><p class="muted">This removes the company, its people, charges and all its filings from the register. It can’t be undone.</p><form method="post" action="/admin/company/' + esc(c.slug) + '/delete">' + csrfField(ctx.staffUser.csrf) + '<button class="button danger" type="submit" data-confirm="Delete ' + esc(c.legalName) + ' and all its records?">Delete company</button></form></section>' });
}

// Change (usually backdate) the incorporation date. The Incorporation filing moves with it, and so can the officers
// and persons with significant control recorded on the old date or before the new one.
function incorporationPanel(c, ctx) {
  return '<section class="panel" id="incorporation"><h2>Incorporation date</h2><p>' + (c.incorporated ? 'Incorporated on <strong>' + esc(fmt(c.incorporated)) + '</strong>.' : 'No incorporation date is recorded yet.') + '</p>' +
    '<p class="muted">Backdate the incorporation date if the company started earlier than recorded, or correct it if it was entered wrongly. The Incorporation filing and its PDF move to the new date.</p>' +
    '<form method="post" action="/admin/company/' + esc(c.slug) + '/incorporation" class="form grid-form">' + csrfField(ctx.staffUser.csrf) +
    field('New incorporation date', 'date', '', { type: 'date', required: true, hint: 'It can’t be in the future.' }) + field('Reason', 'reason', '', { max: 200, hint: 'Optional. Kept in the activity log, for example: Incorporated earlier than first recorded.' }) +
    '<div class="check wide"><input type="checkbox" id="move-records" name="moveRecords" checked><label for="move-records">Also move officers and persons with significant control recorded on the old date, or before the new date, to the new date (with their filings)</label></div>' +
    '<div class="form-actions"><button class="button" type="submit" data-confirm="Change ' + esc(c.legalName) + '’s incorporation date? Its filings will be updated.">Change incorporation date</button></div></form></section>';
}

// Customer accounts that manage the company. Managing a company also covers its subsidiaries.
function managersPanel(c, ctx) {
  const base = '/admin/company/' + esc(c.slug) + '/managers';
  const inherited = [];
  for (let cur = c.parent ? store.company(c.parent) : null, n = 0; cur && n < 20; cur = cur.parent ? store.company(cur.parent) : null, n++) inherited.push(cur);
  const viaParents = inherited.filter((x) => x.managers.length);
  return '<section class="panel"><h2>Managers</h2><p class="muted">Customers who manage this company can file changes for it and register its subsidiaries.</p>' +
    (c.managers.length ? '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th></th></tr></thead><tbody>' + c.managers.map((cid) => { const cu = store.customer(cid); return '<tr><td>' + esc(cu ? cu.name : 'Deleted account') + '</td><td>' + esc(cu ? cu.email : '') + '</td><td><form method="post" action="' + base + '/' + esc(cid) + '/delete">' + csrfField(ctx.staffUser.csrf) + '<button class="link danger-text" type="submit" data-confirm="Stop this customer managing the company?">Remove</button></form></td></tr>'; }).join('') + '</tbody></table></div>' : '<p>No customers manage this company directly.</p>') +
    (viaParents.length ? '<p class="muted small">Also managed through ' + viaParents.map((x) => esc(x.legalName)).join(', ') + '.</p>' : '') +
    '<form method="post" action="' + base + '" class="form inline-form">' + csrfField(ctx.staffUser.csrf) + field('Add a manager by their account email', 'email', '', { type: 'email', required: true, max: 160 }) + '<div class="form-actions"><button class="button small" type="submit">Add manager</button></div></form></section>';
}

const classSummary = (p) => [['A', p.classA], ['B', p.classB], ['C', p.classC]].filter(([, v]) => Number(v || 0) > 0).map(([n, v]) => 'Class ' + n + ' ' + v + '%').join(', ') + (Number(p.classC || 0) > 0 ? ' (Class C issued by ' + p.classCIssuedBy + ')' : '');
// The details of a filed change, as staff need to review it.
function changeDetails(s) {
  const ch = s.change || {};
  const rows = [];
  if (s.kind === 'appoint' && ch.officer) { const o = ch.officer; rows.push(['Name', o.name], ['Role', o.role], ['Appointed on', fmt(o.appointed)], ['Occupation', o.occupation], ['Nationality', o.nationality], ['Country of residence', o.countryOfResidence]); }
  else if (s.kind === 'psc_add' && ch.psc) { const p = ch.psc; rows.push(['Name', p.name], ['Type', p.kind], ['Shareholding', p.share ? p.share + '%' : ''], ['Share classes', classSummary(p)], ['Nature of control', (p.control || []).join('; ')], ['Notified on', fmt(p.notified)]); }
  else if (s.kind === 'psc_change' && ch.after) {
    const show = (y) => [y.name, y.kind, y.share ? y.share + '%' : 'Shareholding not recorded', classSummary(y), (y.control || []).join('; ')].filter(Boolean).join(' · ');
    rows.push(['Previous details', show(ch.before)], ['New details', show(ch.after)], ['Changed on', fmt(ch.changed)]);
  }
  else if (s.kind === 'sic') rows.push(['New nature of business', ch.sic.join('; ')]);
  else if (s.kind === 'incorporate' && ch.details) {
    const x = ch.details, o = ch.officer || {}, p = ch.psc || {};
    rows.push(['Registered name', x.legalName], ['Trading name', x.name], ['Company type', x.type], ['Incorporated on', x.incorporated ? fmt(x.incorporated) : 'The date it’s accepted'], ['Registered office', x.registeredOffice.replace(/\n/g, ', ')],
      ['Nature of business', x.sic.replace(/\n/g, '; ')], ['Parent company', x.parent ? (store.company(x.parent)?.legalName || 'No longer on the register') : ''], ['Website', x.website], ['About', x.description],
      ['First officer', o.name + ' (' + o.role + ')' + (o.appointed ? ', appointed ' + fmt(o.appointed) : '')],
      ['First person with significant control', p.name + ' (' + p.kind + (p.share ? ', ' + p.share + '%' : '') + ')' + ((p.control || []).length ? ': ' + p.control.join('; ') : '')]);
  }
  if (!rows.length) return '';
  return dl(rows.filter((r) => r[1]).map(([k, x]) => [k, esc(x)]));
}

function adminSubmissions(res, ctx, flash) {
  const list = [...store.db.submissions].sort((a, b) => (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)).slice(0, 300);
  page(res, ctx, { title: 'Submissions', noindex: true, flash,
    body: '<h1 class="page-title">Filing submissions</h1>' + adminNav('/admin/submissions', ctx.staffUser) + '<section class="panel">' + (list.length ? list.map((s) => {
      const cust = store.customer(s.customer);
      const special = { incorporate: 'Application to register a company', claim: 'Request to manage a company' }[s.kind];
      return '<article class="item-card"><h3>' + esc(s.ref) + ' · ' + esc(companyName(s)) + ' <span class="status ' + (s.status === 'Accepted' ? 'ok' : s.status === 'Pending' ? 'warn' : 'bad') + '">' + esc(s.status) + '</span></h3>' +
        '<p><strong>' + esc(special || (store.CHANGE_TYPES[s.kind || 'document'] || {}).label || s.category) + ':</strong> ' + esc(s.description) + '</p>' + changeDetails(s) + '<p class="muted small">From ' + esc(cust ? cust.name + ' (' + cust.email + ')' : 'a deleted account') + ' · ' + esc(fmtTime(s.createdAt)) + '</p>' + (s.note ? '<p class="note">' + esc(s.note) + '</p>' : '') +
        (s.status === 'Pending' ? (s.file ? '<p><a href="/admin/submission-file/' + s.id + '" target="_blank" rel="noopener">Open the PDF' + (s.pages ? ' (' + plural(s.pages, 'page', 'pages') + ')' : '') + '</a></p>' : '<p class="muted small">' + (special ? 'No document attached.' : 'No PDF attached; one will be created from these details.') + '</p>') + '<form method="post" action="/admin/submissions/' + s.id + '" class="form">' + csrfField(ctx.staffUser.csrf) + field('Note to the customer (optional)', 'note', '', { max: 1000 }) +
          '<div class="form-actions"><button class="button small" type="submit" name="decision" value="accept">' + (s.kind === 'claim' ? 'Approve' : s.kind === 'incorporate' ? 'Accept and register' : 'Accept and publish') + '</button><button class="button small danger" type="submit" name="decision" value="reject">Reject</button></div></form>' : (s.staffNote ? '<p class="muted small">Note: ' + esc(s.staffNote) + '</p>' : '')) + '</article>';
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
    body: '<h1 class="page-title">Customer accounts</h1>' + adminNav('/admin/customers', ctx.staffUser) + '<section class="panel"><p class="muted">' + plural(store.db.customers.length, 'account', 'accounts') + '. Customers can only see their own requests and submissions.</p>' + (list.length ? '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Manages</th><th>Created</th><th>Last sign-in</th><th></th></tr></thead><tbody>' +
      list.map((c) => '<tr><td>' + esc(c.name) + (c.disabled ? ' <span class="status bad">Disabled</span>' : '') + '</td><td>' + esc(c.email) + '</td><td>' + (store.companies(true).filter((x) => x.managers.includes(c.id)).map((x) => '<a href="/admin/company/' + esc(x.slug) + '">' + esc(x.legalName) + '</a>').join('<br>') || '—') + '</td><td>' + esc(fmtTime(c.createdAt)) + '</td><td>' + (c.lastLoginAt ? esc(fmtTime(c.lastLoginAt)) : '—') + '</td><td><form method="post" action="/admin/customers/' + c.id + '">' + csrfField(ctx.staffUser.csrf) + '<button class="link" type="submit" name="disabled" value="' + (c.disabled ? '0' : '1') + '">' + (c.disabled ? 'Enable' : 'Disable') + '</button></form></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Nobody has created an account yet.</p>') + '</section>' });
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
  if (priv.ENABLED && await priv.gate(req, res, url, p, (r, status, title, text, cookies, signedOut) =>
    send(r, status, layout({ title, noindex: true, searchBar: false, customer: signedOut ? null : customers.current(req), staffUser: signedOut ? null : staff.current(req),
      body: '<section class="panel narrow"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p><p><a class="button" href="' + (signedOut ? '/auth/login' : '/') + '">' + (signedOut ? 'Sign in with HN Group' : 'Go to the register') + '</a></p></section>' }), cookies && cookies.length ? { 'Set-Cookie': cookies } : {}))) return;

  const ctx = { customer: customers.current(req), staffUser: priv.ENABLED ? staff.current(req) : null };
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
  // A read-only feed of the public company records, which the HN Group Wiki follows.
  if (req.method === 'GET' && p === '/api/public/companies') {
    const feed = store.publicFeed(), etag = '"' + feed.version + '"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(feed));
  }
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
    if (sub === 'group-report' && req.method === 'GET') {
      if (needCustomer(res, ctx, p)) return;
      if (!url.searchParams.has('generate')) return groupReportPage(res, ctx, c);
      const on = (k) => url.searchParams.get(k) === '1';
      const { buffer, count } = store.groupReport(c.slug, { subsidiaries: on('subsidiaries'), officers: on('officers'), psc: on('psc'), charges: on('charges'), filings: on('filings') });
      store.audit('customer:' + ctx.customer.account.email, 'report.generate', c.slug + ' (' + count + ' compan' + (count === 1 ? 'y' : 'ies') + ')'); store.save();
      const name = c.slug + '-' + (count > 1 ? 'group-' : '') + 'report-' + new Date().toISOString().slice(0, 10) + '.pdf';
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': buffer.length, 'Content-Disposition': 'attachment; filename="' + name + '"', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'no-store' });
      return res.end(buffer);
    }
    if (sub === 'claim') {
      if (needCustomer(res, ctx, p)) return;
      if (store.canManage(c, ctx.customer.account.id)) return accountPage(res, ctx, { text: 'You already manage ' + c.legalName + '.' });
      if (req.method === 'GET') return claimPage(res, ctx, c, {});
      if (req.method === 'POST') {
        const { fields, file } = await forms.parse(req);
        if (fields.csrf !== ctx.customer.csrf) throw fail(403, 'Your session has changed. Go back, refresh the page and try again.');
        try { const s = store.addSubmission(ctx.customer.account, c.slug, { note: fields.note, kind: 'claim' }, file); return redirect(res, '/account?sent=' + s.ref); }
        catch (e) { if (e.status !== 400 && e.status !== 429) throw e; return claimPage(res, ctx, c, fields, e.message); }
      }
    }
    if (sub === 'request' || sub === 'report' || sub === 'file') {
      if (needCustomer(res, ctx, p)) return;
      if (sub === 'file' && !store.canManage(c, ctx.customer.account.id)) return notManagerPage(res, ctx, c);
      if (req.method === 'GET') return sub === 'file' ? submitForm(res, ctx, c, { psc: url.searchParams.get('psc') || '' }, null, url.searchParams.get('type')) : requestForm(res, ctx, c, sub === 'report' ? 'mistake' : 'copy', {});
      if (req.method === 'POST') {
        const { fields, file } = await forms.parse(req);
        if (fields.csrf !== ctx.customer.csrf) throw fail(403, 'Your session has changed. Go back, refresh the page and try again.');
        if (sub === 'file' && (fields.kind === 'psc_add' || fields.kind === 'psc_change')) fields.item = unprefix(fields, 'psc_');
        try {
          if (sub === 'file') { const s = store.addSubmission(ctx.customer.account, c.slug, { ...fields, kind: fields.kind === 'claim' ? 'document' : fields.kind }, file); return redirect(res, '/account?sent=' + s.ref); }
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
    if (needCustomer(res, ctx, p + url.search)) return;
    if (p === '/account' && req.method === 'GET') {
      // After sending something for review, the browser is sent here so a refresh can't send it again.
      const sent = store.db.submissions.find((x) => x.ref === url.searchParams.get('sent') && x.customer === ctx.customer.account.id);
      return accountPage(res, ctx, sent ? { text: 'Thanks. Your ' + (sent.kind === 'claim' ? 'request ' + sent.ref + ' to manage ' + companyName(sent) : sent.kind === 'incorporate' ? 'application ' + sent.ref : 'filing ' + sent.ref) + ' has been sent for review.' } : undefined);
    }
    if (p === '/account/register-company') {
      if (req.method === 'GET') return registerCompanyPage(res, ctx, { parent: url.searchParams.get('parent') || '' });
      if (req.method === 'POST') {
        const { fields } = await forms.parse(req);
        if (fields.csrf !== ctx.customer.csrf) throw fail(403, 'Your session has changed. Refresh the page and try again.');
        const officer = unprefix(fields, 'officer_'), psc = unprefix(fields, 'psc_');
        try { const s = store.addApplication(ctx.customer.account, fields, officer, psc); return redirect(res, '/account?sent=' + s.ref); }
        catch (e) { if (e.status !== 400 && e.status !== 403 && e.status !== 429) throw e; return registerCompanyPage(res, ctx, { ...fields, officer, psc }, e.message); }
      }
    }
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
    m = /^\/admin\/company\/([a-z0-9-]+)(?:\/(officers|psc|charges|filings|managers|incorporation|delete))?(?:\/([a-f0-9]{24}))?(\/delete)?$/.exec(p);
    if (m) {
      const c = store.company(m[1]);
      if (!c) return messagePage(res, ctx, 404, 'Company not found', 'That company isn’t on the register.');
      if (req.method === 'GET' && !m[2]) return adminCompany(res, ctx, c);
      if (req.method === 'POST') {
        try {
          if (!m[2]) { store.saveCompany(c.slug, fields, actor); return adminCompany(res, ctx, c, { text: 'Company details saved.' }); }
          if (m[2] === 'incorporation') { const r = store.changeIncorporation(c.slug, fields, actor); return adminCompany(res, ctx, c, { text: 'Incorporation date changed to ' + fmt(r.date) + (r.old ? ' (was ' + fmt(r.old) + ')' : '') + '. The Incorporation filing has been updated' + (r.moved ? ', and ' + r.moved + (r.moved === 1 ? ' officer or person with significant control was' : ' officers and persons with significant control were') + ' moved to the new date' : '') + '.' }); }
          if (m[2] === 'delete') { store.deleteCompany(c.slug, actor); return adminHome(res, ctx, { text: c.legalName + ' has been deleted.' }); }
          if (m[2] === 'managers') { if (m[4]) store.removeManager(c.slug, m[3], actor); else store.addManager(c.slug, fields.email, actor); return adminCompany(res, ctx, c, { text: m[4] ? 'Manager removed.' : 'Manager added.' }); }
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
      const done = s.kind === 'claim' ? ' approved. They now manage the company.' : s.kind === 'incorporate' ? ' accepted. The company has been registered and the applicant manages it.' : ' accepted. The company record has been updated and the filing published.';
      return adminSubmissions(res, ctx, { text: s.ref + (s.status === 'Accepted' ? done : ' rejected.') });
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
