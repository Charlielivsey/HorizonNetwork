'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
async function fixture() {
  const { createStatusSso } = require('../staff-portal/lib/status-sso');
  const sessions = new Map(), people = new Map();
  const roles = new Map([
    ['super', { name: 'Super Admin', permissions: ['system.admin'] }],
    ['leadership', { name: 'Leadership & HR', permissions: ['system.admin'] }]
  ]);
  let maintenance = false;
  const store = { getPerson: id => people.get(id), getRole: id => roles.get(id), isOwner: p => p?.id === 'owner', maintenance: () => ({ on: maintenance }) };
  function addUser(id, roleIds = [], extra = {}) {
    const raw = crypto.randomBytes(32).toString('hex');
    const token = crypto.createHash('sha256').update(raw).digest('hex');
    const person = { id, displayName: id, roleIds, account: { enabled: true }, ...extra };
    people.set(id, person);
    const data = { personId: id, expires: Date.now() + 3600000 };
    sessions.set(token, data);
    return { raw, token, person, data };
  }
  const users = { owner: addUser('owner'), super: addUser('super', ['super']), leadership: addUser('leadership', ['leadership']), staff: addUser('staff'), builtin: addUser('builtin', [], { system: true }) };
  const sendJson = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const redirect = (res, location) => { res.writeHead(302, { Location: location }); res.end(); };
  const readJsonBody = async req => { let text = ''; for await (const c of req) text += c; return JSON.parse(text); };
  const handler = createStatusSso({ store, sessions, sendJson, redirect, readJsonBody, logEvent: () => {} });
  const server = http.createServer(async (req, res) => {
    const raw = (req.headers.cookie || '').replace('hn_staff_session=', '');
    const token = crypto.createHash('sha256').update(raw).digest('hex'), data = sessions.get(token);
    const person = data && people.get(data.personId);
    const session = data && person && person.account.enabled && data.expires > Date.now() ? { token, data, person } : null;
    try { if (!await handler(req, res, new URL(req.url, 'http://localhost').pathname, session)) sendJson(res, 404, {}); }
    catch (e) { sendJson(res, 500, { error: e.message }); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}`, users, sessions, roles, maintenance: value => { maintenance = value; } };
}
module.exports = { fixture };
