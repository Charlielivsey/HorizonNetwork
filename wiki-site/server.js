'use strict';
// HN Group Wiki — wiki.hngroup.org.uk. A Wikipedia-style encyclopedia for HN Group and its
// companies. Anyone can read; staff edit after signing in with HN Group Auth. Every edit is kept.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const markup = require('./lib/markup');
const store = require('./lib/store');
const auth = require('./lib/auth');
const { esc, normaliseTitle, pageUrl } = markup;

const PUBLIC = process.env.WIKI_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.WIKI_DATA_DIR || '/var/lib/hn-wiki';
const SEED_DIR = process.env.WIKI_SEED_DIR || path.join(__dirname, 'seed');
const SITE = 'HN Group Wiki';
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

const brandDir = path.join(PUBLIC, 'assets', 'brand');
const brandFiles = new Set(fs.existsSync(brandDir) ? fs.readdirSync(brandDir) : []);
markup.setFileCheck((f) => brandFiles.has(f));
store.init(DATA_DIR, SEED_DIR);

// Rendering is cached per revision; links to missing pages are red, so the cache is cleared
// whenever pages are created or deleted.
let renderCache = new Map();
const exists = (t) => !!store.get(t);
function rendered(page, rev) {
  const r = rev || store.latest(page);
  if (!renderCache.has(r.id)) {
    if (renderCache.size > 2000) renderCache = new Map();
    renderCache.set(r.id, markup.render(r.text, { exists, editUrl: editUrl(page.title) }));
  }
  return renderCache.get(r.id);
}
const editUrl = (title) => pageUrl(title) + '?action=edit';
const historyUrl = (title) => pageUrl(title) + '?action=history';
const fmtDate = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const isSpecial = (t) => /^Special:/i.test(t);
const namespaceOf = (t) => (/^(Category|Help|HN Group Wiki|Special|File):/i.exec(t) || [, ''])[1];

// ---------- Page shell ----------

function layout(o) {
  const user = o.user;
  const tabs = o.tabs || [];
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#5514B4"><title>' + esc(o.title) + ' – ' + SITE + '</title>' +
    (o.description ? '<meta name="description" content="' + esc(o.description) + '">' : '') +
    (o.noindex ? '<meta name="robots" content="noindex">' : '') +
    (o.canonical ? '<link rel="canonical" href="' + esc(auth.WIKI_ORIGIN + o.canonical) + '">' : '') +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>' +
    '<link rel="stylesheet" href="/assets/wiki.css?v=20261015b"><script src="/assets/wiki.js?v=20261015b" defer></script></head><body>' +
    '<a class="skip" href="#content">Skip to content</a><div class="stripe" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
    '<header class="site-header"><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="sidebar" aria-label="Main menu"><span></span><span></span><span></span></button>' +
    '<a class="brand" href="/wiki/Main_Page" aria-label="HN Group Wiki main page"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="92" height="32"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="92" height="32"><span class="brand-wiki">Wiki</span></a>' +
    '<form class="search" action="/wiki/Special:Search" method="get" role="search"><input type="search" name="search" placeholder="Search HN Group Wiki" aria-label="Search HN Group Wiki" value="' + esc(o.searchValue || '') + '" autocomplete="off"><button type="submit" aria-label="Search">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button></form>' +
    '<div class="user-tools">' + (user
      ? '<span class="user-name" title="Signed in with HN Group Auth">' + esc(user.name) + (user.admin ? ' <span class="badge">Admin</span>' : '') + '</span><form method="post" action="/auth/logout"><button class="link-button" type="submit">Sign out</button></form>'
      : '<a href="/auth/login?return=' + encodeURIComponent(o.returnTo || '/wiki/Main_Page') + '">Staff sign in</a>') + '</div></header>' +
    '<div class="page"><nav class="sidebar" id="sidebar" aria-label="Wiki navigation"><ul>' +
    '<li><a href="/wiki/Main_Page">Main page</a></li><li><a href="/wiki/Special:AllPages">All pages</a></li><li><a href="/wiki/Special:Categories">Categories</a></li>' +
    '<li><a href="/wiki/Special:Random">Random article</a></li><li><a href="/wiki/Special:RecentChanges">Recent changes</a></li></ul>' +
    '<h3>Companies</h3><ul><li><a href="/wiki/HN_Group">HN Group</a></li><li><a href="/wiki/Horizon_Network">Horizon Network</a></li><li><a href="/wiki/Horizon_Advertising">Horizon Advertising</a></li><li><a href="/wiki/Horizon_Development">Horizon Development</a></li><li><a href="/wiki/Horizon_Media_Group">Horizon Media Group</a></li></ul>' +
    '<h3>Help</h3><ul><li><a href="/wiki/Help:Editing">How to edit</a></li><li><a href="/wiki/HN_Group_Wiki:About">About this wiki</a></li></ul>' +
    '<h3>HN Group sites</h3><ul><li><a class="external" href="https://hngroup.org.uk">hngroup.org.uk</a></li><li><a class="external" href="https://horizon-network.co.uk">horizon-network.co.uk</a></li><li><a class="external" href="https://staff.hngroup.org.uk">Staff portal</a></li><li><a class="external" href="https://status.hngroup.org.uk">Service status</a></li></ul></nav>' +
    '<main class="content" id="content">' +
    (tabs.length ? '<div class="tabs"><ul class="tabs-left">' + tabs.filter((t) => t.side !== 'right').map(tabHtml).join('') + '</ul><ul class="tabs-right">' + tabs.filter((t) => t.side === 'right').map(tabHtml).join('') + '</ul></div>' : '') +
    '<article class="article"><h1 class="first-heading">' + (o.heading || esc(o.title)) + '</h1>' +
    (o.tagline === false ? '' : '<div class="tagline">From HN Group Wiki, the encyclopedia of HN Group and its companies</div>') +
    (o.sub ? '<div class="subtitle">' + o.sub + '</div>' : '') +
    '<div class="body">' + o.body + '</div>' +
    (o.categories && o.categories.length ? '<div class="catlinks"><a href="/wiki/Special:Categories">Categories</a>: <ul>' + o.categories.map((c) => '<li><a href="' + esc(pageUrl('Category:' + c)) + '">' + esc(c) + '</a></li>').join('') + '</ul></div>' : '') +
    '</article>' +
    '<footer class="footer">' + (o.lastEdited ? '<p>This page was last edited on ' + esc(fmtDate(o.lastEdited)) + '.</p>' : '') +
    '<p>Content is maintained by HN Group staff. © ' + new Date().getFullYear() + ' HN Group Limited. <a href="/wiki/HN_Group_Wiki:About">About HN Group Wiki</a> · <a class="external" href="https://hngroup.org.uk/privacy">Privacy</a> · <a class="external" href="https://hngroup.org.uk/contact">Contact</a></p></footer>' +
    '</main></div></body></html>';
}
function tabHtml(t) {
  return '<li' + (t.active ? ' class="selected"' : '') + '><a href="' + esc(t.href) + '"' + (t.newPage ? ' class="new"' : '') + '>' + esc(t.label) + '</a></li>';
}

function send(res, status, html, headers) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) });
  res.end(html);
}
function errorPage(res, status, title, message, cookies) {
  send(res, status, layout({ title, body: '<p>' + esc(message) + '</p><p><a href="/wiki/Main_Page">Return to the Main Page</a></p>', noindex: true, tagline: false }), cookies ? { 'Set-Cookie': cookies } : {});
}
function redirect(res, location, status) { res.writeHead(status || 302, { Location: location, 'Cache-Control': 'no-store' }); res.end(); }

function articleTabs(title, active, opts) {
  const page = store.get(title);
  const tabs = [
    { label: namespaceOf(title) === 'Category' ? 'Category' : namespaceOf(title) ? 'Page' : 'Article', href: pageUrl(title), active: active !== 'talk', newPage: !page },
  ];
  if (!isSpecial(title)) {
    tabs.push({ label: 'Read', href: pageUrl(title), active: active === 'read', side: 'right' });
    const canEdit = opts && opts.user && (!page || !page.protected || opts.user.admin);
    tabs.push({ label: page ? (canEdit || !opts || !opts.user ? 'Edit' : 'View source') : 'Create', href: editUrl(title), active: active === 'edit', side: 'right' });
    if (page) tabs.push({ label: 'View history', href: historyUrl(title), active: active === 'history', side: 'right' });
  }
  return tabs;
}

// ---------- Pages ----------

function categoryMembers(cat) {
  return store.all().filter((p) => rendered(p).categories.includes(cat) && !rendered(p).redirect);
}

function viewPage(req, res, url, user, title) {
  const page = store.get(title);
  const isCategory = namespaceOf(title) === 'Category';
  if (!page && !isCategory) {
    return send(res, 404, layout({
      title, user, returnTo: pageUrl(title), tabs: articleTabs(title, 'read', { user }), noindex: true,
      body: '<div class="notice">HN Group Wiki does not have an article with this exact name.</div>' +
        '<ul><li><a href="/wiki/Special:Search?search=' + encodeURIComponent(title) + '">Search for “' + esc(title) + '”</a> in existing articles.</li>' +
        '<li>' + (user ? '<a href="' + esc(editUrl(title)) + '">Start the “' + esc(title) + '” article</a>.' : 'Staff can <a href="/auth/login?return=' + encodeURIComponent(editUrl(title)) + '">sign in</a> to start this article.') + '</li></ul>',
    }));
  }
  const oldid = url.searchParams.get('oldid');
  let rev = page && store.latest(page), oldNote = '';
  if (page && oldid) {
    rev = page.revisions.find((r) => r.id === oldid);
    if (!rev) return errorPage(res, 404, 'Revision not found', 'That revision of “' + title + '” doesn’t exist.');
    if (rev !== store.latest(page)) oldNote = '<div class="notice old-revision">This is an old revision of this page, as edited ' + (user ? 'by <b>' + esc(rev.author.name) + '</b> ' : '') + 'at ' + esc(fmtDate(rev.at)) + '. It may differ significantly from the <a href="' + esc(pageUrl(page.title)) + '">current revision</a>.' +
      (user && (!page.protected || user.admin) ? ' <form method="post" action="' + esc(pageUrl(page.title)) + '?action=restore" class="inline-form"><input type="hidden" name="csrf" value="' + esc(user.csrf) + '"><input type="hidden" name="rev" value="' + esc(rev.id) + '"><button class="button small" type="submit">Restore this version</button></form>' : '') + '</div>';
  }
  const r = page ? rendered(page, rev) : { html: '', categories: [] };
  if (r.redirect && url.searchParams.get('redirect') !== 'no') {
    return redirect(res, pageUrl(r.redirect, r.redirectAnchor) .replace(/(#.*)?$/, (h) => '?from=' + encodeURIComponent(page.title) + h));
  }
  const from = url.searchParams.get('from');
  let body = oldNote + (from && store.get(from) ? '<div class="redirect-note">(Redirected from <a href="' + esc(pageUrl(from)) + '?redirect=no">' + esc(normaliseTitle(from)) + '</a>)</div>' : '') +
    (page && page.protected ? '<div class="protected-icon" title="This page is protected: only wiki administrators can edit it.">🔒</div>' : '') +
    (r.redirect ? '<div class="notice">Redirect to: <a href="' + esc(pageUrl(r.redirect)) + '">' + esc(r.redirect) + '</a></div>' : r.html);
  if (isCategory) {
    const cat = title.replace(/^Category:/i, '');
    const members = categoryMembers(normaliseTitle(cat));
    const groups = {};
    for (const m of members) { const letter = m.title.replace(/^[^:]*:/, '').charAt(0).toUpperCase(); (groups[letter] = groups[letter] || []).push(m); }
    body += '<h2>Pages in category “' + esc(cat) + '”</h2>' + (members.length
      ? '<p>The following ' + members.length + (members.length === 1 ? ' page is' : ' pages are') + ' in this category.</p><div class="category-columns">' + Object.keys(groups).sort().map((l) => '<h3>' + esc(l) + '</h3><ul>' + groups[l].map((m) => '<li><a href="' + esc(pageUrl(m.title)) + '">' + esc(m.title) + '</a></li>').join('') + '</ul>').join('') + '</div>'
      : '<p>This category currently contains no pages.</p>');
  }
  const desc = page ? markup.plainText(rev.text).slice(0, 180) : '';
  send(res, 200, layout({
    title: page ? page.title : title, user, returnTo: pageUrl(title), tabs: articleTabs(title, 'read', { user }),
    body, categories: r.categories, lastEdited: page && !oldNote ? rev.at : null, description: desc,
    canonical: pageUrl(title), noindex: !!oldNote,
    heading: page && page.title === 'Main Page' ? 'Welcome to HN Group Wiki' : null, tagline: !(page && page.title === 'Main Page'),
  }));
}

function editPage(req, res, user, title, form) {
  const page = store.get(title);
  if (namespaceOf(title) === 'Special') return errorPage(res, 400, 'Can’t edit', 'Special pages are generated automatically and can’t be edited.');
  const current = page ? store.latest(page) : null;
  const readOnly = !user || (page && page.protected && !user.admin);
  const text = form ? form.text : current ? current.text : '';
  const preview = form && form.preview ? markup.render(text, { exists }) : null;
  const notices = (form && form.error ? '<div class="notice error">' + esc(form.error) + '</div>' : '') +
    (!user ? '<div class="notice">You need to <a href="/auth/login?return=' + encodeURIComponent(editUrl(title)) + '">sign in with your staff account</a> to edit. You can view the source below.</div>' : '') +
    (user && readOnly ? '<div class="notice">This page is protected so only wiki administrators (the system owner and Super Admin members) can edit it. You can view its source.</div>' : '') +
    (!page && user ? '<div class="notice">You’re creating a new page. See <a href="/wiki/Help:Editing" target="_blank">how to edit</a> for the formatting you can use.</div>' : '');
  const body = notices +
    (preview ? '<div class="preview"><div class="preview-label">Preview</div>' + preview.html + '</div>' : '') +
    '<form method="post" action="' + esc(pageUrl(title)) + '?action=submit" class="edit-form">' +
    '<input type="hidden" name="csrf" value="' + esc(user ? user.csrf : '') + '"><input type="hidden" name="base" value="' + esc(form ? form.base : current ? current.id : '') + '">' +
    '<div class="edit-toolbar" aria-label="Formatting help"><span>Formatting:</span> <code>\'\'\'bold\'\'\'</code> <code>\'\'italic\'\'</code> <code>[[Link]]</code> <code>== Heading ==</code> <code>* list</code> <code>&lt;ref&gt;source&lt;/ref&gt;</code> <a href="/wiki/Help:Editing" target="_blank">More help</a></div>' +
    '<textarea name="text" id="wpTextbox" rows="28" spellcheck="true"' + (readOnly ? ' readonly' : '') + ' aria-label="Page source">' + esc(text) + '</textarea>' +
    (readOnly ? '' : '<div class="edit-options"><label for="summary">Summary <span class="muted">(briefly describe your changes)</span></label><input type="text" id="summary" name="summary" maxlength="250" value="' + esc(form ? form.summary : '') + '">' +
      '<p class="edit-note">Your edit will be published immediately and recorded in the page history with your name, which only signed-in staff can see.</p>' +
      '<div class="edit-buttons"><button class="button primary" type="submit" name="save" value="1">' + (page ? 'Publish changes' : 'Create page') + '</button><button class="button" type="submit" name="preview" value="1">Show preview</button><a class="button quiet" href="' + esc(pageUrl(title)) + '">Cancel</a></div></div>') +
    '</form>' +
    (user && user.admin && page ? '<div class="admin-tools"><h2>Administrator tools</h2>' +
      '<form method="post" action="' + esc(pageUrl(title)) + '?action=protect" class="inline-form"><input type="hidden" name="csrf" value="' + esc(user.csrf) + '"><input type="hidden" name="on" value="' + (page.protected ? '0' : '1') + '"><button class="button small" type="submit">' + (page.protected ? 'Unprotect page' : 'Protect page') + '</button></form> ' +
      (page.title === 'Main Page' ? '' : '<form method="post" action="' + esc(pageUrl(title)) + '?action=delete" class="inline-form" data-confirm="Delete “' + esc(page.title) + '” and all of its history? This can’t be undone."><input type="hidden" name="csrf" value="' + esc(user.csrf) + '"><button class="button small danger" type="submit">Delete page</button></form>') + '</div>' : '');
  send(res, 200, layout({
    title: (readOnly ? 'View source for ' : page ? 'Editing ' : 'Creating ') + title, heading: (readOnly ? 'View source for ' : page ? 'Editing ' : 'Creating ') + '<i>' + esc(title) + '</i>',
    user, returnTo: editUrl(title), tabs: articleTabs(title, 'edit', { user }), body, noindex: true, tagline: false,
  }));
}

function historyPage(req, res, user, title) {
  const page = store.get(title);
  if (!page) return redirect(res, pageUrl(title));
  const revs = page.revisions.slice().reverse();
  const body = '<p class="muted">Every change to this page is kept. Select a date to see that version' + (user ? ', and restore it if needed' : '') + '.' + (user ? '' : ' Editors’ names are visible to signed-in staff.') + '</p><ul class="history">' +
    revs.map((rev, i) => {
      const prev = revs[i + 1];
      const delta = rev.text.length - (prev ? prev.text.length : 0);
      return '<li><a href="' + esc(pageUrl(page.title)) + '?oldid=' + esc(rev.id) + '">' + esc(fmtDate(rev.at)) + '</a> · ' +
        '<span class="history-user">' + esc(user ? rev.author.name : rev.author.id === 'system' ? 'HN Group Wiki' : 'Staff editor') + '</span> · ' +
        '<span class="bytes">' + rev.text.length.toLocaleString('en-GB') + ' bytes</span> <span class="delta ' + (delta > 0 ? 'plus' : delta < 0 ? 'minus' : '') + '">(' + (delta > 0 ? '+' : '') + delta.toLocaleString('en-GB') + ')</span>' +
        (rev.summary ? ' <span class="summary">(' + esc(rev.summary) + ')</span>' : '') + (i === 0 ? ' <span class="badge">current</span>' : '') + '</li>';
    }).join('') + '</ul>';
  send(res, 200, layout({ title: page.title + ': Revision history', heading: '<i>' + esc(page.title) + '</i>: Revision history', user, returnTo: historyUrl(page.title), tabs: articleTabs(page.title, 'history', { user }), body, noindex: true, tagline: false }));
}

function snippet(text, q) {
  const plain = markup.plainText(text);
  const i = plain.toLowerCase().indexOf(q.toLowerCase());
  const start = Math.max(0, i - 80), part = plain.slice(start, start + 220);
  const hit = i === -1 ? esc(part) : esc(part).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;').replace(/</g, '&lt;') + ')', 'ig'), '<mark>$1</mark>');
  return (start ? '…' : '') + hit + (start + 220 < plain.length ? '…' : '');
}

function specialPage(req, res, url, user, name) {
  const lower = name.toLowerCase();
  if (lower === 'random') {
    const list = store.all().filter((p) => !namespaceOf(p.title) && !rendered(p).redirect && p.title !== 'Main Page');
    return redirect(res, list.length ? pageUrl(list[Math.floor(Math.random() * list.length)].title) : '/wiki/Main_Page');
  }
  if (lower === 'allpages') {
    const pages = store.all().filter((p) => !rendered(p).redirect);
    const body = '<p>' + pages.length + ' pages on HN Group Wiki.</p><ul class="all-pages">' + pages.map((p) => '<li><a href="' + esc(pageUrl(p.title)) + '">' + esc(p.title) + '</a></li>').join('') + '</ul>';
    return send(res, 200, layout({ title: 'All pages', user, returnTo: '/wiki/Special:AllPages', body, tagline: false }));
  }
  if (lower === 'categories') {
    const counts = {};
    for (const p of store.all()) for (const c of rendered(p).categories) counts[c] = (counts[c] || 0) + 1;
    const body = '<ul class="all-pages">' + Object.keys(counts).sort().map((c) => '<li><a href="' + esc(pageUrl('Category:' + c)) + '">' + esc(c) + '</a> (' + counts[c] + ' ' + (counts[c] === 1 ? 'member' : 'members') + ')</li>').join('') + '</ul>';
    return send(res, 200, layout({ title: 'Categories', user, returnTo: '/wiki/Special:Categories', body, tagline: false }));
  }
  if (lower === 'recentchanges') {
    const list = store.recentChanges(100);
    let day = '';
    const body = '<p class="muted">The latest 100 changes across the wiki.' + (user ? '' : ' Editors’ names are visible to signed-in staff.') + '</p>' + list.map((c) => {
      const d = new Date(c.rev.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
      const head = d !== day ? (day ? '</ul>' : '') + '<h2>' + esc(d) + '</h2><ul class="history">' : '';
      day = d;
      const delta = c.size - c.prevSize;
      return head + '<li>' + (c.isNew ? '<abbr class="new-flag" title="This edit created a new page">N</abbr> ' : '') + '<a href="' + esc(pageUrl(c.title)) + '">' + esc(c.title) + '</a> · ' +
        esc(new Date(c.rev.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })) + ' · ' + esc(user ? c.rev.author.name : c.rev.author.id === 'system' ? 'HN Group Wiki' : 'Staff editor') +
        ' <span class="delta ' + (delta > 0 ? 'plus' : delta < 0 ? 'minus' : '') + '">(' + (delta > 0 ? '+' : '') + delta.toLocaleString('en-GB') + ')</span>' + (c.rev.summary ? ' <span class="summary">(' + esc(c.rev.summary) + ')</span>' : '') + '</li>';
    }).join('') + (list.length ? '</ul>' : '');
    return send(res, 200, layout({ title: 'Recent changes', user, returnTo: '/wiki/Special:RecentChanges', body, tagline: false, noindex: true }));
  }
  if (lower === 'search') {
    const q = String(url.searchParams.get('search') || '').trim().slice(0, 100);
    if (q && url.searchParams.get('fulltext') !== '1') {
      const exact = store.get(q);
      if (exact) return redirect(res, pageUrl(exact.title));
    }
    const ql = q.toLowerCase();
    const results = q ? store.all().filter((p) => !rendered(p).redirect).map((p) => {
      const text = store.latest(p).text, inTitle = p.title.toLowerCase().includes(ql);
      const count = markup.plainText(text).toLowerCase().split(ql).length - 1;
      return { p, score: (inTitle ? 100 : 0) + count, text };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.p.title.localeCompare(b.p.title)) : [];
    const body = '<form class="search-big" action="/wiki/Special:Search" method="get"><input type="search" name="search" value="' + esc(q) + '" aria-label="Search"><input type="hidden" name="fulltext" value="1"><button class="button primary" type="submit">Search</button></form>' +
      (q ? (!store.get(q) ? '<p>' + (user ? 'Create the page “<a class="new" href="' + esc(editUrl(q)) + '">' + esc(q) + '</a>” on this wiki.' : 'There is no page titled “' + esc(q) + '”.') + '</p>' : '') +
        (results.length ? '<p class="muted">' + results.length + ' result' + (results.length === 1 ? '' : 's') + '</p><ul class="search-results">' + results.slice(0, 50).map((x) => '<li><a href="' + esc(pageUrl(x.p.title)) + '">' + esc(x.p.title) + '</a><div class="snippet">' + snippet(x.text, q) + '</div></li>').join('') + '</ul>' : '<p>There were no results matching the query.</p>') : '');
    return send(res, 200, layout({ title: 'Search results', user, returnTo: '/wiki/Special:Search', body, tagline: false, searchValue: q, noindex: true }));
  }
  return errorPage(res, 404, 'No such special page', 'You have requested an invalid special page.');
}

// Search-as-you-type suggestions, like Wikipedia's: titles starting with the text first, then
// titles with a word starting with it, then titles containing it. Redirects lead to their target.
function suggest(raw) {
  const q = String(raw || '').trim().toLowerCase().replace(/_/g, ' ').slice(0, 100);
  if (!q) return [];
  const best = new Map();
  for (const p of store.all()) {
    const t = p.title.toLowerCase();
    const rank = t.startsWith(q) ? 0 : t.split(/[\s:()-]+/).some((w) => w.startsWith(q)) ? 1 : t.includes(q) ? 2 : -1;
    if (rank < 0) continue;
    const r = rendered(p);
    const target = r.redirect ? store.get(r.redirect) : p;
    if (!target) continue;
    const score = rank * 2 + (r.redirect ? 1 : 0) + (namespaceOf(target.title) ? 6 : 0);
    const prev = best.get(target.title);
    if (!prev || score < prev.score) best.set(target.title, { score, target, from: r.redirect ? p.title : null, anchor: r.redirectAnchor || '' });
  }
  return [...best.values()].sort((a, b) => a.score - b.score || a.target.title.length - b.target.title.length || a.target.title.localeCompare(b.target.title)).slice(0, 8).map((x) => {
    const text = store.latest(x.target).text;
    return { title: x.target.title, url: pageUrl(x.target.title, x.anchor || undefined), description: markup.shortDescription(text), image: markup.infoboxImage(text), redirectFrom: x.from };
  });
}

// ---------- Saving ----------

function readForm(req, limit) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return reject(Object.assign(new Error('Unsupported form.'), { status: 415 }));
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('That page is too large to save.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))));
    req.on('error', reject);
  });
}

async function handlePost(req, res, url, title) {
  const origin = req.headers.origin;
  if (origin && origin !== auth.WIKI_ORIGIN && origin !== 'null') return errorPage(res, 403, 'Not allowed', 'This request came from another website.');
  const form = await readForm(req, 400 * 1024);
  let user;
  try { user = await auth.current(req, { fresh: true }); } catch (e) { return errorPage(res, 503, 'Can’t save right now', e.message); }
  if (!user) return errorPage(res, 401, 'Please sign in', 'Your sign-in has ended. Copy any changes, sign in again and retry.');
  if (form.csrf !== user.csrf) return errorPage(res, 403, 'Session expired', 'This form has expired. Go back, reload the page and try again.');
  const action = url.searchParams.get('action');
  const page = store.get(title);
  if (namespaceOf(title) === 'Special') return errorPage(res, 400, 'Can’t edit', 'Special pages can’t be edited.');
  if (page && page.protected && !user.admin) return errorPage(res, 403, 'Protected page', 'Only wiki administrators can change this page.');
  if (action === 'submit') {
    const text = String(form.text || '').replace(/\r/g, '');
    if (form.preview || !form.save) return editPage(req, res, user, title, { text, summary: form.summary || '', base: form.base || '', preview: true });
    if (!text.trim()) return editPage(req, res, user, title, { text, summary: form.summary || '', base: form.base || '', error: 'The page can’t be empty. To remove a page, ask a wiki administrator.' });
    try {
      const created = !page;
      store.edit(title, text, user, form.summary, form.base || null);
      if (created) renderCache = new Map();
      return redirect(res, pageUrl(title), 303);
    } catch (e) {
      if (e.conflict) return editPage(req, res, user, title, { text, summary: form.summary || '', base: e.current.id, error: 'Edit conflict: someone else saved a change while you were editing. Your text is below; the page now has their changes. Copy what you need, then reload and reapply it.' });
      throw e;
    }
  }
  if (action === 'restore' && page) {
    const rev = page.revisions.find((r) => r.id === form.rev);
    if (!rev) return errorPage(res, 404, 'Revision not found', 'That revision no longer exists.');
    store.edit(title, rev.text, user, 'Restored the version from ' + fmtDate(rev.at));
    return redirect(res, pageUrl(title), 303);
  }
  if (action === 'protect' && page && user.admin) { store.setProtected(title, form.on === '1'); return redirect(res, pageUrl(title), 303); }
  if (action === 'delete' && page && user.admin && page.title !== 'Main Page') { store.remove(title); renderCache = new Map(); return redirect(res, '/wiki/Main_Page', 303); }
  return errorPage(res, 400, 'Not possible', 'That action isn’t available.');
}

// ---------- Server ----------

function serveStatic(res, route) {
  const file = path.normalize(path.join(PUBLIC, route));
  if (!file.startsWith(path.join(PUBLIC, 'assets') + path.sep) && !['/robots.txt'].includes(route)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': route.startsWith('/assets/') ? 'public, max-age=604800' : 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self' " + (process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk') + "; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  try {
    const url = new URL(req.url, auth.WIKI_ORIGIN);
    const route = url.pathname;
    if (route === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
    if (await auth.handle(req, res, url, errorPage)) return;
    if (req.method === 'GET' && (route.startsWith('/assets/') || route === '/robots.txt') && serveStatic(res, route)) return;
    if (route === '/' || route === '/wiki' || route === '/wiki/') return redirect(res, '/wiki/Main_Page', 301);
    if (route === '/sitemap.xml' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + store.all().filter((p) => !rendered(p).redirect).map((p) => '<url><loc>' + esc(auth.WIKI_ORIGIN + pageUrl(p.title)) + '</loc><lastmod>' + store.latest(p).at.slice(0, 10) + '</lastmod></url>').join('') + '</urlset>');
    }
    if (route === '/w/api/suggest' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ results: suggest(url.searchParams.get('q')) }));
    }
    if (route.startsWith('/wiki/')) {
      let raw;
      try { raw = decodeURIComponent(route.slice(6)); } catch { return errorPage(res, 400, 'Bad title', 'That page title isn’t valid.'); }
      const title = normaliseTitle(raw);
      if (!title || title.length > 200 || /[<>[\]{}|#]/.test(title)) return errorPage(res, 400, 'Bad title', 'The requested page title contains characters that can’t be used in titles.');
      // Canonical URLs use underscores and a capital first letter.
      // Titles are matched without regard to case, so send people to the page's real spelling.
      const existing = store.get(title);
      if (req.method === 'GET' && existing && existing.title !== title) return redirect(res, pageUrl(existing.title) + url.search, 301);
      if (req.method === 'GET' && route.slice(6) !== pageUrl(title).slice(6) && raw !== title.replace(/ /g, '_')) return redirect(res, pageUrl(title) + url.search, 301);
      if (req.method === 'POST') return await handlePost(req, res, url, title);
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      const user = await auth.current(req).catch(() => null);
      if (isSpecial(title)) return specialPage(req, res, url, user, title.slice(8));
      const action = url.searchParams.get('action');
      if (action === 'edit') return editPage(req, res, user, title, null);
      if (action === 'history') return historyPage(req, res, user, title);
      return viewPage(req, res, url, user, title);
    }
    const user = await auth.current(req).catch(() => null);
    send(res, 404, layout({ title: 'Page not found', user, body: '<p>The page you were looking for isn’t here.</p><p><a href="/wiki/Main_Page">Go to the Main Page</a> or <a href="/wiki/Special:Search">search the wiki</a>.</p>', noindex: true, tagline: false }));
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) errorPage(res, err.status || 500, 'Something went wrong', err.status ? err.message : 'The wiki couldn’t complete that request. Please try again.');
    else res.destroy();
  }
});

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3800), HOST = process.env.HOST || '127.0.0.1';
  server.listen(PORT, HOST, () => console.log(`HN Group Wiki on http://${HOST}:${PORT}`));
}
module.exports = { server };
