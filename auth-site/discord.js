'use strict';
// "Continue with Discord" for HN Group Auth (the user's request, 28 October 2026), alongside Sign in with Google.
// Optional for each sign-in account: once someone has connected their Discord account (signed in here with their
// password and PIN, then "Connect" under Discord), Continue with Discord signs them straight in, with no password
// and no PIN, and never makes the browser remember the account (the same as Google).
//
// Discord is only used to confirm who someone is: the authorization-code flow with a state bound to this browser by
// a cookie, and the user from Discord's API with the access token we get straight back (scope "identify"). The staff
// account service links the Discord account (its permanent id) to the sign-in account and keeps the Discord username
// and id on the staff record. HN Group Auth's Discord bot then looks those ids (and the ids on staff records) up every 30 minutes so the stored
// usernames stay current.
//
// Set-up (owner): /var/lib/hn-auth/discord.json (root only) with {"client_id","client_secret","bot_token"}: the
// application's OAuth2 client id and secret, and the bot's token, from the Discord Developer Portal; the redirect
// https://auth.hngroup.org.uk/discord/callback must be added under OAuth2 → Redirects. It's read when needed, so no
// restart. Without client_id/client_secret the option is hidden; the bot only needs bot_token.
const fs = require('node:fs');
const { startPresence } = require('./discord-gateway');
const path = require('node:path');

const DISCORD_API = 'https://discord.com/api/v10';
const AUTHORIZE = 'https://discord.com/oauth2/authorize';
const TOKEN = DISCORD_API + '/oauth2/token';
const BINDING = '__Host-hn_auth_discord', TICKET = '__Host-hn_auth_discord_result';
const ID = /^\d{15,22}$/;

function createDiscord({ origin, staff, send, profile, entryFor, setCookie, cookie, finishLogin, destination, random, hash, fail, fetcher = fetch,
  file = process.env.DISCORD_OAUTH_FILE || path.join(process.env.DATA_DIR || '/var/lib/hn-auth', 'discord.json'), refreshEvery = 30 * 60000 }) {
  const REDIRECT = origin + '/discord/callback';
  const pending = new Map(), results = new Map();
  setInterval(() => { for (const map of [pending, results]) for (const [k, v] of map) if (v.expires <= Date.now()) map.delete(k); }, 60000).unref();
  let cached = null;
  // The Discord application settings, or null when nothing is set up.
  function config() {
    let stat; try { stat = fs.statSync(file); } catch { return null; }
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.value;
    let value = null;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const id = String(raw.client_id || '').trim(), secret = String(raw.client_secret || '').trim(), bot = String(raw.bot_token || '').trim();
      value = { id: ID.test(id) ? id : null, secret: secret.length >= 8 ? secret : null, bot: bot.length >= 50 ? bot : null };
    } catch {}
    cached = { mtimeMs: stat.mtimeMs, value };
    return value;
  }
  const client = () => { const c = config(); return c && c.id && c.secret ? c : null; };
  function safeNext(next) {
    if (typeof next !== 'string' || next.length > 4096 || !next.startsWith('/') || next.startsWith('//')) return '/';
    if (next === '/' || /^\/\?[^#]*$/.test(next)) return '/';
    try { const url = new URL(next, origin); if (url.origin === origin && url.pathname === '/authorize' && destination(url)) return url.pathname + url.search; } catch {}
    return '/';
  }
  const back = (next) => next + (next.includes('?') ? '&' : '?') + 'discord=1';
  function finish(res, next, result) {
    const token = random(); results.set(hash(token), { ...result, expires: Date.now() + 5 * 60000 });
    res.writeHead(302, { Location: back(next), 'Cache-Control': 'no-store', 'Set-Cookie': [setCookie(BINDING, '', 0), setCookie(TICKET, token, 300)] });
    res.end();
  }
  // The parts of a Discord user kept on staff profiles: username, display name, picture, banner, colour and badges.
  const profileOf = (u) => ({ id: String(u.id), username: String(u.username).slice(0, 64), globalName: typeof u.global_name === 'string' ? u.global_name.slice(0, 64) : null,
    avatar: typeof u.avatar === 'string' ? u.avatar : null, banner: typeof u.banner === 'string' ? u.banner : null,
    accentColor: Number.isInteger(u.accent_color) ? u.accent_color : null, publicFlags: Number.isInteger(u.public_flags) ? u.public_flags : 0 });
  // Who signed in, from Discord.
  async function identity(code, c) {
    let response;
    try {
      response = await fetcher(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, grant_type: 'authorization_code', code, redirect_uri: REDIRECT }).toString(),
        signal: AbortSignal.timeout(10000), redirect: 'error' });
    } catch { throw fail(503, 'Discord couldn’t be reached. Please try again.'); }
    const token = await response.json().catch(() => ({}));
    if (!response.ok || typeof token.access_token !== 'string') throw fail(401, 'Discord didn’t confirm the sign-in. Please try again.');
    let me;
    try {
      const r = await fetcher(DISCORD_API + '/users/@me', { headers: { Authorization: 'Bearer ' + token.access_token, Accept: 'application/json' }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      me = r.ok ? await r.json() : null;
    } catch { me = null; }
    if (!me || !ID.test(String(me.id || '')) || typeof me.username !== 'string') throw fail(401, 'Discord’s answer didn’t check out, so you weren’t signed in.');
    return profileOf(me);
  }

  // The bot: looks up every connected Discord account and stores any changed username.
  let refreshing = false;
  async function refreshNames() {
    const c = config();
    if (!c || !c.bot || refreshing) return 0;
    refreshing = true;
    try {
      const { value } = await staff('/api/auth/discord-accounts', {});
      const updates = [];
      for (const id of (value.ids || []).filter((x) => ID.test(x))) {
        let r;
        try { r = await fetcher(DISCORD_API + '/users/' + id, { headers: { Authorization: 'Bot ' + c.bot, Accept: 'application/json' }, signal: AbortSignal.timeout(10000), redirect: 'error' }); } catch { continue; }
        if (r.status === 429) { const wait = Number((await r.json().catch(() => ({}))).retry_after || 1); await new Promise((ok) => setTimeout(ok, Math.min(30, wait) * 1000)); continue; }
        if (r.status === 401) break; // the bot token isn't valid
        const u = r.ok ? await r.json().catch(() => null) : null;
        if (u && typeof u.username === 'string') updates.push(profileOf(u));
        await new Promise((ok) => setTimeout(ok, 250));
      }
      if (!updates.length) return 0;
      return (await staff('/api/auth/discord-update', { updates })).value.changed || 0;
    } catch { return 0; } finally { refreshing = false; }
  }
  if (refreshEvery > 0) {
    setTimeout(() => { refreshNames(); setInterval(refreshNames, refreshEvery).unref(); }, 20000).unref();
  }
  // Keeps the bot online in Discord while a bot token is set (discord-gateway.js).
  const presence = process.env.HN_DISCORD_PRESENCE === '0' ? null : startPresence(() => (config() || {}).bot || null);

  async function discord(req, res, route, data) {
    if (route === '/api/discord' && req.method === 'GET') { send(res, 200, { enabled: !!client() }); return true; }
    // Starts a Discord sign-in (mode "login") or connecting Discord to the signed-in account (mode "link").
    if (route === '/api/discord/start') {
      const c = client(); if (!c) throw fail(404, 'Continue with Discord isn’t set up yet.');
      const mode = data.mode === 'link' ? 'link' : 'login', record = { mode, next: safeNext(data.next), expires: Date.now() + 10 * 60000 };
      if (mode === 'link') {
        const entry = entryFor(req), user = await profile(entry);
        if (user.passwordChangeRequired || user.codeSetupRequired) throw fail(403, 'Finish setting up your account first.');
        record.staffSession = entry.staffSession;
      }
      if (pending.size >= 10000) throw fail(503, 'Please try again shortly.');
      const binding = random(), state = random(); record.state = state;
      pending.set(hash(binding), record);
      const url = new URL(AUTHORIZE);
      for (const [k, v] of Object.entries({ client_id: c.id, redirect_uri: REDIRECT, response_type: 'code', scope: 'identify', state, prompt: 'consent' })) url.searchParams.set(k, v);
      send(res, 200, { url: url.href }, [setCookie(BINDING, binding, 600)]); return true;
    }
    if (route === '/discord/callback' && req.method === 'GET') {
      const url = new URL(req.url, origin), key = hash(cookie(req, BINDING)), record = pending.get(key);
      pending.delete(key);
      if (!record || record.expires <= Date.now() || record.state !== url.searchParams.get('state')) { finish(res, '/', { error: 'That Discord sign-in expired. Please try again.' }); return true; }
      if (url.searchParams.get('error') || !url.searchParams.get('code')) { finish(res, record.next, { error: url.searchParams.get('error') === 'access_denied' ? 'Discord sign-in was cancelled.' : 'Discord didn’t finish signing you in. Please try again.' }); return true; }
      try {
        const c = client(); if (!c) throw fail(404, 'Continue with Discord isn’t set up.');
        const who = await identity(url.searchParams.get('code'), c);
        if (record.mode === 'link') {
          await staff('/api/auth/discord-link', { session: record.staffSession, id: who.id, username: who.username });
          await staff('/api/auth/discord-update', { updates: [who] }).catch(() => {});
          finish(res, record.next, { linked: who.username });
        } else finish(res, record.next, { discord: who });
      } catch (e) { finish(res, record.next, { error: e.status ? e.message : 'Continue with Discord is unavailable right now. Please try again shortly.' }); }
      return true;
    }
    // The page asks what happened once it's back (the redirect is a page load, which ends Auth sessions).
    if (route === '/api/discord/result') {
      const key = hash(cookie(req, TICKET)), result = results.get(key); results.delete(key);
      const clear = [setCookie(TICKET, '', 0)];
      if (!result || result.expires <= Date.now()) { send(res, 200, { none: true }, clear); return true; }
      if (result.error) { send(res, 200, { error: result.error }, clear); return true; }
      if (result.linked) { send(res, 200, { linked: result.linked }, clear); return true; }
      // Signs in as the connected account with no password or PIN, and remembers who it was on this browser.
      const { response } = await staff('/api/auth/discord-login', { id: result.discord.id, username: result.discord.username }, req, true);
      await finishLogin(req, res, response, { google: true }); return true;
    }
    if (route === '/api/discord/unlink') {
      const entry = entryFor(req); await profile(entry);
      await staff('/api/auth/discord-unlink', { session: entry.staffSession }, req);
      send(res, 200, { user: await profile(entry) }); return true;
    }
    return false;
  }
  discord.enabled = () => !!client();
  discord.refreshNames = refreshNames;
  discord.presence = presence;
  return discord;
}
module.exports = { createDiscord, BINDING, TICKET };
