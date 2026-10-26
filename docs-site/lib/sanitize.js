'use strict';
// Document bodies come from the browser's editor as HTML. Nothing is passed through as it came: the HTML is read
// tag by tag and rebuilt from a short list of formatting tags, with text re-escaped, links limited to http(s),
// mailto and in-page anchors, and the only style kept being text alignment. Scripts, styles, frames, forms,
// images, SVG and comments are dropped with their contents.

const ALLOWED = new Set(['p', 'div', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const VOID = new Set(['br', 'hr']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript', 'textarea', 'select', 'title', 'head', 'xmp', 'noembed', 'noframes', 'plaintext']);
const ALIGNABLE = new Set(['p', 'div', 'h1', 'h2', 'h3', 'li', 'blockquote', 'th', 'td']);
const RENAME = { b: 'strong', i: 'em' };
const MAX = 600000;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', pound: '£', euro: '€', copy: '©' };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e.toLowerCase()) ? NAMED[e.toLowerCase()] : m;
  });
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Text in the editor: control characters other than tab and new lines are removed.
const cleanText = (s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

function attributes(raw) {
  const out = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(raw))) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}
function safeHref(v) {
  const s = String(v).replace(/[\u0000- \u007f]/g, '');
  if (/^https?:\/\/[^\s]+$/i.test(s) || /^mailto:[^\s]+$/i.test(s) || /^#[\w-]{1,80}$/.test(s)) return s.slice(0, 2000);
  return '';
}
function openTag(name, attrs) {
  let a = '';
  if (name === 'a') { const href = safeHref(attrs.href || ''); if (href) a += ' href="' + esc(href) + '"' + (href.startsWith('#') ? '' : ' rel="noopener noreferrer"'); }
  if (ALIGNABLE.has(name)) {
    const m = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i.exec(attrs.style || '') || /^(left|center|right|justify)$/i.exec(attrs.align || '');
    if (m) a += ' style="text-align:' + m[1].toLowerCase() + '"';
  }
  if (name === 'th' || name === 'td') for (const k of ['colspan', 'rowspan']) { const n = Number(attrs[k]); if (Number.isInteger(n) && n > 1 && n <= 20) a += ' ' + k + '="' + n + '"'; }
  return '<' + name + a + '>';
}

function sanitize(input) {
  const html = String(input == null ? '' : input).slice(0, MAX);
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<[!?][^>]*>?|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let out = '', last = 0, m, skip = null;
  const stack = [];
  const text = (s) => { if (!skip) out += esc(cleanText(decode(s))); };
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index).replace(/</g, '&lt;'));
    last = re.lastIndex;
    if (!m[2]) continue; // comments, doctypes, CDATA and stray "<!" are dropped
    const closing = m[1] === '/', raw = m[2].toLowerCase(), name = RENAME[raw] || raw;
    if (skip) { if (closing && raw === skip) skip = null; continue; }
    if (DROP_WITH_CONTENT.has(raw)) { if (!closing && !/\/\s*$/.test(m[3])) skip = raw; continue; }
    if (!ALLOWED.has(name)) continue;
    if (VOID.has(name)) { if (!closing) out += '<' + name + '>'; continue; }
    if (!closing) { if (stack.length >= 60) continue; stack.push(name); out += openTag(name, attributes(m[3])); continue; }
    const at = stack.lastIndexOf(name);
    if (at === -1) continue;
    while (stack.length > at) out += '</' + stack.pop() + '>';
  }
  text(html.slice(last).replace(/</g, '&lt;'));
  while (stack.length) out += '</' + stack.pop() + '>';
  return out;
}

// Plain text for fields and titles: no tags, at most `max` characters (new lines allowed only when asked).
function plain(v, max, multiline) {
  let s = cleanText(String(v == null ? '' : v)).replace(/\r\n?/g, '\n');
  s = multiline ? s.replace(/\n{3,}/g, '\n\n') : s.replace(/\s*\n\s*/g, ' ');
  return s.trim().slice(0, max);
}

module.exports = { sanitize, plain, decode };
