'use strict';
// HN Group Mail administration (admin.mail.hngroup.org.uk, the user's request, 6 November 2026). Signs in through HN
// Group Auth ("mail-admin" client). What each administrator can do comes from their staff portal permissions:
//   mail.view       usage, delivery failures, queue, logs, domain checks, audit log
//   mail.mailboxes  people's mailboxes, quotas, aliases and forwarding, provisioning retries
//   mail.groups     distribution groups
//   mail.shared     shared mailboxes, their members, access and send-as
//   mail.settings   queue actions, sending limits, spam scores, default quota
// The system owner and owner-level accounts have all of them. Every change is recorded in the audit log and applied to
// the mail server at once (lib/apply.js), where it is enforced. Staff records are turned into mailboxes every minute
// and whenever the staff portal says they changed (lib/sync.js).
// It also answers HN Mail (mail.hngroup.org.uk) over loopback with the service secret: which mailboxes an HN Group Auth
// account may open, their storage, and its mail app passwords.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createAuth } = require('./lib/auth'), { sessions } = require('./lib/sessions');
const { createDirectory } = require('./lib/directory'), { render } = require('./lib/render'), { createApplier } = require('./lib/apply');
const { createSync } = require('./lib/sync'), { createDnsCheck } = require('./lib/dns');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const fail = (status, message) => Object.assign(new Error(message), { status });
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function readJson(req, limit = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw fail(413, 'That request is too big.'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw fail(400, 'That request couldn’t be read.'); }
}
const loopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-real-ip'] && !req.headers['x-forwarded-for'];
function serviceAllowed(req) {
  if (!loopback(req)) return false;
  let key = ''; try { key = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch {}
  const given = String(req.headers.authorization || '').replace(/^Bearer /, '');
  return /^[a-f0-9]{64}$/.test(key) && given.length === key.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
}

function createServer({ dir = process.env.MAIL_ADMIN_DATA_DIR || '/var/lib/hn-mail-admin', fetcher = fetch, applier, syncEvery = 60000 } = {}) {
  const directory = createDirectory(dir);
  const store = sessions(path.join(dir, 'sessions'));
  const auth = createAuth(store);
  const apply = applier || createApplier();
  const dns = createDnsCheck();
  let usageCache = { at: 0, value: {} }, healthCache = { at: 0, value: null };
  const rendered = () => render(directory.data());
  const applyNow = async () => { const r = await apply.apply(rendered, () => Object.values(directory.data().mailboxes)); directory.save(); usageCache.at = 0; return r; };
  const sync = createSync({ directory, fetcher, onChange: () => applyNow() });
  async function usage(fresh) { if (fresh || Date.now() - usageCache.at > 60000) usageCache = { at: Date.now(), value: await apply.usage() }; return usageCache.value; }

  // Views (never app password hashes).
  function mailboxView(m, u) {
    const used = u && u[m.address];
    const d = directory.data();
    return { id: m.id, kind: m.kind, address: m.address, name: m.name, aliases: m.aliases || [], recordId: m.recordId || null, source: m.source, quotaMB: m.quotaMB,
      usedKB: used ? used.usedKB : null, messages: used ? used.messages : null, percent: used && m.quotaMB ? Math.round((used.usedKB / (m.quotaMB * 1024)) * 1000) / 10 : null,
      disabled: !!m.disabled, suspended: !!m.suspended, recordGone: !!m.recordGone, temporary: !!m.temporary, accounts: m.accounts || [], forwardTo: m.forwardTo || [], keepCopy: m.keepCopy !== false,
      members: m.kind === 'shared' ? (m.members || []).map((x) => ({ ...x, address: (d.mailboxes[x.mailbox] || {}).address || '(removed)', name: (d.mailboxes[x.mailbox] || {}).name || '' })) : undefined,
      appPasswords: m.kind === 'person' ? (m.appPasswords || []).map((p) => ({ id: p.id, label: p.label, createdAt: p.createdAt })) : undefined,
      memberOf: m.kind === 'person' ? Object.values(d.mailboxes).filter((s) => s.kind === 'shared' && (s.members || []).some((x) => x.mailbox === m.id)).map((s) => s.address) : undefined,
      createdAt: m.createdAt, updatedAt: m.updatedAt };
  }

  // Which mailboxes an HN Group Auth account may open in HN Mail: the mailboxes of its staff records (never other
  // people's), and the shared mailboxes those are members of, with the rights and send-as the directory gives.
  function accessFor(recordIds) {
    const d = directory.data(), ids = new Set((recordIds || []).filter((x) => typeof x === 'string'));
    const own = Object.values(d.mailboxes).filter((m) => m.kind === 'person' && m.recordId && ids.has(m.recordId));
    const usable = own.filter((m) => !m.disabled && !m.suspended);
    const sendAs = rendered().sendAs;
    const out = [];
    for (const m of usable) out.push({ id: m.id, kind: 'person', address: m.address, name: m.name, login: m.address, folderPrefix: '', access: 'full', sendAs: sendAs[m.address] ? sendAs[m.address].filter((a) => a === m.address || (m.aliases || []).includes(a)) : [m.address], quotaMB: m.quotaMB });
    for (const s of Object.values(d.mailboxes)) if (s.kind === 'shared' && !s.disabled) {
      const member = (s.members || []).find((x) => usable.some((m) => m.id === x.mailbox));
      if (!member) continue;
      const via = usable.find((m) => m.id === member.mailbox);
      out.push({ id: s.id, kind: 'shared', address: s.address, name: s.name, login: via.address, folderPrefix: 'Shared/' + s.address + '/', access: member.access, sendAs: member.sendAs ? [s.address, ...(s.aliases || [])] : [], quotaMB: s.quotaMB });
    }
    return { mailboxes: out, blocked: own.filter((m) => m.disabled || m.suspended).map((m) => ({ address: m.address, reason: m.disabled ? 'disabled' : 'suspended' })) };
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    for (const [k, v] of Object.entries({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' })) res.setHeader(k, v);
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    const page = (response, status, title, message, cookies = []) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookies });
      response.end('<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Mail admin · HN Group</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/admin.css?v=1"><script src="/assets/hn-theme.js"></script><body class="plain"><main class="wrap problem"><img class="on-light logo" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="140"><img class="on-dark logo" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="140"><p class="eyebrow">MAIL ADMIN</p><h1>' + escape(title) + '</h1><p class="lead">' + escape(message) + '</p>' + (status === 403 ? '' : '<p><a class="btn btn-primary" href="/auth/login">Sign in with HN Group Auth</a></p>') + '</main></body></html>');
    };
    let route = '';
    try {
      const url = new URL(req.url, 'http://localhost');
      route = url.pathname;
      if (route === '/healthz') return json(200, { ok: true, service: 'hn-mail-admin', apply: apply.status(), sync: sync.status() });
      if (route === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /\n'); }
      // The staff portal (same server) says staff records changed: sync now.
      if (route === '/_hooks/staff-changed' && req.method === 'POST') { if (!loopback(req)) return json(403, { error: 'Not allowed.' }); sync.run(null).catch(() => {}); return json(202, { ok: true }); }

      // ---- Service API for HN Mail (loopback + service secret) ----
      if (route.startsWith('/api/service/')) {
        if (!serviceAllowed(req)) return json(403, { error: 'Not allowed.' });
        const v = req.method === 'POST' ? await readJson(req) : {};
        const records = Array.isArray(v.recordIds) ? v.recordIds.slice(0, 20) : [];
        if (route === '/api/service/access' && req.method === 'POST') {
          const a = accessFor(records), u = await usage(false);
          a.mailboxes = a.mailboxes.map((m) => ({ ...m, usedKB: (u[m.address] || {}).usedKB ?? null }));
          return json(200, a);
        }
        if (route === '/api/service/usage' && req.method === 'POST') {
          const m = accessFor(records).mailboxes.find((x) => x.id === v.mailbox);
          if (!m) return json(404, { error: 'Unknown mailbox.' });
          const u = await apply.usageOf(m.address);
          return json(200, { address: m.address, quotaMB: m.quotaMB, usedKB: u ? u.usedKB : null, messages: u ? u.messages : null });
        }
        // Mail app passwords: only for a person's own mailbox (one of their staff records).
        const ownMailbox = () => { const m = Object.values(directory.data().mailboxes).find((x) => x.id === v.mailbox && x.kind === 'person' && records.includes(x.recordId) && !x.disabled && !x.suspended); if (!m) throw fail(404, 'That isn’t your mailbox.'); return m; };
        const actor = v.actor && typeof v.actor === 'object' ? { accountId: String(v.actor.accountId || ''), displayName: String(v.actor.displayName || ''), username: String(v.actor.username || '') } : null;
        if (route === '/api/service/app-passwords' && req.method === 'POST') {
          const m = ownMailbox();
          if (v.action === 'list') return json(200, { appPasswords: (m.appPasswords || []).map((p) => ({ id: p.id, label: p.label, createdAt: p.createdAt })) });
          if (v.action === 'create') { const created = directory.addAppPassword(actor, m.id, v.label); await applyNow(); return json(200, created); }
          if (v.action === 'revoke') { directory.removeAppPassword(actor, m.id, String(v.id || '')); await applyNow(); return json(200, { ok: true }); }
          return json(400, { error: 'Unknown action.' });
        }
        return json(404, { error: 'Not found.' });
      }

      if (await auth.handle(req, res, url, page)) return;
      if (route.startsWith('/assets/') && ['GET', 'HEAD'].includes(req.method)) {
        const target = path.resolve(PUBLIC, '.' + decodeURIComponent(route)), type = TYPES[path.extname(target)];
        if (!target.startsWith(PUBLIC + path.sep) || !type || !fs.existsSync(target) || !fs.statSync(target).isFile()) return json(404, { error: 'Not found.' });
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': /\.(js|css)$/.test(target) ? 'no-cache' : 'public, max-age=3600' });
        if (req.method === 'HEAD') return res.end(); return fs.createReadStream(target).pipe(res);
      }
      if (route === '/signed-out') return page(res, 200, 'You’ve signed out.', 'Sign in again whenever you need to manage HN Group mail.');
      let active;
      try { active = await auth.current(req); } catch (e) { if (e.status === 403) return route.startsWith('/api/') ? json(403, { error: e.message }) : page(res, 403, 'No mail permission', e.message); throw e; }
      if (!active) { if (route.startsWith('/api/')) return json(401, { error: 'Please sign in again.', code: 'signin' }); res.writeHead(302, { Location: '/auth/login' }); return res.end(); }
      const user = active.user, can = (p) => user.owner || user.permissions.includes(p), need = (...ps) => { if (!ps.some(can)) throw fail(403, 'You don’t have permission to do that.'); };
      if (route === '/' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(PUBLIC, 'index.html'))); }
      if (!route.startsWith('/api/')) return page(res, 404, 'Nothing here.', 'That page isn’t part of mail administration.');
      if (route === '/api/avatar') {
        const pic = await auth.ownPicture(active.authSession);
        if (!pic) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return fs.createReadStream(path.join(PUBLIC, 'assets', 'avatar.svg')).pipe(res); }
        res.writeHead(200, { 'Content-Type': pic.type, 'Cache-Control': 'private, max-age=600' }); return res.end(pic.bytes);
      }
      const d = directory.data();
      let m;
      if (route === '/api/state' && req.method === 'GET') {
        const u = await usage(false), boxes = Object.values(d.mailboxes);
        const totalKB = boxes.reduce((n, b) => n + ((u[b.address] || {}).usedKB || 0), 0);
        return json(200, { me: { displayName: user.displayName, username: user.username, owner: user.owner, permissions: user.permissions }, domains: d.domains, settings: d.settings,
          counts: { people: boxes.filter((b) => b.kind === 'person').length, shared: boxes.filter((b) => b.kind === 'shared').length, groups: Object.keys(d.groups).length, aliases: Object.keys(d.aliases).length,
            disabled: boxes.filter((b) => b.disabled || b.suspended).length, nearlyFull: boxes.filter((b) => ((u[b.address] || {}).usedKB || 0) >= b.quotaMB * 1024 * 0.9).length,
            provisioningErrors: Object.values(d.provisioning).filter((p) => p.status === 'error').length, pendingGroups: Object.values(d.groups).filter((g) => g.pendingImport).length, totalKB },
          apply: apply.status(), sync: sync.status(), problems: rendered().problems });
      }
      // ---- mailboxes ----
      if (route === '/api/mailboxes' && req.method === 'GET') { need('mail.view', 'mail.mailboxes', 'mail.shared'); const u = await usage(url.searchParams.get('fresh') === '1'); return json(200, { mailboxes: Object.values(d.mailboxes).sort((a, b) => a.address.localeCompare(b.address)).map((x) => mailboxView(x, u)) }); }
      if (route === '/api/mailboxes' && req.method === 'POST') {
        const v = await readJson(req); need(v.kind === 'shared' ? 'mail.shared' : 'mail.mailboxes');
        const created = directory.createMailbox(user, v); await applyNow(); return json(201, { mailbox: mailboxView(created, await usage(true)) });
      }
      if ((m = /^\/api\/mailboxes\/([a-f0-9]{16})$/.exec(route))) {
        const box = directory.mailbox(m[1]);
        if (req.method === 'PATCH') { const v = await readJson(req); need(box.kind === 'shared' ? 'mail.shared' : 'mail.mailboxes'); if (v.quotaMB !== undefined) need('mail.mailboxes', 'mail.shared'); directory.updateMailbox(user, box.id, { name: v.name, address: v.address, aliases: v.aliases, quotaMB: v.quotaMB, disabled: v.disabled, forwardTo: v.forwardTo, keepCopy: v.keepCopy }); await applyNow(); return json(200, { mailbox: mailboxView(box, await usage(true)) }); }
        if (req.method === 'DELETE') { need(box.kind === 'shared' ? 'mail.shared' : 'mail.mailboxes'); const u = await apply.usageOf(box.address); directory.removeMailbox(user, box.id, { usageKB: u ? u.usedKB : null }); await applyNow(); return json(200, { ok: true }); }
      }
      if ((m = /^\/api\/mailboxes\/([a-f0-9]{16})\/members$/.exec(route)) && req.method === 'PUT') { need('mail.shared'); const v = await readJson(req); const box = directory.setMembers(user, m[1], v.members); await applyNow(); return json(200, { mailbox: mailboxView(box, await usage(false)) }); }
      if ((m = /^\/api\/mailboxes\/([a-f0-9]{16})\/app-passwords\/([a-f0-9]{16})$/.exec(route)) && req.method === 'DELETE') { need('mail.mailboxes'); directory.removeAppPassword(user, m[1], m[2]); await applyNow(); return json(200, { ok: true }); }
      // ---- aliases and forwarders ----
      if (route === '/api/aliases' && req.method === 'GET') { need('mail.view', 'mail.mailboxes'); return json(200, { aliases: Object.values(d.aliases).sort((a, b) => a.address.localeCompare(b.address)) }); }
      if (route === '/api/aliases' && req.method === 'POST') { need('mail.mailboxes'); const a = directory.saveAlias(user, null, await readJson(req)); await applyNow(); return json(201, { alias: a }); }
      if ((m = /^\/api\/aliases\/([a-f0-9]{16})$/.exec(route))) {
        need('mail.mailboxes');
        if (req.method === 'PATCH') { const a = directory.saveAlias(user, m[1], await readJson(req)); await applyNow(); return json(200, { alias: a }); }
        if (req.method === 'DELETE') { directory.removeAlias(user, m[1]); await applyNow(); return json(200, { ok: true }); }
      }
      // ---- distribution groups ----
      if (route === '/api/groups' && req.method === 'GET') { need('mail.view', 'mail.groups'); const r = rendered(); return json(200, { groups: Object.values(d.groups).sort((a, b) => a.name.localeCompare(b.name)).map((g) => ({ ...g, delivers: ((r.files['postfix/aliases'].split('\n').find((l) => l.startsWith(g.address + ' ')) || '').split(' ')[1] || '').split(',').filter(Boolean) })) }); }
      if (route === '/api/groups' && req.method === 'POST') { need('mail.groups'); const g = directory.saveGroup(user, null, await readJson(req)); await applyNow(); return json(201, { group: g }); }
      if ((m = /^\/api\/groups\/([a-f0-9]{16})$/.exec(route))) {
        need('mail.groups');
        if (req.method === 'PATCH') { const g = directory.saveGroup(user, m[1], await readJson(req)); await applyNow(); return json(200, { group: g }); }
        if (req.method === 'DELETE') { directory.removeGroup(user, m[1]); await applyNow(); return json(200, { ok: true }); }
      }
      // ---- staff provisioning ----
      if (route === '/api/provisioning' && req.method === 'GET') { need('mail.view', 'mail.mailboxes'); return json(200, { sync: sync.status(), records: Object.entries(d.provisioning).map(([id, p]) => ({ recordId: id, ...p })).sort((a, b) => ({ error: 0, warning: 1, ok: 2, skipped: 3 }[a.status] - { error: 0, warning: 1, ok: 2, skipped: 3 }[b.status]) || String(a.name).localeCompare(String(b.name))) }); }
      if (route === '/api/provisioning/run' && req.method === 'POST') { need('mail.mailboxes'); return json(200, { sync: await sync.run(user) }); }
      if ((m = /^\/api\/provisioning\/([a-f0-9]{8,32})\/retry$/.exec(route)) && req.method === 'POST') { need('mail.mailboxes'); await sync.run(user, m[1]); return json(200, { record: d.provisioning[m[1]] || null }); }
      if (route === '/api/apply' && req.method === 'POST') { need('mail.settings', 'mail.mailboxes'); directory.audit(user, 'apply', 'mail server', {}); return json(200, { apply: await applyNow() }); }
      // ---- service: queue, failures, logs, health, domains ----
      if (route === '/api/queue' && req.method === 'GET') { need('mail.view', 'mail.settings'); return json(200, await apply.queue()); }
      if ((m = /^\/api\/queue\/(flush|[A-Za-z0-9]{6,20})(?:\/(retry|hold|release|delete))?$/.exec(route)) && req.method === 'POST') {
        need('mail.settings'); const action = m[1] === 'flush' ? 'flush' : m[2]; if (!action) throw fail(400, 'Unknown action.');
        await apply.queueAction(action, m[1]); directory.audit(user, 'queue.' + action, m[1], {}); return json(200, { ok: true });
      }
      if (route === '/api/failures' && req.method === 'GET') { need('mail.view'); return json(200, { lines: await apply.failures() }); }
      if (route === '/api/logs' && req.method === 'GET') { need('mail.view'); return json(200, { lines: await apply.logs({ lines: 400, filter: String(url.searchParams.get('q') || '').slice(0, 100) }) }); }
      if (route === '/api/health' && req.method === 'GET') { need('mail.view'); if (!healthCache.value || Date.now() - healthCache.at > 60000 || url.searchParams.get('fresh') === '1') healthCache = { at: Date.now(), value: await apply.health() }; return json(200, healthCache.value); }
      if (route === '/api/domains' && req.method === 'GET') { need('mail.view'); return json(200, await dns.all(d.domains, { fresh: url.searchParams.get('fresh') === '1' })); }
      if (route === '/api/audit' && req.method === 'GET') { need('mail.view'); return json(200, { entries: directory.readAudit(400) }); }
      if (route === '/api/settings' && req.method === 'PATCH') { need('mail.settings'); const s = directory.setSettings(user, await readJson(req)); await applyNow(); return json(200, { settings: s }); }
      return json(404, { error: 'Not found.' });
    } catch (e) {
      if (res.headersSent) return res.destroy();
      const status = e.status || 500;
      if (!e.status) console.error(e);
      if (route.startsWith('/api/')) return json(status, { error: e.status ? e.message : 'Something went wrong. Please try again.' });
      page(res, status, 'Unavailable', e.status ? e.message : 'Please try again shortly.');
    }
  });
  // Staff records are checked every minute; the mail server is brought in line at start.
  let timer = null;
  server.on('listening', () => { applyNow().catch(() => {}); sync.run(null).catch(() => {}); if (syncEvery) timer = setInterval(() => sync.run(null).catch(() => {}), syncEvery); });
  server.on('close', () => clearInterval(timer));
  server.directory = directory; server.sync = sync; server.accessFor = accessFor;
  return server;
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 5670), '127.0.0.1');
module.exports = { createServer };
