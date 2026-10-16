'use strict';
// Document signing workflow. Each signer receives a private link (shared manually by staff) and
// confirms by typing their name. The trail records time, IP address, browser and the document's
// SHA-256 fingerprint. This is a simple electronic acknowledgement: it does not verify identity and
// is not a qualified or advanced electronic signature.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { fail, id, token, hash, now, json, body, text, email, clientIp, rate } = require('./http');
const { requireStaff, actor, sameOrigin } = require('./access');

const norm = s => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const canManage = (ctx, doc) => !!ctx.staff && (ctx.admin || doc.createdBy.id === String(ctx.staff.id || ctx.staff.email));

function staffView(doc) {
  return { id: doc.id, title: doc.title, message: doc.message, status: doc.status, createdAt: doc.createdAt, createdBy: doc.createdBy.name, completedAt: doc.completedAt || null,
    file: { name: doc.file.name, size: doc.file.size, sha256: doc.file.sha256 },
    signers: doc.signers.map(s => ({ id: s.id, name: s.name, email: s.email, status: s.status, viewedAt: s.viewedAt || null, signedAt: s.signedAt || null, typedName: s.typedName || null, ip: s.ip || null, userAgent: s.userAgent || null, declineReason: s.declineReason || null })),
    events: doc.events };
}
function bySignerToken(ctx, m, raw) {
  if (!/^[a-f0-9]{64}$/.test(raw || '')) throw fail(404, 'This signing link is invalid or has been replaced.');
  const digest = hash(raw);
  for (const doc of ctx.store.list(m.key)) { const s = doc.signers.find(x => x.token === digest); if (s) return { doc, signer: s }; }
  throw fail(404, 'This signing link is invalid or has been replaced.');
}
function sendFile(ctx, doc, disposition = 'attachment') {
  const safe = doc.file.name.replace(/[^a-zA-Z0-9 ._()-]/g, '_');
  ctx.res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${safe}"`, 'Content-Length': doc.file.size, 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" });
  fs.createReadStream(ctx.store.filePath(doc.file.stored)).on('error', () => ctx.res.destroy()).pipe(ctx.res);
}
function certificate(doc, domain) {
  const lines = [
    `Signing record — ${doc.title}`, `Website: https://${domain}`, `Record ID: ${doc.id}`, `Status: ${doc.status}`,
    `Document: ${doc.file.name} (${doc.file.size} bytes)`, `Document SHA-256: ${doc.file.sha256}`, `Created: ${doc.createdAt} by ${doc.createdBy.name}`,
    doc.completedAt ? `Completed: ${doc.completedAt}` : '', '', 'Signers:'];
  for (const s of doc.signers) lines.push(`- ${s.name} <${s.email}>: ${s.status}${s.signedAt ? ` at ${s.signedAt}, typed name "${s.typedName}", IP ${s.ip}, browser "${s.userAgent}"` : ''}${s.declineReason ? ` — reason: ${s.declineReason}` : ''}`);
  lines.push('', 'Events:', ...doc.events.map(e => `- ${e.at} ${e.type}${e.signer ? ' (' + e.signer + ')' : ''}${e.ip ? ' IP ' + e.ip : ''}`));
  lines.push('', 'This record is a simple electronic acknowledgement made through a private link. HN Group did not verify the identity of signers beyond possession of that link. It is not a qualified or advanced electronic signature.');
  return lines.filter(l => l !== null).join('\n');
}

async function route(ctx, m, parts) {
  const action = parts[0] || '';
  // Signer actions use the private link token; they never require a staff or customer account.
  if (['open', 'document', 'sign', 'decline'].includes(action)) {
    if (ctx.method !== 'POST') throw fail(405, 'Method not allowed.');
    sameOrigin(ctx); rate(ctx.req, 'sign', 60);
    const b = await body(ctx.req);
    const { doc, signer } = bySignerToken(ctx, m, b.token);
    const edit = fn => ctx.store.change(d => { const t = d.items[m.key].find(x => x.id === doc.id); fn(t, t.signers.find(x => x.id === signer.id)); });
    if (action === 'document') { if (doc.status === 'voided') throw fail(410, 'This document was withdrawn.'); return sendFile(ctx, doc); }
    if (action === 'open') {
      if (!signer.viewedAt) edit((t, s) => { s.viewedAt = now(); t.events.push({ at: now(), type: 'viewed', signer: s.name, ip: clientIp(ctx.req) }); });
      const others = doc.signers.filter(s => s.id !== signer.id).map(s => ({ name: s.name, status: s.status }));
      return json(ctx.res, 200, { title: doc.title, message: doc.message, from: doc.createdBy.name, status: doc.status, file: { name: doc.file.name, size: doc.file.size, sha256: doc.file.sha256 }, signer: { name: signer.name, status: signer.status, signedAt: signer.signedAt || null }, others });
    }
    if (doc.status !== 'sent') throw fail(400, doc.status === 'voided' ? 'This document was withdrawn.' : 'This document is no longer awaiting signatures.');
    if (signer.status !== 'pending') throw fail(400, 'You have already responded to this document.');
    if (action === 'sign') {
      if (b.consent !== true) throw fail(400, 'Confirm that you have read the document and agree to sign it electronically.');
      const typed = text(b.typedName, 120, true, 'Your full name');
      if (norm(typed) !== norm(signer.name)) throw fail(400, `Type your name exactly as shown: ${signer.name}`);
      if (b.sha256 !== doc.file.sha256) throw fail(400, 'Please open the document again before signing.');
      const ip = clientIp(ctx.req), ua = String(ctx.req.headers['user-agent'] || '').slice(0, 300);
      edit((t, s) => {
        Object.assign(s, { status: 'signed', signedAt: now(), typedName: typed, ip, userAgent: ua, token: hash(token()) });
        t.events.push({ at: now(), type: 'signed', signer: s.name, ip });
        if (t.signers.every(x => x.status === 'signed')) { t.status = 'completed'; t.completedAt = now(); t.events.push({ at: now(), type: 'completed' }); }
      });
      return json(ctx.res, 200, { ok: true });
    }
    const reason = text(b.reason, 1000, true, 'Reason');
    edit((t, s) => { Object.assign(s, { status: 'declined', declineReason: reason, declinedAt: now() }); t.status = 'declined'; t.events.push({ at: now(), type: 'declined', signer: s.name, ip: clientIp(ctx.req) }); });
    return json(ctx.res, 200, { ok: true });
  }

  requireStaff(ctx);
  const docs = ctx.store.list(m.key);
  if (!action && ctx.method === 'GET') return json(ctx.res, 200, { documents: docs.filter(d => canManage(ctx, d)).map(staffView), admin: ctx.admin });
  if (!action && ctx.method === 'POST') {
    sameOrigin(ctx);
    const b = await body(ctx.req, 14 * 1024 * 1024);
    const title = text(b.title, 160, true, 'Title'), message = text(b.message, 2000);
    if (!Array.isArray(b.signers) || !b.signers.length || b.signers.length > 10) throw fail(400, 'Add between 1 and 10 signers.');
    const signers = b.signers.map((s, i) => ({ name: text(s?.name, 120, true, `Signer ${i + 1} name`), email: email(s?.email, true, `Signer ${i + 1} email`) }));
    if (new Set(signers.map(s => s.email)).size !== signers.length) throw fail(400, 'Each signer needs a different email address.');
    if (typeof b.file?.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.file.data)) throw fail(400, 'Choose a PDF document.');
    const bytes = Buffer.from(b.file.data, 'base64');
    if (bytes.length < 5 || bytes.length > 10 * 1048576 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw fail(400, 'Choose a PDF document of up to 10 MB.');
    const name = text(b.file.name, 180, true, 'File name').replace(/[\\/\0]/g, '_');
    const stored = ctx.store.putFile(bytes);
    const links = [];
    const doc = { id: id(), title, message, status: 'sent', createdBy: actor(ctx), createdAt: now(), file: { stored, name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
      signers: signers.map(s => { const raw = token(); const sid = id(); links.push({ id: sid, name: s.name, email: s.email, link: `https://${ctx.config.domain}/#/sign/${raw}` }); return { id: sid, ...s, status: 'pending', token: hash(raw) }; }),
      events: [{ at: now(), type: 'created', signer: null }] };
    try { ctx.store.change(d => { (d.items[m.key] ||= []).unshift(doc); ctx.store.audit(d, ctx.staff.displayName, 'create signing', doc.id); }); }
    catch (e) { ctx.store.removeFile(stored); throw e; }
    return json(ctx.res, 201, { document: staffView(doc), links });
  }
  const doc = docs.find(d => d.id === action);
  if (!doc || !canManage(ctx, doc)) throw fail(404, 'Not found.');
  const sub = parts[1] || '';
  if (ctx.method === 'GET') {
    if (!sub) return json(ctx.res, 200, { document: staffView(doc) });
    if (sub === 'file') return sendFile(ctx, doc);
    if (sub === 'record') { ctx.res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="signing-record-${doc.id}.txt"`, 'Cache-Control': 'no-store' }); return ctx.res.end(certificate(doc, ctx.config.domain)); }
    throw fail(404, 'Not found.');
  }
  sameOrigin(ctx);
  const b = await body(ctx.req);
  if (sub === 'void') {
    if (doc.status !== 'sent') throw fail(400, 'Only documents awaiting signatures can be withdrawn.');
    ctx.store.change(d => { const t = d.items[m.key].find(x => x.id === doc.id); t.status = 'voided'; t.events.push({ at: now(), type: 'withdrawn by ' + ctx.staff.displayName }); for (const s of t.signers) s.token = hash(token()); ctx.store.audit(d, ctx.staff.displayName, 'void signing', doc.id); });
    return json(ctx.res, 200, { ok: true });
  }
  if (sub === 'relink') {
    const signer = doc.signers.find(s => s.id === b.signerId);
    if (!signer || signer.status !== 'pending' || doc.status !== 'sent') throw fail(400, 'Only pending signers can receive a new link.');
    const raw = token();
    ctx.store.change(d => { const t = d.items[m.key].find(x => x.id === doc.id); t.signers.find(s => s.id === signer.id).token = hash(raw); t.events.push({ at: now(), type: 'new link issued', signer: signer.name }); });
    return json(ctx.res, 200, { link: `https://${ctx.config.domain}/#/sign/${raw}` });
  }
  if (sub === 'delete') {
    if (!ctx.admin) throw fail(403, 'Only administrators can delete signing records.');
    if (doc.status === 'completed') throw fail(400, 'Completed signing records are kept. Download the record instead.');
    ctx.store.change(d => { d.items[m.key] = d.items[m.key].filter(x => x.id !== doc.id); ctx.store.audit(d, ctx.staff.displayName, 'delete signing', doc.id); });
    ctx.store.removeFile(doc.file.stored);
    return json(ctx.res, 200, { ok: true });
  }
  throw fail(404, 'Not found.');
}
module.exports = { route };
