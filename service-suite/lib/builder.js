'use strict';
// Branded forms and surveys built by managers. Responses stay on this website; results are
// aggregated server-side and only shown publicly when a survey is set to share results.
const { fail, id, now, json, body, text, email, rate } = require('./http');
const { isManager, requireStaff, actor, sameOrigin } = require('./access');
const TYPES = ['text', 'textarea', 'email', 'number', 'select', 'multi', 'rating', 'yesno'];

function cleanQuestions(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 40) throw fail(400, 'Add between 1 and 40 questions.');
  return raw.map((q, i) => {
    const type = TYPES.includes(q?.type) ? q.type : 'text';
    const options = ['select', 'multi'].includes(type) ? [...new Set((Array.isArray(q.options) ? q.options : []).map(o => text(String(o), 120)).filter(Boolean))] : [];
    if (['select', 'multi'].includes(type) && (options.length < 2 || options.length > 20)) throw fail(400, `Question ${i + 1} needs between 2 and 20 options.`);
    return { id: /^[a-f0-9]{12}$/.test(q.id || '') ? q.id : id().slice(0, 12), label: text(q.label, 300, true, `Question ${i + 1}`), help: text(q.help || '', 300), type, options, required: q.required !== false };
  });
}
function answer(q, raw) {
  const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && !raw.length);
  if (empty) { if (q.required) throw fail(400, `“${q.label}” is required.`); return null; }
  switch (q.type) {
    case 'textarea': return text(String(raw), 5000, q.required, q.label);
    case 'email': return email(String(raw), q.required, q.label);
    case 'number': { const n = Number(raw); if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw fail(400, `“${q.label}” must be a number.`); return n; }
    case 'select': { const v = String(raw); if (!q.options.includes(v)) throw fail(400, `Choose an option for “${q.label}”.`); return v; }
    case 'multi': { if (!Array.isArray(raw)) throw fail(400, `Choose options for “${q.label}”.`); const v = [...new Set(raw.map(String))]; if (v.some(x => !q.options.includes(x))) throw fail(400, `Choose valid options for “${q.label}”.`); return v; }
    case 'rating': { const n = Number(raw); if (!Number.isInteger(n) || n < 1 || n > 5) throw fail(400, `Rate “${q.label}” from 1 to 5.`); return n; }
    case 'yesno': { if (!['yes', 'no'].includes(raw)) throw fail(400, `Answer yes or no for “${q.label}”.`); return raw; }
    default: return text(String(raw), 500, q.required, q.label);
  }
}
const isOpen = f => f.open && (!f.closes || f.closes >= new Date().toISOString().slice(0, 10));
function visible(ctx, m, f) { return isManager(ctx, m) || (f.published && (f.audience !== 'staff' || !!ctx.staff)); }
function summary(ctx, m, f) {
  const responses = ctx.store.list(m.key + ':responses').filter(r => r.formId === f.id);
  return { id: f.id, title: f.title, description: f.description, audience: f.audience, open: isOpen(f), published: f.published, closes: f.closes || null, resultsPublic: !!f.resultsPublic, anonymous: !!f.anonymous, questions: f.questions, responses: isManager(ctx, m) ? responses.length : undefined, updatedAt: f.updatedAt };
}
function results(ctx, m, f) {
  const responses = ctx.store.list(m.key + ':responses').filter(r => r.formId === f.id);
  const manager = isManager(ctx, m);
  return f.questions.map(q => {
    const values = responses.map(r => r.answers[q.id]).filter(v => v !== null && v !== undefined);
    const out = { id: q.id, label: q.label, type: q.type, answered: values.length };
    if (['select', 'multi', 'yesno'].includes(q.type)) {
      const opts = q.type === 'yesno' ? ['yes', 'no'] : q.options;
      out.counts = opts.map(o => ({ option: o, count: values.filter(v => Array.isArray(v) ? v.includes(o) : v === o).length }));
    } else if (['rating', 'number'].includes(q.type)) {
      out.average = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null;
      if (q.type === 'rating') out.distribution = [1, 2, 3, 4, 5].map(n => values.filter(v => v === n).length);
    } else if (manager) {
      out.answers = values.slice(-200).map(String);
    }
    return out;
  });
}

async function route(ctx, m, parts) {
  const forms = ctx.store.list(m.key);
  if (!parts.length && ctx.method === 'GET') return json(ctx.res, 200, { forms: forms.filter(f => visible(ctx, m, f)).map(f => summary(ctx, m, f)), manager: isManager(ctx, m) });
  if (!parts.length && ctx.method === 'POST') {
    sameOrigin(ctx);
    if (!isManager(ctx, m)) throw fail(403, 'Only managers can build ' + m.title.toLowerCase() + '.');
    const b = await body(ctx.req, 200000);
    const existing = b.id ? forms.find(f => f.id === b.id) : null;
    if (b.id && !existing) throw fail(404, 'Not found.');
    const questions = cleanQuestions(b.questions);
    if (existing && ctx.store.list(m.key + ':responses').some(r => r.formId === existing.id) && JSON.stringify(existing.questions.map(q => [q.id, q.type])) !== JSON.stringify(questions.map(q => [q.id, q.type]))) {
      throw fail(400, 'Questions cannot be added, removed or change type after responses arrive. Duplicate it instead.');
    }
    const closes = text(b.closes || '', 10);
    if (closes && !/^\d{4}-\d{2}-\d{2}$/.test(closes)) throw fail(400, 'Choose a valid closing date.');
    const form = { id: existing?.id || id(), title: text(b.title, 160, true, 'Title'), description: text(b.description, 2000), audience: b.audience === 'staff' ? 'staff' : 'public', open: b.open === true, published: b.published === true, resultsPublic: m.mode === 'survey' && b.resultsPublic === true, anonymous: b.anonymous !== false, closes, questions, createdBy: existing?.createdBy || actor(ctx), createdAt: existing?.createdAt || now(), updatedAt: now() };
    ctx.store.change(d => { d.items[m.key] = (d.items[m.key] || []).filter(f => f.id !== form.id); d.items[m.key].unshift(form); ctx.store.audit(d, ctx.staff.displayName, 'save ' + m.key, form.id); });
    return json(ctx.res, 200, { form: summary(ctx, m, form) });
  }
  const f = forms.find(x => x.id === parts[0]);
  if (!f || !visible(ctx, m, f)) throw fail(404, 'Not found.');
  const action = parts[1] || '';
  if (!action && ctx.method === 'GET') return json(ctx.res, 200, { form: summary(ctx, m, f) });
  if (action === 'results' && ctx.method === 'GET') {
    if (!isManager(ctx, m) && !(f.resultsPublic && f.published)) throw fail(403, 'Results are not shared for this survey.');
    return json(ctx.res, 200, { results: results(ctx, m, f), total: ctx.store.list(m.key + ':responses').filter(r => r.formId === f.id).length });
  }
  if (action === 'responses' && ctx.method === 'GET') {
    if (!isManager(ctx, m)) throw fail(403, 'Only managers can read responses.');
    const list = ctx.store.list(m.key + ':responses').filter(r => r.formId === f.id);
    if (parts[2] === 'export.csv') {
      const cell = v => { let s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const rows = [['submitted', 'by', ...f.questions.map(q => q.label)].map(cell).join(',')].concat(list.map(r => [r.at, r.by || '', ...f.questions.map(q => r.answers[q.id])].map(cell).join(',')));
      ctx.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${m.key}-${f.id}.csv"`, 'Cache-Control': 'no-store' });
      return ctx.res.end('﻿' + rows.join('\r\n'));
    }
    return json(ctx.res, 200, { responses: list.slice(0, 500) });
  }
  if (ctx.method !== 'POST') throw fail(405, 'Method not allowed.');
  sameOrigin(ctx);
  if (action === 'respond') {
    if (!isOpen(f) || !f.published) throw fail(400, 'This is not accepting responses.');
    if (f.audience === 'staff') requireStaff(ctx); else if (!ctx.staff) rate(ctx.req, 'respond-' + f.id, 6);
    const b = await body(ctx.req, 100000);
    if (b.website) throw fail(400, 'Unable to submit.');
    const answers = {};
    for (const q of f.questions) answers[q.id] = answer(q, b.answers?.[q.id]);
    const by = f.anonymous ? null : (ctx.staff ? ctx.staff.displayName : null);
    if (f.audience === 'staff' && ctx.store.list(m.key + ':responses').some(r => r.formId === f.id && r.userId === String(ctx.staff.id))) throw fail(400, 'You have already responded.');
    const response = { id: id(), formId: f.id, answers, at: now(), by, ...(f.audience === 'staff' ? { userId: String(ctx.staff.id) } : {}) };
    ctx.store.change(d => { (d.items[m.key + ':responses'] ||= []).unshift(response); });
    return json(ctx.res, 201, { ok: true });
  }
  if (!isManager(ctx, m)) throw fail(403, 'Only managers can change this.');
  if (action === 'delete') {
    ctx.store.change(d => { d.items[m.key] = d.items[m.key].filter(x => x.id !== f.id); d.items[m.key + ':responses'] = (d.items[m.key + ':responses'] || []).filter(r => r.formId !== f.id); ctx.store.audit(d, ctx.staff.displayName, 'delete ' + m.key, f.id); });
    return json(ctx.res, 200, { ok: true });
  }
  throw fail(404, 'Not found.');
}
module.exports = { route };
