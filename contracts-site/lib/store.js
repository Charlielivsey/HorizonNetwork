'use strict';
// HN Group Contracts: the contracts, who signs them and everything that happens to them. One JSON file (written
// atomically, owner-only) and the PDFs in DATA_DIR/files. A contract is a PDF that someone with "Send contracts for
// signing" uploads (or sends from HN Group Docs). They choose who signs it from the staff list (each person is a
// profile of an HN Group Auth sign-in account), in any order or one after another, with an optional date to sign by,
// and send it. Each signer opens the PDF, then signs with their typed name (or declines with a reason). The PDF never
// changes: each signature is recorded against its SHA-256 fingerprint, and once everyone has signed a signing
// certificate is made to go with it. Nothing is emailed; people see what is waiting for them on the site.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_PDF = 25 * 1024 * 1024, MAX_SIGNERS = 20, MAX_FIELDS = 200;
// What a placed box shows once its signer has signed.
const FIELD_TYPES = ['signature', 'name', 'date', 'jobTitle'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) ? String(v) : '');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

let file, filesDir, db;
function init(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  file = path.join(dataDir, 'contracts.json'); filesDir = path.join(dataDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true, mode: 0o700 });
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') fs.renameSync(file, file + '.unreadable-' + Date.now()); db = {}; }
  for (const [k, v] of Object.entries({ version: 2, contracts: [], sessions: {}, linkSessions: {}, audit: [] })) if (db[k] === undefined) db[k] = v;
  for (const [t, s] of Object.entries(db.sessions)) if (!(s.expires > Date.now())) delete db.sessions[t];
  for (const [t, s] of Object.entries(db.linkSessions)) if (!(s.expires > Date.now())) delete db.linkSessions[t];
  // Contracts from before signers had keys (and placed boxes) get them now.
  for (const c of db.contracts) {
    if (!Array.isArray(c.fields)) c.fields = [];
    if (!c.links || typeof c.links !== 'object') c.links = {};
    for (const x of c.signers) if (!x.key) { let k; do k = crypto.randomBytes(4).toString('hex'); while (c.signers.some((y) => y.key === k)); x.key = k; }
  }
  save();
}
function save() { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 }); fs.renameSync(tmp, file); }
// Is the data folder writable? (For the health check.)
function writable() { try { const t = path.join(filesDir, '.check'); fs.writeFileSync(t, 'ok'); fs.rmSync(t); return true; } catch { return false; } }
function audit(who, action, c, detail) {
  db.audit.push({ at: now(), who: who ? who.displayName : 'HN Group Contracts', whoId: who ? who.id : '', action, contract: c ? c.id : '', detail: clean(detail, 300) });
  if (db.audit.length > 10000) db.audit.splice(0, db.audit.length - 10000);
}

// ---------- This site's sign-in sessions (tied to an HN Group Auth sign-in; only hashes of tokens are kept) ----------
const hash = (t) => sha256(String(t));
function createSession(user, authSession, expires) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[hash(token)] = { user, authSession, checked: Date.now(), expires: Math.min(Number(expires) || 0, Date.now() + 30 * 86400000) || Date.now() + 3600000 };
  save(); return token;
}
function session(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const s = db.sessions[hash(token)];
  if (s && s.expires <= Date.now()) { delete db.sessions[hash(token)]; save(); return null; }
  return s || null;
}
function updateSession(token, fields) { const s = session(token); if (s) { Object.assign(s, fields); save(); } }
function endSession(token) { if (/^[a-f0-9]{64}$/.test(token || '') && db.sessions[hash(token)]) { delete db.sessions[hash(token)]; save(); } }

// ---------- PDFs ----------
const blobPath = (id) => path.join(filesDir, id + '.pdf');
function writeBlob(bytes) { const id = crypto.randomUUID(), tmp = blobPath(id) + '.tmp'; fs.writeFileSync(tmp, bytes, { mode: 0o600 }); fs.renameSync(tmp, blobPath(id)); return id; }
const readBlob = (id) => (UUID.test(id || '') ? fs.readFileSync(blobPath(id)) : null);
const removeBlob = (id) => { if (UUID.test(id || '')) fs.rmSync(blobPath(id), { force: true }); };
const isPdf = (b) => Buffer.isBuffer(b) && b.length > 8 && b.subarray(0, 5).toString('latin1') === '%PDF-' && b.subarray(Math.max(0, b.length - 1024)).toString('latin1').includes('%%EOF');
const pageCount = (b) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length || 1;

// ---------- Who may do what ----------
// Permissions come from the staff portal's roles through HN Group Auth, like every HN Group website. Nobody can send,
// manage or sign while an administrator is logged in as them.
const canSend = (u) => !!u && !u.impersonated && (u.owner || u.permissions.includes('contracts.send') || u.permissions.includes('contracts.manage'));
const canManage = (u) => !!u && !u.impersonated && (u.owner || u.permissions.includes('contracts.manage'));
const isMe = (s, u) => !!u && (s.id === u.id || (!!u.accountId && (s.accountIds || []).includes(u.accountId)));
// Someone can sign the same contract in more than one capacity, for example as the employee and on behalf of the
// employer (the user's request, 3 November 2026: "when someone is the signatory for both fields it should actually
// work"). One signature covers every place they sign, as soon as each one is their turn.
const mySigners = (c, u) => c.signers.filter((s) => isMe(s, u));
const mySigner = (c, u) => { const all = mySigners(c, u); return all.find((s) => canSignNow(c, s)) || all.find((s) => s.status === 'waiting') || all[0] || null; };
const isSender = (c, u) => !!u && (c.sender.id === u.id || (!!u.accountId && c.sender.accountId === u.accountId));
// Senders see their own contracts, signers see contracts once they're sent, and managers see everything.
const canSee = (c, u) => isSender(c, u) || canManage(u) || (c.status !== 'draft' && mySigners(c, u).length > 0);
// Signed one after another: only the first person still to sign can sign now.
const nextUp = (c) => (c.order === 'sequence' ? c.signers.find((s) => s.status === 'waiting') || null : null);
const canSignNow = (c, s) => c.status === 'out' && !!s && s.status === 'waiting' && (c.order !== 'sequence' || nextUp(c) === s);
const overdue = (c) => c.status === 'out' && !!c.dueDate && c.dueDate < now().slice(0, 10);

function find(id) { return (UUID.test(id || '') && db.contracts.find((c) => c.id === id)) || null; }
function get(id, u) { const c = find(id); if (!c || !canSee(c, u)) throw fail(404, 'That contract doesn’t exist, or you can’t open it.'); return c; }
const event = (c, who, text, onlySender) => c.events.push({ at: now(), who: who ? who.displayName : 'HN Group Contracts', text, ...(onlySender ? { private: true } : {}) });

// What a person sees of a contract.
function view(c, u) {
  const mine = mySigners(c, u), me = mySigner(c, u), manage = isSender(c, u) || canManage(u), next = nextUp(c);
  return {
    id: c.id, title: c.title, message: c.message, status: c.status, order: c.order, dueDate: c.dueDate, overdue: overdue(c),
    createdAt: c.createdAt, sentAt: c.sentAt || null, completedAt: c.completedAt || null, cancelledAt: c.cancelledAt || null,
    sender: { id: c.sender.id, name: c.sender.name }, mine: isSender(c, u), source: c.source,
    file: { name: c.file.name, size: c.file.size, pages: c.file.pages, sha256: c.file.sha256 }, certificate: !!c.certificate,
    signers: c.signers.map((s, i) => ({ position: i + 1, key: s.key, id: s.id, name: s.name, jobTitle: s.jobTitle, company: s.company, role: s.role, status: s.status, me: mine.includes(s), external: !!s.external,
      ...(manage ? { email: s.email || '', linkAt: (c.links[s.id] && c.links[s.id].createdAt) || null, linkUsedAt: (c.links[s.id] && c.links[s.id].usedAt) || null } : {}),
      viewedAt: s.viewedAt || null, signedAt: s.signedAt || null, declinedAt: s.declinedAt || null, remindedAt: s.remindedAt || null,
      signature: s.status === 'signed' ? s.signature.typed : '', reason: s.status === 'declined' ? s.reason : '', next: next === s })),
    fields: (c.fields || []).map((f) => ({ ...f, signer: c.signers.findIndex((s) => s.key === f.signer) })).filter((f) => f.signer >= 0),
    events: manage ? c.events.slice() : c.events.filter((e) => !e.private),
    can: {
      edit: c.status === 'draft' && manage && canSend(u),
      cancel: ['draft', 'out', 'declined'].includes(c.status) && manage && !u.impersonated,
      // Signing links can be remade while it's out for signing (the old link and PIN stop working).
      links: c.status === 'out' && manage && !u.viaLink && !u.impersonated,
      remind: c.status === 'out' && manage && !u.impersonated,
      sign: !u.impersonated && mine.some((s) => canSignNow(c, s)),
      mustOpen: c.status === 'out' && mine.some((s) => s.status === 'waiting' && !s.viewedAt),
      waitingFor: c.status === 'out' && c.order === 'sequence' && !mine.some((s) => canSignNow(c, s)) && mine.some((s) => s.status === 'waiting') && next ? next.name : '',
      // Every capacity this person signs in that is theirs to sign now (one signature covers them all).
      signAs: mine.filter((s) => canSignNow(c, s)).map((s) => s.role),
    },
  };
}
const summary = (c, u) => {
  const mine = mySigners(c, u), me = mySigner(c, u);
  return { id: c.id, title: c.title, status: c.status, order: c.order, dueDate: c.dueDate, overdue: overdue(c), createdAt: c.createdAt, sentAt: c.sentAt || null,
    completedAt: c.completedAt || null, sender: c.sender.name, senderId: c.sender.id, mine: isSender(c, u), signed: c.signers.filter((s) => s.status === 'signed').length, total: c.signers.length,
    signers: c.signers.map((s) => ({ id: s.id, name: s.name, status: s.status })), needsMe: !u.impersonated && mine.some((s) => canSignNow(c, s)), reminded: mine.some((s) => s.remindedAt && s.status === 'waiting'),
    myStatus: !mine.length ? null : mine.some((s) => s.status === 'declined') ? 'declined' : mine.some((s) => s.status === 'waiting') ? 'waiting' : 'signed' };
};

// Everything someone can see, sorted into the dashboard's lists.
function lists(u) {
  const all = db.contracts.filter((c) => canSee(c, u)).sort((a, b) => (b.sentAt || b.createdAt).localeCompare(a.sentAt || a.createdAt)).map((c) => ({ c, s: summary(c, u) }));
  const pick = (fn) => all.filter(({ c, s }) => fn(c, s)).map(({ s }) => s);
  return {
    toSign: pick((c, s) => s.needsMe),
    waiting: pick((c, s) => c.status === 'out' && !s.needsMe && (s.mine || s.myStatus)),
    completed: pick((c, s) => ['completed', 'declined'].includes(c.status) && (s.mine || s.myStatus)),
    // Cancelled contracts only show in their own section (the user's request, 7 November 2026), never in the others.
    cancelled: pick((c, s) => c.status === 'cancelled' && (s.mine || s.myStatus || canManage(u))),
    drafts: pick((c, s) => c.status === 'draft' && s.mine),
    everything: canManage(u) ? all.filter(({ c }) => c.status !== 'cancelled').map(({ s }) => s) : null,
  };
}

// A new contract (a draft for its sender) from an uploaded PDF or a document sent from HN Group Docs.
function create(u, { title, pdf, fileName, source }) {
  if (!canSend(u)) throw fail(403, 'You need the “Send contracts for signing” permission. Ask an administrator to add it to one of your roles in the staff portal.');
  if (!isPdf(pdf)) throw fail(400, 'Choose a PDF file.');
  if (pdf.length > MAX_PDF) throw fail(413, 'That PDF is larger than 25 MB.');
  const t = clean(title, 160) || clean(String(fileName || '').replace(/\.pdf$/i, ''), 160) || 'Contract';
  const name = (clean(fileName, 120) || t).replace(/[\\/:*?"<>|]/g, '-').replace(/(\.pdf)?$/i, '.pdf');
  const c = { id: crypto.randomUUID(), title: t, message: '', status: 'draft', order: 'any', dueDate: '', createdAt: now(),
    sender: { id: u.id, accountId: u.accountId || '', name: u.displayName },
    file: { blob: writeBlob(pdf), name, size: pdf.length, pages: pageCount(pdf), sha256: sha256(pdf) },
    source: source && source.kind === 'docs' ? { kind: 'docs', docId: clean(source.docId, 64) } : { kind: 'upload' }, signers: [], fields: [], links: {}, events: [] };
  event(c, u, c.source.kind === 'docs' ? 'Sent from HN Group Docs' : 'Uploaded ' + name);
  db.contracts.push(c); audit(u, 'contract.create', c, t); save();
  return c;
}

// What each person signs as, chosen from a fixed list: the employee, or someone signing on behalf of the employer (HN
// Group Limited, or the group company named as employer in a company contract), or a witness.
const ROLES = ['Employee', 'On behalf of HN Group Limited', 'On behalf of Horizon Network Limited', 'On behalf of Horizon Media Group Limited',
  'On behalf of Horizon Advertising Limited', 'On behalf of HN Group Management Limited', 'Witness'];

// A draft's title, message, signers, signing order and date to sign by. Signers come from the staff list only.
function update(id, u, input, directory) {
  const c = get(id, u);
  if (!view(c, u).can.edit) throw fail(409, 'Only a draft can be changed, by the person who uploaded it.');
  if (input.title !== undefined) c.title = clean(input.title, 160) || c.title;
  if (input.message !== undefined) c.message = clean(input.message, 1000);
  if (input.order !== undefined) c.order = input.order === 'sequence' ? 'sequence' : 'any';
  if (input.dueDate !== undefined) {
    const d = day(input.dueDate);
    if (input.dueDate && !d) throw fail(400, 'Enter the date to sign by as a date.');
    if (d && d < now().slice(0, 10)) throw fail(400, 'The date to sign by can’t be in the past.');
    c.dueDate = d;
  }
  if (Array.isArray(input.signers)) {
    if (input.signers.length > MAX_SIGNERS) throw fail(400, 'A contract can have at most ' + MAX_SIGNERS + ' people signing it.');
    // The same person may sign more than once, each time as something different (employee and for the employer).
    const seen = new Set(), used = new Set();
    const next = input.signers.map((x) => {
      // Someone outside HN Group (the user's request, 8 November 2026: people who "aren't staff" sign with their link
      // and PIN): typed in by name, with an optional email address and organisation, and kept as they were on re-saves.
      let p = directory.find((d) => d.id === String(x && x.id));
      const ext = !p && x && (x.external === true || /^ext-[0-9a-f]{12}$/.test(String(x.id || '')));
      if (ext) {
        const old = /^ext-[0-9a-f]{12}$/.test(String(x.id || '')) && c.signers.find((s) => s.id === x.id && s.external);
        // Details not sent again stay as they were.
        const name = clean(x.name !== undefined ? x.name : old && old.name, 120), email = clean(x.email !== undefined ? x.email : old && old.email, 200), company = clean(x.company !== undefined ? x.company : old && old.company, 120);
        if (name.length < 2) throw fail(400, 'Type the name of the person outside HN Group who signs.');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Check ' + name + '’s email address.');
        p = { id: old ? old.id : 'ext-' + crypto.randomBytes(6).toString('hex'), accountIds: [], name, email, jobTitle: '', company, external: true };
      }
      if (!p) throw fail(400, 'Choose everyone who signs from the staff list, or add them as someone outside HN Group.');
      // A role typed in before the list existed stays as it was; anything new comes from the list.
      const role = clean(x.role, 80), before = c.signers.find((s) => s.id === p.id && s.role === role);
      if (!ROLES.includes(role) && !(role && before)) throw fail(400, 'Choose what ' + p.name + ' signs as.');
      if (seen.has(p.id + '|' + role)) throw fail(400, p.name + ' is on the list twice as ' + role + '.');
      seen.add(p.id + '|' + role);
      let key = before && !used.has(before.key) ? before.key : '';
      if (!key) do key = crypto.randomBytes(4).toString('hex'); while (used.has(key) || c.signers.some((s) => s.key === key && s !== before));
      used.add(key);
      return { key, id: p.id, accountIds: p.accountIds || [], name: p.name, jobTitle: p.jobTitle, company: p.company, role, status: 'waiting', ...(p.external ? { external: true, email: p.email } : {}) };
    });
    // Boxes placed for someone no longer signing go with them.
    c.fields = (c.fields || []).filter((f) => next.some((s) => s.key === f.signer));
    c.signers = next;
  }
  // Where each person's signature, name, date and job title go (the user's request, 3 November 2026: "when uploading a
  // document I want to be able to choose the boxes for the signature name and date etc. and put them where I want").
  // Positions are fractions of the page (0 to 1 from the top left), so they don't depend on how big the page is drawn.
  if (Array.isArray(input.fields)) {
    if (input.fields.length > MAX_FIELDS) throw fail(400, 'A contract can have at most ' + MAX_FIELDS + ' boxes.');
    const num = (v, lo, hi) => { const n = Number(v); if (!Number.isFinite(n)) throw fail(400, 'A box’s position isn’t valid.'); return Math.min(hi, Math.max(lo, Math.round(n * 10000) / 10000)); };
    c.fields = input.fields.map((f) => {
      const s = c.signers[Number(f && f.signer)];
      if (!s || !Number.isInteger(Number(f.signer))) throw fail(400, 'Each box has to belong to someone who signs.');
      if (!FIELD_TYPES.includes(f.type)) throw fail(400, 'Choose what each box is for.');
      const page = Number(f.page);
      if (!Number.isInteger(page) || page < 0 || page >= Math.max(c.file.pages, 1) + 50) throw fail(400, 'A box is on a page the contract doesn’t have.');
      const w = num(f.w, 0.02, 1), h = num(f.h, 0.01, 1);
      return { signer: s.key, type: f.type, page, x: num(f.x, 0, 1 - w), y: num(f.y, 0, 1 - h), w, h };
    });
  }
  save(); return c;
}

function send(id, u) {
  const c = get(id, u);
  if (!view(c, u).can.edit) throw fail(409, 'Only a draft can be sent, by the person who uploaded it.');
  if (!c.signers.length) throw fail(400, 'Add at least one person to sign it.');
  if (c.dueDate && c.dueDate < now().slice(0, 10)) throw fail(400, 'The date to sign by has passed. Choose a new one.');
  c.status = 'out'; c.sentAt = now();
  event(c, u, 'Sent for signing to ' + c.signers.map((s) => s.name).join(', ') + (c.order === 'sequence' ? ', in that order' : '') + (c.dueDate ? ', to sign by ' + c.dueDate : ''));
  const access = [...new Set(c.signers.map((s) => s.id))].map((pid) => makeLink(c, pid));
  event(c, u, 'Made a signing link and PIN for ' + access.map((a) => a.name).join(', '), true);
  audit(u, 'contract.send', c, c.signers.map((s) => s.name).join(', ')); save();
  c.access = access; // shown to the sender once, never saved
  return c;
}

// ---------- Signing links and PINs (the user's request, 8 November 2026: "When contracts are sent for signing I want a
// unique link generated so even if they aren't staff or can't access their account they can see and sign and download
// that specific contract, it should also generate a unique pin that must be entered when that contact is accessed via
// that link") ----------
// Each person signing gets their own link (a random 32-byte code) and six-digit PIN when the contract is sent. Only a
// hash of the link and a scrypt hash of the PIN are kept, so the sender sees them once and can make new ones (which
// stops the old ones working). Five wrong PINs lock that link for 15 minutes. The link only ever opens that one
// contract, as that one person: they can read it, download it and sign or decline their own places, nothing else.
const LINK_LOCK = 15 * 60000, LINK_TRIES = 5, LINK_SESSION = 2 * 3600000;
const pinHash = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
function makeLink(c, personId) {
  const token = crypto.randomBytes(32).toString('base64url'), pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0'), salt = crypto.randomBytes(16).toString('hex');
  c.links[personId] = { token: sha256(token), salt, pin: pinHash(pin, salt), createdAt: now(), tries: 0, lockedUntil: 0 };
  for (const [t, ls] of Object.entries(db.linkSessions)) if (ls.contract === c.id && ls.person === personId) delete db.linkSessions[t];
  const mine = c.signers.filter((s) => s.id === personId);
  return { person: personId, name: mine[0] ? mine[0].name : '', email: (mine.find((s) => s.email) || {}).email || '', roles: mine.map((s) => s.role), token, pin };
}
// The sender (or anyone who manages contracts) makes a new link and PIN for someone still to sign.
function newLink(id, u, personId) {
  const c = get(id, u);
  if (!view(c, u).can.links) throw fail(409, 'Signing links can only be made by the sender while it’s out for signing.');
  if (!c.signers.some((s) => s.id === personId)) throw fail(404, 'That person isn’t signing this contract.');
  const a = makeLink(c, personId);
  event(c, u, 'Made a new signing link and PIN for ' + a.name + ' (the old one no longer works)', true); audit(u, 'contract.link', c, a.name); save();
  return a;
}
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
function byToken(token) {
  if (!TOKEN.test(token || '')) return null;
  const h = sha256(token);
  for (const c of db.contracts) for (const [person, l] of Object.entries(c.links || {})) if (l.token === h) return { c, person, l };
  return null;
}
// Who someone using a link is, to the rest of this file: the person the link was made for, with no permissions.
function linkUser(c, person) {
  const s = c.signers.find((x) => x.id === person) || {};
  return { id: person, accountId: '', displayName: s.name || 'Signer', fullName: s.name || '', email: s.email || '', jobTitle: s.jobTitle || '', owner: false, impersonated: false, permissions: [], viaLink: true };
}
// Entering the PIN. Returns a session token for this link (kept as a hash, two hours) or throws.
function unlockLink(token, pin) {
  const found = byToken(token);
  if (!found || found.c.status === 'draft') throw fail(404, 'This signing link doesn’t work. It may have been replaced with a new one; ask the person who sent it.');
  const { c, person, l } = found;
  if (l.lockedUntil > Date.now()) throw fail(429, 'Too many wrong PINs. Try again in ' + Math.ceil((l.lockedUntil - Date.now()) / 60000) + ' minutes.');
  const given = String(pin || '').replace(/\s/g, '');
  const ok = /^\d{6}$/.test(given) && crypto.timingSafeEqual(Buffer.from(pinHash(given, l.salt), 'hex'), Buffer.from(l.pin, 'hex'));
  if (!ok) {
    l.tries = (l.tries || 0) + 1;
    if (l.tries >= LINK_TRIES) { l.tries = 0; l.lockedUntil = Date.now() + LINK_LOCK; event(c, null, 'A signing link was locked for 15 minutes after five wrong PINs', true); }
    save();
    throw fail(l.lockedUntil > Date.now() ? 429 : 401, l.lockedUntil > Date.now() ? 'Too many wrong PINs. Try again in 15 minutes.' : 'That PIN isn’t right. ' + (LINK_TRIES - l.tries) + ' tr' + (LINK_TRIES - l.tries === 1 ? 'y' : 'ies') + ' left.');
  }
  l.tries = 0; l.lockedUntil = 0; l.usedAt = now();
  const session = crypto.randomBytes(32).toString('hex');
  db.linkSessions[hash(session)] = { contract: c.id, person, linkToken: l.token, expires: Date.now() + LINK_SESSION };
  save();
  return session;
}
// The contract and person for a link plus its unlocked session, or null.
function linkAccess(token, session) {
  const found = byToken(token);
  if (!found || !/^[a-f0-9]{64}$/.test(session || '')) return null;
  const ls = db.linkSessions[hash(session)];
  if (!ls || ls.expires <= Date.now() || ls.contract !== found.c.id || ls.person !== found.person || ls.linkToken !== found.l.token) return null;
  return { c: found.c, u: linkUser(found.c, found.person) };
}

// Opening the PDF is recorded, and signers have to open it before they can sign.
function opened(c, u) {
  const first = mySigners(c, u).filter((s) => c.status === 'out' && s.status === 'waiting' && !s.viewedAt);
  if (!first.length) return;
  for (const s of first) s.viewedAt = now();
  event(c, u, 'Opened the contract' + (u.viaLink ? ' with their signing link' : '')); save();
}

function sign(id, u, input, from) {
  const c = get(id, u), mine = mySigners(c, u), s = mySigner(c, u);
  if (u.impersonated) throw fail(403, 'You can’t sign while logged in as someone else.');
  if (!s || c.status !== 'out' || s.status !== 'waiting') throw fail(409, 'This contract isn’t waiting for your signature.');
  if (!canSignNow(c, s)) throw fail(409, 'This contract is signed in order. ' + nextUp(c).name + ' needs to sign before you.');
  if (mine.some((x) => x.status === 'waiting' && canSignNow(c, x) && !x.viewedAt)) throw fail(409, 'Open and read the contract before you sign it.');
  const typed = clean(input.name, 120);
  if (typed.length < 3) throw fail(400, 'Type your full name to sign.');
  if (input.agree !== true) throw fail(400, 'Tick the box to confirm you’ve read the contract and agree to sign it electronically.');
  if (input.sha256 !== c.file.sha256) throw fail(409, 'The contract has changed since you opened it. Open it again before signing.');
  // Every place this person signs that is their turn now: all of them in any order, or each one as it comes round in
  // order (so someone signing first and last signs their first place now and their last place when it's their turn).
  const done = [];
  for (let x = mine.find((y) => canSignNow(c, y)); x; x = mine.find((y) => canSignNow(c, y))) {
    x.status = 'signed'; x.signedAt = now(); x.viewedAt = x.viewedAt || now();
    x.signature = { typed, accountId: u.accountId || '', profileId: u.id, email: u.email, ip: clean(from.ip, 64), agent: clean(from.agent, 300), sha256: c.file.sha256, ...(u.viaLink ? { via: 'link and PIN' } : {}) };
    done.push(x.role);
  }
  event(c, u, 'Signed as “' + typed + '”' + (done.filter(Boolean).length ? ' (' + done.filter(Boolean).join('; ') + ')' : '') + (u.viaLink ? ' with their signing link and PIN' : '')); audit(u, 'contract.sign', c, typed);
  if (c.signers.every((x) => x.status === 'signed')) { c.status = 'completed'; c.completedAt = now(); event(c, null, 'Everyone has signed. The contract is complete.'); }
  save(); return c;
}

function decline(id, u, input) {
  const c = get(id, u), s = mySigner(c, u), mine = mySigners(c, u);
  if (u.impersonated) throw fail(403, 'You can’t decline while logged in as someone else.');
  if (!s || c.status !== 'out' || s.status !== 'waiting') throw fail(409, 'This contract isn’t waiting for your signature.');
  const reason = clean(input.reason, 500);
  if (!reason) throw fail(400, 'Say why you’re not signing it, so the sender knows what to change.');
  for (const x of mine.filter((y) => y.status === 'waiting')) { x.status = 'declined'; x.declinedAt = now(); x.reason = reason; }
  c.status = 'declined';
  event(c, u, 'Declined to sign: ' + reason); audit(u, 'contract.decline', c, reason); save();
  return c;
}

// A reminder shows on the signer's list on the site (nothing is emailed).
function remind(id, u) {
  const c = get(id, u);
  if (!view(c, u).can.remind) throw fail(409, 'Only the sender (or someone who manages contracts) can send reminders while it’s out for signing.');
  const due = c.order === 'sequence' ? [nextUp(c)].filter(Boolean) : c.signers.filter((s) => s.status === 'waiting');
  if (!due.length) throw fail(409, 'Nobody is waiting to sign.');
  for (const s of due) s.remindedAt = now();
  event(c, u, 'Reminded ' + due.map((s) => s.name).join(', ')); audit(u, 'contract.remind', c); save();
  return c;
}

function cancel(id, u) {
  const c = get(id, u);
  if (!view(c, u).can.cancel) throw fail(409, 'Only the sender (or someone who manages contracts) can cancel it, before it’s complete.');
  if (c.status === 'draft') { removeBlob(c.file.blob); db.contracts = db.contracts.filter((x) => x !== c); audit(u, 'contract.delete-draft', c, c.title); save(); return null; }
  c.status = 'cancelled'; c.cancelledAt = now(); event(c, u, 'Cancelled'); audit(u, 'contract.cancel', c, c.title); save();
  return c;
}

function setCertificate(c, bytes) { if (c.certificate) removeBlob(c.certificate); c.certificate = writeBlob(bytes); save(); }
const fileOf = (c) => readBlob(c.file.blob);
const certificateOf = (c) => (c.certificate ? readBlob(c.certificate) : null);

module.exports = { init, writable, createSession, session, updateSession, endSession, get, view, lists, create, update, send, opened, sign, decline, remind, cancel,
  newLink, unlockLink, linkAccess, TOKEN,
  setCertificate, fileOf, certificateOf, canSend, canManage, MAX_PDF, ROLES, FIELD_TYPES, get db() { return db; } };
