'use strict';
// Reads raw email messages (RFC 5322 / MIME) as they come from HN Group's mail server: headers (with RFC 2047 encoded
// words), nested multiparts, base64 / quoted-printable bodies, character sets, attachments and inline (cid:) images.
// Parts are numbered like IMAP part numbers ("1", "1.2" …), which HN Mail uses as stable attachment ids.

function decodeBytes(buf, charset) {
  const cs = String(charset || 'utf-8').toLowerCase().replace(/^(x-|cp)/, (m) => (m === 'cp' ? 'windows-' : '')).replace(/^us-ascii$/, 'utf-8');
  try { return new TextDecoder(cs, { fatal: false }).decode(buf); } catch { try { return new TextDecoder('windows-1252').decode(buf); } catch { return buf.toString('latin1'); } }
}
function qp(text, header = false) {
  const s = header ? text.replace(/_/g, ' ') : text.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else { const c = s.charCodeAt(i); if (c < 256) bytes.push(c); else bytes.push(...Buffer.from(s[i], 'utf8')); }
  }
  return Buffer.from(bytes);
}
// "=?UTF-8?B?…?=" words in headers.
function decodeWords(value) {
  return String(value || '').replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1').replace(/=\?([^?*]+)(?:\*[^?]*)?\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, text) => {
    try { return decodeBytes(enc.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : qp(text, true), cs); } catch { return text; }
  });
}
function parseHeaders(text) {
  const out = [];
  for (const line of text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':'); if (i < 1) continue;
    out.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]);
  }
  return out;
}
// "text/plain; charset=utf-8; name*=UTF-8''r%C3%A9sum%C3%A9.pdf" -> {value, params}
function parseParams(value) {
  const parts = []; let cur = '', q = false;
  for (const ch of String(value || '')) { if (ch === '"') q = !q; if (ch === ';' && !q) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  const params = {}, continued = {};
  for (const p of parts.slice(1)) {
    const i = p.indexOf('='); if (i < 0) continue;
    let key = p.slice(0, i).trim().toLowerCase(), v = p.slice(i + 1).trim().replace(/^"(.*)"$/s, '$1').replace(/\\(.)/g, '$1');
    const m = /^([^*]+)\*(\d+)?(\*)?$/.exec(key);
    if (m) { const base = m[1]; (continued[base] = continued[base] || []).push({ n: Number(m[2] || 0), v, enc: !!m[3] || (!m[2] && key.endsWith('*')) }); continue; }
    params[key] = decodeWords(v);
  }
  for (const [base, list] of Object.entries(continued)) {
    list.sort((a, b) => a.n - b.n);
    let joined = '', charset = 'utf-8';
    list.forEach((x, k) => { let v = x.v; if (x.enc) { if (k === 0 && /^[^']*'[^']*'/.test(v)) { charset = v.split("'")[0] || 'utf-8'; v = v.split("'").slice(2).join("'"); } try { v = decodeBytes(Buffer.from(v.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1'), charset); } catch {} } joined += v; });
    params[base] = joined;
  }
  return { value: parts[0].trim().toLowerCase(), params };
}
function split(raw) {
  const s = raw.toString('latin1');
  let i = s.indexOf('\r\n\r\n'), skip = 4;
  const j = s.indexOf('\n\n');
  if (i < 0 || (j >= 0 && j < i)) { i = j; skip = 2; }
  if (i < 0) return { head: s, body: Buffer.alloc(0) };
  return { head: s.slice(0, i), body: raw.subarray(i + skip) };
}
function decodeBody(body, encoding) {
  const e = String(encoding || '').toLowerCase().trim();
  if (e === 'base64') return Buffer.from(body.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  if (e === 'quoted-printable') return qp(body.toString('latin1'));
  return body;
}

function parsePart(raw, id, out, depth) {
  const { head, body } = split(raw);
  const headers = parseHeaders(head), get = (n) => (headers.find(([k]) => k === n) || [])[1] || '';
  const ct = parseParams(get('content-type') || 'text/plain'), cd = parseParams(get('content-disposition'));
  const type = ct.value || 'text/plain';
  if (type.startsWith('multipart/') && ct.params.boundary && depth < 20) {
    const b = '--' + ct.params.boundary, s = body.toString('latin1'), pieces = [];
    let pos = s.indexOf(b);
    while (pos >= 0) {
      const start = s.indexOf('\n', pos) + 1; if (!start) break;
      const next = s.indexOf('\n' + b, start);
      if (next < 0) { pieces.push(body.subarray(start)); break; }
      pieces.push(body.subarray(start, next > 0 && s[next - 1] === '\r' ? next - 1 : next));
      if (s.startsWith(b + '--', next + 1)) break;
      pos = next + 1;
    }
    pieces.forEach((p, k) => parsePart(p, id ? id + '.' + (k + 1) : String(k + 1), out, depth + 1));
    return;
  }
  const partId = id || '1';
  const name = cd.params.filename || ct.params.name || '';
  const disposition = cd.value;
  const cid = get('content-id').replace(/^<|>$/g, '').trim();
  out.parts.set(partId, { type, name, encoding: get('content-transfer-encoding'), body, charset: ct.params.charset });
  const isText = (type === 'text/plain' || type === 'text/html') && disposition !== 'attachment' && !name;
  if (isText) {
    const text = decodeBytes(decodeBody(body, get('content-transfer-encoding')), ct.params.charset);
    if (type === 'text/html') { if (!out.html) out.html = text; } else if (!out.text) out.text = text;
    return;
  }
  const size = decodeBody(body, get('content-transfer-encoding')).length;
  if (cid && type.startsWith('image/') && disposition !== 'attachment') out.inline[cid] = { partId, size, type };
  if (disposition === 'attachment' || name || !cid) out.attachments.push({ partId, name: name || (type === 'message/rfc822' ? 'message.eml' : 'attachment'), type, size });
}

function parse(raw) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const { head } = split(buf);
  const headers = parseHeaders(head);
  const out = { headers, html: '', text: '', attachments: [], inline: {}, parts: new Map() };
  parsePart(buf, '', out, 0);
  if (!out.text && out.html) out.text = out.html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  out.header = (n) => decodeWords((headers.find(([k]) => k === n.toLowerCase()) || [])[1] || '');
  out.part = (partId) => { const p = out.parts.get(String(partId)); if (!p) return null; return { name: p.name || 'attachment', type: p.type, bytes: decodeBody(p.body, p.encoding) }; };
  return out;
}
// A short preview of the text (for message lists), from a message that may be cut off.
function snippet(raw, max = 200) {
  try { const p = parse(raw); return (p.text || '').replace(/\s+/g, ' ').trim().slice(0, max); } catch { return ''; }
}
module.exports = { parse, snippet, decodeWords, parseParams, parseHeaders };
