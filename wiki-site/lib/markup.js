'use strict';
// Renders the wiki's article markup to HTML. It's a small, safe subset of Wikipedia's wikitext:
//
//   == Heading ==, === Subheading ===         '''bold''', ''italic''
//   * bullet, # numbered, : indented          [[Page]], [[Page|text]], [[Page#Section|text]]
//   [https://example.com text]                <ref>Source</ref> and {{Reflist}}
//   {{Infobox ... }}, {{Hatnote|...}}, {{Main|Page}}, {{Stub}}, {{Swatch|#5514B4}}
//   [[File:logo.svg|thumb|Caption]]           {| class="wikitable" ... |} tables
//   [[Category:Companies]]                    #REDIRECT [[Page]]
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

// Brand images available to [[File:...]] and infobox logos (copied from brand/logos).
let fileExists = () => false;
function setFileCheck(fn) { fileExists = fn; }
function imageHtml(name, alt, cls) {
  const file = String(name || '').trim().replace(/^File:/i, '');
  if (!/^[a-z0-9][a-z0-9._-]*\.(svg|png|jpg|jpeg|webp)$/i.test(file) || !fileExists(file)) return '<span class="missing-file">' + esc(file || 'image') + '</span>';
  const white = file.replace(/\.(svg|png)$/i, '-white.$1');
  const src = '/assets/brand/' + file;
  if (fileExists(white) && white !== file) {
    return '<img class="on-light ' + (cls || '') + '" src="' + src + '" alt="' + esc(alt) + '" loading="lazy">' +
      '<img class="on-dark ' + (cls || '') + '" src="/assets/brand/' + white + '" alt="' + esc(alt) + '" loading="lazy">';
  }
  return '<img class="' + (cls || '') + '" src="' + src + '" alt="' + esc(alt) + '" loading="lazy">';
}

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

function infobox(params, ctx) {
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
  return '<table class="infobox">' + (name ? '<caption>' + esc(name) + '</caption>' : '') +
    (logo ? '<tr><td colspan="2" class="ib-logo">' + imageHtml(logo, name) + '</td></tr>' : '') +
    (image ? '<tr><td colspan="2" class="ib-image">' + imageHtml(image, caption || name) + (caption ? '<div class="ib-caption">' + inline(caption, ctx) + '</div>' : '') + '</td></tr>' : '') +
    rows.join('') + '</table>';
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

module.exports = { render, plainText, normaliseTitle, pageUrl, anchorId, esc, setFileCheck, imageHtml };
