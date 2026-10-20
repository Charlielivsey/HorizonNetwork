'use strict';
// Renders the wiki's article markup to HTML. It's a small, safe subset of Wikipedia's wikitext:
//
//   == Heading ==, === Subheading ===         '''bold''', ''italic''
//   * bullet, # numbered, : indented          [[Page]], [[Page|text]], [[Page#Section|text]]
//   [https://example.com text]                <ref>Source</ref> and {{Reflist}}
//   {{Infobox ... }}, {{Hatnote|...}}, {{Main|Page}}, {{Stub}}, {{Swatch|#5514B4}}
//   [[File:logo.svg|thumb|Caption]]           {| class="wikitable" ... |} tables
//   [[Category:Companies]]                    #REDIRECT [[Page]]
//   {{Company infobox|Name}}, {{Company ownership|Name}}, {{Company tree}}, {{Company list}},
//   {{Company cards}}: facts drawn live from the HN Group Company Register
//
// Everything typed is escaped; only the tags this file writes reach the page.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Page titles: spaces in titles, underscores in URLs, first letter capitalised (like Wikipedia).
function normaliseTitle(raw) {
  let t = String(raw || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const pageUrl = (title, anchor) => '/wiki/' + encodeURIComponent(normaliseTitle(title).replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':') + (anchor ? '#' + anchorId(anchor) : '');
const anchorId = (text) => String(text).trim().replace(/\s+/g, '_').replace(/[^\w\-.~]/g, (c) => '.' + c.charCodeAt(0).toString(16).toUpperCase());

function safeUrl(url) {
  const u = String(url || '').trim();
  return /^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(u) ? u : null;
}

// Images for [[File:...]] and infobox logos: the brand files (copied from brand/logos) and images staff
// have uploaded. The resolver answers { src, dark } for a file name, or null.
let fileExists = () => false, resolveFile = null;
function setFileCheck(fn) { fileExists = fn; }
function setFileResolver(fn) { resolveFile = fn; }
function findImage(name) {
  const file = String(name || '').trim().replace(/^File:/i, '');
  if (!/^[a-z0-9][a-z0-9._-]*\.(svg|png|jpg|jpeg|webp|gif)$/i.test(file)) return null;
  if (resolveFile) { const found = resolveFile(file); if (found) return found; }
  if (!fileExists(file)) return null;
  const white = file.replace(/\.(svg|png)$/i, '-white.$1');
  return { src: '/assets/brand/' + file, dark: white !== file && fileExists(white) ? '/assets/brand/' + white : null };
}
function pictureHtml(found, alt, cls) {
  if (found.dark) return '<img class="on-light ' + (cls || '') + '" src="' + esc(found.src) + '" alt="' + esc(alt) + '" loading="lazy"><img class="on-dark ' + (cls || '') + '" src="' + esc(found.dark) + '" alt="' + esc(alt) + '" loading="lazy">';
  return '<img class="' + (cls || '') + '" src="' + esc(found.src) + '" alt="' + esc(alt) + '" loading="lazy">';
}
function imageHtml(name, alt, cls) {
  const found = findImage(name);
  if (!found) return '<span class="missing-file">' + esc(String(name || '').replace(/^File:/i, '').trim() || 'image') + '</span>';
  return pictureHtml(found, alt, cls);
}

// Company facts come from the Company Register (see lib/register.js); the server supplies it with
// logo(company) → { src, dark } and blurb(company) → a one-line description.
let companies = null;
function setCompanySource(source) { companies = source; }

// Inline markup within a line of text.
function inline(text, ctx) {
  // Pull out links first so their contents aren't touched by bold/italic handling.
  const tokens = [];
  const keep = (html) => '\u0000' + (tokens.push(html) - 1) + '\u0000';
  let s = String(text);
  s = s.replace(/\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (m, target, hash, label) => {
    const title = normaliseTitle(target);
    if (/^Category:/i.test(title) || /^File:/i.test(title)) return '';
    if (!title && hash) return keep('<a href="#' + esc(anchorId(hash.slice(1))) + '">' + esc(label || hash.slice(1)) + '</a>');
    if (!title) return esc(m);
    const exists = ctx.exists(title);
    ctx.links.add(title);
    const shown = label !== undefined && label !== '' ? label : (target + (hash || '')).trim();
    return keep('<a href="' + esc(pageUrl(title, hash ? hash.slice(1) : '')) + '"' + (exists ? '' : ' class="new" title="' + esc(title) + ' (page does not exist)"') + '>' + inlineFormat(esc(shown)) + '</a>');
  });
  s = s.replace(/\[(\S+)(?:\s+([^\]]*))?\]/g, (m, url, label) => {
    const ok = safeUrl(url);
    if (!ok) return m;
    return keep('<a class="external" href="' + esc(ok) + '" rel="noopener nofollow">' + inlineFormat(esc(label || ok.replace(/^https?:\/\//, '').replace(/\/$/, ''))) + '</a>');
  });
  s = s.replace(/\{\{Swatch\|(#[0-9a-fA-F]{6})\}\}/g, (m, hex) => keep('<span class="swatch" data-colour="' + hex.toUpperCase() + '" aria-hidden="true"></span>'));
  s = inlineFormat(esc(s));
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => tokens[Number(i)]);
}
function inlineFormat(s) {
  return s.replace(/&#39;&#39;&#39;(.+?)&#39;&#39;&#39;/g, '<b>$1</b>').replace(/&#39;&#39;(.+?)&#39;&#39;/g, '<i>$1</i>')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>').replace(/&lt;code&gt;(.+?)&lt;\/code&gt;/g, '<code>$1</code>');
}

// Finds {{Name ... }} templates, allowing nested [[links]] and {{Swatch|...}} inside.
function extractTemplates(text, onTemplate) {
  let out = '', i = 0;
  while (i < text.length) {
    const start = text.indexOf('{{', i);
    if (start === -1) { out += text.slice(i); break; }
    out += text.slice(i, start);
    let depth = 0, j = start;
    for (; j < text.length - 1; j++) {
      if (text[j] === '{' && text[j + 1] === '{') { depth++; j++; }
      else if (text[j] === '}' && text[j + 1] === '}') { depth--; j++; if (depth === 0) break; }
    }
    if (depth !== 0) { out += text.slice(start); break; }
    const body = text.slice(start + 2, j - 1);
    out += onTemplate(body) ?? '{{' + body + '}}';
    i = j + 1;
  }
  return out;
}
function splitParams(body) {
  // Split on | that aren't inside [[...]] or {{...}}.
  const parts = []; let cur = '', depth = 0;
  for (let k = 0; k < body.length; k++) {
    const two = body.slice(k, k + 2);
    if (two === '[[' || two === '{{') { depth++; cur += two; k++; continue; }
    if ((two === ']]' || two === '}}') && depth) { depth--; cur += two; k++; continue; }
    if (body[k] === '|' && !depth) { parts.push(cur); cur = ''; continue; }
    cur += body[k];
  }
  parts.push(cur);
  return parts;
}

function infobox(params, ctx, extra) {
  const rows = [];
  let name = '', logo = '', caption = '', image = '';
  for (const p of params) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    const key = p.slice(0, eq).trim(), value = p.slice(eq + 1).trim();
    if (!value) continue;
    if (key === 'name') name = value;
    else if (key === 'logo') logo = value;
    else if (key === 'image') image = value;
    else if (key === 'caption') caption = value;
    else if (key.startsWith('header')) rows.push('<tr><th colspan="2" class="ib-header">' + inline(value, ctx) + '</th></tr>');
    else rows.push('<tr><th scope="row">' + esc(key.replace(/_/g, ' ')) + '</th><td>' + value.split(/\s*<br>\s*|\n/).map((v) => inline(v, ctx)).join('<br>') + '</td></tr>');
  }
  const logoHtml = extra && extra.logoHtml ? extra.logoHtml : logo ? imageHtml(logo, name) : '';
  return '<table class="infobox' + (extra && extra.cls ? ' ' + extra.cls : '') + '">' + (name ? '<caption>' + esc(name) + '</caption>' : '') +
    (logoHtml ? '<tr><td colspan="2" class="ib-logo">' + logoHtml + '</td></tr>' : '') +
    (image ? '<tr><td colspan="2" class="ib-image">' + imageHtml(image, caption || name) + (caption ? '<div class="ib-caption">' + inline(caption, ctx) + '</div>' : '') + '</td></tr>' : '') +
    rows.join('') + (extra && extra.footer ? '<tr><td colspan="2" class="ib-source">' + extra.footer + '</td></tr>' : '') + '</table>';
}

// ---------- Company templates (live from the Company Register) ----------
const longDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? Number(m[3]) + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m[2]) - 1] + ' ' + m[1] : ''; };
const listWords = (items) => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
const link = (title) => '[[' + title + ']]';
const ownerText = (o) => (o.company ? link(o.name) : o.name) + (o.share ? ' (' + o.share + ')' : '');
const webLink = (site) => { const s = String(site || '').trim(); if (!s) return ''; const url = /^https?:\/\//i.test(s) ? s : 'https://' + s; return safeUrl(url) ? '[' + url + ' ' + s.replace(/^https?:\/\//i, '').replace(/\/$/, '') + ']' : ''; };
function companyOf(name) { return companies && companies.register ? companies.register.find(name) : null; }
function sourceNote(c) { const R = companies.register; return 'Facts from the <a class="external" href="' + esc(R.registerUrl(c)) + '" rel="noopener">HN Group Company Register</a>, updated automatically.'; }

// {{Company infobox|Name|Products = …|Industry = …}}: the register's facts, plus any rows written here.
function companyInfobox(params, ctx) {
  const name = (params[0] || '').trim(), extras = params.slice(1).filter((p) => p.includes('='));
  const c = companyOf(name);
  if (!c) return infobox(['name = ' + name, ...extras], ctx);
  const R = companies.register, own = R.owners(c), parent = c.parent && R.bySlug(c.parent), manager = c.managedBy && R.bySlug(c.managedBy);
  const given = Object.fromEntries(extras.map((p) => [p.slice(0, p.indexOf('=')).trim().toLowerCase(), p.slice(p.indexOf('=') + 1).trim()]));
  const rows = [];
  const add = (key, value) => { if (value) rows.push(key + ' = ' + value); };
  const whollyOwned = own.length === 1 && own[0].company && own[0].share === '100%';
  add('Type', c.type || (parent ? (whollyOwned ? 'Wholly owned subsidiary' : 'Subsidiary') : ''));
  add(own.length > 1 ? 'Owners' : 'Owner', own.map(ownerText).join('<br>'));
  if (parent && !own.some((o) => o.company && o.company.slug === parent.slug)) add('Parent', link(R.displayName(parent)));
  if (manager) add('Managed by', link(R.displayName(manager)));
  add('Subsidiaries', R.children(c).map((x) => link(R.displayName(x))).join('<br>'));
  add('Manages', R.managedBy(c).filter((x) => x.parent !== c.slug).map((x) => link(R.displayName(x))).join('<br>'));
  add('Divisions', (c.divisions || []).map(link).join('<br>'));
  add('Industry', given.industry || (c.sic || []).join('<br>'));
  if (c.status && c.status !== 'Active') add('Status', c.status + (c.dissolved ? ' (' + longDate(c.dissolved) + ')' : ''));
  add('Founded', longDate(c.incorporated));
  add('Company number', c.number);
  add('Registered office', c.registeredOffice);
  add('Key people', (c.officers || []).map((o) => o.name + (o.role ? ' (' + o.role + ')' : '')).join('<br>'));
  for (const p of extras) { const k = p.slice(0, p.indexOf('=')).trim(); if (!['industry', 'logo', 'name'].includes(k.toLowerCase())) rows.push(p); }
  add('Email domain', c.emailDomain);
  if (!given.website) add('Website', webLink(c.website));
  const logo = (companies.logo && companies.logo(c)) || (given.logo ? findImage(given.logo) : null);
  return infobox(['name = ' + R.displayName(c), ...rows], ctx, { logoHtml: logo ? pictureHtml(logo, R.displayName(c)) : '', footer: sourceNote(c), cls: 'company-infobox' });
}

// Follows company owners upwards: "owned by A (100%), which is owned by B (100%)". When a company has
// several owners and one of them is a company, that company's owners follow in a sentence of their own.
function ownershipChain(c, seen) {
  const R = companies.register, own = R.owners(c);
  if (!own.length) return '';
  let text = listWords(own.map(ownerText));
  const owning = own.filter((o) => o.company), next = owning.length === 1 && owning[0].company;
  if (next && !seen.has(next.slug)) {
    seen.add(next.slug);
    const up = ownershipChain(next, seen);
    if (up) text += own.length === 1 ? ', which is owned by ' + up : '. ' + R.displayName(next) + ' is owned by ' + up;
  }
  return text;
}
// {{Company ownership|Name}}: who owns, runs and belongs to the company, as sentences.
function companyOwnership(params, ctx) {
  const c = companyOf((params[0] || '').trim());
  if (!c) return params[0] ? '<p class="company-facts muted">' + esc(params[0].trim()) + ' isn’t on the HN Group Company Register yet.</p>' : '';
  const R = companies.register, n = R.displayName(c), parts = [];
  const chain = ownershipChain(c, new Set([c.slug]));
  parts.push(chain ? n + ' is owned by ' + chain + '.' : 'No owner is recorded for ' + n + ' on the Company Register.');
  const parent = c.parent && R.bySlug(c.parent), own = R.owners(c);
  if (parent && !own.some((o) => o.company && o.company.slug === parent.slug)) parts.push('It is a subsidiary of ' + link(R.displayName(parent)) + '.');
  const manager = c.managedBy && R.bySlug(c.managedBy);
  if (manager) parts.push('It is managed by ' + link(R.displayName(manager)) + '.');
  const subs = R.children(c).map((x) => link(R.displayName(x)));
  if (subs.length) parts.push((subs.length === 1 ? 'Its subsidiary is ' : 'Its subsidiaries are ') + listWords(subs) + '.');
  const runs = R.managedBy(c).filter((x) => x.parent !== c.slug).map((x) => link(R.displayName(x)));
  if (runs.length) parts.push('It also manages ' + listWords(runs) + '.');
  if ((c.divisions || []).length) parts.push(listWords(c.divisions.map(link)) + ((c.divisions.length === 1) ? ' is part of ' : ' are part of ') + n + '.');
  return '<p class="company-facts">' + inline(parts.join(' '), ctx) + '<sup class="register-ref" title="From the HN Group Company Register"><a class="external" href="' + esc(R.registerUrl(c)) + '" rel="noopener">[register]</a></sup></p>';
}
// {{Company tree}} or {{Company tree|Name}}: the group's structure from the register.
function companyTree(params, ctx) {
  if (!companies || !companies.register) return '';
  const R = companies.register, start = (params[0] || '').trim(), top = start ? [companyOf(start)].filter(Boolean) : R.roots();
  const lines = [], seen = new Set();
  const walk = (c, depth) => {
    if (seen.has(c.slug)) return; seen.add(c.slug);
    const manager = c.managedBy && R.bySlug(c.managedBy), own = R.owners(c), share = own.length === 1 && own[0].company && own[0].share ? own[0].share + ' owned' : '';
    const notes = [share, manager ? 'managed by ' + link(R.displayName(manager)) : ''].filter(Boolean);
    lines.push('*'.repeat(depth) + " '''" + link(R.displayName(c)) + "'''" + (notes.length ? ' (' + notes.join(', ') + ')' : ''));
    for (const d of c.divisions || []) lines.push('*'.repeat(depth + 1) + ' ' + link(d) + ' (division)');
    for (const x of R.children(c)) walk(x, depth + 1);
  };
  for (const c of top) walk(c, 1);
  return '<div class="company-tree">' + render(lines.join('\n'), { exists: ctx.exists, noToc: true }).html + '</div>';
}
// {{Company list}}: a table of every company on the register.
function companyList(params, ctx) {
  if (!companies || !companies.register) return '';
  const R = companies.register, order = [], seen = new Set();
  const walk = (c) => { if (seen.has(c.slug)) return; seen.add(c.slug); order.push(c); R.children(c).forEach(walk); };
  R.roots().forEach(walk);
  const rows = order.map((c) => { const manager = c.managedBy && R.bySlug(c.managedBy); return "| '''" + link(R.displayName(c)) + "''' || " + (R.owners(c).map(ownerText).join('<br>') || '—') + ' || ' + (manager ? link(R.displayName(manager)) : '—') + ' || ' + (c.status || '—') + ' || ' + (longDate(c.incorporated) || '—') + ' || ' + (webLink(c.website) || '—'); });
  return table(['{| class="wikitable company-list"', '! Company !! Owner !! Managed by !! Status !! Founded !! Website', ...rows.flatMap((r) => ['|-', r]), '|}'], ctx);
}
// {{Company cards}}: a card for every company, with its current logo.
function companyCards(ctx) {
  if (!companies || !companies.register) return '';
  const R = companies.register, order = [], seen = new Set();
  const walk = (c) => { if (seen.has(c.slug)) return; seen.add(c.slug); order.push(c); R.children(c).forEach(walk); };
  R.roots().forEach(walk);
  return order.map((c) => { const n = R.displayName(c), logo = companies.logo && companies.logo(c), blurb = companies.blurb ? companies.blurb(c) : ''; ctx.links.add(n);
    return '<a class="company-card" href="' + esc(pageUrl(n)) + '"><span class="cc-logo">' + (logo ? pictureHtml(logo, n) : '<span class="cc-initials">' + esc(n.split(/\s+/).map((w) => w[0]).join('').slice(0, 3)) + '</span>') + '</span><span class="cc-name">' + esc(n) + '</span>' + (blurb ? '<span class="cc-blurb">' + esc(blurb) + '</span>' : '') + '</a>'; }).join('');
}

function table(lines, ctx) {
  const cls = /class="?([\w -]+)"?/.exec(lines[0]);
  let html = '<div class="table-wrap"><table class="' + esc(cls ? cls[1] : 'wikitable') + '">', caption = '', row = [];
  const rows = [];
  for (const line of lines.slice(1, -1)) {
    if (line.startsWith('|+')) caption = line.slice(2).trim();
    else if (line.startsWith('|-')) { if (row.length) rows.push(row); row = []; }
    else if (line.startsWith('!')) line.slice(1).split('!!').forEach((c) => row.push({ th: true, text: c.trim() }));
    else if (line.startsWith('|')) line.slice(1).split('||').forEach((c) => row.push({ th: false, text: c.trim() }));
  }
  if (row.length) rows.push(row);
  if (caption) html += '<caption>' + inline(caption, ctx) + '</caption>';
  for (const r of rows) html += '<tr>' + r.map((c) => (c.th ? '<th>' : '<td>') + inline(c.text, ctx) + (c.th ? '</th>' : '</td>')).join('') + '</tr>';
  return html + '</table></div>';
}

function render(source, opts) {
  const ctx = { exists: (opts && opts.exists) || (() => true), links: new Set(), refs: [], categories: [], headings: [] };
  let text = String(source || '').replace(/\r/g, '');
  const redirect = /^#REDIRECT\s*\[\[([^\]|#]+)(?:#([^\]|]*))?[^\]]*\]\]/i.exec(text.trim());
  if (redirect) return { redirect: normaliseTitle(redirect[1]), redirectAnchor: redirect[2] || '', html: '', categories: [], links: [] };

  // <code>…</code> and <nowiki>…</nowiki> are shown exactly as typed (no links, templates or formatting).
  const literals = [];
  text = text.replace(/<(code|nowiki)>([\s\S]*?)<\/\1>/g, (m, tag, body) => '\u0004' + (literals.push(tag === 'code' ? '<code>' + esc(body) + '</code>' : esc(body)) - 1) + '\u0004');
  text = text.replace(/\[\[Category:([^\]|]+)(?:\|[^\]]*)?\]\]/gi, (m, c) => { const n = normaliseTitle(c); if (!ctx.categories.includes(n)) ctx.categories.push(n); return ''; });
  // References: numbered in order, listed where {{Reflist}} appears.
  text = text.replace(/<ref>([\s\S]*?)<\/ref>/g, (m, body) => {
    const n = ctx.refs.push(body.trim());
    return '\u0001REF' + n + '\u0001';
  });
  const blocks = [];
  const keepBlock = (html) => '\n\u0002' + (blocks.push(html) - 1) + '\u0002\n';
  text = extractTemplates(text, (body) => {
    const params = splitParams(body);
    const name = params[0].trim().toLowerCase();
    if (name === 'company infobox') return keepBlock(companyInfobox(params.slice(1), ctx));
    if (name === 'company ownership') return keepBlock(companyOwnership(params.slice(1), ctx));
    if (name === 'company tree') return keepBlock(companyTree(params.slice(1), ctx));
    if (name === 'company list') return keepBlock(companyList(params.slice(1), ctx));
    if (name === 'company cards') return keepBlock(companyCards(ctx));
    if (name === 'infobox' || name.startsWith('infobox ')) return keepBlock(infobox(params.slice(1), ctx));
    if (name === 'reflist') return keepBlock('\u0003REFLIST\u0003');
    if (name === 'hatnote') return keepBlock('<div class="hatnote">' + inline(params.slice(1).join('|'), ctx) + '</div>');
    if (name === 'main') return keepBlock('<div class="hatnote">Main article: ' + params.slice(1).map((p) => inline('[[' + p.trim() + ']]', ctx)).join(', ') + '</div>');
    if (name === 'stub') return keepBlock('<div class="notice stub"><b>This article is a stub.</b> Staff can help by <a href="' + esc(opts && opts.editUrl || '#') + '">expanding it</a>.</div>');
    if (name === 'notice') return keepBlock('<div class="notice">' + inline(params.slice(1).join('|'), ctx) + '</div>');
    if (name === 'box start') return keepBlock('<section class="mp-box mp-' + esc((params[2] || 'purple').trim().toLowerCase().replace(/[^a-z]/g, '')) + '"><h2 class="mp-title">' + inline((params[1] || '').trim(), ctx) + '</h2><div class="mp-body">');
    if (name === 'box end') return keepBlock('</div></section>');
    if (name === 'columns start') return keepBlock('<div class="mp-columns"><div class="mp-column">');
    if (name === 'column') return keepBlock('</div><div class="mp-column">');
    if (name === 'columns end') return keepBlock('</div></div>');
    if (name === 'company card') {
      // {{Company card|Page|logo.svg|Short description}}
      const page = normaliseTitle(params[1] || ''), logo = (params[2] || '').trim(), blurb = (params[3] || '').trim();
      ctx.links.add(page);
      return keepBlock('<a class="company-card" href="' + esc(pageUrl(page)) + '"><span class="cc-logo">' + imageHtml(logo, page) + '</span><span class="cc-name">' + esc(page) + '</span>' + (blurb ? '<span class="cc-blurb">' + esc(blurb) + '</span>' : '') + '</a>');
    }
    if (name === 'cards start') return keepBlock('<div class="company-cards">');
    if (name === 'cards end') return keepBlock('</div>');
    if (name === 'swatch') return null;
    if (name === 'clear') return keepBlock('<div class="clear"></div>');
    if (name === 'short description') return '';
    return keepBlock('<span class="unknown-template">{{' + esc(body) + '}}</span>');
  });

  const lines = text.split('\n');
  const out = [];
  let para = [], list = null;
  const flushPara = () => { if (para.length) { out.push('<p>' + para.map((l) => inline(l, ctx)).join(' ') + '</p>'); para = []; } };
  const flushList = () => {
    if (!list) return;
    // Nested lists from prefixes like "*", "**", "#", "*#".
    let html = '', stack = [];
    const tag = (ch) => (ch === '#' ? 'ol' : ch === ':' ? 'dl' : 'ul');
    for (const item of list) {
      const prefix = item.prefix;
      let common = 0;
      while (common < stack.length && common < prefix.length && stack[common] === prefix[common]) common++;
      while (stack.length > common) { html += (stack[stack.length - 1] === ':' ? '</dd></dl>' : '</li></' + tag(stack[stack.length - 1]) + '>'); stack.pop(); }
      if (stack.length === prefix.length && stack.length) html += stack[stack.length - 1] === ':' ? '</dd><dd>' : '</li><li>';
      while (stack.length < prefix.length) { const ch = prefix[stack.length]; html += '<' + tag(ch) + '>' + (ch === ':' ? '<dd>' : '<li>'); stack.push(ch); }
      html += inline(item.text, ctx);
    }
    while (stack.length) { html += (stack[stack.length - 1] === ':' ? '</dd></dl>' : '</li></' + tag(stack[stack.length - 1]) + '>'); stack.pop(); }
    out.push(html);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const block = /^\u0002(\d+)\u0002$/.exec(line.trim());
    if (block) { flushPara(); flushList(); out.push(blocks[Number(block[1])]); continue; }
    const h = /^(={2,4})\s*(.+?)\s*\1\s*$/.exec(line);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length, plain = h[2].replace(/'''?|\[\[|\]\]/g, '').replace(/\|[^|]*$/, '');
      let id = anchorId(plain), n = 2;
      while (ctx.headings.some((x) => x.id === id)) id = anchorId(plain) + '_' + n++;
      ctx.headings.push({ level, text: plain, id });
      out.push('<h' + level + ' id="' + esc(id) + '"><span class="mw-headline">' + inline(h[2], ctx) + '</span>' +
        (opts && opts.sectionEdit ? '<span class="section-edit">[<a href="' + esc(opts.editUrl) + '">edit</a>]</span>' : '') + '</h' + level + '>');
      continue;
    }
    if (/^\{\|/.test(line)) {
      flushPara(); flushList();
      const rows = [line];
      while (++i < lines.length && !/^\|\}/.test(lines[i])) rows.push(lines[i]);
      rows.push('|}');
      out.push(table(rows, ctx));
      continue;
    }
    const file = /^\[\[File:([^|\]]+)((?:\|[^\]]*)?)\]\]\s*$/i.exec(line.trim());
    if (file) {
      flushPara(); flushList();
      const opts2 = file[2].split('|').slice(1).map((x) => x.trim());
      const caption = opts2.filter((o) => !/^(thumb|right|left|center|frameless|\d+px)$/i.test(o)).pop() || '';
      const side = opts2.includes('left') ? 'tleft' : opts2.includes('center') ? 'tcenter' : 'tright';
      out.push('<figure class="thumb ' + side + '"><div class="thumb-image">' + imageHtml(file[1], caption) + '</div>' + (caption ? '<figcaption>' + inline(caption, ctx) + '</figcaption>' : '') + '</figure>');
      continue;
    }
    // "; Term" lines are bold definition terms; the ": description" lines after them are indented.
    const term = /^;\s*(.*)$/.exec(line);
    if (term) { flushPara(); flushList(); out.push('<dl><dt>' + inline(term[1], ctx) + '</dt></dl>'); continue; }
    const li = /^([*#:]+)\s*(.*)$/.exec(line);
    if (li) { flushPara(); (list = list || []).push({ prefix: li[1], text: li[2] }); continue; }
    if (/^----+\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  let html = out.join('\n');

  // Contents box before the first heading when there are three or more headings.
  if (ctx.headings.length >= 3 && !(opts && opts.noToc)) {
    let n2 = 0, n3 = 0;
    const toc = '<nav class="toc" aria-labelledby="toc-title"><div class="toc-title" id="toc-title">Contents</div><ol>' + ctx.headings.map((hd) => {
      const num = hd.level === 2 ? (++n2, n3 = 0, String(n2)) : (n2 + '.' + (++n3));
      return '<li class="toclevel-' + (hd.level - 1) + '"><a href="#' + esc(hd.id) + '"><span class="tocnumber">' + num + '</span> <span class="toctext">' + esc(hd.text) + '</span></a></li>';
    }).join('') + '</ol></nav>';
    html = html.replace(/<h2 /, toc + '<h2 ');
  }
  html = html.replace(/\u0001REF(\d+)\u0001/g, (m, n) => '<sup class="reference" id="cite_ref-' + n + '"><a href="#cite_note-' + n + '">[' + n + ']</a></sup>');
  const reflist = ctx.refs.length ? '<ol class="references">' + ctx.refs.map((r, i) => '<li id="cite_note-' + (i + 1) + '"><a class="ref-back" href="#cite_ref-' + (i + 1) + '" aria-label="Back to text">^</a> ' + inline(r, ctx) + '</li>').join('') + '</ol>' : '';
  html = html.includes('\u0003REFLIST\u0003') ? html.replace('\u0003REFLIST\u0003', reflist) : html + reflist;
  html = html.replace(/\u0004(\d+)\u0004/g, (m, i) => literals[Number(i)] || '');
  return { html, categories: ctx.categories, links: [...ctx.links], headings: ctx.headings };
}

// Plain text for search snippets and descriptions.
function plainText(source) {
  return String(source || '').replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/<ref>[\s\S]*?<\/ref>/g, '')
    .replace(/\[\[(?:Category|File):[^\]]*\]\]/gi, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\[(\S+)\s+([^\]]*)\]/g, '$2').replace(/'''?/g, '').replace(/^=+\s*|\s*=+$/gm, '').replace(/^[*#:]+\s*/gm, '')
    .replace(/\{\|[\s\S]*?\|\}/g, ' ').replace(/\s+/g, ' ').trim();
}

// For search suggestions: the page's {{Short description|…}}, or the start of its first sentence.
function shortDescription(source) {
  const m = /\{\{\s*short description\s*\|([^{}]*)\}\}/i.exec(String(source || ''));
  if (m) return m[1].trim().slice(0, 120);
  const first = plainText(extractTemplates(String(source || ''), () => ' ').replace(/<[^>]*>/g, '')).replace(/\s*\[\d+\]/g, '');
  const sentence = (/^.*?[.!?](?=\s|$)/.exec(first) || [first])[0];
  return sentence.length > 100 ? sentence.slice(0, 97).replace(/\s+\S*$/, '') + '…' : sentence;
}

// For search suggestions: the infobox logo (a company's current logo for company infoboxes), as light
// and (when there is one) dark image paths.
function infoboxImage(source) {
  const company = /\{\{\s*company infobox\s*\|([^|}]+)/i.exec(String(source || ''));
  if (company) { const c = companyOf(company[1].trim()), logo = c && companies.logo && companies.logo(c); if (logo) return { light: logo.src, dark: logo.dark || null }; }
  const m = /\{\{\s*infobox[\s\S]*?\|\s*logo\s*=\s*([a-z0-9][a-z0-9._-]*\.(?:svg|png|jpe?g|webp|gif))/i.exec(String(source || ''));
  const found = m && findImage(m[1]);
  return found ? { light: found.src, dark: found.dark || null } : null;
}
// The company a page's {{Company infobox}} is about, if it has one.
function companyOfSource(source) { const m = /\{\{\s*company infobox\s*\|([^|}]+)/i.exec(String(source || '')); return m ? companyOf(m[1].trim()) : null; }

module.exports = { shortDescription, infoboxImage, render, plainText, normaliseTitle, pageUrl, anchorId, esc, setFileCheck, setFileResolver, setCompanySource, companyOfSource, imageHtml, findImage };
