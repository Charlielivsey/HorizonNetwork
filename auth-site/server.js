'use strict';
// HN Group Auth brokers existing staff sessions; it never stores passwords or PINs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {nativeDestination,createNative}=require('./native');
const {createGoogle}=require('./google');
const {createDiscord}=require('./discord');
const ORIGIN = 'https://auth.hngroup.org.uk';
// Registered applications: fixed callbacks and who may use them.
const CLIENTS = {
  browser: { name: 'HN Browser', native: true, allowed: () => true, denied: 'This account cannot use HN Browser.' },
  'app-manager': { name: 'HN Group App Manager', native: true, allowed: () => true, denied: 'This account cannot use HN Group App Manager.' },
  media: { name: 'Horizon Media Group administration', callback: 'https://media.hngroup.org.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can manage this website.' },
  holding: { name: 'HN Group Management administration', callback: 'https://holding.hngroup.org.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can manage this website.' },
  development: { name: 'Horizon Development administration', callback: 'https://development.hngroup.org.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can manage this website.' },
  support: { name: 'HN Group Support administration', callback: 'https://support.hngroup.org.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can manage this website.' },
  clients: { name: 'HN Group Clients administration', callback: 'https://clients.hngroup.org.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can manage this website.' },
  careers: { name: 'HN Group Careers administration', callback: 'https://careers.hngroup.org.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can manage this website.' },
  news: { name: 'HN Group News', callback: 'https://news.hngroup.org.uk/auth/callback', allowed: user => !!(user.statusAdminAllowed || user.ownerAccess || (Array.isArray(user.companies) ? user.companies : [user.company]).includes('HN Group')), denied: 'Only staff with a role at HN Group can manage HN Group News.' },
  network: { name: 'Horizon Network website configuration', callback: 'https://horizon-network.co.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can configure Horizon Network.' },
  status: { name: 'Status administration', callback: 'https://status.hngroup.org.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can manage status.' },
  website: { name: 'HN Group website configuration', callback: 'https://hngroup.org.uk/auth/callback', allowed: user => user.statusAdminAllowed, denied: 'Only the system owner and Super Admin members can configure the website.' },
  portal: { name: 'Staff portal', callback: 'https://staff.hngroup.org.uk/auth/callback', allowed: (user) => !user.standalone, denied: 'This account has no staff profile, so it can’t use the staff portal.' },
  wiki: { name: 'HN Group Wiki', callback: 'https://wiki.hngroup.org.uk/auth/callback', allowed: () => true, denied: 'This account cannot edit the HN Group Wiki.' },
  branding: { name: 'HN Group brand centre', callback: 'https://branding.hngroup.org.uk/auth/callback', allowed: () => true, denied: 'This account cannot use the HN Group brand centre.' },
  accounts: { name: 'HN Account', callback: 'https://accounts.hngroup.org.uk/auth/callback', allowed: () => true, denied: 'This account cannot use HN Account.' },
  investors: { name: 'HN Group Investors', callback: 'https://investors.hngroup.org.uk/auth/callback', allowed: user => !!user.ownerAccess || (Array.isArray(user.companies) ? user.companies : [user.company]).includes('HN Group'), denied: 'Only staff with a role at HN Group can sign in to the investors website.' },
  vpn: { name: 'HN Group VPN', callback: 'https://vpn.hngroup.org.uk/auth/callback', allowed: () => true, denied: 'This account cannot use the HN Group VPN.' },
  devices: { name: 'HN Group Devices', callback: 'https://devices.hngroup.org.uk/auth/callback', allowed: () => true, denied: 'This account cannot use HN Group Devices.' },
  docs: { name: 'HN Group Docs', callback: 'https://docs.hngroup.org.uk/auth/callback', allowed: () => true, denied: 'This account cannot use HN Group Docs.' },
  // Anyone can sign in to sign what they've been sent; sending needs the "Send contracts for signing" permission.
  contracts: { name: 'HN Group Contracts', callback: 'https://contract.hngroup.org.uk/auth/callback', allowed: () => true, denied: 'This account cannot use HN Group Contracts.' },
};
const HEX = /^[a-f0-9]{64}$/;
const COOKIE = '__Host-hn_auth_session', FLOW = '__Host-hn_auth_flow', REMEMBER = '__Host-hn_auth_resume';
const secretFile = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const backend = process.env.STAFF_PORTAL_BACKEND || 'http://127.0.0.1:3200';
const sessions = new Map(), challenges = new Map(), codes = new Map(), applicationSessions = new Map();
const random = () => crypto.randomBytes(32).toString('hex');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function cookie(req, name) { return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || ''; }
function setCookie(name, value, age = 43200) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
function send(res, status, data, cookies = []) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': cookies }); res.end(JSON.stringify(data)); }
function redirect(res, url) { res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' }); res.end(); }
function fail(status, message) { return Object.assign(new Error(message), { status }); }
async function body(req, limit = 16384) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'JSON required.');
  let value = ''; for await (const chunk of req) { value += chunk; if (value.length > limit) throw fail(413, 'Request too large.'); }
  try { return JSON.parse(value); } catch { throw fail(400, 'Invalid request.'); }
}
function secret() { const s = fs.readFileSync(secretFile, 'utf8').trim(); if (!HEX.test(s)) throw fail(503, 'Authentication integration is not configured.'); return s; }
function service(req) {
  const supplied = (req.headers.authorization || '').replace(/^Bearer /, '');
  const expected = secret();
  return HEX.test(supplied) && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
async function staff(endpoint, data, req, login = false, method = 'POST') {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret() };
  if (req) {
    const remembered = cookie(req, REMEMBER);
    if (HEX.test(remembered)) headers.Cookie = 'hn_staff_resume=' + remembered;
    if (login) headers['X-Auth-Remember'] = '1';
    // Only the local reverse proxy can supply the original client address.
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    headers['X-Real-IP'] = local ? (req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
    headers['User-Agent'] = String(req.headers['user-agent'] || 'HN Group Auth').slice(0, 300);
    headers['X-Forwarded-Proto'] = 'https';
  }
  let response;
  try { response = await fetch(backend + endpoint, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(8000), redirect: 'error' }); }
  catch { throw fail(503, 'Staff account service is unavailable. Please try again shortly.'); }
  const value = await response.json();
  if (!response.ok) throw Object.assign(fail(response.status, value.error || 'Sign-in could not be verified.'), { restart: !!value.restart });
  return { value, response };
}
async function profile(entry) {
  if (!entry || entry.expires <= Date.now()) throw fail(401, 'Please sign in again.');
  const { value } = await staff('/api/auth/profile', { session: entry.staffSession });
  entry.expires = Math.min(entry.expires, value.expires);
  return value.user;
}
function requireReady(user) { if (user.passwordChangeRequired) throw fail(403, 'Create a new password before continuing.'); if (user.codeSetupRequired) throw fail(403, 'Set your sign-in PIN before continuing.'); }
function entryFor(req) { return sessions.get(hash(cookie(req, COOKIE))); }
// google: a Google or Discord sign-in, which never remembers the account and leaves any remembered account on this browser as it is.
async function finishLogin(req, res, response, { google = false } = {}) {
  const raw = (response.headers.get('set-cookie') || '').match(/(?:^|,\s*)hn_staff_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!raw) throw fail(503, 'The staff account service did not create a session.');
  const entry = { staffSession: hash(raw), expires: Date.now() + 12 * 3600000 };
  const user = await profile(entry);
  if (sessions.size >= 10000) throw fail(503, 'Please try again shortly.');
  sessions.delete(hash(cookie(req, COOKIE)));
  const token = random(); sessions.set(hash(token), entry);
  challenges.delete(hash(cookie(req, FLOW)));
  const remembered = (response.headers.get('set-cookie') || '').match(/(?:^|,\s*)hn_staff_resume=([a-f0-9]{64})(?:;|$)/)?.[1];
  const cookies = [setCookie(COOKIE, token), setCookie(FLOW, '', 0)];
  if (google) {}
  else if (remembered) cookies.push(setCookie(REMEMBER, remembered, 30 * 86400));
  else {
    if (HEX.test(cookie(req, REMEMBER))) await staff('/api/resume/forget', {}, req);
    cookies.push(setCookie(REMEMBER, '', 0));
  }
  send(res, 200, { user }, cookies);
}
async function serveAvatar(entry, res) {
  const response = await fetch(backend + '/api/auth/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + secret(), 'Content-Type': 'application/json' }, body: JSON.stringify({ session: entry.staffSession }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) return send(res, response.status, { error: 'Profile picture unavailable.' });
  const image = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, { 'Content-Type': response.headers.get('content-type'), 'Cache-Control': 'no-store' });
  return res.end(image);
}
function destination(url) {
 const id=url.searchParams.get('client_id'),state=url.searchParams.get('state');
 if(!Object.hasOwn(CLIENTS,id||'')||!HEX.test(state||''))return null;
 const client={id,state,...CLIENTS[id]};if(client.native){const native=nativeDestination(url);return native?{...client,...native}:null;}return client;
}
async function persistentAvatar(token,res){
 const response=await fetch(backend+'/api/auth/browser-avatar',{method:'POST',headers:{Authorization:'Bearer '+secret(),'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(5000),redirect:'error'});
 if(!response.ok)return send(res,response.status,{error:'Profile picture unavailable.'});res.writeHead(200,{'Content-Type':response.headers.get('content-type'),'Cache-Control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
}
const native=createNative({codes,applications:applicationSessions,profile,requireReady,send,body,serveAvatar,destination,persistentAvatar,
 issuePersistent:async(entry,req)=>(await staff('/api/auth/browser-issue',{session:entry.staffSession},req)).value,
 persistent:async(action,token,req,data={})=>(await staff('/api/auth/browser-'+action,{token,...(action==='unlock'?{code:data.code}:{}),...(action.startsWith('account')?{unlock:data.unlock,profile:data.profile,status:data.status,image:data.image,remove:!!data.remove}:{})},req)).value});
// "Sign in with Google" (google.js): optional per person, and the PIN is still asked.
const google=createGoogle({origin:ORIGIN,staff,send,profile,entryFor,setCookie,cookie,finishLogin,destination,random,hash,fail});
// "Continue with Discord" (discord.js): the same as Google, plus the bot that keeps Discord usernames current.
const discord=createDiscord({origin:ORIGIN,staff,send,profile,entryFor,setCookie,cookie,finishLogin,destination,random,hash,fail});
const staticFiles = { '/': 'index.html', '/authorize': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js', '/assets/favicon.svg': 'assets/favicon.svg', '/assets/brand/hn-group-wordmark-white.svg': 'assets/brand/hn-group-wordmark-white.svg', '/assets/brand/hn-group-wordmark.svg': 'assets/brand/hn-group-wordmark.svg', '/assets/fonts/plus-jakarta-sans.woff2': 'assets/fonts/plus-jakarta-sans.woff2' };
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  try {
    const url = new URL(req.url, ORIGIN), route = url.pathname;
    if (route === '/healthz') return send(res, 200, { ok: true });
    if(await native(req,res,route))return;
    if (route.startsWith('/api/sso/')) {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
      if (!service(req)) return send(res, 401, { error: 'Client not authenticated.' });
      const data = await body(req); let token, applicationToken, detachedEntry;
      // Status and website keep live Auth sessions; the portal starts its own staff session.
      const clientId = data.client_id || 'status';
      if (!Object.hasOwn(CLIENTS, clientId)||CLIENTS[clientId].native) return send(res, 400, { error: 'Unknown application.' });
      if (route === '/api/sso/exchange') {
        const grant = codes.get(data.code); codes.delete(data.code);
        if (!grant || grant.expires <= Date.now() || grant.state !== data.state || grant.client !== clientId) throw fail(401, 'Sign-in link expired or already used.');
        token = grant.session;
      } else {
        if (!['/api/sso/session','/api/sso/avatar'].includes(route)) return send(res, 404, { error: 'Not found.' });
        const application = HEX.test(data.session || '') && applicationSessions.get(hash(data.session));
        if (!application || application.client !== clientId || application.expires <= Date.now()) throw fail(401, 'Application sign-in expired.');
        token = application.session; applicationToken = data.session; detachedEntry = application.entry;
      }
      const entry = detachedEntry || (HEX.test(token || '') && sessions.get(token)), user = await profile(entry);
      requireReady(user);
      if (!CLIENTS[clientId].allowed(user)) throw fail(403, CLIENTS[clientId].denied);
      if (clientId === 'portal' || clientId === 'accounts') {
        // The application starts its own session (HN Account swaps this one for its own on the staff
        // account service); this Auth sign-in has done its job.
        sessions.delete(token);
        return send(res, 200, { user, staffSession: entry.staffSession });
      }
      if (route === '/api/sso/avatar') return await serveAvatar(entry, res);
      if (!applicationToken) {
        if (applicationSessions.size >= 10000) throw fail(503, 'Please try signing in again shortly.');
        applicationToken = random();
        applicationSessions.set(hash(applicationToken), {session:token,client:clientId,expires:entry.expires});
      }
      return send(res, 200, { session: applicationToken, expires: entry.expires, user });
    }
    if (req.method === 'POST') {
      if (req.headers.origin !== ORIGIN) throw fail(403, 'Request origin not allowed.');
      const data = await body(req);
      if (route.startsWith('/api/google/') && await google(req, res, route, data)) return;
      if (route.startsWith('/api/discord/') && await discord(req, res, route, data)) return;
      if (route === '/api/resume/forget') {
        await staff('/api/resume/forget', {}, req);
        sessions.delete(hash(cookie(req, COOKIE))); challenges.delete(hash(cookie(req, FLOW)));
        return send(res, 200, { ok: true }, [setCookie(REMEMBER, '', 0), setCookie(COOKIE, '', 0), setCookie(FLOW, '', 0)]);
      }
      if (route === '/api/resume') {
        // An account with Sign in with Google turned on resumes with Google only, never the PIN (the user's request).
        const { value: who } = await staff('/api/resume', null, req, false, 'GET');
        if (who.google && google.enabled() && data.pin !== true) throw fail(403, 'This account signs in with Google. Choose Continue with Google.');
        const { response } = await staff('/api/resume', { code: data.code }, req, true);
        return await finishLogin(req, res, response);
      }
      if (route === '/api/login') {
        challenges.delete(hash(cookie(req, FLOW)));
        const { value, response } = await staff('/api/login', { username: data.username, password: data.password }, req, true);
        if (value.codeRequired) {
          if (challenges.size >= 10000) throw fail(503, 'Please try again shortly.');
          // With Sign in with Google turned on, the second step is Google, not the PIN (the user's request).
          if (value.google && google.enabled() && data.pin !== true) return send(res, 200, { googleRequired: true }, [setCookie(FLOW, '', 0)]);
          const flow = random(); challenges.set(hash(flow), { challenge: value.challenge, expires: Date.now() + 5 * 60000 });
          return send(res, 200, { codeRequired: true }, [setCookie(FLOW, flow, 300)]);
        }
        return await finishLogin(req, res, response);
      }
      if (route === '/api/login/code') {
        const key = hash(cookie(req, FLOW)), flow = challenges.get(key);
        if (!flow || flow.expires <= Date.now()) { challenges.delete(key); throw fail(401, 'Sign-in expired. Start again.'); }
        const { response } = await staff('/api/login/code', { challenge: flow.challenge, code: data.code }, req, true);
        challenges.delete(key); return await finishLogin(req, res, response);
      }
      if (route === '/api/setup-code') {
        const entry = entryFor(req), user = await profile(entry);
        if (user.passwordChangeRequired) throw fail(403, 'Create a new password first.');
        if (!user.codeSetupRequired) throw fail(403, 'A sign-in PIN is already configured.');
        const { response } = await staff('/api/auth/code', { session: entry.staffSession, code: data.code }, req, true);
        const remembered = (response.headers.get('set-cookie') || '').match(/(?:^|,\s*)hn_staff_resume=([a-f0-9]{64})(?:;|$)/)?.[1];
        return send(res, 200, { user: await profile(entry) }, remembered ? [setCookie(REMEMBER, remembered, 30 * 86400)] : []);
      }
      if (route === '/api/password') {
        const entry = entryFor(req), user = await profile(entry);
        if (!user.passwordChangeRequired) throw fail(403, 'A temporary password change is not required.');
        await staff('/api/auth/password', { session: entry.staffSession, newPassword: data.newPassword });
        return send(res, 200, { user: await profile(entry) }, [setCookie(REMEMBER, '', 0)]);
      }
      if (route === '/api/logout') {
        sessions.delete(hash(cookie(req, COOKIE))); challenges.delete(hash(cookie(req, FLOW)));
        return send(res, 200, { ok: true }, [setCookie(COOKIE, '', 0), setCookie(FLOW, '', 0)]);
      }
      // Which profile to sign in as, when the account has several (the user's request, 28 October 2026).
      if (route === '/api/profile/select') {
        const entry = entryFor(req); await profile(entry);
        const { value } = await staff('/api/auth/profile-select', { session: entry.staffSession, key: String(data.key || '') });
        return send(res, 200, { user: value.user });
      }
      if (route === '/api/continue') {
        const requestURL=new URL('/authorize',ORIGIN);for(const key of ['client_id','state','redirect_uri','code_challenge','code_challenge_method'])if(typeof data[key]==='string')requestURL.searchParams.set(key,data[key]);
        const client=destination(requestURL);
        if (!client) throw fail(400, 'Invalid application. Start from the application’s sign-in button.');
        const entry = entryFor(req), user = await profile(entry);
        requireReady(user);
        if (!client.allowed(user)) return send(res, 200, { redirect: client.callback + '?error=access_denied&state=' + client.state });
        if (codes.size >= 10000) throw fail(503, 'Please try again shortly.');
        const code = random(); codes.set(code, { session: hash(cookie(req, COOKIE)), state: client.state, client: client.id, expires: Date.now() + 60000, ...(client.native?{native:true,redirect:client.callback,challenge:client.challenge,entry:{...entry}}:{}) });
        return send(res, 200, { redirect: client.callback + '?code=' + code + '&state=' + client.state });
      }
      return send(res, 404, { error: 'Not found.' });
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
    if ((route === '/api/google' || route === '/google/callback') && await google(req, res, route, {})) return;
    if ((route === '/api/discord' || route === '/discord/callback') && await discord(req, res, route, {})) return;
    if (route === '/api/resume') {
      const { value } = await staff('/api/resume', null, req, false, 'GET');
      if (value.avatarUrl) value.avatarUrl = '/api/resume/avatar';
      value.google = !!value.google && google.enabled();
      return send(res, 200, value, value.available ? [] : [setCookie(REMEMBER, '', 0)]);
    }
    if (route === '/api/resume/avatar') {
      const remembered = cookie(req, REMEMBER);
      if (!HEX.test(remembered)) throw fail(401, 'Please sign in again.');
      const response = await fetch(backend + '/api/resume/avatar', { headers: { Cookie: 'hn_staff_resume=' + remembered }, signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) return send(res, response.status, { error: 'Profile picture unavailable.' });
      res.writeHead(200, { 'Content-Type': response.headers.get('content-type'), 'Cache-Control': 'no-store' });
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (route === '/api/me') return send(res, 200, { user: await profile(entryFor(req)) });
    // A profile's picture on "Choose a profile" (only the signed-in account's own profiles).
    if (route === '/api/profile/avatar') {
      const entry = entryFor(req); await profile(entry);
      const key = new URL(req.url, ORIGIN).searchParams.get('key') || '';
      const response = await fetch(backend + '/api/auth/profile-avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + secret(), 'Content-Type': 'application/json' }, body: JSON.stringify({ session: entry.staffSession, key }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) return send(res, response.status, { error: 'Profile picture unavailable.' });
      res.writeHead(200, { 'Content-Type': response.headers.get('content-type'), 'Cache-Control': 'no-store' });
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (route === '/api/avatar') {
      const entry = entryFor(req); await profile(entry);
      return await serveAvatar(entry, res);
    }
    let browserRemembered=null;
    if(route==='/')browserRemembered=await native.consumeOffer(req,url);
    if (route === '/authorize') {
      if (!destination(url)) throw fail(400, 'Invalid application. Start from the application’s sign-in button.');
      browserRemembered=await native.consumeOffer(req,url);
      if (url.searchParams.get('switch') === '1') {
        sessions.delete(hash(cookie(req, COOKIE))); res.setHeader('Set-Cookie', setCookie(COOKIE, '', 0));
        url.searchParams.delete('switch'); url.searchParams.set('account', 'other'); return redirect(res, url.pathname + url.search);
      }
    }
    const file = staticFiles[route];
    if (!file) return send(res, 404, { error: 'Not found.' });
    // Auth deliberately ends its session on every document navigation, including refresh.
    // Assets and API requests must not revoke the sign-in in progress.
    if (file.endsWith('.html')) {
      sessions.delete(hash(cookie(req, COOKIE)));
      challenges.delete(hash(cookie(req, FLOW)));
      res.setHeader('Set-Cookie', [setCookie(COOKIE, '', 0), setCookie(FLOW, '', 0),...(browserRemembered?[setCookie(REMEMBER,browserRemembered,30*86400)]:[])]);
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)], // The page and its script/stylesheet are always revalidated, so an update reaches people at once
    // (a cached old app.js once left the new Devices sign-in stuck); fonts and pictures may be kept for an hour.
    'Cache-Control': file.endsWith('.html') ? 'no-store' : /\.(js|css)$/.test(file) ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(path.join(__dirname, 'public', file)).pipe(res);
  } catch (e) { send(res, e.status || 503, { error: e.status ? e.message : 'Authentication service is unavailable. Please try again shortly.', ...(e.restart ? { restart: true } : {}) }, e.restart ? [setCookie(REMEMBER, '', 0)] : []); }
});
setInterval(() => { for (const [key, value] of applicationSessions) if (value.expires <= Date.now() || !value.entry && !sessions.has(value.session)) applicationSessions.delete(key); for (const map of [sessions, challenges, codes]) for (const [key, value] of map) if (value.expires <= Date.now()) map.delete(key); }, 60000).unref();
if (require.main === module) server.listen(Number(process.env.PORT || 3400), process.env.HOST || '127.0.0.1');
module.exports = { server, discord };
