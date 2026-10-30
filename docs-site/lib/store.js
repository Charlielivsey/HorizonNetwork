'use strict';
// HN Group Docs: documents, private storage, sign-ins and an activity log, in one JSON file (documents.json, written
// atomically), with uploaded files in files/ and copies of staff profile pictures in avatars/.
//
// - A document is either shared with all staff (anyone can open and edit it) or in its author's private storage.
// - Everyone has their own private storage (their private documents and uploaded files). Nobody else can see it,
//   except people the staff portal lets in: the "Access staff document storage" permission, Super Admin, the system
//   owner, or an individual, timed grant to that one person's storage. They can open and download what's there but
//   never change or delete it, and every visit is logged.
// - Saves carry the version they were based on, so two people can't overwrite each other's changes unseen.
// - Policies keep a version history: marking a changed policy final again gives it a new version number and lists
//   what changed (see finalisePolicy).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('./catalog');
const { sanitize, plain, decode } = require('./sanitize');

const SESSION_MS = 30 * 86400 * 1000, MAX_DOCS = 20000, MAX_AUDIT = 5000, MAX_FILE = 25 * 1024 * 1024, MAX_FILES_EACH = 1000;
const STATUSES = ['draft', 'final'];
const SHARING = ['staff', 'private'];
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => Date.now();
const fail = (status, message) => Object.assign(new Error(message), { status });
let dir = null, file = null, data = null;

function init(dataDir, seedDir) {
  dir = dataDir;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const sub of ['files', 'avatars']) fs.mkdirSync(path.join(dir, sub), { recursive: true, mode: 0o700 });
  file = path.join(dir, 'documents.json');
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; data = null; }
  if (!data || typeof data !== 'object') data = {};
  for (const k of ['documents', 'files', 'sessions', 'people', 'avatars', 'seeds']) data[k] = data[k] && typeof data[k] === 'object' && !Array.isArray(data[k]) ? data[k] : {};
  data.audit = Array.isArray(data.audit) ? data.audit : [];
  for (const [k, s] of Object.entries(data.sessions)) if (s.expires <= now()) delete data.sessions[k];
  if (seedDir) seed(seedDir);
  removeOnce();
  save();
}

// One-off removals the system owner asked for. Protection from deletion stops anyone removing these on the site, so
// they're removed here, once, after a private copy is kept in DATA_DIR/backups.
const REMOVALS = [
  // The user's request (30 October 2026): the protected draft "Letter" (HN Group, Letter template, confidential, last
  // edited 26 October 2026) in catnap@hngroup.org.uk's private storage.
  { id: 'catnap-letter-2026-10-30', owner: 'catnap@hngroup.org.uk', match: (d) => d.title === 'Letter' && d.template === 'letter' && d.company === 'hn-group' &&
    d.status === 'draft' && d.sharing === 'private' && d.protected && !!d.confidential && new Date(d.updatedAt).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === '2026-10-26' },
];
function removeOnce() {
  data.removals = data.removals && typeof data.removals === 'object' ? data.removals : {};
  for (const r of REMOVALS) {
    if (data.removals[r.id]) continue;
    const ownerOf = (d) => String(d.ownerEmail || (data.people[d.ownerId] || {}).email || '').toLowerCase();
    const found = Object.values(data.documents).filter((d) => ownerOf(d) === r.owner && r.match(d));
    if (found.length) {
      const backups = path.join(dir, 'backups');
      fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(backups, r.id + '-' + now() + '.json'), JSON.stringify(found, null, 1), { mode: 0o600 });
      for (const d of found) { delete data.documents[d.id]; audit(null, 'deleted at the system owner’s request', d, { of: d.ownerId }); }
    }
    data.removals[r.id] = { at: now(), removed: found.map((d) => d.id) };
  }
}
function save() {
  const tmp = file + '.' + crypto.randomUUID();
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function audit(user, action, item, extra) {
  data.audit.unshift({ at: now(), by: user ? user.displayName : 'HN Group Docs', byId: user ? user.id : null, action, item: item ? item.id : null, title: item ? (item.title || item.name || '') : '', ...(extra || {}) });
  data.audit.length = Math.min(data.audit.length, MAX_AUDIT);
}

// Files shipped with the site that belong in someone's private storage (seed/index.json), added once each. They're
// held by email until that person first signs in, then they become theirs.
function seed(seedDir) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(seedDir, 'index.json'), 'utf8')); } catch { return; }
  for (const s of list) {
    if (!s || !s.id || data.seeds[s.id]) continue;
    let bytes;
    try { bytes = fs.readFileSync(path.join(seedDir, path.basename(s.file))); } catch { continue; }
    const kind = detect(s.name, bytes);
    if (!kind) continue;
    const f = { id: crypto.randomUUID(), name: plain(s.name, 160), mime: kind.mime, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      company: catalog.company(s.company) ? s.company : '', ownerId: '', ownerEmail: String(s.ownerEmail || '').toLowerCase(), owner: '', createdAt: now(), updatedAt: now() };
    const person = Object.entries(data.people).find(([, p]) => p.email === f.ownerEmail);
    if (person) { f.ownerId = person[0]; f.owner = person[1].displayName; }
    writeBlob(f.id, bytes);
    data.files[f.id] = f; data.seeds[s.id] = { at: now(), file: f.id };
    audit(null, 'added to storage', f, { for: f.ownerEmail });
  }
}

// ---------- People ----------
// Names of people who have signed in, so storage pages can say whose storage it is; unclaimed seeded files become
// theirs on their first sign-in.
function notePerson(user) {
  if (!user || !user.id) return;
  const before = data.people[user.id];
  data.people[user.id] = { displayName: user.displayName, fullName: user.fullName, email: user.email, jobTitle: user.jobTitle, seen: now() };
  let changed = !before || before.displayName !== user.displayName || before.email !== user.email || before.jobTitle !== user.jobTitle;
  for (const f of Object.values(data.files)) if (!f.ownerId && f.ownerEmail && f.ownerEmail === user.email) { f.ownerId = user.id; f.owner = user.displayName; changed = true; }
  for (const d of Object.values(data.documents)) if (!d.ownerId && d.ownerEmail && d.ownerEmail === user.email) { d.ownerId = user.id; d.owner = user.displayName; changed = true; }
  if (changed || now() - (before.seen || 0) > 3600000) save();
}
const person = (id) => data.people[id] || null;

// ---------- Profile pictures ----------
const avatarPath = (id) => path.join(dir, 'avatars', hash('avatar:' + id));
function setAvatar(id, image, mime) {
  if (!image) { if (data.avatars[id]) { delete data.avatars[id]; fs.rmSync(avatarPath(id), { force: true }); save(); } return; }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(String(mime || '')) || image.length > 3 * 1024 * 1024) return;
  const tag = hash(image).slice(0, 16);
  if (data.avatars[id] && data.avatars[id].tag === tag) return;
  const tmp = avatarPath(id) + '.tmp';
  fs.writeFileSync(tmp, image, { mode: 0o600 }); fs.renameSync(tmp, avatarPath(id));
  data.avatars[id] = { mime, tag, updatedAt: now() }; save();
}
function avatar(id) {
  const a = data.avatars[id];
  if (!a) return null;
  try { return { mime: a.mime, tag: a.tag, image: fs.readFileSync(avatarPath(id)) }; } catch { return null; }
}

// ---------- Who may do what ----------
const grantFor = (user, ownerId) => (user.storageGrants || []).find((g) => g.personId === ownerId && Date.parse(g.until) > now());
// Whether `user` may look inside `ownerId`'s private storage.
function storageAllowed(user, ownerId) { return !!ownerId && (ownerId === user.id || user.storageAccess === true || !!grantFor(user, ownerId)); }
const canSee = (d, user) => d.sharing === 'staff' || d.ownerId === user.id || storageAllowed(user, d.ownerId);
const canEdit = (d, user) => d.sharing === 'staff' || d.ownerId === user.id;
const canManage = (d, user) => d.ownerId === user.id || (user.admin && d.sharing === 'staff');

// A document as the website sees it; the list leaves out the body.
function view(d, user, full) {
  const v = { kind: 'document', id: d.id, title: d.title, company: d.company, template: d.template, status: d.status, sharing: d.sharing, version: d.version,
    owner: d.owner, ownerId: d.ownerId, createdAt: d.createdAt, updatedAt: d.updatedAt, updatedBy: d.updatedBy, mine: d.ownerId === user.id,
    readOnly: !canEdit(d, user), canManage: canManage(d, user), confidential: !!d.confidential, protected: !!d.protected,
    canDelete: canManage(d, user) && !d.protected };
  if (full) { v.fields = d.fields; v.body = d.body; v.history = (d.policy && d.policy.history) || []; }
  return v;
}
const fileView = (f, user) => ({ kind: 'file', id: f.id, name: f.name, mime: f.mime, size: f.size, company: f.company, owner: f.owner, ownerId: f.ownerId,
  createdAt: f.createdAt, updatedAt: f.updatedAt, mine: f.ownerId === user.id, canManage: f.ownerId === user.id });

function matches(terms, text) { return !terms.length || terms.every((t) => text.toLowerCase().includes(t)); }
const termsOf = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

// Shared documents (scope "shared"), or this person's own storage (scope "mine": private documents and files).
function list(user, { scope = 'shared', company, template, q } = {}) {
  const terms = termsOf(q);
  const companyName = (id) => (catalog.company(id) || {}).name || '';
  const docs = Object.values(data.documents)
    .filter((d) => (scope === 'mine' ? d.ownerId === user.id && d.sharing === 'private' : d.sharing === 'staff'))
    .filter((d) => (!company || d.company === company) && (!template || d.template === template))
    .filter((d) => matches(terms, d.title + ' ' + d.owner + ' ' + companyName(d.company)))
    .sort((a, b) => b.updatedAt - a.updatedAt).map((d) => view(d, user, false));
  const files = scope !== 'mine' || (template && template !== 'files') ? [] : Object.values(data.files)
    .filter((f) => f.ownerId === user.id && (!company || f.company === company) && matches(terms, f.name + ' ' + companyName(f.company)))
    .sort((a, b) => b.updatedAt - a.updatedAt).map((f) => fileView(f, user));
  return template === 'files' ? { documents: [], files } : { documents: docs, files };
}
// Someone else's private storage, for people allowed in. Every visit is logged.
function storage(ownerId, user) {
  if (!storageAllowed(user, ownerId)) throw fail(403, 'You don’t have access to this person’s storage. Access is given in the staff portal.');
  const p = person(ownerId);
  if (ownerId !== user.id) { audit(user, 'opened storage', null, { of: ownerId, ofName: p ? p.displayName : '' }); save(); }
  const docs = Object.values(data.documents).filter((d) => d.ownerId === ownerId && d.sharing === 'private').sort((a, b) => b.updatedAt - a.updatedAt).map((d) => view(d, user, false));
  const files = Object.values(data.files).filter((f) => f.ownerId === ownerId).sort((a, b) => b.updatedAt - a.updatedAt).map((f) => fileView(f, user));
  const g = grantFor(user, ownerId);
  return { person: { id: ownerId, name: p ? p.displayName : (g && g.name) || 'This member of staff', jobTitle: p ? p.jobTitle : '', signedIn: !!p },
    access: ownerId === user.id ? 'own' : user.storageAccess ? 'permission' : 'grant', until: g && !user.storageAccess ? g.until : null, documents: docs, files };
}
function get(id, user) {
  const d = data.documents[id];
  if (!d || !canSee(d, user)) throw fail(404, 'That document doesn’t exist, or it’s in someone else’s private storage.');
  if (d.ownerId !== user.id && d.sharing === 'private') { audit(user, 'opened from storage', d, { of: d.ownerId }); save(); }
  return d;
}

function cleanFields(t, input) {
  const out = {};
  for (const f of [...t.head, ...t.foot]) out[f.key] = plain(input && input[f.key], f.multiline ? 600 : 200, !!f.multiline);
  return out;
}

function create(user, input) {
  const c = catalog.company(input.company), t = catalog.template(input.template);
  if (!c) throw fail(400, 'Choose a company.');
  if (!t) throw fail(400, 'Choose a template.');
  if (Object.keys(data.documents).length >= MAX_DOCS) throw fail(507, 'There are too many documents. Delete some first.');
  const start = catalog.start(t, c, user);
  const d = { id: crypto.randomUUID(), title: plain(input.title, 160) || start.title || (t.id === 'blank' ? 'Untitled document' : t.name), company: c.id, template: t.id,
    fields: start.fields, body: sanitize(start.body), status: 'draft', sharing: input.sharing === 'staff' ? 'staff' : 'private', version: 1,
    confidential: input.confidential === true || (input.confidential === undefined && !!t.confidential), protected: false,
    owner: user.displayName, ownerId: user.id, ownerEmail: user.email, createdAt: now(), updatedAt: now(), updatedBy: user.displayName };
  data.documents[d.id] = d;
  audit(user, 'created', d); save();
  return view(d, user, true);
}

function update(id, user, input) {
  const d = get(id, user);
  if (!canEdit(d, user)) throw fail(403, 'This document is in someone else’s private storage, so you can open it but not change it.');
  if (Number(input.version) !== d.version) throw fail(409, d.updatedBy + ' changed this document while you were editing it. Reload to see their changes.');
  const t = catalog.template(d.template);
  if (input.title !== undefined) d.title = plain(input.title, 160) || 'Untitled document';
  if (input.company !== undefined) { if (!catalog.company(input.company)) throw fail(400, 'Choose a company.'); d.company = input.company; }
  if (input.fields !== undefined) d.fields = cleanFields(t, input.fields);
  if (input.body !== undefined) { if (String(input.body).length > 600000) throw fail(413, 'This document is too long.'); d.body = sanitize(input.body); }
  if (input.sharing !== undefined && input.sharing !== d.sharing) {
    if (!SHARING.includes(input.sharing)) throw fail(400, 'Unknown sharing.');
    if (d.ownerId !== user.id && !user.admin) throw fail(403, 'Only the author can move this document.');
    if (input.sharing === 'private' && d.ownerId !== user.id) throw fail(403, 'Only the author can move a document into their private storage.');
    d.sharing = input.sharing; audit(user, input.sharing === 'private' ? 'moved to private storage' : 'shared with staff', d);
  }
  // "Private & confidential" is marked on every page; anyone who can edit the document can change it.
  if (input.confidential !== undefined && !!input.confidential !== !!d.confidential) {
    d.confidential = !!input.confidential; audit(user, d.confidential ? 'marked private & confidential' : 'unmarked private & confidential', d);
  }
  // Protection from deletion is switched on in the document's settings by its author (or an owner-level/Super Admin
  // account for shared documents) and can never be switched off.
  if (input.protected !== undefined && !!input.protected !== !!d.protected) {
    if (!input.protected) throw fail(403, 'This document is protected from deletion, and that can’t be undone.');
    if (!canManage(d, user)) throw fail(403, 'Only the author can protect this document from deletion.');
    d.protected = true; d.protectedBy = user.displayName; d.protectedAt = now(); audit(user, 'protected from deletion', d);
  }
  if (input.status !== undefined && input.status !== d.status) {
    if (!STATUSES.includes(input.status)) throw fail(400, 'Unknown status.');
    if (input.status === 'final' && d.template === 'policy') finalisePolicy(d, user);
    audit(user, input.status === 'final' ? 'marked final' : 'back to draft', d);
    d.status = input.status;
  }
  d.version++; d.updatedAt = now(); d.updatedBy = user.displayName;
  save();
  return view(d, user, true);
}

// ---------- Policy versions ----------
// A policy's text split into its sections (by heading), as plain text, to see what changed between versions.
function sections(html) {
  const out = new Map(); let name = 'Introduction', n = 0;
  for (const part of String(html || '').split(/(<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>)/i)) {
    const heading = /^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>$/i.exec(part);
    if (heading) { name = decode(heading[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() || 'Untitled section ' + (++n); if (!out.has(name)) out.set(name, ''); continue; }
    const text = decode(part.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text || out.has(name)) out.set(name, ((out.get(name) || '') + ' ' + text).trim());
  }
  return out;
}
function describeChanges(before, after) {
  const changes = [];
  if (before.title !== after.title) changes.push('Renamed from “' + before.title + '”');
  const a = sections(before.body), b = sections(after.body);
  for (const [k, v] of b) if (!a.has(k)) changes.push('Added ' + k); else if (a.get(k) !== v) changes.push('Updated ' + k);
  for (const k of a.keys()) if (!b.has(k)) changes.push('Removed ' + k);
  const labels = { owner: 'policy owner', effective: 'effective date', review: 'next review date' };
  for (const [k, label] of Object.entries(labels)) if ((before.fields || {})[k] !== (after.fields || {})[k]) changes.push('Changed the ' + label);
  return changes;
}
function nextVersion(v) {
  const m = /^(\d+)\.(\d+)$/.exec(String(v || '').trim());
  return m ? m[1] + '.' + (Number(m[2]) + 1) : /^\d+$/.test(String(v || '').trim()) ? String(v).trim() + '.1' : '1.0';
}
// Marking a policy final records a version: the first time as its first version, and after that only when its
// wording, title or details changed since the last version. The version number goes up by itself (1.0 → 1.1),
// unless someone typed a new number (for example 2.0) in the Version box first.
function finalisePolicy(d, user) {
  const snap = { title: d.title, body: d.body, fields: { ...d.fields } };
  const p = d.policy || (d.policy = { history: [], snapshot: null });
  const last = p.history[p.history.length - 1];
  let version, changes;
  if (!last) { version = (d.fields.version || '').trim() || '1.0'; changes = ['First version']; }
  else {
    const before = p.snapshot, after = snap;
    changes = describeChanges(before, { ...after, fields: after.fields });
    const typed = (d.fields.version || '').trim();
    if (!changes.length && typed === last.version) return;
    if (!changes.length) changes = ['Version number changed'];
    version = typed && typed !== last.version ? typed : nextVersion(last.version);
  }
  d.fields.version = version.slice(0, 20);
  snap.fields.version = d.fields.version;
  p.history.push({ version: d.fields.version, date: catalog.longDate(new Date()), by: user.fullName || user.displayName, changes: changes.slice(0, 20) });
  if (p.history.length > 100) p.history.splice(0, p.history.length - 100);
  p.snapshot = snap;
}

function duplicate(id, user) {
  const s = get(id, user);
  const d = { ...JSON.parse(JSON.stringify(s)), id: crypto.randomUUID(), title: (s.title + ' (copy)').slice(0, 160), status: 'draft', version: 1,
    sharing: s.sharing === 'staff' && canEdit(s, user) ? s.sharing : 'private', owner: user.displayName, ownerId: user.id, ownerEmail: user.email, createdAt: now(), updatedAt: now(), updatedBy: user.displayName };
  delete d.policy; d.protected = false; delete d.protectedBy; delete d.protectedAt;
  data.documents[d.id] = d;
  audit(user, 'duplicated', d); save();
  return view(d, user, true);
}

function remove(id, user) {
  const d = get(id, user);
  if (d.protected) throw fail(403, 'This document is protected and can never be deleted.');
  if (!canManage(d, user)) throw fail(403, 'Only the author can delete this document.');
  delete data.documents[id];
  audit(user, 'deleted', d); save();
}
// Deletes several documents and files at once. Anything protected, or that this person can't delete, is left
// alone and listed with the reason.
function removeMany(user, input) {
  const ids = (v) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string').slice(0, 500);
  const deleted = { documents: 0, files: 0 }, skipped = [];
  for (const id of ids(input.documents)) {
    const d = data.documents[id];
    if (!d || !canSee(d, user)) { skipped.push({ id, reason: 'Not found.' }); continue; }
    if (d.protected) { skipped.push({ id, title: d.title, reason: 'Protected from deletion.' }); continue; }
    if (!canManage(d, user)) { skipped.push({ id, title: d.title, reason: 'Only the author can delete it.' }); continue; }
    delete data.documents[id]; audit(user, 'deleted', d, { bulk: true }); deleted.documents++;
  }
  for (const id of ids(input.files)) {
    const f = data.files[id];
    if (!f || !storageAllowed(user, f.ownerId)) { skipped.push({ id, reason: 'Not found.' }); continue; }
    if (f.ownerId !== user.id) { skipped.push({ id, title: f.name, reason: 'Only the owner can delete it.' }); continue; }
    delete data.files[id]; fs.rmSync(blobPath(id), { force: true }); audit(user, 'deleted', f, { bulk: true }); deleted.files++;
  }
  save();
  return { deleted, skipped };
}

// Counts per company for the filter, in the given scope.
function counts(user, scope = 'shared') {
  const out = {};
  for (const d of Object.values(data.documents)) if (scope === 'mine' ? d.ownerId === user.id && d.sharing === 'private' : d.sharing === 'staff') out[d.company] = (out[d.company] || 0) + 1;
  if (scope === 'mine') for (const f of Object.values(data.files)) if (f.ownerId === user.id && f.company) out[f.company] = (out[f.company] || 0) + 1;
  return out;
}

// ---------- Files in private storage ----------
// Only these kinds of file, recognised by their contents and name.
const KINDS = [
  { ext: ['pdf'], mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { ext: ['png'], mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: ['jpg', 'jpeg'], mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ['gif'], mime: 'image/gif', test: (b) => /^GIF8[79]a/.test(b.subarray(0, 6).toString('latin1')) },
  { ext: ['webp'], mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { ext: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', test: (b) => b.readUInt32LE(0) === 0x04034b50 },
  { ext: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', test: (b) => b.readUInt32LE(0) === 0x04034b50 },
  { ext: ['pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', test: (b) => b.readUInt32LE(0) === 0x04034b50 },
  { ext: ['doc'], mime: 'application/msword', test: (b) => b.readUInt32LE(0) === 0xe011cfd0 },
  { ext: ['xls'], mime: 'application/vnd.ms-excel', test: (b) => b.readUInt32LE(0) === 0xe011cfd0 },
  { ext: ['ppt'], mime: 'application/vnd.ms-powerpoint', test: (b) => b.readUInt32LE(0) === 0xe011cfd0 },
  { ext: ['txt', 'md'], mime: 'text/plain; charset=utf-8', test: (b) => !b.includes(0) },
  { ext: ['csv'], mime: 'text/csv; charset=utf-8', test: (b) => !b.includes(0) },
];
function detect(name, bytes) {
  const ext = (String(name).toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1];
  const kind = ext && KINDS.find((k) => k.ext.includes(ext));
  if (!kind || !bytes.length || (bytes.length < 8 && !kind.mime.startsWith('text/'))) return null;
  return kind.test(bytes) ? kind : null;
}
const blobPath = (id) => path.join(dir, 'files', id);
function writeBlob(id, bytes) { const tmp = blobPath(id) + '.tmp'; fs.writeFileSync(tmp, bytes, { mode: 0o600 }); fs.renameSync(tmp, blobPath(id)); }

function addFile(user, name, bytes, company) {
  const clean = plain(name, 160).replace(/[\\/:*?"<>|]/g, '-');
  if (!clean) throw fail(400, 'The file needs a name.');
  if (!bytes.length) throw fail(400, 'That file is empty.');
  if (bytes.length > MAX_FILE) throw fail(413, 'Files can be up to 25 MB.');
  const kind = detect(clean, bytes);
  if (!kind) throw fail(415, 'Upload a PDF, Word, Excel or PowerPoint file, a picture (PNG, JPEG, GIF or WebP) or a text or CSV file.');
  if (Object.values(data.files).filter((f) => f.ownerId === user.id).length >= MAX_FILES_EACH) throw fail(507, 'Your storage is full. Delete some files first.');
  const f = { id: crypto.randomUUID(), name: clean, mime: kind.mime, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    company: catalog.company(company) ? company : '', ownerId: user.id, ownerEmail: user.email, owner: user.displayName, createdAt: now(), updatedAt: now() };
  writeBlob(f.id, bytes);
  data.files[f.id] = f;
  audit(user, 'uploaded', f); save();
  return fileView(f, user);
}
function fileFor(id, user) {
  const f = data.files[id];
  if (!f || !storageAllowed(user, f.ownerId)) throw fail(404, 'That file doesn’t exist, or it’s in someone else’s private storage.');
  return f;
}
function readFile(id, user) {
  const f = fileFor(id, user);
  if (f.ownerId !== user.id) { audit(user, 'downloaded from storage', f, { of: f.ownerId }); save(); }
  return { file: f, bytes: fs.readFileSync(blobPath(f.id)) };
}
function updateFile(id, user, input) {
  const f = fileFor(id, user);
  if (f.ownerId !== user.id) throw fail(403, 'Only the owner can change this file.');
  if (input.name !== undefined) {
    const clean = plain(input.name, 160).replace(/[\\/:*?"<>|]/g, '-');
    const ext = (f.name.match(/\.[a-z0-9]{1,5}$/i) || [''])[0];
    if (!clean) throw fail(400, 'The file needs a name.');
    f.name = clean.toLowerCase().endsWith(ext.toLowerCase()) ? clean : clean + ext;
  }
  if (input.company !== undefined) f.company = catalog.company(input.company) ? input.company : '';
  f.updatedAt = now();
  audit(user, 'renamed', f); save();
  return fileView(f, user);
}
function removeFile(id, user) {
  const f = fileFor(id, user);
  if (f.ownerId !== user.id) throw fail(403, 'Only the owner can delete this file.');
  delete data.files[id];
  fs.rmSync(blobPath(id), { force: true });
  audit(user, 'deleted', f); save();
}

// ---------- Website sign-ins ----------
function createSession(user, authSession, expires) {
  for (const [k, s] of Object.entries(data.sessions)) if (s.expires <= now()) delete data.sessions[k];
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions[hash(token)] = { user, authSession, checked: now(), avatarChecked: now(), expires: Math.min(now() + SESSION_MS, Number(expires) || now() + SESSION_MS) };
  save(); return token;
}
function session(token) { const s = data.sessions[hash(token || '')]; if (!s || s.expires <= now()) return null; return s; }
function updateSession(token, patch) { const s = session(token); if (s) { Object.assign(s, patch); save(); } }
function endSession(token) { if (token && data.sessions[hash(token)]) { delete data.sessions[hash(token)]; save(); } }

module.exports = { init, audit, list, storage, get, view, create, update, duplicate, remove, removeMany, counts, addFile, readFile, updateFile, removeFile, notePerson, person, setAvatar, avatar,
  createSession, session, updateSession, endSession, sections, describeChanges, nextVersion };
