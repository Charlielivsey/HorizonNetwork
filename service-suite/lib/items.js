'use strict';
// Generic records: catalogues (published by managers), intake forms (submitted by visitors, accounts
// or staff, tracked by private reference) and internal records with statuses and approvals.
const fs = require('node:fs');
const { fail, id, token, hash, now, json, body, text, rate } = require('./http');
const { validate } = require('./fields');
const { isManager, meets, requireStaff, actor, sameActor, sameOrigin } = require('./access');

const CLOSED = ['cancelled', 'rejected', 'declined', 'withdrawn', 'void'];
const MAX_FILE = 10 * 1024 * 1024;

function lookups(store) {
  const items = {};
  for (const [key, list] of Object.entries(store.data.items)) items[key] = list;
  return { users: store.data.users, accounts: store.data.accounts, items };
}
const owns = (ctx, item) => sameActor(item.createdBy, ctx.staff ? { type: 'staff', id: String(ctx.staff.id || ctx.staff.email) } : ctx.account ? { type: 'account', id: ctx.account.id } : null);
const assignedAccount = (ctx, m, item) => !!ctx.account && (m.fields || []).some(f => f.type === 'account' && item.fields[f.name] === ctx.account.id);
const assignedStaff = (ctx, m, item) => !!ctx.staff && (m.fields || []).some(f => f.type === 'user' && item.fields[f.name] === String(ctx.staff.id || ctx.staff.email));

function canSee(ctx, m, item) {
  if (m.private) return owns(ctx, item);
  if (isManager(ctx, m)) return true;
  if (owns(ctx, item) || assignedAccount(ctx, m, item) || assignedStaff(ctx, m, item)) return true;
  if (!meets(ctx, m.view)) return false;
  if (m.scope === 'own') return false;
  if (m.publish) return !!item.published && (!item.visibility || meets(ctx, item.visibility));
  return true;
}

// Shape returned to the browser: internal fields, references and other people's details are removed
// for anyone who is not managing this module.
function view(ctx, m, item, detail = false) {
  const manager = isManager(ctx, m) && !m.private;
  const mine = owns(ctx, item);
  const fields = {};
  for (const f of m.fields || []) {
    if (f.internal && !manager) continue;
    if (f.contact && !manager && !mine) continue;
    if (item.fields[f.name] !== undefined) fields[f.name] = item.fields[f.name];
  }
  const out = { id: item.id, fields, status: item.status, published: !!item.published, visibility: item.visibility || 'public', createdAt: item.createdAt, updatedAt: item.updatedAt, parentId: item.parentId || null, mine };
  if (manager || mine || m.showAuthor) out.createdBy = { type: item.createdBy.type, name: item.createdBy.name };
  out.files = (item.files || []).filter(f => manager || mine || !f.internal).map(({ stored, ...f }) => f);
  if (m.comments && (detail || manager)) out.comments = (item.comments || []).filter(c => manager || !c.internal).map(c => ({ id: c.id, body: c.body, by: c.by.type === 'staff' ? (c.by.name || 'Staff') : c.by.name, from: c.by.type, internal: !!c.internal, at: c.at }));
  if (m.parent) {
    const parent = (ctx.store.list(m.parent.module) || []).find(p => p.id === item.parentId);
    if (parent) out.parentTitle = parent.fields.title || parent.fields.name || '';
  }
  if (m.capacity) out.taken = ctx.store.list(m.capacity.module).filter(c => c.parentId === item.id && !CLOSED.includes(c.status)).length;
  if (m.completion && ctx.staff) out.completed = (item.completions || []).find(c => c.userId === String(ctx.staff.id || ctx.staff.email))?.at || null;
  if (m.completion && manager) out.completions = (item.completions || []).length;
  if (manager && item.portalBill) out.portalBill = item.portalBill;
  if (manager && item.invite) out.invited = item.invite;
  if (manager && m.reference) out.hasReference = !!item.reference;
  out.can = permissions(ctx, m, item);
  return out;
}

function permissions(ctx, m, item) {
  const manager = isManager(ctx, m) && !m.private;
  const mine = owns(ctx, item);
  const statuses = (m.statuses || []).map(s => s.id);
  const transitions = m.transitions?.[item.status] || (m.transitions ? [] : statuses.filter(s => s !== item.status));
  let status = manager ? transitions : [];
  if (m.approval && manager) {
    const self = mine && m.approval.noSelf;
    status = status.filter(s => !m.approval.decisions.includes(s) || (!self && (m.approval.by === 'staff' || ctx.admin)));
  }
  if (mine && m.cancellable?.includes(item.status) && statuses.includes('cancelled') && !status.includes('cancelled')) status = [...status, 'cancelled'];
  return {
    edit: manager || (m.private && mine) || (mine && (m.ownerEdit || []).includes(item.status)),
    delete: manager || (m.private && mine) || (mine && (m.ownerDelete || []).includes(item.status)),
    comment: !!m.comments && (manager || mine || assignedAccount(ctx, m, item) || assignedStaff(ctx, m, item)),
    upload: !!m.files && (manager || ((m.files === 'creator' || m.private) && mine)),
    status
  };
}

function publicFieldDefs(ctx, m) {
  const manager = isManager(ctx, m);
  return (m.fields || []).filter(f => manager || !f.internal);
}

function find(ctx, m, itemId) {
  if (!/^[a-f0-9]{24}$/.test(itemId)) throw fail(404, 'Not found.');
  const item = ctx.store.list(m.key).find(i => i.id === itemId);
  if (!item || !canSee(ctx, m, item)) throw fail(404, 'Not found.');
  return item;
}

function checkParent(ctx, m, parentId, values, exceptId) {
  const parentModule = ctx.config.modules.find(x => x.key === m.parent.module);
  const parent = ctx.store.list(m.parent.module).find(p => p.id === parentId);
  if (!parent || !canSee(ctx, parentModule, parent)) throw fail(400, `Choose a valid ${m.parent.label || 'option'}.`);
  if (parentModule.publish && !parent.published && !isManager(ctx, m)) throw fail(400, 'This is not open.');
  if (parent.fields.open === false) throw fail(400, 'This is not currently open.');
  const closes = parent.fields[m.parent.closes || 'closes'];
  if (closes && closes < new Date().toISOString().slice(0, closes.length > 10 ? 16 : 10)) throw fail(400, 'This has closed.');
  const siblings = ctx.store.list(m.key).filter(i => i.parentId === parentId && !CLOSED.includes(i.status) && i.id !== exceptId);
  const capacity = Number(parent.fields[m.parent.capacity || 'capacity']);
  if (capacity > 0 && siblings.length >= capacity) throw fail(400, 'Sorry, this is full.');
  const unique = m.parent.unique;
  if (unique && values[unique] && siblings.some(s => String(s.fields[unique]).toLowerCase() === String(values[unique]).toLowerCase())) throw fail(400, 'An entry already exists for these details.');
  return parent;
}

async function create(ctx, m) {
  sameOrigin(ctx);
  const who = actor(ctx);
  const manager = isManager(ctx, m);
  if (!(m.create === 'manager' ? manager : m.create === 'staff' ? !!ctx.staff : m.create === 'account' ? !!ctx.account || manager : m.create === 'public')) {
    throw fail(ctx.staff || ctx.account ? 403 : 401, m.create === 'account' ? 'Sign in to your account to continue.' : 'You do not have permission to add this.');
  }
  if (who.type === 'public') rate(ctx.req, 'create-' + m.key, m.rateLimit || 6);
  const b = await body(ctx.req, m.files ? 14 * 1024 * 1024 : 65536);
  if (b.website) throw fail(400, 'Unable to submit this request.'); // honeypot field hidden from people
  if (who.type === 'public' && !b.consent && m.consent) throw fail(400, 'Please confirm the privacy notice.');
  const values = validate(publicFieldDefs(ctx, m), b.fields, lookups(ctx.store));
  let parentId = null;
  if (m.parent) { parentId = text(String(b.parentId || ''), 24, true, m.parent.label || 'Choice'); checkParent(ctx, m, parentId, values); }
  if (m.slots) require('./slots').check(ctx, m, parentId, values);
  const raw = m.reference && who.type === 'public' ? token() : null;
  const item = {
    id: id(), fields: values, status: m.initial || (m.statuses?.[0]?.id ?? 'open'), createdBy: who, createdAt: now(), updatedAt: now(),
    parentId, files: [], comments: [], history: [{ at: now(), by: who.name, action: 'created' }]
  };
  if (m.publish) { item.published = manager && b.published === true; item.visibility = ['public', 'members', 'staff'].includes(b.visibility) ? b.visibility : (m.defaultVisibility || 'public'); }
  if (raw) item.reference = hash(raw);
  if (m.files && b.file) attach(ctx, m, item, b.file, manager);
  try {
    ctx.store.change(d => { (d.items[m.key] ||= []).unshift(item); ctx.store.audit(d, who.name, 'create ' + m.key, item.id); });
  } catch (e) { for (const f of item.files) ctx.store.removeFile(f.stored); throw e; }
  return json(ctx.res, 201, { item: view(ctx, m, item, true), ...(raw ? { reference: raw } : {}) });
}

function attach(ctx, m, item, file, manager) {
  const name = text(file?.name, 180, true, 'File name').replace(/[\\/\0]/g, '_');
  if (typeof file.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw fail(400, 'Choose a valid file.');
  const bytes = Buffer.from(file.data, 'base64');
  const max = m.maxFile || MAX_FILE;
  if (!bytes.length || bytes.length > max) throw fail(413, `Files must be between 1 byte and ${Math.round(max / 1048576)} MB.`);
  const allowed = m.fileTypes || ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'svg', 'json', 'md'];
  const ext = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || '').toLowerCase();
  if (!allowed.includes(ext)) throw fail(400, 'This file type is not accepted. Allowed: ' + allowed.join(', ') + '.');
  if (ctx.store.usage() + bytes.length > (ctx.config.storageLimitMb || 1024) * 1048576) throw fail(400, 'Storage for this website is full. Ask an administrator to remove old files.');
  const stored = ctx.store.putFile(bytes);
  const entry = { id: id(), stored, name, size: bytes.length, ext, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex'), at: now(), by: actor(ctx).name, internal: manager && file.internal === true, label: text(file.label || '', 120) };
  item.files.push(entry);
  return entry;
}

async function update(ctx, m, item) {
  sameOrigin(ctx);
  const p = permissions(ctx, m, item);
  if (!p.edit) throw fail(403, 'You cannot edit this.');
  const b = await body(ctx.req);
  const values = validate(publicFieldDefs(ctx, m), b.fields, lookups(ctx.store));
  if (m.parent && b.parentId && b.parentId !== item.parentId) checkParent(ctx, m, text(b.parentId, 24, true), values, item.id);
  if (m.slots && (values.date !== item.fields.date || values.time !== item.fields.time || (b.parentId && b.parentId !== item.parentId))) require('./slots').check(ctx, m, b.parentId || item.parentId, values);
  ctx.store.change(d => {
    const target = d.items[m.key].find(i => i.id === item.id);
    // Internal fields keep their saved values when edited by someone who cannot see them.
    target.fields = { ...target.fields, ...values };
    if (m.parent && b.parentId) target.parentId = b.parentId;
    if (m.publish && isManager(ctx, m)) { target.published = b.published === true; if (['public', 'members', 'staff'].includes(b.visibility)) target.visibility = b.visibility; }
    target.updatedAt = now(); target.history.push({ at: now(), by: actor(ctx).name, action: 'edited' });
    ctx.store.audit(d, actor(ctx).name, 'edit ' + m.key, item.id);
  });
  return json(ctx.res, 200, { item: view(ctx, m, ctx.store.list(m.key).find(i => i.id === item.id), true) });
}

async function setStatus(ctx, m, item) {
  sameOrigin(ctx);
  const b = await body(ctx.req);
  const status = text(b.status, 40, true, 'Status');
  if (!permissions(ctx, m, item).status.includes(status)) throw fail(403, 'You cannot move this to that status.');
  const note = text(b.note, 2000, false, 'Note');
  ctx.store.change(d => {
    const target = d.items[m.key].find(i => i.id === item.id);
    target.status = status; target.updatedAt = now();
    target.history.push({ at: now(), by: actor(ctx).name, action: 'status ' + status });
    if (m.approval?.decisions.includes(status)) target.decision = { status, by: actor(ctx).name, at: now(), note };
    if (note && m.comments) target.comments.push({ id: id(), by: actor(ctx), body: note, at: now(), internal: false });
    ctx.store.audit(d, actor(ctx).name, 'status ' + m.key, item.id + ' ' + status);
  });
  return json(ctx.res, 200, { item: view(ctx, m, ctx.store.list(m.key).find(i => i.id === item.id), true) });
}

async function comment(ctx, m, item, viaReference = false) {
  if (!viaReference) { sameOrigin(ctx); if (!permissions(ctx, m, item).comment) throw fail(403, 'You cannot reply to this.'); }
  const b = await body(ctx.req);
  const message = text(b.body, 5000, true, 'Message');
  const by = viaReference ? { type: 'public', id: '', name: item.fields.name || 'Submitter' } : actor(ctx);
  const internal = !viaReference && isManager(ctx, m) && b.internal === true;
  ctx.store.change(d => {
    const target = d.items[m.key].find(i => i.id === item.id);
    target.comments.push({ id: id(), by, body: message, at: now(), internal });
    target.updatedAt = now();
    ctx.store.audit(d, by.name, 'reply ' + m.key, item.id);
  });
  return json(ctx.res, 201, { ok: true });
}

async function upload(ctx, m, item) {
  sameOrigin(ctx);
  if (!permissions(ctx, m, item).upload) throw fail(403, 'You cannot add files here.');
  const b = await body(ctx.req, 14 * 1024 * 1024);
  const copy = structuredClone(item);
  const entry = attach(ctx, m, copy, b.file, isManager(ctx, m));
  try {
    ctx.store.change(d => { const t = d.items[m.key].find(i => i.id === item.id); t.files.push(entry); t.updatedAt = now(); ctx.store.audit(d, actor(ctx).name, 'upload ' + m.key, item.id); });
  } catch (e) { ctx.store.removeFile(entry.stored); throw e; }
  return json(ctx.res, 201, { ok: true });
}

function download(ctx, m, item, fileId) {
  const file = (item.files || []).find(f => f.id === fileId);
  if (!file || (file.internal && !isManager(ctx, m) && !owns(ctx, item))) throw fail(404, 'File not found.');
  const safe = file.name.replace(/[^a-zA-Z0-9 ._()-]/g, '_');
  ctx.res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${safe}"`, 'Content-Length': file.size, 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" });
  fs.createReadStream(ctx.store.filePath(file.stored)).on('error', () => ctx.res.destroy()).pipe(ctx.res);
}

async function removeFile(ctx, m, item, fileId) {
  sameOrigin(ctx);
  if (!permissions(ctx, m, item).upload) throw fail(403, 'You cannot remove files here.');
  const file = item.files.find(f => f.id === fileId);
  if (!file) throw fail(404, 'File not found.');
  ctx.store.change(d => { const t = d.items[m.key].find(i => i.id === item.id); t.files = t.files.filter(f => f.id !== fileId); ctx.store.audit(d, actor(ctx).name, 'remove file ' + m.key, item.id); });
  ctx.store.removeFile(file.stored);
  return json(ctx.res, 200, { ok: true });
}

async function remove(ctx, m, item) {
  sameOrigin(ctx);
  if (!permissions(ctx, m, item).delete) throw fail(403, 'You cannot delete this.');
  const children = ctx.config.modules.filter(x => x.parent?.module === m.key).flatMap(x => ctx.store.list(x.key).filter(c => c.parentId === item.id));
  if (children.length) throw fail(400, `This has ${children.length} linked ${children.length === 1 ? 'entry' : 'entries'}. Close it instead, or remove those first.`);
  ctx.store.change(d => { d.items[m.key] = d.items[m.key].filter(i => i.id !== item.id); ctx.store.audit(d, actor(ctx).name, 'delete ' + m.key, item.id); });
  for (const f of item.files || []) ctx.store.removeFile(f.stored);
  return json(ctx.res, 200, { ok: true });
}

function csv(ctx, m) {
  if (!isManager(ctx, m) || m.private) throw fail(403, 'Only managers can export this.');
  const fields = m.fields || [];
  const cell = v => { let s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = [['id', 'status', 'created', ...fields.map(f => f.label || f.name)].map(cell).join(',')];
  for (const item of ctx.store.list(m.key)) rows.push([item.id, item.status, item.createdAt, ...fields.map(f => f.type === 'money' && item.fields[f.name] !== '' ? (item.fields[f.name] / 100).toFixed(2) : item.fields[f.name])].map(cell).join(','));
  ctx.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${m.key}.csv"`, 'Cache-Control': 'no-store' });
  ctx.res.end('﻿' + rows.join('\r\n'));
}

// Learning: record a course as completed here and (where configured) as a staff-portal training record.
async function complete(ctx, m, item) {
  sameOrigin(ctx); requireStaff(ctx);
  if (!m.completion) throw fail(404, 'Not found.');
  const userId = String(ctx.staff.id || ctx.staff.email);
  if ((item.completions || []).some(c => c.userId === userId)) throw fail(400, 'You have already completed this.');
  const date = new Date().toISOString().slice(0, 10);
  let portal = 'not-configured';
  if (m.completion.portal) {
    try {
      const response = await ctx.auth.bridge(ctx.req, 'POST', '/api/training', { upload: { header: 'x-training', meta: { course: String(item.fields.title).slice(0, 120), provider: String(m.completion.provider || ctx.config.name).slice(0, 120), completedOn: date, note: 'Completed on ' + ctx.config.domain } } });
      const value = await response.json().catch(() => ({}));
      portal = response.ok ? 'recorded' : 'failed: ' + (value.error || 'The staff portal did not accept the record.');
    } catch (e) { portal = 'failed: ' + e.message; }
  }
  ctx.store.change(d => { const t = d.items[m.key].find(i => i.id === item.id); (t.completions ||= []).push({ userId, name: ctx.staff.displayName, at: now(), portal }); ctx.store.audit(d, ctx.staff.displayName, 'complete ' + m.key, item.id); });
  return json(ctx.res, 200, { ok: true, portal });
}

// Procurement: after approval, record the purchase as a supplier bill in the staff portal (single source
// of financial truth). The portal checks the person's payroll & finance permission itself.
async function portalBill(ctx, m, item) {
  sameOrigin(ctx); requireStaff(ctx);
  if (!m.portalBill || !isManager(ctx, m)) throw fail(403, 'You cannot record this as a bill.');
  if (!['approved', 'ordered', 'received'].includes(item.status)) throw fail(400, 'Only approved purchases can be recorded as bills.');
  if (item.portalBill) throw fail(400, 'This purchase is already recorded in the staff portal.');
  const b = await body(ctx.req);
  const dueDate = text(b.dueDate, 10, true, 'Due date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw fail(400, 'Choose a valid due date.');
  const amount = item.fields[m.portalBill.amount];
  if (!(amount > 0)) throw fail(400, 'This purchase has no amount.');
  const response = await ctx.auth.bridge(ctx.req, 'POST', '/api/bills', { json: { supplier: String(item.fields[m.portalBill.supplier] || '').slice(0, 120), amount: (amount / 100).toFixed(2), dueDate, reference: 'PR-' + item.id.slice(0, 8).toUpperCase(), category: text(b.category, 60) || 'Other', repeat: 'none', note: String(item.fields.title || '').slice(0, 500) } });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status === 403 ? 403 : 400, value.error || 'The staff portal did not accept the bill.');
  ctx.store.change(d => { const t = d.items[m.key].find(i => i.id === item.id); t.portalBill = { at: now(), by: ctx.staff.displayName }; ctx.store.audit(d, ctx.staff.displayName, 'portal bill ' + m.key, item.id); });
  return json(ctx.res, 200, { ok: true });
}

// Membership: approve an application and issue a single-use account invitation for the applicant.
async function invite(ctx, m, item) {
  sameOrigin(ctx);
  if (!m.invite || !isManager(ctx, m)) throw fail(403, 'You cannot invite this applicant.');
  const accounts = require('./accounts');
  const link = accounts.issueInvite(ctx, { name: item.fields.name, email: item.fields.email, member: true });
  ctx.store.change(d => { const t = d.items[m.key].find(i => i.id === item.id); t.status = m.invite.status || 'approved'; t.invite = { at: now(), by: ctx.staff.displayName }; t.updatedAt = now(); ctx.store.audit(d, ctx.staff.displayName, 'invite ' + m.key, item.id); });
  return json(ctx.res, 200, { invite: link });
}

async function route(ctx, m, parts) {
  const method = ctx.method;
  if (!parts.length) {
    if (method === 'GET') {
      const visible = ctx.store.list(m.key).filter(i => canSee(ctx, m, i));
      if (!visible.length && !meets(ctx, m.view) && !isManager(ctx, m) && m.create !== 'public') throw fail(ctx.staff || ctx.account ? 403 : 401, 'Sign in to see this.');
      return json(ctx.res, 200, { items: visible.map(i => view(ctx, m, i)), manager: isManager(ctx, m) && !m.private, canCreate: m.create === 'manager' ? isManager(ctx, m) : m.create === 'staff' ? !!ctx.staff : m.create === 'account' ? !!ctx.account || isManager(ctx, m) : true, fields: publicFieldDefs(ctx, m) });
    }
    if (method === 'POST') return create(ctx, m);
  }
  if (parts[0] === 'export.csv' && method === 'GET') return csv(ctx, m);
  const item = find(ctx, m, parts[0]);
  const action = parts[1] || '';
  if (!action && method === 'GET') return json(ctx.res, 200, { item: view(ctx, m, item, true), history: isManager(ctx, m) ? item.history : undefined });
  if (method === 'GET' && action === 'file' && parts[2]) return download(ctx, m, item, parts[2]);
  if (method !== 'POST') throw fail(405, 'Method not allowed.');
  if (!action) return update(ctx, m, item);
  if (action === 'status') return setStatus(ctx, m, item);
  if (action === 'comment') return comment(ctx, m, item);
  if (action === 'upload') return upload(ctx, m, item);
  if (action === 'remove-file' && parts[2]) return removeFile(ctx, m, item, parts[2]);
  if (action === 'delete') return remove(ctx, m, item);
  if (action === 'complete') return complete(ctx, m, item);
  if (action === 'portal-bill') return portalBill(ctx, m, item);
  if (action === 'invite') return invite(ctx, m, item);
  throw fail(404, 'Not found.');
}

// Private reference holders (anonymous submitters) can read the public conversation and reply.
async function reference(ctx, action) {
  sameOrigin(ctx);
  rate(ctx.req, 'reference', 40);
  const peek = await body(ctx.req, 12000);
  const raw = String(peek.reference || '').trim();
  if (!/^[a-f0-9]{64}$/.test(raw)) throw fail(404, 'Nothing was found for that reference. Check you copied all 64 characters.');
  const digest = hash(raw);
  for (const m of ctx.config.modules.filter(x => x.type === 'items' && x.reference)) {
    const item = ctx.store.list(m.key).find(i => i.reference === digest);
    if (!item) continue;
    if (action === 'reply') {
      if (!m.comments) throw fail(400, 'Replies are not available here.');
      if (CLOSED.includes(item.status) || item.status === 'closed') throw fail(400, 'This is closed. Please submit a new request.');
      const message = text(peek.body, 5000, true, 'Message');
      ctx.store.change(d => { const t = d.items[m.key].find(i => i.id === item.id); t.comments.push({ id: id(), by: { type: 'public', id: '', name: item.fields.name || 'Submitter' }, body: message, at: now(), internal: false }); t.updatedAt = now(); });
    }
    if (action === 'cancel') {
      if (!(m.cancellable || []).includes(item.status)) throw fail(400, 'This can no longer be cancelled here.');
      ctx.store.change(d => { const t = d.items[m.key].find(i => i.id === item.id); t.status = 'cancelled'; t.updatedAt = now(); t.history.push({ at: now(), by: 'Submitter', action: 'status cancelled' }); });
    }
    const current = ctx.store.list(m.key).find(i => i.id === item.id);
    const statusLabel = (m.statuses || []).find(s => s.id === current.status)?.label || current.status;
    const parent = m.parent ? ctx.store.list(m.parent.module).find(p => p.id === current.parentId) : null;
    return json(ctx.res, 200, {
      module: m.key, title: m.title, status: current.status, statusLabel, createdAt: current.createdAt, parentTitle: parent ? (parent.fields.title || parent.fields.name) : null,
      fields: Object.fromEntries((m.fields || []).filter(f => !f.internal).map(f => [f.label || f.name, current.fields[f.name]])),
      comments: m.comments ? current.comments.filter(c => !c.internal).map(c => ({ body: c.body, from: c.by.type === 'public' ? 'You' : (c.by.type === 'staff' ? (c.by.name || 'HN Group') : c.by.name), at: c.at })) : [],
      canReply: !!m.comments && !CLOSED.includes(current.status) && current.status !== 'closed', canCancel: (m.cancellable || []).includes(current.status)
    });
  }
  throw fail(404, 'Nothing was found for that reference. Check you copied all 64 characters.');
}

module.exports = { route, reference, canSee, view, CLOSED, attach, lookups };
