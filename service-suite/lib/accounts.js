'use strict';
// Customer, member and community accounts for one website. They are never staff identities: they
// cannot reach staff pages, and staff permissions come only from HN Group Auth.
const crypto = require('node:crypto');
const { fail, id, token, hash, now, json, body, text, email, cookie, setCookie, rate } = require('./http');
const { isManager, sameOrigin } = require('./access');

const sessions = new Map();
const cookieName = config => `__Host-hn_${config.id}_account`;

function scrypt(value, salt) { return crypto.scryptSync(value, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex'); }
function newPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw fail(400, 'Use a password between 12 and 128 characters.');
  const salt = token();
  return { salt, password: scrypt(value, salt) };
}
const safe = a => ({ id: a.id, name: a.name, email: a.email, member: !!a.member, disabled: !!a.disabled, invited: !a.password, createdAt: a.createdAt, lastLogin: a.lastLogin || null });
const publicName = a => ({ id: a.id, name: a.name });

function current(ctx) {
  const raw = cookie(ctx.req, cookieName(ctx.config));
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const s = sessions.get(hash(raw));
  if (!s || s.expires < Date.now() || s.site !== ctx.config.id) { sessions.delete(hash(raw)); return null; }
  const account = ctx.store.data.accounts.find(a => a.id === s.id && !a.disabled && a.password);
  if (!account) { sessions.delete(hash(raw)); return null; }
  return account;
}
function startSession(ctx, account) {
  for (const [k, s] of sessions) if (s.expires < Date.now()) sessions.delete(k);
  if (sessions.size > 20000) throw fail(503, 'Please try again shortly.');
  const raw = token();
  sessions.set(hash(raw), { id: account.id, site: ctx.config.id, expires: Date.now() + 8 * 3600000 });
  return setCookie(cookieName(ctx.config), raw, 28800);
}
function endSessions(accountId) { for (const [k, s] of sessions) if (s.id === accountId) sessions.delete(k); }

function issueInvite(ctx, { name, email: address, member = false }) {
  address = email(address); name = text(name, 120, true, 'Name');
  const raw = token();
  ctx.store.change(d => {
    let a = d.accounts.find(x => x.email === address);
    if (!a) { a = { id: id(), email: address, name, createdAt: now() }; d.accounts.push(a); }
    delete a.password; delete a.salt;
    Object.assign(a, { name, invite: hash(raw), inviteExpires: Date.now() + 7 * 86400000, disabled: false, member: a.member || member });
    ctx.store.audit(d, ctx.staff?.displayName, 'invite account', a.id);
  });
  endSessions(ctx.store.data.accounts.find(a => a.email === address).id);
  return 'https://' + ctx.config.domain + '/#/account/activate/' + raw;
}

async function route(ctx, parts) {
  const cfg = ctx.config.accounts;
  if (!cfg) throw fail(404, 'Not found.');
  const action = parts[0] || '';
  if (action === 'me' && ctx.method === 'GET') return json(ctx.res, 200, { account: ctx.account ? safe(ctx.account) : null, mode: cfg.mode });
  const manage = { manage: cfg.manage || 'admin' };
  if (action === 'list' && ctx.method === 'GET') {
    if (!isManager(ctx, manage)) throw fail(ctx.staff ? 403 : 401, 'Only administrators can manage accounts.');
    return json(ctx.res, 200, { accounts: ctx.store.data.accounts.map(safe) });
  }
  if (ctx.method !== 'POST') throw fail(405, 'Method not allowed.');
  sameOrigin(ctx);
  if (action === 'register') {
    if (cfg.mode !== 'register') throw fail(403, 'Accounts are by invitation only.');
    rate(ctx.req, 'register', 5);
    const b = await body(ctx.req);
    if (b.website) throw fail(400, 'Unable to create this account.');
    const address = email(b.email), name = text(b.name, 60, true, 'Display name');
    if (!/^[\p{L}\p{N} ._'-]{2,60}$/u.test(name)) throw fail(400, 'Use letters, numbers, spaces, dots, apostrophes or hyphens for your display name.');
    if (b.terms !== true) throw fail(400, 'Please accept the community guidelines.');
    const fields = newPassword(b.password);
    if (ctx.store.data.accounts.some(a => a.email === address)) throw fail(400, 'An account already uses this email. Sign in instead.');
    if (ctx.store.data.accounts.some(a => a.name.toLowerCase() === name.toLowerCase())) throw fail(400, 'That display name is taken.');
    const account = { id: id(), email: address, name, createdAt: now(), ...fields, lastLogin: now() };
    ctx.store.change(d => { d.accounts.push(account); ctx.store.audit(d, name, 'register account', account.id); });
    return json(ctx.res, 201, { account: safe(account) }, [startSession(ctx, account)]);
  }
  if (action === 'login') {
    rate(ctx.req, 'login', 10);
    const b = await body(ctx.req);
    const address = email(b.email);
    const account = ctx.store.data.accounts.find(a => a.email === address && !a.disabled);
    const guess = scrypt(String(b.password || '').slice(0, 128), account?.salt || 'no-such-account');
    if (!account?.password || !crypto.timingSafeEqual(Buffer.from(guess, 'hex'), Buffer.from(account.password, 'hex'))) throw fail(401, 'Email or password is incorrect.');
    ctx.store.change(d => { d.accounts.find(a => a.id === account.id).lastLogin = now(); });
    return json(ctx.res, 200, { account: safe(account) }, [startSession(ctx, account)]);
  }
  if (action === 'activate') {
    rate(ctx.req, 'activate', 10);
    const b = await body(ctx.req);
    if (!/^[a-f0-9]{64}$/.test(b.invite || '')) throw fail(400, 'This invitation is invalid or has expired.');
    const account = ctx.store.data.accounts.find(a => a.invite === hash(b.invite) && a.inviteExpires > Date.now() && !a.disabled);
    if (!account) throw fail(400, 'This invitation is invalid or has expired.');
    const fields = newPassword(b.password);
    ctx.store.change(d => { const a = d.accounts.find(x => x.id === account.id); Object.assign(a, fields, { lastLogin: now() }); delete a.invite; delete a.inviteExpires; ctx.store.audit(d, a.name, 'activate account', a.id); });
    return json(ctx.res, 200, { account: safe(account) }, [startSession(ctx, ctx.store.data.accounts.find(a => a.id === account.id))]);
  }
  if (action === 'logout') {
    sessions.delete(hash(cookie(ctx.req, cookieName(ctx.config))));
    return json(ctx.res, 200, { ok: true }, [setCookie(cookieName(ctx.config), '', 0)]);
  }
  if (action === 'password') {
    if (!ctx.account) throw fail(401, 'Sign in to your account.');
    const b = await body(ctx.req);
    const guess = scrypt(String(b.current || '').slice(0, 128), ctx.account.salt);
    if (!crypto.timingSafeEqual(Buffer.from(guess, 'hex'), Buffer.from(ctx.account.password, 'hex'))) throw fail(400, 'Your current password is incorrect.');
    const fields = newPassword(b.password);
    ctx.store.change(d => Object.assign(d.accounts.find(a => a.id === ctx.account.id), fields));
    endSessions(ctx.account.id);
    return json(ctx.res, 200, { ok: true }, [startSession(ctx, ctx.store.data.accounts.find(a => a.id === ctx.account.id))]);
  }
  // Management by staff (HN Group Auth): list, invite, member flag, disable/enable.
  if (!isManager(ctx, manage)) throw fail(ctx.staff ? 403 : 401, 'Only administrators can manage accounts.');
  const b = await body(ctx.req);
  if (action === 'invite') return json(ctx.res, 200, { invite: issueInvite(ctx, { name: b.name, email: b.email, member: b.member === true }), expires: '7 days' });
  const account = ctx.store.data.accounts.find(a => a.id === b.id);
  if (!account) throw fail(404, 'Account not found.');
  if (action === 'disable' || action === 'enable') {
    ctx.store.change(d => { const a = d.accounts.find(x => x.id === account.id); a.disabled = action === 'disable'; if (a.disabled) { delete a.invite; delete a.inviteExpires; } ctx.store.audit(d, ctx.staff.displayName, action + ' account', a.id); });
    endSessions(account.id);
    return json(ctx.res, 200, { ok: true });
  }
  if (action === 'member') {
    ctx.store.change(d => { d.accounts.find(x => x.id === account.id).member = b.member === true; ctx.store.audit(d, ctx.staff.displayName, 'membership ' + (b.member ? 'granted' : 'removed'), account.id); });
    return json(ctx.res, 200, { ok: true });
  }
  throw fail(404, 'Not found.');
}
module.exports = { route, current, issueInvite, publicName, safe };
