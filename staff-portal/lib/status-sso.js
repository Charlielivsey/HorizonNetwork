'use strict';
const resume = require('./resume');
const network = require('./network-leadership');
const storageAccess = require('./storage-access');
const crypto = require('node:crypto');
const fs = require('node:fs');
const STATUS_ORIGIN = 'https://status.hngroup.org.uk';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const HEX = /^[a-f0-9]{64}$/;

// Role membership is deliberately narrower than system.admin permission.
function allowed(session, store) {
  if (!session || session.data.impersonatorId || !session.person.account?.enabled || session.person.account.passwordTemporary || !store.hasCode(session.person)) return false;
  if (store.maintenance().on && !store.hasOwnerAccess(session.person)) return false;
  return store.hasOwnerAccess(session.person) || (!session.person.system && (session.person.roleIds || []).some(id => {
    const role = store.getRole(id);
    return role?.name.toLowerCase() === 'super admin';
  }));
}
// True for a request made by HN Group Auth itself, carrying the shared service secret.
function serviceRequest(req) {
  let secret;
  try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { return false; }
  const supplied = (req.headers.authorization || '').replace(/^Bearer /, '');
  return HEX.test(secret) && HEX.test(supplied) && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}
function loginNext(value) {
  return typeof value === 'string' && /^\/status-admin\/authorize\?state=[a-f0-9]{64}$/.test(value) ? value : null;
}
function createStatusSso({ store, sessions, sendJson, redirect, readJsonBody, logEvent, handleChangePassword, handleSetCode, verifyBrowserPin, verifyVpnPin, issueSession, googleLogin }) {
  const codes = new Map();
  function current(token) {
    const data = sessions.get(token);
    if (!data || data.expires <= Date.now()) return null;
    const person = store.getPerson(data.personId);
    return person ? { token, data, person } : null;
  }
  function identity(active) {
    const p=active.person;
    return {
      id:p.id,displayName:p.displayName,firstName:p.firstName||'',lastName:p.lastName||'',email:(p.emails||[]).find(e=>e.primary)?.address||p.emails?.[0]?.address||store.loginName(p),
      jobTitle:p.jobTitle||'',company:p.company||'',companies:[...new Set([p.company,...(p.otherRoles||[]).map(r=>r.company)].filter(Boolean))],avatarUrl:store.avatarFile(p)?'/api/avatar':null,
      ...(p.account.passwordTemporary?{passwordChangeRequired:true,passwordMinLength:store.meView(p).passwordMinLength}:{}),
      ...(!store.hasCode(p)?{codeSetupRequired:true}:{}),statusAdminAllowed:allowed(active,store),
      // "Sign in with Google": the connected Google account's email, if the person has turned it on.
      google:p.account.google?{email:p.account.google.email,linkedAt:p.account.google.linkedAt}:null,ownerAccess:store.hasOwnerAccess(p)&&!active.data.impersonatorId,
      // Who may open other people's document storage on docs.hngroup.org.uk (never while logged in as someone else).
      ...(active.data.impersonatorId?{storageAccess:false,storageGrants:[]}:storageAccess.forIdentity(p))
    };
  }
  // What HN Browser's settings show and let people change about themselves.
  function accountView(p){
    const v=store.meView(p);
    return{displayName:p.displayName||'',firstName:p.firstName||'',lastName:p.lastName||'',email:identity({person:p,data:{}}).email,jobTitle:p.jobTitle||'',company:p.company||'',department:p.department||'',phone:p.phone||'',location:p.location||'',timezone:p.timezone||'',skills:p.skills||[],languages:p.languages||[],bio:p.bio||'',bioPublic:p.bioPublic!==false,birthday:p.birthday||null,status:p.status||null,photo:!!store.avatarFile(p),supervisor:v.supervisor?.displayName||null,roles:v.roleNames||[],lastLogin:p.account?.lastLoginAt||null};
  }
  const credentials = serviceRequest;
  return async function handle(req, res, pathname, session) {
    if (pathname === '/status-admin/authorize') {
      if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed.' }); return true; }
      const state = new URL(req.url, 'http://localhost').searchParams.get('state');
      if (!HEX.test(state || '')) { sendJson(res, 400, { error: 'Invalid sign-in request.' }); return true; }
      if (!session) { redirect(res, '/login?next=' + encodeURIComponent('/status-admin/authorize?state=' + state)); return true; }
      if (!allowed(session, store)) {
        logEvent(req, session, 'status-admin-denied');
        redirect(res, `${STATUS_ORIGIN}/auth/callback?error=access_denied&state=${state}`); return true;
      }
      for (const [code, grant] of codes) if (grant.expires <= Date.now()) codes.delete(code);
      if (codes.size >= 1000) { sendJson(res, 503, { error: 'Please try signing in again shortly.' }); return true; }
      const code = crypto.randomBytes(32).toString('hex');
      codes.set(code, { token: session.token, state, expires: Date.now() + 60000 });
      logEvent(req, session, 'status-admin-sign-in');
      redirect(res, `${STATUS_ORIGIN}/auth/callback?code=${code}&state=${state}`); return true;
    }
    if (!['/api/status-sso/exchange', '/api/status-sso/session', '/api/auth/profile', '/api/auth/avatar', '/api/auth/password', '/api/auth/code', '/api/auth/network-leadership', '/api/auth/network-avatar', '/api/auth/account-status', '/api/auth/staff-directory', '/api/auth/vpn-pin', '/api/auth/accounts-session', '/api/auth/browser-issue', '/api/auth/browser-profile', '/api/auth/browser-avatar', '/api/auth/browser-offer', '/api/auth/browser-logout', '/api/auth/browser-unlock', '/api/auth/browser-lock', '/api/auth/browser-account', '/api/auth/browser-account-update', '/api/auth/browser-account-status', '/api/auth/browser-account-photo', '/api/auth/google-login', '/api/auth/google-link', '/api/auth/google-unlink'].includes(pathname)) return false;
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed.' }); return true; }
    if (!credentials(req)) { sendJson(res, 401, { error: 'Status integration not authenticated.' }); return true; }
    const body = await readJsonBody(req, pathname === '/api/auth/browser-account-photo' ? 2 * 1024 * 1024 : undefined);
    if (pathname.startsWith('/api/auth/browser-')) {
      const action=pathname.slice('/api/auth/browser-'.length),raw=body.token;
      const remembered=HEX.test(raw||'')&&resume.lookup(raw);
      const active=action==='issue'?current(body.session):remembered?.kind==='browser'?{person:store.getPerson(remembered.personId),data:{expires:remembered.expires}}:null;
      if (!active?.person?.account?.enabled || active.data.impersonatorId || active.person.account.passwordTemporary || !store.hasCode(active.person) || (store.maintenance().on&&!store.hasOwnerAccess(active.person))) {
        if(remembered?.kind==='browser')resume.forget(raw);
        sendJson(res,401,{error:'Your browser account session ended. Sign in again.',restart:true});return true;
      }
      if(action==='unlock'){const error=verifyBrowserPin(req,active.person,raw,body.code);if(error){sendJson(res,error.status,{error:error.error,restart:error.restart});return true;}resume.touch(raw);sendJson(res,200,{expires:resume.lookup(raw).expires,user:identity(active),unlock:resume.unlockKey(raw)});return true;}
      if(action==='lock'){resume.lock(raw);sendJson(res,200,{ok:true});return true;}
      if(action==='logout'){resume.forget(raw);sendJson(res,200,{ok:true});return true;}
      if(action==='issue'){
        const token=resume.issue(active.person.id,null,req.headers['user-agent'],{kind:'browser'});
        logEvent(req,active,'browser-connected');sendJson(res,200,{token,expires:resume.lookup(token).expires,user:identity(active),unlock:resume.unlockKey(token)});return true;
      }
      resume.touch(raw);
      // Your HN account in HN Browser's settings: only while the browser is unlocked (its unlock key).
      if(action.startsWith('account')){
        if(!resume.unlocked(raw,body.unlock)){sendJson(res,423,{error:'Unlock HN Browser with your PIN to change your profile.',locked:true});return true;}
        const p=active.person,session={person:p,data:{},token:null};
        try{
          if(action==='account-update'){const input=body.profile&&typeof body.profile==='object'?body.profile:{};const keep={displayName:p.displayName,phone:p.phone||'',location:p.location||'',timezone:p.timezone||''};store.updateOwnProfile(p,{...keep,...Object.fromEntries(Object.entries(input).filter(([k])=>['displayName','phone','location','timezone','skills','languages','bio','bioPublic','birthdayMonth','birthdayDay','showBirthday'].includes(k)))});logEvent(req,session,'profile-updated',{detail:'HN Browser'});}
          else if(action==='account-status'){store.setStatus(p,body.status||null);logEvent(req,session,'status-changed',{detail:'HN Browser'});}
          else if(action==='account-photo'){if(body.remove){store.removeAvatar(p);logEvent(req,session,'photo-removed',{detail:'HN Browser'});}else{store.saveAvatar(p,body.image);logEvent(req,session,'photo-updated',{detail:'HN Browser'});}}
        }catch(e){if(e.status===400){sendJson(res,400,{error:e.message});return true;}throw e;}
        sendJson(res,200,{user:identity(active),profile:accountView(p)});return true;
      }
      if(action==='offer'){
        const token=resume.issue(active.person.id,null,'HN Browser website PIN sign-in',{parent:raw});
        sendJson(res,200,{remembered:token});return true;
      }
      if(action==='avatar'){
        const avatar=store.avatarFile(active.person);if(!avatar){sendJson(res,404,{error:'No profile picture.'});return true;}
        res.writeHead(200,{'Content-Type':avatar.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(avatar.file).on('error',()=>res.destroy()).pipe(res);return true;
      }
      sendJson(res,200,{expires:resume.lookup(raw).expires,user:identity(active)});return true;
    }
    // "Sign in with Google" (HN Group Auth checked the Google sign-in): starts the PIN step for the linked account.
    if (pathname === '/api/auth/google-login') {
      if (typeof body.sub !== 'string' || typeof body.email !== 'string') { sendJson(res, 400, { error: 'Invalid Google sign-in.' }); return true; }
      googleLogin(req, res, { sub: body.sub, email: body.email }); return true;
    }
    // Lets HN Group services (such as the VPN) check that staff accounts they serve are still enabled.
    if (pathname === '/api/auth/account-status') {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string').slice(0, 5000) : [];
      const accounts = {};
      for (const id of ids) { const p = store.getPerson(id); accounts[id] = !!(p && p.account && p.account.enabled); }
      sendJson(res, 200, { accounts }); return true;
    }
    // HN Group Docs lists everyone's storage for people allowed to open it (names and job titles of enabled staff only).
    if (pathname === '/api/auth/staff-directory') {
      const people = store.employees().filter((p) => p.account && p.account.enabled).map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle || '', company: p.company || '' }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      sendJson(res, 200, { people }); return true;
    }
    // HN Secure Network asks for the PIN before connecting the VPN (checked through vpn.hngroup.org.uk).
    if (pathname === '/api/auth/vpn-pin') {
      const error = verifyVpnPin(body.id, body.code, typeof body.ip === 'string' ? body.ip.slice(0, 64) : '', typeof body.client === 'string' ? body.client.slice(0, 80) : '');
      sendJson(res, error ? error.status : 200, error ? { error: error.error } : { ok: true }); return true;
    }
    if (pathname === '/api/auth/network-leadership') {
      sendJson(res, 200, { leaders: network.publicMembers(store) }); return true;
    }
    if (pathname === '/api/auth/network-avatar') {
      const person = network.members(store).find(p => p.id === body.id);
      const avatar = person && store.avatarFile(person);
      if (!avatar) { sendJson(res, 404, { error: 'Not found.' }); return true; }
      res.writeHead(200, { 'Content-Type': avatar.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(avatar.file).on('error', () => res.destroy()).pipe(res); return true;
    }
    let token = body.session;
    if (pathname.endsWith('/exchange')) {
      const grant = codes.get(body.code);
      // Failed exchanges also consume the code, preventing repeated guesses/replays.
      codes.delete(body.code);
      if (!grant || grant.expires <= Date.now() || grant.state !== body.state) {
        sendJson(res, 401, { error: 'Sign-in link expired or already used.' }); return true;
      }
      token = grant.token;
    }
    const active = HEX.test(token || '') ? current(token) : null;
    if (!active) { sendJson(res, 401, { error: 'Staff sign-in expired. Please sign in again.' }); return true; }
    if (pathname.startsWith('/api/auth/')) {
      if (!active.person.account?.enabled || active.data.impersonatorId || (store.maintenance().on && !store.hasOwnerAccess(active.person))) {
        sendJson(res, 403, { error: 'This account cannot sign in right now.' }); return true;
      }
      if (pathname === '/api/auth/password') {
        if (!active.person.account.passwordTemporary) { sendJson(res, 403, { error: 'A temporary password change is not required.' }); return true; }
        await handleChangePassword(req, res, active, { newPassword: body.newPassword }); return true;
      }
      if (pathname === '/api/auth/code') {
        if (store.hasCode(active.person)) { sendJson(res, 403, { error: 'A sign-in PIN is already configured.' }); return true; }
        await handleSetCode(req, res, active, { code: body.code }); return true;
      }
      // HN Account (accounts.hngroup.org.uk): swaps the sign-in Auth just made for the account website's own
      // staff session, which it keeps on its server and uses for the person's own account and, where their
      // permissions allow, staff accounts. The Auth sign-in session ends here.
      if (pathname === '/api/auth/accounts-session') {
        const ip = typeof body.ip === 'string' ? body.ip.slice(0, 64) : '', ua = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : '';
        const raw = issueSession(active.person.id, ip, ua);
        sessions.delete(token);
        logEvent({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-real-ip': ip, 'user-agent': ua } }, null, 'signed-in', { actor: store.loginName(active.person), detail: 'HN Account', ua });
        sendJson(res, 200, { token: raw, user: identity(active) }); return true;
      }
      // Turning "Sign in with Google" on or off, by the person themselves while signed in to HN Group Auth.
      if (pathname === '/api/auth/google-link' || pathname === '/api/auth/google-unlink') {
        const p = active.person;
        if (p.account.passwordTemporary || !store.hasCode(p)) { sendJson(res, 403, { error: 'Finish setting up your account first.' }); return true; }
        if (pathname === '/api/auth/google-unlink') { store.setGoogle(p, null); logEvent(req, active, 'google-disconnected'); sendJson(res, 200, { user: identity(active) }); return true; }
        if (typeof body.sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(body.sub)) { sendJson(res, 400, { error: 'Invalid Google account.' }); return true; }
        if (!store.ownsEmail(p, body.email)) { sendJson(res, 403, { error: 'Use the Google account for one of your own HN Group email addresses (' + identity(active).email + ').' }); return true; }
        try { store.setGoogle(p, { sub: body.sub, email: body.email }); } catch (e) { if (e.status) { sendJson(res, e.status, { error: e.message }); return true; } throw e; }
        logEvent(req, active, 'google-connected', { detail: String(body.email).toLowerCase().slice(0, 100) });
        sendJson(res, 200, { user: identity(active) }); return true;
      }
      if (pathname === '/api/auth/avatar') {
        const avatar = store.avatarFile(active.person);
        if (!avatar) { sendJson(res, 404, { error: 'No profile picture.' }); return true; }
        res.writeHead(200, { 'Content-Type': avatar.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        fs.createReadStream(avatar.file).on('error', () => res.destroy()).pipe(res); return true;
      }
      sendJson(res,200,{session:token,expires:active.data.expires,user:identity(active)});return true;
    }
    if (!allowed(active, store)) { sendJson(res, 403, { error: 'Only the system owner and Super Admin members can manage status.' }); return true; }
    sendJson(res, 200, { session: token, expires: active.data.expires, user: { id: active.person.id, displayName: active.person.displayName } });
    return true;
  };
}
module.exports = { createStatusSso, allowed, loginNext, serviceRequest };
