'use strict';
// Staff-portal synchronised modules. Records stay in the staff portal (one source of truth), so both
// the portal and this website always show the same data. Requests run as the signed-in person; the
// portal applies its own permission rules, and Auth plus the portal each enforce a route allowlist.
const { fail, json, body } = require('./http');
const { requireStaff, sameOrigin } = require('./access');
const ID = /^[a-f0-9]{16}$/;

function fill(template, itemId) {
  if (!template.includes('{id}')) return template;
  if (!ID.test(itemId || '')) throw fail(400, 'Choose a valid record.');
  return template.replace('{id}', itemId);
}
function query(m, url) {
  const params = new URLSearchParams();
  for (const q of m.load?.query || []) {
    const value = url.searchParams.get(q.name);
    if (value === null || value === '') continue;
    const ok = q.type === 'month' ? /^\d{4}-\d{2}$/.test(value) : q.type === 'date' ? /^\d{4}-\d{2}-\d{2}$/.test(value) : q.type === 'id' ? ID.test(value) : /^[\w .-]{1,60}$/.test(value);
    if (!ok) throw fail(400, 'Invalid ' + (q.label || q.name) + '.');
    params.set(q.name, value);
  }
  const s = params.toString();
  return s ? '?' + s : '';
}
function cleanValues(fields, raw, passthrough) {
  if (passthrough) return raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const f of fields || []) {
    const v = raw?.[f.name];
    if (v === undefined) continue;
    if (['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => ['string', 'number'].includes(typeof x)))) out[f.name] = typeof v === 'string' ? v.slice(0, f.max || 5000) : v;
  }
  for (const [k, v] of Object.entries((fields || []).reduce((a, f) => (f.fixed !== undefined ? { ...a, [f.name]: f.fixed } : a), {}))) out[k] = v;
  return out;
}
async function relay(ctx, response) {
  const type = response.headers.get('content-type') || 'application/json';
  if (type.startsWith('application/json')) {
    let value = {}; try { value = await response.json(); } catch {}
    if (response.status === 401) value = { error: 'Your staff session has ended. Please sign in again.' };
    return json(ctx.res, response.status, value);
  }
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" };
  const disposition = response.headers.get('content-disposition');
  if (disposition) headers['Content-Disposition'] = disposition.replace(/^inline/, 'attachment');
  ctx.res.writeHead(response.status, headers);
  ctx.res.end(Buffer.from(await response.arrayBuffer()));
}

async function route(ctx, m, parts) {
  requireStaff(ctx);
  const url = new URL(ctx.req.url, 'https://' + ctx.config.domain);
  if (!parts.length && ctx.method === 'GET') return relay(ctx, await ctx.auth.bridge(ctx.req, 'GET', m.load.path + query(m, url)));
  if (parts[0] === 'download' && ctx.method === 'GET') {
    const v = (m.views || []).find(x => x.id === parts[1]);
    if (!v?.download) throw fail(404, 'Not found.');
    return relay(ctx, await ctx.auth.bridge(ctx.req, 'GET', fill(v.download.path, url.searchParams.get('id')) + '?download'));
  }
  if (ctx.method !== 'POST') throw fail(405, 'Method not allowed.');
  sameOrigin(ctx);
  const b = await body(ctx.req, 30 * 1024 * 1024);
  if (parts[0] === 'form') {
    const f = (m.forms || []).find(x => x.id === parts[1]);
    if (!f) throw fail(404, 'Not found.');
    const values = cleanValues(f.fields, b.values, f.passthrough);
    const path = fill(f.path, b.id);
    if (f.upload) {
      let data = '';
      if (b.file?.data) {
        if (typeof b.file.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.file.data)) throw fail(400, 'Choose a valid file.');
        data = b.file.data;
        values.fileName = String(b.file.name || 'file').slice(0, 180);
      } else if (f.upload.required) throw fail(400, 'Choose a file to upload.');
      return relay(ctx, await ctx.auth.bridge(ctx.req, 'POST', path, { upload: { header: f.upload.header, meta: values, data } }));
    }
    return relay(ctx, await ctx.auth.bridge(ctx.req, 'POST', path, { json: values }));
  }
  if (parts[0] === 'action') {
    const v = (m.views || []).find(x => x.id === parts[1]);
    const a = v?.actions?.find(x => x.id === parts[2]);
    if (!a) throw fail(404, 'Not found.');
    return relay(ctx, await ctx.auth.bridge(ctx.req, 'POST', fill(a.path, b.id), { json: cleanValues(a.fields, b.values, a.passthrough) }));
  }
  throw fail(404, 'Not found.');
}
module.exports = { route };
