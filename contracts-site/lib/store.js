'use strict';
// HN Group Contracts storage: one JSON file (written atomically, owner-only) plus the contract PDFs and signing
// certificates in DATA_DIR/files. A contract is a PDF that someone with "Send contracts for signing" uploads (or sends
// from HN Group Docs), with the people who must sign it, each invited by their HN Group Auth account. The PDF is never
// changed: every signature is recorded against its SHA-256 fingerprint, and once everyone has signed a signing
// certificate (who signed, when, from where, and the fingerprint) is made to go with it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let dir, file, filesDir, db;
const now = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });
const MAX_PDF = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function init(dataDir) {
  dir = dataDir; file = path.join(dir, 'contracts.json'); filesDir = path.join(dir, 'files');
  fs.mkdirSync(filesDir, { recursive: true, mode: 0o700 });
  db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  for (const [k, v] of Object.entries({ contracts: [], sessions: {}, people: {}, audit: [] })) if (!db[k]) db[k] = v;
  for (const [t, s] of Object.entries(db.sessions)) if (s.expires <= Date.now()) delete db.sessions[t];
  save();
}
function save() { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 }); fs.renameSync(tmp, file); }
function audit(who, action, contract, detail) {
  db.audit.push({ at: now(), who: who ? who.displayName : 'System', whoId: who ? who.id : '', action, contract: contract ? contract.id : '', detail: detail || '' });
  if (db.audit.length > 10000) db.audit.splice(0, db.audit.length - 10000);
}

// ---------- Sessions (this site's own cookie, tied to an HN Group Auth sign-in) ----------
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
function createSession(user, authSession, expires) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[hash(token)] = { user, authSession, expires: Math.min(Number(expires) || 0, Date.now() + 12 * 3600000) || Date.now() + 3600000, checked: Date.now() };
  save(); return token;
}
function session(token) { const s = /^[a-f0-9]{64}$/.test(token || '') && db.sessions[hash(token)]; if (!s) return null; if (s.expires <= Date.now()) { delete db.sessions[hash(token)]; save(); return null; } return s; }
function updateSession(token, fields) { const s = session(token); if (s) { Object.assign(s, fields); save(); } }
function endSession(token) { if (/^[a-f0-9]{64}$/.test(token || '') && db.sessions[hash(token)]) { delete db.sessions[hash(token)]; save(); } }
function notePerson(user) { db.people[user.id] = { name: user.displayName, accountId: user.accountId, at: now() }; }

// ---------- Files ----------
const blobPath = (id) => path.join(filesDir, id + '.pdf');
function writeBlob(bytes) { const id = crypto.randomUUID(), tmp = blobPath(id) + '.tmp'; fs.writeFileSync(tmp, bytes, { mode: 0o600 }); fs.renameSync(tmp, blobPath(id)); return id; }
function readBlob(id) { return UUID.test(id || '') ? fs.readFileSync(blobPath(id)) : null; }
const isPdf = (b) => Buffer.isBuffer(b) && b.length > 8 && b.subarray(0, 5).toString('latin1') === '%PDF-' && b.subarray(Math.max(0, b.length - 1024)).toString('latin1').includes('%%EOF');
const pageCount = (b) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

// ---------- Who may do what ----------
// Permissions come from the staff portal's roles through HN Group Auth (the same ones every HN Group website gets).
const canSend = (u) => !!u && !u.impersonated && (u.owner || u.permissions.includes('contracts.send') || u.permissions.includes('contracts.manage'));
const canManage = (u) => !!u && !u.impersonated && (u.owner || u.permissions.includes('contracts.manage'));
const isSigner = (s, u) => !!u && (s.id === u.id || (!!u.accountId && (s.accountIds || []).includes(u.accountId)));
const mySigner = (c, u) => c.signers.find((s) => isSigner(s, u)) || null;
const isSender = (c, u) => !!u && (c.createdBy.id === u.id || (!!u.accountId && c.createdBy.accountId === u.accountId));
// Senders see their own contracts; signers see contracts once they've been sent; managers see everything.
const canSee = (c, u) => isSender(c, u) || canManage(u) || (c.status !== 'draft' && !!mySigner(c, u));

function contract(id) { return db.contracts.find((c) => c.id === id) || null; }
function get(id, u) { const c = UUID.test(id || '') && contract(id); if (!c || !canSee(c, u)) throw fail(404, 'That contract doesn’t exist, or you can’t open it.'); return c; }

function view(c, u) {
  const me = mySigner(c, u);
  return {
    id: c.id, title: c.title, message: c.message, status: c.status, createdAt: c.createdAt, sentAt: c.sentAt || null, completedAt: c.completedAt || null, cancelledAt: c.cancelledAt || null,
    createdBy: { name: c.createdBy.name }, source: c.source, file: { name: c.file.name, size: c.file.size, pages: c.file.pages, sha256: c.file.sha256 },
    signers: c.signers.map((s) => ({ id: s.id, name: s.name, jobTitle: s.jobTitle, company: s.company, role: s.role, status: s.status, signedAt: s.signedAt || null, viewedAt: s.viewedAt || null,
      declinedAt: s.declinedAt || null, reason: s.status === 'declined' ? s.reason : '', signature: s.status === 'signed' ? s.signature.typed : '', me: me === s })),
    events: (isSender(c, u) || canManage(u)) ? c.events.slice() : c.events.filter((e) => !e.private),
    certificate: !!c.certificate,
    can: { edit: c.status === 'draft' && (isSender(c, u) || canManage(u)) && canSend(u), cancel: ['draft', 'out', 'declined'].includes(c.status) && (isSender(c, u) || canManage(u)),
      sign: c.status === 'out' && !!me && me.status === 'waiting' && !u.impersonated, mustView: c.status === 'out' && !!me && me.status === 'waiting' && !me.viewedAt },
  };
}
const summary = (c, u) => { const v = view(c, u); return { id: v.id, title: v.title, status: v.status, createdAt: v.createdAt, sentAt: v.sentAt, completedAt: v.completedAt, createdBy: v.createdBy,
  signed: c.signers.filter((s) => s.status === 'signed').length, total: c.signers.length, waitingForMe: v.can.sign, mine: isSender(c, u), signers: v.signers.map((s) => ({ name: s.name, status: s.status })) }; };

function list(u) {
  const all = db.contracts.filter((c) => canSee(c, u)).sort((a, b) => (b.sentAt || b.createdAt).localeCompare(a.sentAt || a.createdAt));
  return {
    toSign: all.filter((c) => c.status === 'out' && mySigner(c, u) && mySigner(c, u).status === 'waiting').map((c) => summary(c, u)),
    signed: all.filter((c) => mySigner(c, u) && c.status !== 'draft' && mySigner(c, u).status !== 'waiting').map((c) => summary(c, u)),
    sent: all.filter((c) => isSender(c, u)).map((c) => summary(c, u)),
    everyone: canManage(u) ? all.map((c) => summary(c, u)) : null,
  };
}
const event = (c, who, text, priv) => c.events.push({ at: now(), who: who ? who.displayName : 'HN Group Contracts', text, ...(priv ? { private: true } : {}) });

// A new contract from an uploaded PDF (on this site or sent from HN Group Docs). It starts as a draft for its sender.
function create(u, { title, message, pdf, name, source }) {
  if (!canSend(u)) throw fail(403, 'You need the “Send contracts for signing” permission. Ask an administrator to add it to one of your roles in the staff portal.');
  if (!isPdf(pdf)) throw fail(400, 'Choose a PDF file.');
  if (pdf.length > MAX_PDF) throw fail(413, 'That PDF is larger than 25 MB.');
  const t = clean(title, 160) || clean(String(name || '').replace(/\.pdf$/i, ''), 160) || 'Contract';
  const c = { id: crypto.randomUUID(), title: t, message: clean(message, 1000), status: 'draft', createdAt: now(), createdBy: { id: u.id, accountId: u.accountId || '', name: u.displayName },
    file: { blob: writeBlob(pdf), name: (clean(name, 120) || t) .replace(/[\\/:*?"<>|]/g, '-').replace(/(\.pdf)?$/i, '.pdf'), size: pdf.length, pages: pageCount(pdf), sha256: crypto.createHash('sha256').update(pdf).digest('hex') },
    source: source && source.kind === 'docs' ? { kind: 'docs', docId: clean(source.docId, 64), title: clean(source.title, 160) } : { kind: 'upload' }, signers: [], events: [] };
  event(c, u, c.source.kind === 'docs' ? 'Sent from HN Group Docs' : 'Uploaded');
  db.contracts.push(c); audit(u, 'contract.create', c, c.title); save();
  return c;
}

// Drafts: the title, message and signers can change until it's sent. Signers are people from the staff list, each a
// profile of an HN Group Auth sign-in account; their sign-in accounts are kept so they can sign from any of their profiles.
function update(id, u, input, directory) {
  const c = get(id, u);
  if (!view(c, u).can.edit) throw fail(409, 'Only a draft can be changed, by the person who uploaded it.');
  if (input.title !== undefined) c.title = clean(input.title, 160) || c.title;
  if (input.message !== undefined) c.message = clean(input.message, 1000);
  if (Array.isArray(input.signers)) {
    if (input.signers.length > 20) throw fail(400, 'A contract can have at most 20 people signing it.');
    const seen = new Set();
    c.signers = input.signers.map((x) => {
      const p = directory.find((d) => d.id === String(x && x.id));
      if (!p) throw fail(400, 'Choose everyone who signs from the staff list.');
      if (seen.has(p.id)) throw fail(400, p.name + ' is on the list twice.'); seen.add(p.id);
      const was = c.signers.find((s) => s.id === p.id);
      return { id: p.id, accountIds: p.accountIds || [], name: p.name, jobTitle: p.jobTitle, company: p.company, role: clean(x.role, 80), status: 'waiting', ...(was && was.viewedAt ? { viewedAt: was.viewedAt } : {}) };
    });
  }
  save(); return c;
}

function send(id, u) {
  const c = get(id, u);
  if (!view(c, u).can.edit) throw fail(409, 'Only a draft can be sent, by the person who uploaded it.');
  if (!c.signers.length) throw fail(400, 'Add at least one person to sign it.');
  c.status = 'out'; c.sentAt = now();
  event(c, u, 'Sent for signing to ' + c.signers.map((s) => s.name).join(', '));
  audit(u, 'contract.send', c, c.signers.map((s) => s.name).join(', ')); save();
  return c;
}

// Signers must open the PDF before they can sign it.
function viewed(c, u) {
  const s = mySigner(c, u);
  if (s && c.status === 'out' && !s.viewedAt) { s.viewedAt = now(); event(c, u, 'Opened the contract'); save(); }
}

function sign(id, u, input, from) {
  const c = get(id, u), s = mySigner(c, u);
  if (u.impersonated) throw fail(403, 'You can’t sign while logged in as someone else.');
  if (!s || c.status !== 'out' || s.status !== 'waiting') throw fail(409, 'This contract isn’t waiting for your signature.');
  if (!s.viewedAt) throw fail(409, 'Open and read the contract before you sign it.');
  const typed = clean(input.name, 120);
  if (typed.length < 3) throw fail(400, 'Type your full name to sign.');
  if (input.agree !== true) throw fail(400, 'Tick the box to confirm you’ve read the contract and agree to sign it electronically.');
  if (input.sha256 !== c.file.sha256) throw fail(409, 'The contract has changed since you opened it. Open it again before signing.');
  s.status = 'signed'; s.signedAt = now(); s.signature = { typed, accountId: u.accountId || '', profileId: u.id, email: u.email, ip: clean(from.ip, 64), agent: clean(from.agent, 300), sha256: c.file.sha256 };
  event(c, u, 'Signed as “' + typed + '”');
  audit(u, 'contract.sign', c, typed);
  if (c.signers.every((x) => x.status === 'signed')) { c.status = 'completed'; c.completedAt = now(); event(c, null, 'Everyone has signed. The contract is complete.'); }
  save(); return c;
}

function decline(id, u, input) {
  const c = get(id, u), s = mySigner(c, u);
  if (!s || c.status !== 'out' || s.status !== 'waiting') throw fail(409, 'This contract isn’t waiting for your signature.');
  const reason = clean(input.reason, 500);
  if (!reason) throw fail(400, 'Say why you’re not signing it, so the sender knows what to change.');
  s.status = 'declined'; s.declinedAt = now(); s.reason = reason; c.status = 'declined';
  event(c, u, 'Declined to sign: ' + reason); audit(u, 'contract.decline', c, reason); save();
  return c;
}

function cancel(id, u) {
  const c = get(id, u);
  if (!view(c, u).can.cancel) throw fail(409, 'Only the sender (or someone who manages contracts) can cancel it, before it’s complete.');
  if (c.status === 'draft') { removeBlob(c.file.blob); db.contracts = db.contracts.filter((x) => x !== c); audit(u, 'contract.delete-draft', c, c.title); save(); return null; }
  c.status = 'cancelled'; c.cancelledAt = now(); event(c, u, 'Cancelled'); audit(u, 'contract.cancel', c, c.title); save();
  return c;
}
function removeBlob(id) { if (UUID.test(id || '')) fs.rmSync(blobPath(id), { force: true }); }
function setCertificate(c, bytes) { if (c.certificate) removeBlob(c.certificate); c.certificate = writeBlob(bytes); save(); }

module.exports = { init, save, createSession, session, updateSession, endSession, notePerson, contract, get, view, list, create, update, send, viewed, sign, decline, cancel, setCertificate,
  readBlob, isPdf, canSend, canManage, MAX_PDF, UUID, get db() { return db; } };
