'use strict';
// Docs hosts the UI; the private staff backend remains the only writer of policies and grants.
const store = require('./store');
const { serviceRequest } = require('./status-sso');
const PREFIX = '/api/docs-administration';
module.exports = async function docsAdministration(req, res, pathname, { sendJson, routeWorkplace, extraRoutes }) {
  if (!pathname.startsWith(PREFIX + '/')) return false;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || !serviceRequest(req)) {
    sendJson(res, 404, { error: 'Not found.' }); return true;
  }
  let identity;
  try { identity = JSON.parse(Buffer.from(String(req.headers['x-hn-docs-identity'] || ''), 'base64url').toString()); } catch {}
  if (!identity || identity.impersonated) throw Object.assign(new Error('Sign in as yourself to use these tools.'), { status: 403 });
  const login = store.getLogin(identity.accountId);
  const profile = login && store.loginProfiles(login).find(p => p.profileId === identity.id);
  const me = login && store.getPerson(profile ? 'p~' + login.id + '~' + profile.personId + '~' + profile.key.split(':')[1] : 'p~' + login.id);
  if (!me || !me.account?.enabled || (login.guest && !login.guest.sites.includes('docs')) || (profile ? profile.profileId : login.id) !== identity.id) throw Object.assign(new Error('This account or profile cannot use Docs.'), { status: 403 });
  const session = { person: me, data: {}, token: null };
  const route = pathname.slice(PREFIX.length);
  if (route === '/tools' && req.method === 'GET') {
    sendJson(res, 200, { storage: store.can(me, 'storage.access'), documents: store.can(me, 'documents.manage'), companies: store.COMPANIES }); return true;
  }
  if (/^\/document-storage(?:\/|$)/.test(route)) {
    if (!store.can(me, 'storage.access')) throw Object.assign(new Error('You do not have permission to manage document storage.'), { status: 403 });
    await extraRoutes.handle(req, res, '/api' + route, session); return true;
  }
  if (/^\/(documents|policies)(?:\/|$)/.test(route)) {
    if (route.startsWith('/documents') && !store.can(me, 'documents.manage')) throw Object.assign(new Error('You do not have permission to manage documents.'), { status: 403 });
    // Policies is the ordinary read/acknowledge view. Management always uses /documents.
    if (route.startsWith('/policies') && !(req.method === 'GET' || (req.method === 'POST' && /^\/policies\/[a-f0-9]{16}\/acknowledge$/.test(route)))) throw Object.assign(new Error('Not allowed.'), { status: 403 });
    req.docsPoliciesReadOnly = route.startsWith('/policies');
    await routeWorkplace(req, res, '/api' + route.replace(/^\/policies/, '/documents'), session); return true;
  }
  sendJson(res, 404, { error: 'Not found.' }); return true;
};
