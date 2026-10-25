'use strict';
// HN Group Investors — investors.hngroup.org.uk. Investors sign in with their own accounts (made by
// staff with an invitation link) to see what they're invested in, what it's worth and news for
// investors. HN Group staff sign in through HN Group Auth to manage investors, valuations and news.
// Holdings come from the HN Group Company Register; valuations are recorded here.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('./lib/auth');
const store = require('./lib/store');
const register = require('./lib/register');
const holdings = require('./lib/holdings');
const newsroom = require('./lib/newsroom');
const documents = require('./lib/documents');
const NEWS_ADMIN = (process.env.NEWS_ORIGIN || 'https://news.hngroup.org.uk') + '/admin';

const PUBLIC = process.env.INVESTORS_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.INVESTORS_DATA_DIR || '/var/lib/hn-investors';
const ORIGIN = auth.INVESTORS_ORIGIN;
const INVESTOR_COOKIE = (auth.SECURE ? '__Host-' : '') + 'hn_investor';
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
store.init(DATA_DIR);
register.init(DATA_DIR);
newsroom.init(DATA_DIR);
store.useFeed(newsroom.all);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);
const longDate = (iso) => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }); };
const dateTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const STRIPE = [['pink', 14], ['purple', 14], ['yellow', 6], ['teal', 20], ['plum', 10], ['raspberry', 10], ['green', 13], ['navy', 13]];
const brandDir = path.join(PUBLIC, 'assets', 'brand');
const brandFiles = new Set(fs.existsSync(brandDir) ? fs.readdirSync(brandDir) : []);

// A company's approved logo (roundel or wordmark), or its initials.
function logo(c, cls) {
  const base = register.displayName(c).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const kind of ['-roundel', '-wordmark']) if (brandFiles.has(base + kind + '.svg')) {
    const white = brandFiles.has(base + kind + '-white.svg') ? base + kind + '-white.svg' : base + kind + '.svg';
    return '<span class="logo ' + (cls || '') + (kind === '-wordmark' ? ' wide' : '') + '"><img class="on-light" src="/assets/brand/' + base + kind + '.svg" alt=""><img class="on-dark" src="/assets/brand/' + white + '" alt=""></span>';
  }
  return '<span class="logo initials ' + (cls || '') + '" aria-hidden="true">' + esc(register.displayName(c).split(/\s+/).map((w) => w[0]).join('').slice(0, 3)) + '</span>';
}
const paragraphs = (text) => String(text || '').split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');

// ---------- Page shell ----------

function layout(o) {
  const who = o.investor ? 'investor' : o.staff ? 'staff' : '';
  const nav = who === 'investor' ? [['/', 'Overview'], ['/holdings', 'Holdings'], ['/documents', 'Documents'], ['/news', 'News'], ['/account', 'Account']]
    : who === 'staff' ? [['/staff', 'Dashboard'], ['/staff/investors', 'Investors'], ['/staff/companies', 'Companies'], ['/staff/news', 'News'], ['/staff/activity', 'Activity']] : [];
  const signOut = who === 'investor' ? '<form method="post" action="/logout"><input type="hidden" name="csrf" value="' + esc(o.csrf) + '"><button type="submit" class="link">Sign out</button></form>'
    : who === 'staff' ? '<form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="' + esc(o.staff.csrf) + '"><button type="submit" class="link">Sign out</button></form>' : '';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#5514B4"><meta name="robots" content="noindex, nofollow"><title>' + esc(o.title) + ' · HN Group Investors</title>' +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>' +
    '<link rel="stylesheet" href="/assets/investors.css?v=6"><script src="/assets/investors.js?v=1" defer></script></head><body class="' + (who || 'public') + '">' +
    '<a class="skip" href="#content">Skip to content</a><div class="stripe" aria-hidden="true">' + STRIPE.map(([id, w]) => '<i class="c-' + id + ' f' + w + '"></i>').join('') + '</div>' +
    '<header class="top"><a class="brand" href="' + (who === 'staff' ? '/staff' : '/') + '"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="92" height="32"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="92" height="32"><span class="brand-name">Investors</span></a>' +
    (nav.length ? '<nav class="nav" aria-label="Main">' + nav.map(([href, label]) => '<a href="' + href + '"' + (o.active === href ? ' aria-current="page"' : '') + '>' + label + (href === '/news' && o.unread ? ' <span class="badge">' + o.unread + '</span>' : '') + '</a>').join('') + '</nav>' : '') +
    (who ? '<div class="user"><span class="who">' + esc(who === 'staff' ? o.staff.name : o.investor.name) + (who === 'staff' ? ' <span class="tag">Staff</span>' : '') + '</span>' + signOut + '</div>' : '') +
    '</header><main id="content" class="' + (o.narrow ? 'narrow' : '') + '">' + (o.flash ? '<div class="flash ' + (o.flash.kind || '') + '" role="status">' + esc(o.flash.text) + '</div>' : '') + o.body + '</main>' +
    '<footer class="foot"><p>HN Group Investors is run by HN Group Limited. Holdings come from the <a href="' + esc(register.PUBLIC_URL) + '">HN Group Company Register</a>; values are based on the latest valuation HN Group has recorded and aren’t an offer to buy or sell. © ' + new Date().getFullYear() + ' HN Group Limited.</p></footer></body></html>';
}
function send(res, status, html, headers) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) }); res.end(html); }
function redirect(res, location, cookies) { res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] }); res.end(); }
function message(res, status, title, text, cookies, action, ctx) {
  send(res, status, layout({ ...(ctx || {}), title, narrow: true, body: '<section class="hero small"><p class="eyebrow">HN Group Investors</p><h1>' + esc(title) + '</h1><p class="lede">' + esc(text) + '</p>' + (action ? '<p><a class="button" href="' + esc(action[1]) + '">' + esc(action[0]) + '</a></p>' : '') + '</section>' }), cookies ? { 'Set-Cookie': cookies } : {});
}
const cookieValue = (req, name) => (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || '';
const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly;${auth.SECURE ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;
const flashOf = (url) => { const m = { saved: 'Saved.', password: 'Your password has been changed.', deleted: 'Deleted.', valuation: 'Valuation recorded.', published: 'Published. Investors can see it now.', draft: 'Saved as a draft. Investors can’t see it yet.' }[url.searchParams.get('done')]; return m ? { text: m, kind: 'ok' } : null; };

// ---------- Public pages ----------

function landing(res, url) {
  const body = '<section class="hero"><p class="eyebrow">HN Group · Investor relations</p><h1>Investors.</h1>' +
    '<p class="lede">See what you’re invested in across HN Group, what your holdings are worth, and the latest news for investors.</p></section>' +
    (url.searchParams.get('signed-out') ? '<div class="flash ok" role="status">You’ve signed out.</div>' : '') +
    '<section class="choices">' +
    '<article class="choice"><span class="choice-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19h16M6 16V9m4 7V5m4 11v-5m4 5V8"/></svg></span><h2>Investors</h2><p>Sign in with the email address and password you set up from your invitation.</p><p><a class="button" href="/login">Investor sign in</a></p></article>' +
    '<article class="choice"><span class="choice-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/></svg></span><h2>HN Group staff</h2><p>Staff with a role at HN Group sign in with HN Group Auth to manage investors, valuations and news.</p><p><a class="button secondary" href="/auth/login?return=%2Fstaff">Staff sign in</a></p></article>' +
    '</section>';
  send(res, 200, layout({ title: 'Investor relations', body }));
}
function loginPage(res, error, email) {
  const body = '<section class="card form-card"><p class="eyebrow">HN Group Investors</p><h1>Investor sign in</h1>' +
    (error ? '<div class="flash error" role="alert">' + esc(error) + '</div>' : '') +
    '<form method="post" action="/login" class="form" data-once><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="username" required value="' + esc(email || '') + '">' +
    '<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>' +
    '<button class="button" type="submit">Sign in</button></form>' +
    '<p class="muted small">Forgotten your password, or haven’t got an account? Ask your HN Group contact for a new invitation link.</p></section>';
  send(res, error ? 400 : 200, layout({ title: 'Investor sign in', narrow: true, body }));
}
function invitePage(res, token, x, error) {
  if (!x) return message(res, 410, 'Invitation expired', 'This invitation has expired or has already been used. Ask your HN Group contact for a new one.', null, ['Go to sign in', '/login']);
  const body = '<section class="card form-card"><p class="eyebrow">HN Group Investors</p><h1>Welcome, ' + esc(x.name.split(' ')[0]) + '.</h1><p class="muted">Choose a password for <b>' + esc(x.email) + '</b>. You’ll use it with your email address to sign in.</p>' +
    (error ? '<div class="flash error" role="alert">' + esc(error) + '</div>' : '') +
    '<form method="post" action="/invite/' + esc(token) + '" class="form" data-once><input type="text" name="username" autocomplete="username" value="' + esc(x.email) + '" hidden>' +
    '<label for="password">New password</label><input id="password" name="password" type="password" minlength="10" autocomplete="new-password" required><p class="hint">At least 10 characters.</p>' +
    '<label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" minlength="10" autocomplete="new-password" required>' +
    '<button class="button" type="submit">Set password and sign in</button></form></section>';
  send(res, error ? 400 : 200, layout({ title: 'Set up your account', narrow: true, body }));
}

// ---------- Investor pages ----------

function chart(series) {
  if (series.length < 2) return '';
  const W = 640, H = 180, P = 8, max = Math.max(...series.map((p) => p.value)) || 1, min = Math.min(0, ...series.map((p) => p.value));
  const t0 = Date.parse(series[0].asOf), t1 = Date.parse(series[series.length - 1].asOf) || t0 + 1;
  const pt = (p) => [P + (W - 2 * P) * ((Date.parse(p.asOf) - t0) / ((t1 - t0) || 1)), H - P - (H - 2 * P) * ((p.value - min) / ((max - min) || 1))].map((n) => n.toFixed(1));
  const line = series.map((p) => pt(p).join(',')).join(' ');
  return '<figure class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Value of your holdings at each valuation, from ' + esc(money(series[0].value)) + ' on ' + esc(longDate(series[0].asOf)) + ' to ' + esc(money(series[series.length - 1].value)) + ' on ' + esc(longDate(series[series.length - 1].asOf)) + '">' +
    '<polygon class="area" points="' + P + ',' + (H - P) + ' ' + line + ' ' + pt(series[series.length - 1])[0] + ',' + (H - P) + '"/><polyline class="line" points="' + line + '"/>' +
    series.map((p) => '<circle class="dot" cx="' + pt(p)[0] + '" cy="' + pt(p)[1] + '" r="4"><title>' + esc(longDate(p.asOf) + ': ' + money(p.value)) + '</title></circle>').join('') + '</svg>' +
    '<figcaption><span>' + esc(longDate(series[0].asOf)) + '</span><span>' + esc(longDate(series[series.length - 1].asOf)) + '</span></figcaption></figure>';
}
function change(now, before) {
  if (before === null || before === undefined || now === null) return '';
  const d = now - before, pct = before ? (d / before) * 100 : null;
  return '<span class="change ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + esc(money(Math.abs(d))) + (pct !== null ? ' (' + (d >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%)' : '') + ' since the previous valuation</span>';
}
// Share classes and votes (worked out by the Company Register): Class A one vote, Class B half a vote,
// Class C two votes, and 51% of the votes for the largest Class C holder if they have more than 10% of them.
const CLASS_HELP = '<details class="explain"><summary>How share classes and voting power work</summary><ul>' +
  '<li><b>Class A</b> shares are ordinary shares, available to the public and other companies. Each carries one vote.</li>' +
  '<li><b>Class B</b> shares are for HN Group staff. Each carries half the votes of a Class A share.</li>' +
  '<li><b>Class C</b> shares are special issue shares, issued only by one of the company’s officers. Each carries double the votes of a Class A share. Of the holders with more than 10% of all the Class C shares, the one holding the most holds 51% of the company’s votes (or more, if their shares already give them more); the others count double.</li>' +
  '<li>Holdings not split into classes count as Class A. Your voting power is your share of all the votes held by the company’s recorded shareholders.</li></ul></details>';
const classesOf = (h) => register.classText(h) || (h.share !== null ? 'Class A (not split)' : '—');
function votesBar(v) { const w = Math.max(0, Math.min(100, v)); return '<svg class="bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect class="bar-bg" width="100" height="8" rx="4"/><rect class="bar-fill" width="' + w.toFixed(2) + '" height="8" rx="4"/></svg>'; }
function votingSection(s) {
  const list = s.direct.filter((h) => h.votes !== null);
  if (!list.length) return '';
  return '<section class="block"><h2>Your voting power</h2><p class="intro">Your share of the votes in each company you hold directly, based on the classes of share you hold.</p><div class="votes">' +
    list.map((h) => '<div class="vote-row"><span class="cell-co">' + logo(h.company, 'sm') + esc(register.displayName(h.company)) + '</span><span class="vote-figure"><b>' + esc(h.votes) + '%</b> of votes' + (h.votingControl ? ' <span class="pill ok">Voting control</span>' : '') + '</span>' + votesBar(h.votes) +
      '<span class="muted small">' + esc(classesOf(h)) + (h.votingControl ? ' · You hold the most Class C shares (more than 10% of them), so you hold 51% of the votes or more.' : '') + '</span></div>').join('') + '</div>' + CLASS_HELP + '</section>';
}
// The register's nature-of-control wording, shortened for the holdings table (the full text is the tooltip).
function shortControl(x) {
  const t = String(x), range = (/(more than 25% but not more than 50%|more than 50% but less than 75%|75% or more)/i.exec(t) || [])[1];
  const r = range ? ' ' + { 'more than 25% but not more than 50%': '25–50%', 'more than 50% but less than 75%': '50–75%', '75% or more': '75%+' }[range.toLowerCase()] : '';
  if (/^ownership of shares/i.test(t)) return 'Shares' + r;
  if (/^ownership of voting/i.test(t)) return 'Votes' + r;
  if (/appoint and remove directors/i.test(t)) return 'Appoints directors';
  if (/significant influence or control/i.test(t)) return 'Significant influence';
  return t.length > 28 ? t.slice(0, 26) + '…' : t;
}
const shortDate = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }); };
function holdingCard(h) {
  const c = h.company;
  return '<article class="holding"><div class="holding-head">' + logo(c) + '<div><h3>' + esc(register.displayName(c)) + '</h3><p class="muted small">' + esc(c.legalName || '') + (c.number ? ' · Company ' + esc(c.number) : '') + '</p></div></div>' +
    '<dl class="facts"><div><dt>Your holding</dt><dd>' + esc(h.shareText) + '</dd></div>' +
    '<div><dt>Share classes</dt><dd>' + esc(classesOf(h)) + '</dd></div>' +
    '<div><dt>Voting power</dt><dd>' + (h.votes !== null ? '<b>' + esc(h.votes) + '%</b>' + (h.votingControl ? ' <span class="pill ok">Control</span>' : '') : '<span class="muted">Not recorded</span>') + '</dd></div>' +
    '<div><dt>Value</dt><dd>' + (h.value !== null ? '<b>' + esc(money(h.value)) + '</b>' : '<span class="muted">' + (h.share === null ? 'Needs an exact share on the register' : 'Not valued yet') + '</span>') + '</dd></div>' +
    '<div><dt>Company valuation</dt><dd>' + (h.valuation ? esc(money(h.valuation.amount)) + '<span class="muted small"> on ' + esc(longDate(h.valuation.asOf)) + '</span>' : '<span class="muted">Not recorded</span>') + '</dd></div>' +
    (h.holder ? '<div><dt>Held as</dt><dd>' + esc(h.holder) + '</dd></div>' : '') + '</dl>' +
    (h.value !== null ? change(h.value, h.previousValue) : '') +
    (c.description ? '<p class="desc">' + esc(c.description) + '</p>' : '') +
    '<p class="small"><a href="' + esc(register.registerUrl(c)) + '">View on the Company Register</a>' + (c.website ? ' · <a href="' + esc(/^https?:/.test(c.website) ? c.website : 'https://' + c.website) + '">' + esc(c.website.replace(/^https?:\/\//, '')) + '</a>' : '') + '</p></article>';
}
function interestsTable(list) {
  if (!list.length) return '';
  return '<section class="block"><h2>Held through your companies</h2><p class="intro">Companies your holdings own in turn. Their value is already part of the value of the company that owns them.</p><div class="table-wrap"><table><thead><tr><th>Company</th><th>Owned through</th><th>Your effective interest</th></tr></thead><tbody>' +
    list.map((i) => '<tr><td><span class="cell-co">' + logo(i.company, 'sm') + esc(register.displayName(i.company)) + '</span></td><td>' + i.through.map((c) => esc(register.displayName(c))).join(' → ') + '</td><td>' + esc(i.shareText) + '</td></tr>').join('') + '</tbody></table></div></section>';
}
const unreadFor = (x) => store.news().filter((n) => !x.newsSeen || n.publishedAt > x.newsSeen).length;
function newsList(items, x, base) {
  if (!items.length) return '<p class="muted">There’s no investor news yet.</p>';
  return '<ul class="news-list">' + items.map((n) => '<li><a href="' + base + n.id + '"><span class="news-date">' + esc(longDate(n.publishedAt || n.updatedAt)) + (x && (!x.newsSeen || n.publishedAt > x.newsSeen) ? ' <span class="badge">New</span>' : '') + (n.status === 'draft' ? ' <span class="tag">Draft</span>' : '') + '</span><span class="news-title">' + esc(n.title) + '</span>' +
    '<span class="news-snippet">' + esc(n.body.slice(0, 180)) + (n.body.length > 180 ? '…' : '') + '</span></a></li>').join('') + '</ul>';
}
function investorOverview(x, ctx, preview) {
  const s = holdings.summary(x.holders, store.valuations()), first = x.name.split(' ')[0];
  const body = (preview ? '<div class="flash">You’re previewing what ' + esc(x.name) + ' sees. <a href="/staff/investors/' + esc(x.id) + '">Back to their account</a></div>' : '') +
    '<section class="hero small"><p class="eyebrow">Your investments</p><h1>Hello, ' + esc(first) + '.</h1></section>' +
    '<section class="summary">' +
    '<div class="stat big"><span class="stat-label">Total value</span><span class="stat-value">' + (s.direct.length && s.total ? esc(money(s.total)) : s.direct.length ? '—' : esc(money(0))) + '</span>' + (s.previous !== null ? change(s.total, s.previous) : '') +
    (s.unvalued ? '<span class="muted small">' + s.unvalued + ' holding' + (s.unvalued === 1 ? ' isn’t' : 's aren’t') + ' valued yet.</span>' : '') + '</div>' +
    '<div class="stat"><span class="stat-label">Companies you hold directly</span><span class="stat-value">' + s.direct.length + '</span></div>' +
    '<div class="stat"><span class="stat-label">Held through them</span><span class="stat-value">' + s.indirect.length + '</span></div></section>' +
    chart(s.series) + votingSection(s) +
    '<section class="block"><div class="block-head"><h2>What you’re invested in</h2><a href="/holdings">Full details</a></div>' +
    (s.direct.length ? '<div class="holdings">' + s.direct.map(holdingCard).join('') + '</div>' : '<p class="muted">No holdings are recorded for you on the Company Register yet. If you think this is wrong, contact HN Group.</p>') + '</section>' +
    interestsTable(s.indirect) +
    (documents.forInvestor(x).length ? '<section class="block"><div class="block-head"><h2>Your documents</h2>' + (preview ? '' : '<a href="/documents">All documents</a>') + '</div>' + documentList(documents.forInvestor(x), !preview) + '</section>' : '') +
    '<section class="block"><div class="block-head"><h2>Investor news</h2><a href="' + (preview ? '/staff/news' : '/news') + '">All news</a></div>' + newsList(store.news().slice(0, 3), preview ? null : x, preview ? '/staff/news/' : '/news/') + '</section>';
  return layout({ ...ctx, title: 'Your investments', active: '/', body, unread: preview ? 0 : unreadFor(x) });
}
function holdingsPage(x, ctx) {
  const s = holdings.summary(x.holders, store.valuations());
  const rows = s.direct.map((h) => '<tr><td><span class="cell-co">' + logo(h.company, 'sm') + '<span><b>' + esc(register.displayName(h.company)) + '</b><span class="sub">' + esc(h.holder) + (h.kind ? ' · ' + esc(h.kind) : '') + '</span></span></span></td>' +
    '<td><b>' + esc(h.shareText) + '</b><span class="sub wrap">' + esc(classesOf(h)) + (Number((h.classes || {}).C || 0) > 0 && h.classCIssuedBy ? ' · C issued by ' + esc(h.classCIssuedBy) : '') + '</span></td>' +
    '<td class="num"><b>' + (h.votes !== null ? esc(h.votes) + '%' : '—') + '</b>' + (h.votingControl ? '<span class="sub"><span class="pill ok">Control</span></span>' : '') + '</td>' +
    '<td>' + (h.control.length ? '<span class="chips">' + h.control.map((x) => '<span class="chip" title="' + esc(x) + '">' + esc(shortControl(x)) + '</span>').join('') + '</span>' : '<span class="muted">—</span>') + '</td>' +
    '<td class="nowrap since">' + (h.notified ? esc(shortDate(h.notified)) : '—') + '</td><td class="num"><b>' + (h.value !== null ? esc(money(h.value)) : '—') + '</b></td></tr>').join('');
  const history = s.direct.filter((h) => h.history.length).map((h) => '<h3>' + esc(register.displayName(h.company)) + '</h3><div class="table-wrap"><table><thead><tr><th>Valuation date</th><th class="num">Company valuation</th><th class="num">Your share</th></tr></thead><tbody>' +
    (store.valuations()[h.company.slug] || []).slice().sort((a, b) => b.asOf.localeCompare(a.asOf)).map((v) => '<tr><td>' + esc(longDate(v.asOf)) + (v.note ? '<div class="muted small">' + esc(v.note) + '</div>' : '') + '</td><td class="num">' + esc(money(v.amount)) + '</td><td class="num">' + esc(money(Math.round(v.amount * h.share) / 100)) + '</td></tr>').join('') + '</tbody></table></div>').join('');
  const body = '<section class="hero small"><p class="eyebrow">Your investments</p><h1>Holdings</h1><p class="lede">Every holding recorded for you on the HN Group Company Register, as ' + esc(x.holders.join(', ') || '—') + '.</p></section>' +
    (s.direct.length ? '<div class="table-wrap"><table class="holdings-table"><thead><tr><th>Company</th><th>Share</th><th class="num">Votes</th><th>Nature of control</th><th class="since">Since</th><th class="num">Value</th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><th colspan="4">Total</th><td class="since"></td><th class="num">' + esc(money(s.total)) + '</th></tr></tfoot></table></div>' + CLASS_HELP : '<p class="muted">No holdings are recorded for you yet.</p>') +
    interestsTable(s.indirect) + (history ? '<section class="block"><h2>Valuation history</h2>' + history + '</section>' : '');
  return layout({ ...ctx, title: 'Holdings', active: '/holdings', body, unread: unreadFor(x) });
}
// Your documents: share certificates and other documents issued to the register names on your account.
function documentList(list, links) {
  return '<div class="table-wrap"><table><thead><tr><th>Document</th><th>Company</th><th>Issued</th>' + (links ? '<th></th>' : '') + '</tr></thead><tbody>' + list.map((d) => '<tr><td><b>' + esc(d.title) + '</b><span class="sub">' + esc(d.kind) + (d.detail ? ' · ' + esc(d.detail) : '') + ' · ' + esc(d.holder) + '</span></td><td>' + esc(d.company) + '</td><td class="nowrap">' + esc(longDate(d.issued)) + '</td>' +
    (links ? '<td class="num"><a class="button" href="/documents/' + esc(d.id) + '" target="_blank" rel="noopener">Open PDF</a></td>' : '') + '</tr>').join('') + '</tbody></table></div>';
}
function documentsPage(x, ctx) {
  const list = documents.forInvestor(x);
  const body = '<section class="hero small"><p class="eyebrow">Your investments</p><h1>Documents</h1><p class="lede">Share certificates and other documents issued to you as ' + esc(x.holders.join(', ') || '—') + ' on the HN Group Company Register. Only you can see them.</p></section>' +
    (list.length ? documentList(list, true) : '<p class="muted">There are no documents for you yet.</p>');
  return layout({ ...ctx, title: 'Documents', active: '/documents', body, unread: unreadFor(x) });
}
function newsPage(x, ctx) {
  const items = store.news(), body = '<section class="hero small"><p class="eyebrow">For investors</p><h1>News</h1></section>' + newsList(items, x, '/news/');
  const html = layout({ ...ctx, title: 'News', active: '/news', body, unread: 0 });
  store.markNewsSeen(x.id);
  return html;
}
function articlePage(n, ctx, back) {
  const c = n.company && register.all().find((y) => y.slug === n.company);
  const body = '<article class="article"><p class="eyebrow"><a href="' + back + '">← News</a></p><h1>' + esc(n.title) + '</h1><p class="muted">' + esc(longDate(n.publishedAt || n.updatedAt)) + (c ? ' · ' + esc(register.displayName(c)) : '') + (n.topic && n.topic !== 'General' ? ' · ' + esc(n.topic) : '') + (n.status === 'draft' ? ' · <span class="tag">Draft</span>' : '') + '</p><div class="prose">' + paragraphs(n.body) + '</div>' + (n.document ? '<p><a class="button primary" href="' + esc(n.document.url) + '" target="_blank" rel="noopener">' + esc(n.document.label) + ' ↓</a></p>' : '') + '</article>';
  return layout({ ...ctx, title: n.title, active: back === '/news' ? '/news' : '/staff/news', body, narrow: true });
}
function accountPage(x, ctx, error) {
  const body = '<section class="hero small"><p class="eyebrow">Your account</p><h1>Account</h1></section><div class="grid2">' +
    '<section class="card"><h2>Your details</h2><dl class="facts"><div><dt>Name</dt><dd>' + esc(x.name) + '</dd></div><div><dt>Email address</dt><dd>' + esc(x.email) + '</dd></div><div><dt>On the Company Register as</dt><dd>' + (x.holders.map(esc).join('<br>') || '—') + '</dd></div></dl><p class="muted small">To change these, contact HN Group.</p></section>' +
    '<section class="card"><h2>Change password</h2>' + (error ? '<div class="flash error" role="alert">' + esc(error) + '</div>' : '') +
    '<form method="post" action="/account/password" class="form" data-once><input type="hidden" name="csrf" value="' + esc(ctx.csrf) + '"><input type="text" name="username" autocomplete="username" value="' + esc(x.email) + '" hidden>' +
    '<label for="current">Current password</label><input id="current" name="current" type="password" autocomplete="current-password" required>' +
    '<label for="password">New password</label><input id="password" name="password" type="password" minlength="10" autocomplete="new-password" required>' +
    '<label for="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" minlength="10" autocomplete="new-password" required>' +
    '<button class="button" type="submit">Change password</button></form><p class="muted small">Changing your password signs you out everywhere else.</p></section></div>';
  return layout({ ...ctx, title: 'Account', active: '/account', body, unread: unreadFor(x) });
}

// ---------- Staff pages ----------

function staffDashboard(user, url) {
  const list = store.investors(), st = register.status(), vals = store.valuations();
  const companies = register.all(), valued = companies.filter((c) => (vals[c.slug] || []).length).length;
  const total = list.reduce((sum, x) => sum + holdings.summary(x.holders, vals).total, 0);
  const body = '<section class="hero small"><p class="eyebrow">HN Group staff</p><h1>Investor relations</h1></section>' +
    '<section class="summary"><div class="stat"><span class="stat-label">Investors</span><span class="stat-value">' + list.length + '</span><span class="muted small">' + list.filter((x) => x.password).length + ' signed up · ' + list.filter((x) => !x.password && x.invite).length + ' invited</span></div>' +
    '<div class="stat"><span class="stat-label">Value held by investors</span><span class="stat-value">' + esc(money(total)) + '</span></div>' +
    '<div class="stat"><span class="stat-label">Companies valued</span><span class="stat-value">' + valued + ' of ' + companies.length + '</span></div>' +
    '<div class="stat"><span class="stat-label">Published news</span><span class="stat-value">' + store.news().length + '</span></div></section>' +
    '<section class="block"><div class="grid2"><div class="card"><h2>Company Register</h2><p>' + (st.companies ? st.companies + ' companies received' + (st.at ? ', last changed ' + esc(dateTime(st.at)) : '') + '.' : 'Nothing received from the register yet.') + ' ' + (st.healthy ? '<span class="pill ok">Connected</span>' : '<span class="pill warn">Not connected</span>') + '</p><p class="muted small">Holdings follow the register’s persons with significant control automatically. Change who owns what on the register; record valuations here.</p><p><a class="button secondary" href="/staff/companies">Companies and valuations</a></p></div>' +
    '<div class="card"><h2>Quick actions</h2><p><a class="button" href="/staff/investors/new">Add an investor</a></p><p><a class="button secondary" href="' + esc(NEWS_ADMIN) + '">Write investor news</a></p></div></div></section>';
  return layout({ staff: user, title: 'Dashboard', active: '/staff', body, flash: flashOf(url) });
}
function holderChoices(selected) {
  const names = register.holderNames(), chosen = new Set(selected.map((n) => n.toLowerCase()));
  const extra = selected.filter((n) => !names.some((h) => h.name.toLowerCase() === n.toLowerCase()));
  return '<fieldset class="checks"><legend>On the Company Register as</legend><p class="hint">Their holdings are every company where one of these names is a current person with significant control.</p>' +
    names.map((h) => '<label class="check"><input type="checkbox" name="holders" value="' + esc(h.name) + '"' + (chosen.has(h.name.toLowerCase()) ? ' checked' : '') + '> ' + esc(h.name) + ' <span class="muted small">' + esc(h.kind || '') + '</span></label>').join('') +
    extra.map((n) => '<label class="check"><input type="checkbox" name="holders" value="' + esc(n) + '" checked> ' + esc(n) + ' <span class="muted small">not on the register now</span></label>').join('') +
    '<label for="holder-other">Another name (as it will be recorded on the register)</label><input id="holder-other" name="holders" type="text" maxlength="160"></fieldset>';
}
function investorForm(user, x, error, values) {
  const v = values || (x ? { name: x.name, email: x.email, holders: x.holders } : { name: '', email: '', holders: [] });
  return '<form method="post" action="' + (x ? '/staff/investors/' + esc(x.id) : '/staff/investors/new') + '" class="form" data-once><input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
    (error ? '<div class="flash error" role="alert">' + esc(error) + '</div>' : '') +
    '<label for="name">Name</label><input id="name" name="name" required maxlength="120" value="' + esc(v.name) + '">' +
    '<label for="email">Email address</label><input id="email" name="email" type="email" required maxlength="160" value="' + esc(v.email) + '"><p class="hint">They’ll sign in with this.</p>' +
    holderChoices(v.holders) + '<button class="button" type="submit">' + (x ? 'Save changes' : 'Add investor and make an invitation') + '</button></form>';
}
const inviteBox = (token) => '<div class="invite"><h2>Invitation link</h2><p>Send this link to the investor. It works once and expires in 7 days. It won’t be shown again.</p><div class="copy-row"><input readonly id="invite-link" value="' + esc(ORIGIN + '/invite/' + token) + '"><button type="button" class="button secondary" data-copy="#invite-link">Copy</button></div></div>';
function staffInvestors(user, url) {
  const vals = store.valuations(), list = store.investors();
  const body = '<section class="hero small"><p class="eyebrow">HN Group staff</p><h1>Investors</h1></section><p><a class="button" href="/staff/investors/new">Add an investor</a></p>' +
    (list.length ? '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>On the register as</th><th>Status</th><th class="num">Holdings value</th></tr></thead><tbody>' +
      list.map((x) => { const s = holdings.summary(x.holders, vals); return '<tr><td><a href="/staff/investors/' + esc(x.id) + '"><b>' + esc(x.name) + '</b></a></td><td>' + esc(x.email) + '</td><td>' + (x.holders.map(esc).join(', ') || '<span class="muted">—</span>') + '</td><td>' +
        (!x.enabled ? '<span class="pill warn">Disabled</span>' : x.password ? '<span class="pill ok">Active</span>' : x.invite && x.invite.expires > new Date().toISOString() ? '<span class="pill">Invited</span>' : '<span class="pill warn">Invitation expired</span>') + '</td><td class="num">' + esc(money(s.total)) + '</td></tr>'; }).join('') + '</tbody></table></div>'
      : '<p class="muted">No investors yet.</p>');
  return layout({ staff: user, title: 'Investors', active: '/staff/investors', body, flash: flashOf(url) });
}
function staffInvestor(user, x, opts) {
  const o = opts || {}, s = holdings.summary(x.holders, store.valuations());
  const body = '<p class="eyebrow"><a href="/staff/investors">← Investors</a></p><h1>' + esc(x.name) + '</h1>' + (o.token ? inviteBox(o.token) : '') +
    '<div class="grid2"><section class="card"><h2>Details</h2>' + investorForm(user, x, o.error, o.values) + '</section>' +
    '<section class="card"><h2>Holdings</h2><p class="stat-value">' + esc(money(s.total)) + '</p><ul class="plain">' + (s.direct.map((h) => '<li>' + esc(register.displayName(h.company)) + ' · ' + esc(h.shareText) + (h.value !== null ? ' · ' + esc(money(h.value)) : '') + '</li>').join('') || '<li class="muted">None recorded.</li>') + '</ul>' +
    '<p><a class="button secondary" href="/staff/investors/' + esc(x.id) + '/preview">See what they see</a></p>' +
    '<h2>Account</h2><dl class="facts"><div><dt>Status</dt><dd>' + (!x.enabled ? 'Disabled' : x.password ? 'Active' : 'Waiting for them to accept the invitation') + '</dd></div><div><dt>Last signed in</dt><dd>' + (x.lastSignIn ? esc(dateTime(x.lastSignIn)) : 'Never') + '</dd></div><div><dt>Added</dt><dd>' + esc(dateTime(x.createdAt)) + '</dd></div></dl>' +
    '<div class="actions">' + action(user, x, 'invite', x.password ? 'Make a password reset link' : 'Make a new invitation link', 'secondary', x.password ? 'Make a new link? Their current password keeps working until they use it.' : '') +
    action(user, x, x.enabled ? 'disable' : 'enable', x.enabled ? 'Disable account' : 'Enable account', 'secondary', x.enabled ? 'Disable ' + x.name + '’s account? They’ll be signed out straight away.' : '') +
    action(user, x, 'delete', 'Delete investor', 'danger', 'Delete ' + x.name + '? This can’t be undone.') + '</div></section></div>';
  return layout({ staff: user, title: x.name, active: '/staff/investors', body, flash: o.flash });
}
const action = (user, x, name, label, cls, confirm) => '<form method="post" action="/staff/investors/' + esc(x.id) + '/' + name + '"' + (confirm ? ' data-confirm="' + esc(confirm) + '"' : '') + '><input type="hidden" name="csrf" value="' + esc(user.csrf) + '"><button class="button ' + cls + '" type="submit">' + esc(label) + '</button></form>';
function staffCompanies(user, url, error) {
  const vals = store.valuations(), today = new Date().toISOString().slice(0, 10);
  const body = '<section class="hero small"><p class="eyebrow">HN Group staff</p><h1>Companies and valuations</h1><p class="lede">Companies and owners come from the <a href="' + esc(register.PUBLIC_URL) + '">Company Register</a>. Record a valuation for each company so investors can see what their holdings are worth.</p></section>' +
    (error ? '<div class="flash error" role="alert">' + esc(error) + '</div>' : '') +
    (register.all().map((c) => {
      const list = (vals[c.slug] || []).slice().sort((a, b) => b.asOf.localeCompare(a.asOf) || b.at.localeCompare(a.at));
      return '<section class="card company" id="' + esc(c.slug) + '"><div class="holding-head">' + logo(c) + '<div><h2>' + esc(register.displayName(c)) + '</h2><p class="muted small">' + esc(c.legalName || '') + (c.status ? ' · ' + esc(c.status) : '') + '</p></div><span class="spacer"></span><span class="company-value">' + (list[0] ? esc(money(list[0].amount)) + '<span class="muted small"> on ' + esc(longDate(list[0].asOf)) + '</span>' : '<span class="muted">Not valued</span>') + '</span></div>' +
        '<h3>Owners on the register</h3><ul class="plain">' + ((c.owners || []).map((o) => '<li>' + esc(o.name) + ' · ' + esc(register.shareText(o)) + (register.classText(o) ? ' (' + esc(register.classText(o)) + ')' : '') + (typeof o.votes === 'number' ? ' · <b>' + esc(o.votes) + '% of votes</b>' : '') + (o.votingControl ? ' <span class="pill ok">Voting control</span>' : '') + ' <span class="muted small">' + esc(o.kind || '') + '</span>' + (register.sharePercent(o) === null ? ' <span class="pill warn">No exact share recorded</span>' : '') + '</li>').join('') || '<li class="muted">None recorded</li>') + '</ul>' +
        '<details' + (list.length ? '' : ' open') + '><summary>Record a valuation</summary><form method="post" action="/staff/companies/' + esc(c.slug) + '/valuation" class="form inline-grid" data-once><input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
        '<div><label for="amount-' + esc(c.slug) + '">Company valuation (£)</label><input id="amount-' + esc(c.slug) + '" name="amount" inputmode="decimal" required placeholder="250000"></div>' +
        '<div><label for="asof-' + esc(c.slug) + '">As of</label><input id="asof-' + esc(c.slug) + '" name="asOf" type="date" max="' + today + '" value="' + today + '" required></div>' +
        '<div class="wide"><label for="note-' + esc(c.slug) + '">Note (investors can see this)</label><input id="note-' + esc(c.slug) + '" name="note" maxlength="300" placeholder="For example: based on the 2026 accounts"></div>' +
        '<div><button class="button" type="submit">Record valuation</button></div></form></details>' +
        (list.length ? '<div class="table-wrap"><table><thead><tr><th>As of</th><th class="num">Valuation</th><th>Note</th><th>Recorded</th><th></th></tr></thead><tbody>' + list.map((v) => '<tr><td>' + esc(longDate(v.asOf)) + '</td><td class="num">' + esc(money(v.amount)) + '</td><td>' + esc(v.note || '') + '</td><td class="small muted">' + esc(v.by) + ', ' + esc(dateTime(v.at)) + '</td><td><form method="post" action="/staff/companies/' + esc(c.slug) + '/valuation/' + esc(v.id) + '/delete" data-confirm="Delete this valuation?"><input type="hidden" name="csrf" value="' + esc(user.csrf) + '"><button class="link danger" type="submit">Delete</button></form></td></tr>').join('') + '</tbody></table></div>' : '') +
        '</section>';
    }).join('') || '<p class="muted">Nothing has been received from the Company Register yet.</p>');
  return layout({ staff: user, title: 'Companies', active: '/staff/companies', body, flash: flashOf(url) });
}
function staffNews(user, url) {
  const body = '<section class="hero small"><p class="eyebrow">HN Group staff</p><h1>Investor news</h1><p class="lede">Investor news is written on HN Group News, where you can write news for every HN Group website. Tick <strong>HN Group Investors</strong> to show it here; tick only that to keep it private to investors.</p></section><p><a class="button" href="' + esc(NEWS_ADMIN) + '">Write news on HN Group News</a></p>' + newsList(store.news(true), null, '/staff/news/');
  return layout({ staff: user, title: 'News', active: '/staff/news', body, flash: flashOf(url) });
}
function newsForm(user, n, error, values) {
  const v = values || n || { title: '', body: '', company: '', status: 'draft' };
  const body = '<p class="eyebrow"><a href="/staff/news">← News</a></p><h1>' + (n ? 'Edit news' : 'Write news') + '</h1>' + (error ? '<div class="flash error" role="alert">' + esc(error) + '</div>' : '') +
    '<form method="post" action="' + (n ? '/staff/news/' + esc(n.id) + '/edit' : '/staff/news/new') + '" class="form" data-once><input type="hidden" name="csrf" value="' + esc(user.csrf) + '">' +
    '<label for="title">Title</label><input id="title" name="title" required maxlength="160" value="' + esc(v.title) + '">' +
    '<label for="company">About a company (optional)</label><select id="company" name="company"><option value="">The whole group</option>' + register.all().map((c) => '<option value="' + esc(c.slug) + '"' + (v.company === c.slug ? ' selected' : '') + '>' + esc(register.displayName(c)) + '</option>').join('') + '</select>' +
    '<label for="body">News</label><textarea id="body" name="body" rows="14" required maxlength="20000">' + esc(v.body) + '</textarea><p class="hint">Plain text. Leave a blank line between paragraphs.</p>' +
    '<div class="buttons"><button class="button" type="submit" name="status" value="published">' + (n && n.status === 'published' ? 'Save and keep published' : 'Publish') + '</button><button class="button secondary" type="submit" name="status" value="draft">' + (n && n.status === 'published' ? 'Unpublish (save as draft)' : 'Save as draft') + '</button></div></form>' +
    (n ? '<form method="post" action="/staff/news/' + esc(n.id) + '/delete" data-confirm="Delete this news item?" class="danger-zone"><input type="hidden" name="csrf" value="' + esc(user.csrf) + '"><button class="button danger" type="submit">Delete</button></form>' : '');
  return layout({ staff: user, title: n ? 'Edit news' : 'Write news', active: '/staff/news', body, narrow: true });
}
function staffActivity(user) {
  const body = '<section class="hero small"><p class="eyebrow">HN Group staff</p><h1>Activity</h1></section><div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>' +
    store.activity(300).map((a) => '<tr><td class="small">' + esc(dateTime(a.at)) + '</td><td>' + esc(a.actor) + '</td><td><code>' + esc(a.action) + '</code> ' + esc(a.detail) + '</td></tr>').join('') + '</tbody></table></div>';
  return layout({ staff: user, title: 'Activity', active: '/staff/activity', body });
}

// ---------- Requests ----------

function readForm(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return reject(Object.assign(new Error('Unsupported form.'), { status: 415 }));
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 64 * 1024) { reject(Object.assign(new Error('That form is too large.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}
// Forms must be sent from this website.
function sameSite(req) {
  const origin = req.headers.origin;
  if (origin) return origin === ORIGIN;
  const ref = req.headers.referer || '';
  return ref.startsWith(ORIGIN + '/');
}
function serveFile(res, route) {
  const file = path.normalize(path.join(PUBLIC, route));
  if (!file.startsWith(path.join(PUBLIC, 'assets') + path.sep) && route !== '/robots.txt') return false;
  let stat; try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'public, max-age=3600' });
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}
const actorOf = (user) => user.email || user.name;

async function staffRoutes(req, res, url, route, user) {
  const get = req.method === 'GET';
  if (get && route === '/staff') return send(res, 200, staffDashboard(user, url));
  if (get && route === '/staff/investors') return send(res, 200, staffInvestors(user, url));
  if (get && route === '/staff/companies') return send(res, 200, staffCompanies(user, url));
  if (get && route === '/staff/news') return send(res, 200, staffNews(user, url));
  if (route === '/staff/news/new') return redirect(res, NEWS_ADMIN);
  if (get && route === '/staff/activity') return send(res, 200, staffActivity(user));
  if (get && route === '/staff/investors/new') return send(res, 200, layout({ staff: user, title: 'Add an investor', active: '/staff/investors', narrow: true, body: '<p class="eyebrow"><a href="/staff/investors">← Investors</a></p><h1>Add an investor</h1>' + investorForm(user, null) }));
  let m = /^\/staff\/investors\/([a-f0-9]{24})(?:\/(preview))?$/.exec(route);
  if (get && m) {
    const x = store.investor(m[1]); if (!x) return message(res, 404, 'Not found', 'That investor doesn’t exist.', null, ['Investors', '/staff/investors'], { staff: user });
    return send(res, 200, m[2] ? investorOverview(x, { staff: user }, true) : staffInvestor(user, x, { flash: flashOf(url) }));
  }
  m = /^\/staff\/news\/([a-f0-9]{24})$/.exec(route);
  if (get && m) { const n = store.post(m[1]); if (!n) return message(res, 404, 'Not found', 'That news item doesn’t exist.', null, ['News', '/staff/news'], { staff: user }); return send(res, 200, articlePage(n, { staff: user }, '/staff/news').replace('</article>', n.source === 'news' ? '<p><a class="button secondary" href="' + esc(NEWS_ADMIN) + '">Edit on HN Group News</a></p></article>' : '<p><a class="button secondary" href="/staff/news/' + esc(n.id) + '/edit">Edit</a></p></article>')); }
  m = /^\/staff\/news\/([a-f0-9]{24})\/edit$/.exec(route);
  if (get && m) { const n = store.post(m[1]); if (!n) return message(res, 404, 'Not found', 'That news item doesn’t exist.', null, ['News', '/staff/news'], { staff: user }); if (n.source === 'news') return redirect(res, NEWS_ADMIN); return send(res, 200, newsForm(user, n)); }
  if (req.method !== 'POST') return message(res, 404, 'Not found', 'That page isn’t here.', null, ['Dashboard', '/staff'], { staff: user });

  if (!sameSite(req)) return message(res, 403, 'Not allowed', 'That form came from another website.', null, null, { staff: user });
  const form = await readForm(req);
  if (form.get('csrf') !== user.csrf) return message(res, 403, 'Form expired', 'This form has expired. Go back, reload the page and try again.', null, null, { staff: user });
  const who = actorOf(user), values = (f) => ({ name: f.get('name') || '', email: f.get('email') || '', holders: f.getAll('holders').filter((h) => h.trim()) });
  try {
    if (route === '/staff/investors/new') {
      try { const { investor, token } = store.createInvestor(values(form), who); return send(res, 200, staffInvestor(user, store.investor(investor.id), { token, flash: { text: 'Investor added.', kind: 'ok' } })); }
      catch (e) { if (e.status === 400) return send(res, 400, layout({ staff: user, title: 'Add an investor', active: '/staff/investors', narrow: true, body: '<p class="eyebrow"><a href="/staff/investors">← Investors</a></p><h1>Add an investor</h1>' + investorForm(user, null, e.message, values(form)) })); throw e; }
    }
    m = /^\/staff\/investors\/([a-f0-9]{24})(?:\/(invite|enable|disable|delete))?$/.exec(route);
    if (m) {
      const x = store.investor(m[1]); if (!x) return message(res, 404, 'Not found', 'That investor doesn’t exist.', null, ['Investors', '/staff/investors'], { staff: user });
      if (!m[2]) {
        try { store.updateInvestor(x.id, values(form), who); return redirect(res, '/staff/investors/' + x.id + '?done=saved'); }
        catch (e) { if (e.status === 400) return send(res, 400, staffInvestor(user, x, { error: e.message, values: values(form) })); throw e; }
      }
      if (m[2] === 'invite') return send(res, 200, staffInvestor(user, x, { token: store.reinvite(x.id, who) }));
      if (m[2] === 'enable' || m[2] === 'disable') { store.setEnabled(x.id, m[2] === 'enable', who); return redirect(res, '/staff/investors/' + x.id + '?done=saved'); }
      if (m[2] === 'delete') { store.removeInvestor(x.id, who); return redirect(res, '/staff/investors?done=deleted'); }
    }
    m = /^\/staff\/companies\/([a-z0-9-]{1,80})\/valuation(?:\/([a-f0-9]{24})\/delete)?$/.exec(route);
    if (m) {
      if (!register.bySlug(m[1])) return message(res, 404, 'Not found', 'That company isn’t on the Company Register.', null, ['Companies', '/staff/companies'], { staff: user });
      if (m[2]) { store.removeValuation(m[1], m[2], who); return redirect(res, '/staff/companies?done=deleted#' + m[1]); }
      try { store.addValuation(m[1], { amount: form.get('amount'), asOf: form.get('asOf'), note: form.get('note') }, who); return redirect(res, '/staff/companies?done=valuation#' + m[1]); }
      catch (e) { if (e.status === 400) return send(res, 400, staffCompanies(user, url, register.displayName(register.bySlug(m[1])) + ': ' + e.message)); throw e; }
    }
    m = /^\/staff\/news\/([a-f0-9]{24})\/(edit|delete)$/.exec(route);
    if (m) {
      if (m[2] === 'delete') { store.removePost(m[1], who); return redirect(res, '/staff/news?done=deleted'); }
      const n = m[1] ? store.post(m[1]) : null;
      if (m[1] && !n) return message(res, 404, 'Not found', 'That news item doesn’t exist.', null, ['News', '/staff/news'], { staff: user });
      const input = { title: form.get('title'), body: form.get('body'), company: register.bySlug(form.get('company') || '') ? form.get('company') : '', status: form.get('status') };
      try { const saved = store.savePost(m[1] || null, input, who); return redirect(res, '/staff/news?done=' + saved.status); }
      catch (e) { if (e.status === 400) return send(res, 400, newsForm(user, n, e.message, { ...input, title: input.title || '', body: input.body || '' })); throw e; }
    }
  } catch (e) {
    if (e.status === 404 || e.status === 400) return message(res, e.status, 'Not possible', e.message, null, ['Dashboard', '/staff'], { staff: user });
    throw e;
  }
  return message(res, 404, 'Not found', 'That action isn’t available.', null, ['Dashboard', '/staff'], { staff: user });
}

async function investorRoutes(req, res, url, route) {
  const token = cookieValue(req, INVESTOR_COOKIE), s = store.session(token);
  if (route === '/login') {
    if (req.method === 'GET') return s ? redirect(res, '/') : loginPage(res);
    if (!sameSite(req)) return message(res, 403, 'Not allowed', 'That form came from another website.');
    const form = await readForm(req);
    try { const t = store.signIn(form.get('email'), form.get('password')); return redirect(res, '/', [setCookie(INVESTOR_COOKIE, t, 30 * 86400)]); }
    catch (e) { if ([400, 401, 429].includes(e.status)) return loginPage(res, e.message, form.get('email')); throw e; }
  }
  let m = /^\/invite\/([a-f0-9]{64})$/.exec(route);
  if (m) {
    const x = store.inviteFor(m[1]);
    if (req.method === 'GET') return invitePage(res, m[1], x);
    if (!sameSite(req)) return message(res, 403, 'Not allowed', 'That form came from another website.');
    const form = await readForm(req);
    try { const y = store.acceptInvite(m[1], form.get('password'), form.get('confirm')); const t = store.signIn(y.email, form.get('password')); return redirect(res, '/', [setCookie(INVESTOR_COOKIE, t, 30 * 86400)]); }
    catch (e) { if (e.status === 400) return invitePage(res, m[1], x, e.message); throw e; }
  }
  if (route === '/logout' && req.method === 'POST') {
    const form = await readForm(req);
    if (s && form.get('csrf') === s.csrf) store.signOut(token);
    return redirect(res, '/?signed-out=1', [setCookie(INVESTOR_COOKIE, '', 0)]);
  }
  if (!s) {
    if (route === '/' && req.method === 'GET') return landing(res, url);
    if (['/holdings', '/documents', '/news', '/account'].includes(route) || route.startsWith('/news/') || route.startsWith('/documents/')) return redirect(res, '/login');
    return null;
  }
  const x = s.investor, ctx = { investor: x, csrf: s.csrf };
  if (req.method === 'GET') {
    if (route === '/') return send(res, 200, investorOverview(x, ctx));
    if (route === '/holdings') return send(res, 200, holdingsPage(x, ctx));
    if (route === '/news') return send(res, 200, newsPage(x, ctx));
    if (route === '/documents') return send(res, 200, documentsPage(x, ctx));
    m = /^\/documents\/([a-z0-9-]{3,80})$/.exec(route);
    if (m) {
      const d = documents.find(x, m[1]);
      if (!d) return message(res, 404, 'Not found', 'That document isn’t available.', null, ['Documents', '/documents'], ctx);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="' + d.file + '"', 'Cache-Control': 'private, no-store' });
      return fs.createReadStream(documents.filePath(d)).on('error', () => res.destroy()).pipe(res);
    }
    if (route === '/account') return send(res, 200, accountPage(x, { ...ctx, flash: flashOf(url) }));
    m = /^\/news\/([a-f0-9]{24})$/.exec(route);
    if (m) { const n = store.post(m[1]); if (!n || n.status !== 'published') return message(res, 404, 'Not found', 'That news item isn’t available.', null, ['News', '/news'], ctx); return send(res, 200, articlePage(n, ctx, '/news')); }
  }
  if (route === '/account/password' && req.method === 'POST') {
    if (!sameSite(req)) return message(res, 403, 'Not allowed', 'That form came from another website.', null, null, ctx);
    const form = await readForm(req);
    if (form.get('csrf') !== s.csrf) return message(res, 403, 'Form expired', 'This form has expired. Go back, reload the page and try again.', null, null, ctx);
    try { store.changePassword(x.id, form.get('current'), form.get('password'), form.get('confirm')); const t = store.signIn(x.email, form.get('password')); return redirect(res, '/account?done=password', [setCookie(INVESTOR_COOKIE, t, 30 * 86400)]); }
    catch (e) { if (e.status === 400) return send(res, 400, accountPage(x, ctx, e.message)); throw e; }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self' " + (process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk') + "; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  try {
    const url = new URL(req.url, ORIGIN);
    const route = url.pathname;
    if (route === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end('{"ok":true}'); }
    if (await auth.handle(req, res, url, (r, status, title, text, cookies) => message(r, status, title, text, cookies, ['Back to HN Group Investors', '/']))) return;
    if (req.method === 'GET' && (route.startsWith('/assets/') || route === '/robots.txt') && serveFile(res, route)) return;
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.writeHead(405); return res.end(); }
    if (route === '/staff' || route.startsWith('/staff/')) {
      const user = await auth.current(req).catch((e) => { if (e.status === 403) return null; throw e; });
      if (!user) return req.method === 'GET' ? redirect(res, auth.loginUrl(route + url.search)) : message(res, 401, 'Please sign in', 'Your staff sign-in has ended. Sign in again and retry.', null, ['Staff sign in', '/auth/login?return=%2Fstaff']);
      return await staffRoutes(req, res, url, route, user);
    }
    if ((await investorRoutes(req, res, url, route)) !== null && res.writableEnded) return;
    if (!res.headersSent) message(res, 404, 'Not found', 'That page isn’t part of HN Group Investors.', null, ['Go to the home page', '/']);
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) message(res, err.status || 500, 'Something went wrong', err.status ? err.message : 'The investors website couldn’t complete that request. Please try again.');
    else res.destroy();
  }
});

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 5200;
  server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('HN Group Investors on ' + PORT));
  register.start(Number(process.env.COMPANIES_FEED_INTERVAL || 20000));
  newsroom.start(Number(process.env.NEWS_FEED_INTERVAL || 20000));
}
module.exports = { server };
