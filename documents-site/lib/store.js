'use strict';
// HN Group Documents: the staff documents, their sign-ins and an activity log, in one JSON file (documents.json)
// written atomically. A document is shared with all staff or kept private to its author; anyone who can see a
// document can edit it, and its author or an owner-level/Super Admin account can delete it or change who sees it.
// Each save carries the version it was based on, so two people can't overwrite each other's changes unseen.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('./catalog');
const { sanitize, plain } = require('./sanitize');

const SESSION_MS = 12 * 3600 * 1000, MAX_DOCS = 20000, MAX_AUDIT = 3000;
const STATUSES = ['draft', 'final'];
const SHARING = ['staff', 'private'];
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => Date.now();
const fail = (status, message) => Object.assign(new Error(message), { status });
let file = null, data = null;

function init(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  file = path.join(dir, 'documents.json');
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; data = null; }
  if (!data || typeof data !== 'object') data = {};
  data.documents = data.documents && typeof data.documents === 'object' ? data.documents : {};
  data.sessions = data.sessions && typeof data.sessions === 'object' ? data.sessions : {};
  data.audit = Array.isArray(data.audit) ? data.audit : [];
  for (const [k, s] of Object.entries(data.sessions)) if (s.expires <= now()) delete data.sessions[k];
  save();
}
function save() {
  const tmp = file + '.' + crypto.randomUUID();
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function audit(user, action, doc) {
  data.audit.unshift({ at: now(), by: user.displayName, byId: user.id, action, doc: doc ? doc.id : null, title: doc ? doc.title : '' });
  data.audit.length = Math.min(data.audit.length, MAX_AUDIT);
}

const canSee = (d, user) => d.sharing === 'staff' || d.ownerId === user.id || user.admin;
const canManage = (d, user) => d.ownerId === user.id || user.admin;
// A document as the website sees it; the list leaves out the body.
function view(d, user, full) {
  const v = { id: d.id, title: d.title, company: d.company, template: d.template, status: d.status, sharing: d.sharing, version: d.version,
    owner: d.owner, createdAt: d.createdAt, updatedAt: d.updatedAt, updatedBy: d.updatedBy, mine: d.ownerId === user.id, canManage: canManage(d, user) };
  if (full) { v.fields = d.fields; v.body = d.body; }
  return v;
}

function list(user, { company, template, q, mine } = {}) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  return Object.values(data.documents)
    .filter((d) => canSee(d, user) && (!company || d.company === company) && (!template || d.template === template) && (!mine || d.ownerId === user.id))
    .filter((d) => !terms.length || terms.every((t) => (d.title + ' ' + d.owner + ' ' + (catalog.company(d.company) || {}).name).toLowerCase().includes(t)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((d) => view(d, user, false));
}
function get(id, user) {
  const d = data.documents[id];
  if (!d || !canSee(d, user)) throw fail(404, 'That document doesn’t exist, or it’s private to someone else.');
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
  const start = catalog.start(t, c, user.displayName);
  const d = { id: crypto.randomUUID(), title: plain(input.title, 160) || (t.id === 'blank' ? 'Untitled document' : t.name), company: c.id, template: t.id,
    fields: start.fields, body: sanitize(start.body), status: 'draft', sharing: input.sharing === 'private' ? 'private' : 'staff', version: 1,
    owner: user.displayName, ownerId: user.id, createdAt: now(), updatedAt: now(), updatedBy: user.displayName };
  data.documents[d.id] = d;
  audit(user, 'created', d); save();
  return view(d, user, true);
}

function update(id, user, input) {
  const d = get(id, user);
  if (Number(input.version) !== d.version) throw fail(409, d.updatedBy + ' changed this document while you were editing it. Reload to see their changes.');
  const t = catalog.template(d.template);
  if (input.title !== undefined) d.title = plain(input.title, 160) || 'Untitled document';
  if (input.company !== undefined) { if (!catalog.company(input.company)) throw fail(400, 'Choose a company.'); d.company = input.company; }
  if (input.fields !== undefined) d.fields = cleanFields(t, input.fields);
  if (input.body !== undefined) { if (String(input.body).length > 600000) throw fail(413, 'This document is too long.'); d.body = sanitize(input.body); }
  if (input.status !== undefined) { if (!STATUSES.includes(input.status)) throw fail(400, 'Unknown status.'); if (input.status !== d.status) audit(user, input.status === 'final' ? 'marked final' : 'back to draft', d); d.status = input.status; }
  if (input.sharing !== undefined && input.sharing !== d.sharing) {
    if (!SHARING.includes(input.sharing)) throw fail(400, 'Unknown sharing.');
    if (!canManage(d, user)) throw fail(403, 'Only the author can change who sees this document.');
    d.sharing = input.sharing; audit(user, input.sharing === 'private' ? 'made private' : 'shared with staff', d);
  }
  d.version++; d.updatedAt = now(); d.updatedBy = user.displayName;
  save();
  return view(d, user, true);
}

function duplicate(id, user) {
  const s = get(id, user);
  const d = { ...JSON.parse(JSON.stringify(s)), id: crypto.randomUUID(), title: (s.title + ' (copy)').slice(0, 160), status: 'draft', version: 1,
    sharing: s.sharing, owner: user.displayName, ownerId: user.id, createdAt: now(), updatedAt: now(), updatedBy: user.displayName };
  data.documents[d.id] = d;
  audit(user, 'duplicated', d); save();
  return view(d, user, true);
}

function remove(id, user) {
  const d = get(id, user);
  if (!canManage(d, user)) throw fail(403, 'Only the author can delete this document.');
  delete data.documents[id];
  audit(user, 'deleted', d); save();
}

// Counts per company for the filter, of the documents this person can see.
function counts(user) {
  const out = {};
  for (const d of Object.values(data.documents)) if (canSee(d, user)) out[d.company] = (out[d.company] || 0) + 1;
  return out;
}

// ---------- Website sign-ins ----------
function createSession(user, authSession, expires) {
  for (const [k, s] of Object.entries(data.sessions)) if (s.expires <= now()) delete data.sessions[k];
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions[hash(token)] = { user, authSession, checked: now(), expires: Math.min(now() + SESSION_MS, Number(expires) || now() + SESSION_MS) };
  save(); return token;
}
function session(token) { const s = data.sessions[hash(token || '')]; if (!s || s.expires <= now()) return null; return s; }
function updateSession(token, patch) { const s = session(token); if (s) { Object.assign(s, patch); save(); } }
function endSession(token) { if (token && data.sessions[hash(token)]) { delete data.sessions[hash(token)]; save(); } }

module.exports = { init, list, get, view, create, update, duplicate, remove, counts, createSession, session, updateSession, endSession };
