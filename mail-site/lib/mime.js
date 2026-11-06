'use strict';
// Building emails to send (RFC 5322 / MIME) and reading the message parts Gmail returns.
const crypto = require('node:crypto');

const clean = (v) => String(v == null ? '' : v).replace(/[\r\n\0]+/g, ' ').trim();
const ascii = (s) => /^[\x20-\x7e]*$/.test(s);
// A header value with non-ASCII text encoded as RFC 2047 words (UTF-8, base64), split so lines stay short.
function word(s) {
  s = clean(s);
  if (ascii(s)) return s;
  const out = []; let chunk = '';
  for (const ch of s) { if (Buffer.byteLength(chunk + ch) > 45) { out.push(chunk); chunk = ''; } chunk += ch; }
  if (chunk) out.push(chunk);
  return out.map((c) => '=?UTF-8?B?' + Buffer.from(c, 'utf8').toString('base64') + '?=').join(' ');
}
const EMAIL = /^[^\s@<>(),;:"\\[\]]+@[^\s@<>(),;:"\\[\]]+\.[^\s@<>(),;:"\\[\]]+$/;
// "Ada <ada@x.org>, bob@y.org" -> [{name, email}], refusing anything that isn't an address.
function addresses(input) {
  const text = clean(Array.isArray(input) ? input.join(',') : input);
  if (!text) return [];
  const parts = []; let cur = '', quoted = false, angle = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '<') angle = true;
    if (!quoted && ch === '>') angle = false;
    if ((ch === ',' || ch === ';') && !quoted && !angle) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const list = [];
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    const m = /^(.*?)<([^<>]+)>$/.exec(raw);
    const email = (m ? m[2] : raw).trim(), name = m ? m[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1') : '';
    if (!EMAIL.test(email) || email.length > 254) { const e = new Error('“' + raw.slice(0, 80) + '” isn’t an email address.'); e.status = 400; throw e; }
    list.push({ name: name.slice(0, 120), email });
  }
  if (list.length > 100) { const e = new Error('That’s too many recipients (100 at most).'); e.status = 400; throw e; }
  return list;
}
const formatAddress = ({ name, email }) => (name ? (ascii(name) ? '"' + name.replace(/["\\]/g, '\\$&') + '"' : word(name)) + ' <' + email + '>' : email);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrap76 = (b64) => b64.replace(/.{1,76}/g, '$&\r\n');
function filenameParams(name) {
  const safe = clean(name).replace(/[\\/]/g, '_').slice(0, 180) || 'attachment';
  const fallback = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return { type: 'name="' + fallback + '"', disposition: 'filename="' + fallback + '"' + (ascii(safe) ? '' : "; filename*=UTF-8''" + encodeURIComponent(safe)) };
}

// Builds the raw message. html/text are the body; attachments are [{name, type, data: Buffer}].
function build({ from, to, cc, bcc, subject, html, text, inReplyTo, references, attachments = [], allowEmpty = false }) {
  const toList = addresses(to), ccList = addresses(cc), bccList = addresses(bcc);
  if (!allowEmpty && !toList.length && !ccList.length && !bccList.length) { const e = new Error('Add at least one recipient.'); e.status = 400; throw e; }
  const boundary = () => '=_hnmail_' + crypto.randomBytes(12).toString('hex');
  const head = ['From: ' + formatAddress(from), toList.length ? 'To: ' + toList.map(formatAddress).join(', ') : null, ccList.length ? 'Cc: ' + ccList.map(formatAddress).join(', ') : null,
    bccList.length ? 'Bcc: ' + bccList.map(formatAddress).join(', ') : null, 'Subject: ' + word(subject || ''), 'Date: ' + new Date().toUTCString().replace('GMT', '+0000'), 'MIME-Version: 1.0',
    inReplyTo ? 'In-Reply-To: ' + clean(inReplyTo) : null, references ? 'References: ' + clean(references).slice(0, 4000) : null].filter(Boolean);
  const plain = text != null ? String(text) : String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|blockquote)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const alt = boundary();
  const bodyPart = ['Content-Type: multipart/alternative; boundary="' + alt + '"', '', '--' + alt, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(plain, 'utf8').toString('base64')),
    '--' + alt, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from('<!doctype html><html><body>' + (html != null && html !== '' ? String(html) : escapeHtml(plain).replace(/\n/g, '<br>')) + '</body></html>', 'utf8').toString('base64')), '--' + alt + '--', ''].join('\r\n');
  let body;
  if (attachments.length) {
    const mixed = boundary();
    body = ['Content-Type: multipart/mixed; boundary="' + mixed + '"', '', '--' + mixed, bodyPart];
    for (const a of attachments) {
      const p = filenameParams(a.name), type = /^[\w.+-]+\/[\w.+-]+$/.test(a.type || '') ? a.type : 'application/octet-stream';
      body.push('--' + mixed, 'Content-Type: ' + type + '; ' + p.type, 'Content-Disposition: attachment; ' + p.disposition, 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(a.data).toString('base64')));
    }
    body.push('--' + mixed + '--', '');
    body = body.join('\r\n');
  } else body = bodyPart;
  return Buffer.from(head.join('\r\n') + '\r\n' + body, 'utf8');
}

// ---- Reading Gmail's message parts ----
const header = (part, name) => { const h = ((part && part.headers) || []).find((x) => x.name.toLowerCase() === name.toLowerCase()); return h ? h.value : ''; };
function decode(data, charset) {
  const bytes = Buffer.from(String(data || ''), 'base64url');
  try { return new TextDecoder(charset || 'utf-8').decode(bytes); } catch { return bytes.toString('utf8'); }
}
const charsetOf = (part) => (/charset="?([\w.:-]+)"?/i.exec(header(part, 'Content-Type')) || [])[1];
// Walks the parts: the first HTML and plain text bodies, attachments (with their part ids, which stay the same between
// fetches, unlike Gmail's attachment ids) and inline images by Content-ID.
function parse(payload) {
  const out = { html: '', text: '', attachments: [], inline: {} };
  (function walk(part) {
    if (!part) return;
    const type = String(part.mimeType || '').toLowerCase(), disposition = header(part, 'Content-Disposition').toLowerCase(), cid = header(part, 'Content-ID').replace(/^<|>$/g, '');
    if (part.parts && part.parts.length) { for (const p of part.parts) walk(p); return; }
    const isFile = !!part.filename || disposition.startsWith('attachment');
    if (!isFile && type === 'text/html' && !out.html && part.body && part.body.data) { out.html = decode(part.body.data, charsetOf(part)); return; }
    if (!isFile && type === 'text/plain' && !out.text && part.body && part.body.data) { out.text = decode(part.body.data, charsetOf(part)); return; }
    if (part.body && (part.body.attachmentId || part.body.data) && (isFile || cid)) {
      const info = { partId: String(part.partId || ''), name: part.filename || (cid ? 'image' : 'attachment'), type: type || 'application/octet-stream', size: part.body.size || 0, cid: cid || null,
        inline: !!cid && type.startsWith('image/') && !disposition.startsWith('attachment') };
      if (info.inline) out.inline[cid] = info;
      if (!info.inline) out.attachments.push(info);
    }
  })(payload);
  return out;
}
function findPart(payload, partId) {
  let found = null;
  (function walk(part) { if (!part || found) return; if (String(part.partId) === String(partId)) { found = part; return; } for (const p of part.parts || []) walk(p); })(payload);
  return found;
}
module.exports = { build, addresses, parse, header, findPart, decode, word, formatAddress };
