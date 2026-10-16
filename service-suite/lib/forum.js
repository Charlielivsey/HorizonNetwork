'use strict';
// Community forums. Posting needs a site community account; moderation needs HN Group Auth with the
// module's manager permission. Email addresses are never shown publicly.
const { fail, id, now, json, body, text, rate } = require('./http');
const { isManager, sameOrigin } = require('./access');

function threadView(ctx, m, t, detail) {
  const manager = isManager(ctx, m);
  const replies = t.replies.filter(r => manager || !r.hidden);
  const out = { id: t.id, category: t.category, title: t.title, author: t.author.name, staff: t.author.type === 'staff', createdAt: t.createdAt, lastAt: t.lastAt, replies: replies.length, locked: !!t.locked, pinned: !!t.pinned, hidden: !!t.hidden, mine: !!ctx.account && t.author.type === 'account' && t.author.id === ctx.account.id };
  if (manager) out.reports = t.reports.length + t.replies.reduce((n, r) => n + r.reports.length, 0);
  if (detail) {
    out.body = t.body;
    out.posts = replies.map(r => ({ id: r.id, body: r.body, author: r.author.name, staff: r.author.type === 'staff', at: r.at, hidden: !!r.hidden, mine: !!ctx.account && r.author.type === 'account' && r.author.id === ctx.account.id, ...(manager ? { reports: r.reports.length } : {}) }));
  }
  return out;
}
function author(ctx) {
  if (ctx.account) return { type: 'account', id: ctx.account.id, name: ctx.account.name };
  if (ctx.staff) return { type: 'staff', id: String(ctx.staff.id || ctx.staff.email), name: (ctx.staff.displayName || 'Staff') + ' · ' + (ctx.config.staffLabel || 'HN Group') };
  throw fail(401, 'Sign in or create a community account to post.');
}

async function route(ctx, m, parts) {
  const threads = ctx.store.list(m.key);
  const manager = isManager(ctx, m);
  if (!parts.length && ctx.method === 'GET') {
    const list = threads.filter(t => manager || !t.hidden).sort((a, b) => (b.pinned - a.pinned) || b.lastAt.localeCompare(a.lastAt));
    return json(ctx.res, 200, { categories: m.categories, threads: list.map(t => threadView(ctx, m, t, false)), manager, guidelines: m.guidelines });
  }
  if (!parts.length && ctx.method === 'POST') {
    sameOrigin(ctx); const who = author(ctx); rate(ctx.req, 'thread', 8, 3600000);
    const b = await body(ctx.req, 40000);
    const category = text(b.category, 60, true, 'Category');
    if (!m.categories.some(c => c.id === category)) throw fail(400, 'Choose a category.');
    const thread = { id: id(), category, title: text(b.title, 140, true, 'Title'), body: text(b.body, 10000, true, 'Message'), author: who, createdAt: now(), lastAt: now(), replies: [], reports: [], locked: false, pinned: false, hidden: false };
    ctx.store.change(d => { (d.items[m.key] ||= []).unshift(thread); ctx.store.audit(d, who.name, 'new thread', thread.id); });
    return json(ctx.res, 201, { thread: threadView(ctx, m, thread, true) });
  }
  const t = threads.find(x => x.id === parts[0]);
  if (!t || (t.hidden && !manager)) throw fail(404, 'This discussion is not available.');
  const action = parts[1] || '';
  if (!action && ctx.method === 'GET') return json(ctx.res, 200, { thread: threadView(ctx, m, t, true), manager });
  if (ctx.method !== 'POST') throw fail(405, 'Method not allowed.');
  sameOrigin(ctx);
  const b = await body(ctx.req, 40000);
  const edit = fn => ctx.store.change(d => { const target = d.items[m.key].find(x => x.id === t.id); fn(target); });
  if (action === 'reply') {
    const who = author(ctx); rate(ctx.req, 'reply', 30, 3600000);
    if (t.locked && !manager) throw fail(400, 'This discussion is locked.');
    const reply = { id: id(), body: text(b.body, 10000, true, 'Reply'), author: who, at: now(), hidden: false, reports: [] };
    edit(x => { x.replies.push(reply); x.lastAt = now(); });
    return json(ctx.res, 201, { ok: true });
  }
  if (action === 'report') {
    const who = author(ctx); rate(ctx.req, 'report', 20, 3600000);
    const reason = text(b.reason, 500, true, 'Reason');
    edit(x => { const target = b.postId ? x.replies.find(r => r.id === b.postId) : x; if (!target) throw fail(404, 'Post not found.'); if (!target.reports.some(r => r.by === who.id)) target.reports.push({ by: who.id, reason, at: now() }); });
    return json(ctx.res, 200, { ok: true });
  }
  if (action === 'edit') {
    const who = author(ctx);
    const target = b.postId ? t.replies.find(r => r.id === b.postId) : t;
    if (!target || target.author.type !== who.type || target.author.id !== who.id) throw fail(403, 'You can only edit your own posts.');
    const message = text(b.body, 10000, true, 'Message');
    edit(x => { const p = b.postId ? x.replies.find(r => r.id === b.postId) : x; p.body = message; p.editedAt = now(); });
    return json(ctx.res, 200, { ok: true });
  }
  if (!manager) throw fail(403, 'Only moderators can do this.');
  const reasonNote = text(b.note || '', 300);
  if (action === 'moderate') {
    edit(x => {
      const target = b.postId ? x.replies.find(r => r.id === b.postId) : x;
      if (!target) throw fail(404, 'Post not found.');
      for (const flag of ['hidden', 'locked', 'pinned']) if (typeof b[flag] === 'boolean' && (flag === 'hidden' || !b.postId)) target[flag] = b[flag];
      if (b.clearReports) target.reports = [];
    });
    ctx.store.change(d => ctx.store.audit(d, ctx.staff.displayName, 'moderate ' + m.key, t.id + (b.postId ? '/' + b.postId : '') + ' ' + reasonNote));
    return json(ctx.res, 200, { ok: true });
  }
  if (action === 'delete') {
    ctx.store.change(d => { d.items[m.key] = d.items[m.key].filter(x => x.id !== t.id); ctx.store.audit(d, ctx.staff.displayName, 'delete thread', t.id + ' ' + reasonNote); });
    return json(ctx.res, 200, { ok: true });
  }
  throw fail(404, 'Not found.');
}
module.exports = { route };
