'use strict';
// A small IMAP client for HN Mail talking to HN Group's own mail server (Dovecot on this VPS, 127.0.0.1:143). Only what
// HN Mail needs: LOGIN, LIST, STATUS, SELECT/EXAMINE, UID SEARCH/SORT/THREAD/FETCH/STORE/MOVE/COPY/EXPUNGE, APPEND,
// GETQUOTAROOT. Literals are sent with LITERAL+ (Dovecot supports it), responses with literals are parsed fully.
// Nothing is logged: message contents and credentials never leave this process except to Dovecot.
const net = require('node:net');

const fail = (status, message) => Object.assign(new Error(message), { status });

// ---- response parsing ----
// Splits complete responses (a line, plus any {n} literals and the rest of the line after them) off a buffer.
function takeResponse(buf) {
  let pos = 0;
  for (;;) {
    const crlf = buf.indexOf('\r\n', pos);
    if (crlf < 0) return null;
    const m = /\{(\d+)\}$/.exec(buf.toString('latin1', Math.max(pos, crlf - 20), crlf));
    if (!m) return { bytes: buf.subarray(0, crlf), rest: buf.subarray(crlf + 2) };
    const end = crlf + 2 + Number(m[1]);
    if (buf.length < end) return null;
    pos = end;
  }
}
// Tokens: strings (atoms and quoted), Buffers (literals), arrays (lists), null (NIL).
function tokenize(bytes) {
  let i = 0;
  const s = bytes;
  function list(close) {
    const out = [];
    while (i < s.length) {
      const c = s[i];
      if (c === 0x20) { i++; continue; }
      if (c === close) { i++; return out; }
      if (c === 0x28) { i++; out.push(list(0x29)); continue; }
      if (c === 0x22) { // quoted
        i++; let str = '';
        while (i < s.length && s[i] !== 0x22) { if (s[i] === 0x5c) i++; str += String.fromCharCode(s[i]); i++; }
        i++; out.push(Buffer.from(str, 'latin1').toString('utf8')); continue;
      }
      if (c === 0x7b) { // {n}\r\n literal
        const close = s.indexOf(0x7d, i), n = Number(s.toString('latin1', i + 1, close));
        i = close + 3; out.push(s.subarray(i, i + n)); i += n; continue;
      }
      let start = i, depth = 0;
      while (i < s.length) {
        const d = s[i];
        if (d === 0x5b) depth++; else if (d === 0x5d) depth--;
        else if (depth <= 0 && (d === 0x20 || d === 0x28 || d === 0x29)) break;
        i++;
      }
      const atom = s.toString('utf8', start, i);
      out.push(atom === 'NIL' ? null : atom);
    }
    return out;
  }
  return list(-1);
}
const str = (v) => (v == null ? '' : Buffer.isBuffer(v) ? v.toString('utf8') : String(v));
// IMAP modified UTF-7 mailbox names (RFC 3501 5.1.3).
function decodeMailbox(name) { return String(name).replace(/&([^-]*)-/g, (_, b) => { if (b === '') return '&'; const buf = Buffer.from(b.replace(/,/g, '/'), 'base64'); if (buf.length % 2) return ''; buf.swap16(); return buf.toString('utf16le'); }); }
function encodeMailbox(name) { return String(name).replace(/&/g, '&-').replace(/[^\x20-\x7e]+/g, (run) => { const b = Buffer.from(run, 'utf16le'); b.swap16(); return '&' + b.toString('base64').replace(/=+$/, '').replace(/\//g, ',') + '-'; }); }
// A string argument: quoted when plain ASCII, otherwise a LITERAL+.
function arg(value) {
  const v = String(value);
  if (/^[\x20-\x7e]*$/.test(v) && v.length < 1000) return '"' + v.replace(/(["\\])/g, '\\$1') + '"';
  return { literal: Buffer.from(v, 'utf8') };
}
const mailboxArg = (name) => arg(encodeMailbox(name));

class Imap {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.tag = 0; this.waiting = null; this.untagged = []; this.closed = false;
    this.greeting = new Promise((resolve, reject) => { this.onGreeting = { resolve, reject }; });
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.pump(); });
    socket.on('error', (e) => this.abort(e));
    socket.on('close', () => this.abort(new Error('closed')));
  }
  abort(e) {
    if (this.closed) return; this.closed = true;
    const err = fail(503, 'The mail server connection closed unexpectedly.');
    if (this.onGreeting) { this.onGreeting.reject(err); this.onGreeting = null; }
    if (this.waiting) { this.waiting.reject(err); this.waiting = null; }
  }
  pump() {
    for (;;) {
      const r = takeResponse(this.buf);
      if (!r) return;
      this.buf = r.rest;
      const line = r.bytes, head = line.toString('latin1', 0, Math.min(line.length, 40));
      if (this.onGreeting) { if (head.startsWith('* OK')) { this.onGreeting.resolve(); } else this.onGreeting.reject(fail(503, 'The mail server refused the connection.')); this.onGreeting = null; continue; }
      if (head.startsWith('* ')) { this.untagged.push(tokenize(line.subarray(2))); continue; }
      if (head.startsWith('+')) continue;
      const sp = head.indexOf(' ');
      if (this.waiting && head.slice(0, sp) === this.waiting.tag) {
        const rest = line.toString('utf8', sp + 1), status = rest.split(' ')[0];
        const w = this.waiting; this.waiting = null;
        const untagged = this.untagged; this.untagged = [];
        w.resolve({ status, text: rest.slice(status.length + 1), untagged });
      }
    }
  }
  // Sends a command made of strings and {literal: Buffer} parts. Resolves {status, text, untagged}; rejects on NO/BAD.
  run(parts, { allowNo = false } = {}) {
    if (this.closed) return Promise.reject(fail(503, 'The mail server connection is closed.'));
    const tag = 'H' + (++this.tag);
    const chunks = [Buffer.from(tag + ' ')];
    for (const p of [].concat(parts)) {
      if (p && p.literal) { chunks.push(Buffer.from('{' + p.literal.length + '+}\r\n')); chunks.push(p.literal); }
      else chunks.push(Buffer.from(String(p)));
    }
    chunks.push(Buffer.from('\r\n'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(fail(504, 'The mail server took too long to answer.')); this.socket.destroy(); }, 60000);
      this.waiting = { tag, resolve: (r) => { clearTimeout(timer); if (r.status !== 'OK' && !allowNo) reject(Object.assign(fail(r.status === 'NO' ? 409 : 502, r.text.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*\([\d.+ ]+secs\)\.?$/, '') || 'The mail server refused that.'), { imap: r })); else resolve(r); }, reject: (e) => { clearTimeout(timer); reject(e); } };
      this.socket.write(Buffer.concat(chunks));
    });
  }
  join(...parts) { const out = []; parts.forEach((p, k) => { if (k) out.push(' '); out.push(p); }); return out; }
  async login(user, pass) { await this.run(this.join('LOGIN', arg(user), arg(pass))); }
  async logout() { try { await this.run('LOGOUT'); } catch {} this.socket.end(); }
  async list(pattern = '*') {
    const r = await this.run(this.join('LIST', '""', arg(pattern)));
    return r.untagged.filter((t) => t[0] === 'LIST').map((t) => ({ flags: (t[1] || []).map(String), separator: str(t[2]), name: decodeMailbox(str(t[3])) }));
  }
  async status(name, items = ['MESSAGES', 'UNSEEN', 'UIDNEXT', 'UIDVALIDITY']) {
    const r = await this.run(this.join('STATUS', mailboxArg(name), '(' + items.join(' ') + ')'), { allowNo: true });
    if (r.status !== 'OK') return null;
    const t = r.untagged.find((x) => x[0] === 'STATUS'), list = t ? t[2] : [], out = {};
    for (let k = 0; k < list.length; k += 2) out[String(list[k]).toLowerCase()] = Number(list[k + 1]);
    return out;
  }
  async select(name, readOnly = false) {
    const r = await this.run(this.join(readOnly ? 'EXAMINE' : 'SELECT', mailboxArg(name)), { allowNo: true });
    if (r.status !== 'OK') return null;
    const out = { name, exists: 0, uidvalidity: 0, uidnext: 0, readOnly: /READ-ONLY/i.test(r.text) };
    for (const t of r.untagged) {
      if (t[1] === 'EXISTS') out.exists = Number(t[0]);
      const code = t[0] === 'OK' ? String(t[1] || '') : '';
      let m;
      if ((m = /^\[UIDVALIDITY (\d+)\]$/i.exec(code))) out.uidvalidity = Number(m[1]);
      if ((m = /^\[UIDNEXT (\d+)\]$/i.exec(code))) out.uidnext = Number(m[1]);
    }
    this.selected = out;
    return out;
  }
  // Search keys as tokens ('(' and ')' allowed); spaced properly here.
  spaced(tokens) { const out = []; for (const t of [].concat(tokens)) { if (out.length && t !== ')' && out[out.length - 1] !== '(') out.push(' '); out.push(t); } return out; }
  async search(criteria) { const r = await this.run(['UID SEARCH ', ...this.spaced(criteria)]); const t = r.untagged.find((x) => x[0] === 'SEARCH'); return t ? t.slice(1).map(Number) : []; }
  async sort(criteria) { const r = await this.run(['UID SORT (REVERSE ARRIVAL) UTF-8 ', ...this.spaced(criteria)]); const t = r.untagged.find((x) => x[0] === 'SORT'); return t ? t.slice(1).map(Number) : []; }
  // Threads (RFC 5256 REFERENCES) as arrays of UIDs, newest thread first.
  async threads(criteria) {
    const r = await this.run(['UID THREAD REFERENCES UTF-8 ', ...this.spaced(criteria)]);
    const t = r.untagged.find((x) => x[0] === 'THREAD'), out = [];
    const flat = (node) => (Array.isArray(node) ? node.flatMap(flat) : node == null ? [] : [Number(node)]);
    for (const node of t ? t.slice(1) : []) out.push(flat(node));
    return out.sort((a, b) => Math.max(...b) - Math.max(...a));
  }
  // Fetches items for UIDs; returns [{uid, flags, internaldate, size, ...body sections by name}].
  async fetch(uids, items) {
    if (!uids.length) return [];
    const r = await this.run(this.join('UID FETCH', uidSet(uids), '(' + items.join(' ') + ')'));
    const out = [];
    for (const t of r.untagged) {
      if (t[1] !== 'FETCH' || !Array.isArray(t[2])) continue;
      const o = {}, l = t[2];
      for (let k = 0; k < l.length; k += 2) {
        const key = String(l[k]).toUpperCase(), v = l[k + 1];
        if (key === 'UID') o.uid = Number(v); else if (key === 'FLAGS') o.flags = (v || []).map(String); else if (key === 'INTERNALDATE') o.internaldate = Date.parse(str(v)) || 0;
        else if (key === 'RFC822.SIZE') o.size = Number(v); else if (key.startsWith('BODY[')) o[key.replace(/<\d+>$/, '')] = Buffer.isBuffer(v) ? v : Buffer.from(str(v));
        else o[key] = v;
      }
      if (o.uid) out.push(o);
    }
    return out;
  }
  async store(uids, change, flags) { if (uids.length) await this.run(this.join('UID STORE', uidSet(uids), change + 'FLAGS.SILENT', '(' + flags.join(' ') + ')')); }
  async move(uids, to) { if (uids.length) await this.run(this.join('UID MOVE', uidSet(uids), mailboxArg(to))); }
  async copy(uids, to) { if (uids.length) await this.run(this.join('UID COPY', uidSet(uids), mailboxArg(to))); }
  async expunge(uids) { if (uids.length) await this.run(this.join('UID EXPUNGE', uidSet(uids))); }
  async create(name) { await this.run(this.join('CREATE', mailboxArg(name)), { allowNo: true }); }
  // APPEND; returns {uidvalidity, uid} from UIDPLUS.
  async append(name, raw, flags = []) {
    const r = await this.run(this.join('APPEND', mailboxArg(name), '(' + flags.join(' ') + ')', { literal: Buffer.isBuffer(raw) ? raw : Buffer.from(raw) }));
    const m = /\[APPENDUID (\d+) (\d+)\]/.exec(r.text);
    return m ? { uidvalidity: Number(m[1]), uid: Number(m[2]) } : null;
  }
  async quota(name = 'INBOX') {
    const r = await this.run(this.join('GETQUOTAROOT', mailboxArg(name)), { allowNo: true });
    const t = r.untagged.find((x) => x[0] === 'QUOTA');
    if (!t || !Array.isArray(t[2])) return null;
    const l = t[2]; for (let k = 0; k < l.length; k += 3) if (String(l[k]).toUpperCase() === 'STORAGE') return { usedKB: Number(l[k + 1]), limitKB: Number(l[k + 2]) };
    return null;
  }
}
function uidSet(uids) {
  const s = [...new Set(uids.map(Number).filter((n) => n > 0))].sort((a, b) => a - b), out = [];
  for (let k = 0; k < s.length; k++) { let j = k; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; out.push(j > k ? s[k] + ':' + s[j] : String(s[k])); k = j; }
  return out.join(',') || '0';
}
async function connect({ host = '127.0.0.1', port = 143, user, pass }) {
  const socket = net.connect({ host, port });
  socket.setTimeout(120000, () => socket.destroy());
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', () => reject(fail(503, 'HN Group’s mail server can’t be reached right now. Please try again shortly.'))); });
  const c = new Imap(socket);
  await c.greeting;
  try { await c.login(user, pass); } catch (e) { socket.destroy(); throw fail(e.status === 409 ? 403 : 503, e.status === 409 ? 'Your mailbox couldn’t be opened (it may be disabled).' : e.message); }
  return c;
}
module.exports = { connect, tokenize, takeResponse, arg, uidSet, encodeMailbox, decodeMailbox, Imap };
