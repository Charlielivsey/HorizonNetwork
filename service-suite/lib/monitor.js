'use strict';
// Real checks only: public status components are fetched over HTTP(S) every minute, and the private
// health view polls the loopback /healthz of each HN Group website process on this server.
const { fail, id, now, json, body, text } = require('./http');
const { isManager, requireStaff, sameOrigin } = require('./access');
const STATES = ['operational', 'degraded', 'outage', 'maintenance'];
const INCIDENT = ['investigating', 'identified', 'monitoring', 'resolved', 'scheduled'];
const runtime = new Map(); // component id -> recent checks (also saved periodically)
let lastPersist = 0;

async function probe(url, timeout = 10000) {
  const started = Date.now();
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'HN-Group-Status/1.0' } });
    await response.arrayBuffer().catch(() => {});
    return { ok: response.status < 400, code: response.status, ms: Date.now() - started, at: now() };
  } catch { return { ok: false, code: 0, ms: Date.now() - started, at: now() }; }
}

function startStatus(store, m) {
  const saved = store.data.meta['checks:' + m.key] || {};
  for (const [k, v] of Object.entries(saved)) runtime.set(k, v);
  const tick = async () => {
    for (const c of store.list(m.key)) {
      if (!c.url) continue;
      const result = await probe(c.url);
      const list = runtime.get(c.id) || [];
      list.push(result); if (list.length > 1440) list.splice(0, list.length - 1440);
      runtime.set(c.id, list);
    }
    if (Date.now() - lastPersist > 300000) {
      lastPersist = Date.now();
      const keep = Object.fromEntries(store.list(m.key).map(c => [c.id, (runtime.get(c.id) || []).slice(-1440)]));
      store.change(d => { d.meta['checks:' + m.key] = keep; });
    }
  };
  setTimeout(tick, 2000).unref();
  setInterval(tick, 60000).unref();
}

function stateOf(c, incidents) {
  if (c.override && c.override !== 'auto') return c.override;
  if (incidents.some(i => i.status !== 'resolved' && i.status !== 'scheduled' && i.componentIds.includes(c.id) && i.impact === 'outage')) return 'outage';
  const checks = runtime.get(c.id) || [];
  if (!c.url) return 'operational';
  if (!checks.length) return 'unknown';
  const last = checks.slice(-2);
  if (last.every(x => !x.ok)) return 'outage';
  if (!last[last.length - 1].ok || last[last.length - 1].ms > 4000) return 'degraded';
  return 'operational';
}

function statusRoute(ctx, m, parts) {
  const components = ctx.store.list(m.key), incidents = ctx.store.list(m.key + ':incidents');
  const manager = isManager(ctx, m);
  if (!parts.length && ctx.method === 'GET') {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    return json(ctx.res, 200, {
      manager,
      components: components.map(c => {
        const checks = runtime.get(c.id) || [];
        const day = checks.filter(x => x.at > new Date(Date.now() - 86400000).toISOString());
        return { id: c.id, name: c.name, group: c.group || '', state: stateOf(c, incidents), override: manager ? c.override || 'auto' : undefined, url: manager ? c.url : undefined, monitored: !!c.url, uptime24h: day.length ? Math.round(day.filter(x => x.ok).length / day.length * 10000) / 100 : null, lastChecked: checks.at(-1)?.at || null, recent: checks.slice(-60).map(x => x.ok ? 1 : 0) };
      }),
      incidents: incidents.filter(i => manager || i.status !== 'resolved' || (i.resolvedAt || '') > since).map(i => ({ ...i, updates: i.updates.map(({ by, ...u }) => manager ? { by, ...u } : u) }))
    });
  }
  return manage(ctx, m, parts, components, incidents);
}

async function manage(ctx, m, parts) {
  if (ctx.method !== 'POST') throw fail(405, 'Method not allowed.');
  sameOrigin(ctx);
  if (!isManager(ctx, m)) throw fail(403, 'Only status managers can change this.');
  const b = await body(ctx.req);
  const who = ctx.staff.displayName;
  if (parts[0] === 'component') {
    const url = text(b.url || '', 500);
    if (url) { let u; try { u = new URL(url); } catch { throw fail(400, 'Enter a full https:// address.'); } if (!['https:', 'http:'].includes(u.protocol)) throw fail(400, 'Only http and https addresses can be checked.'); }
    const override = ['auto', ...STATES].includes(b.override) ? b.override : 'auto';
    const component = { id: b.id || id(), name: text(b.name, 80, true, 'Name'), group: text(b.group || '', 60), url, override };
    if (b.id && !ctx.store.list(m.key).some(c => c.id === b.id)) throw fail(404, 'Component not found.');
    if (!b.id && ctx.store.list(m.key).length >= 50) throw fail(400, 'Up to 50 components can be monitored.');
    ctx.store.change(d => { const list = d.items[m.key] ||= []; const i = list.findIndex(c => c.id === component.id); if (i >= 0) list[i] = component; else list.push(component); ctx.store.audit(d, who, 'save component', component.id); });
    return json(ctx.res, 200, { ok: true });
  }
  if (parts[0] === 'delete-component') {
    ctx.store.change(d => { d.items[m.key] = (d.items[m.key] || []).filter(c => c.id !== b.id); ctx.store.audit(d, who, 'delete component', String(b.id).slice(0, 24)); });
    runtime.delete(b.id);
    return json(ctx.res, 200, { ok: true });
  }
  if (parts[0] === 'incident') {
    const status = INCIDENT.includes(b.status) ? b.status : 'investigating';
    const ids = (Array.isArray(b.componentIds) ? b.componentIds : []).filter(x => ctx.store.list(m.key).some(c => c.id === x));
    const message = text(b.message, 3000, true, 'Update message');
    const existing = b.id ? ctx.store.list(m.key + ':incidents').find(i => i.id === b.id) : null;
    if (b.id && !existing) throw fail(404, 'Incident not found.');
    ctx.store.change(d => {
      const list = d.items[m.key + ':incidents'] ||= [];
      let i = list.find(x => x.id === b.id);
      if (!i) { i = { id: id(), createdAt: now(), updates: [] }; list.unshift(i); }
      Object.assign(i, { title: text(b.title, 160, true, 'Title'), status, impact: ['outage', 'degraded', 'maintenance', 'none'].includes(b.impact) ? b.impact : 'degraded', componentIds: ids });
      if (status === 'resolved' && !i.resolvedAt) i.resolvedAt = now();
      if (status !== 'resolved') delete i.resolvedAt;
      i.updates.push({ at: now(), status, message, by: who });
      ctx.store.audit(d, who, 'incident ' + status, i.id);
    });
    return json(ctx.res, 200, { ok: true });
  }
  if (parts[0] === 'delete-incident') {
    ctx.store.change(d => { d.items[m.key + ':incidents'] = (d.items[m.key + ':incidents'] || []).filter(i => i.id !== b.id); ctx.store.audit(d, who, 'delete incident', String(b.id).slice(0, 24)); });
    return json(ctx.res, 200, { ok: true });
  }
  throw fail(404, 'Not found.');
}

// Private: loopback health of each HN Group website process (no public exposure).
const health = new Map();
function startHealth(m) {
  const tick = async () => { for (const t of m.targets || []) health.set(t.id, await probe(`http://127.0.0.1:${t.port}/healthz`, 4000)); };
  setTimeout(tick, 3000).unref();
  setInterval(tick, 60000).unref();
}
function healthRoute(ctx, m) {
  requireStaff(ctx);
  if (ctx.method !== 'GET') throw fail(405, 'Method not allowed.');
  return json(ctx.res, 200, { targets: (m.targets || []).map(t => ({ id: t.id, name: t.name, domain: t.domain, company: t.company, ...(health.get(t.id) || { ok: null }) })) });
}
module.exports = { startStatus, statusRoute, startHealth, healthRoute };
