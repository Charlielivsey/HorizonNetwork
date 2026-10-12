'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
test('protected management, real checks, incidents and persistent history', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-status-test-'));
  process.env.DATA_DIR = dir;
  const { server, checkAll } = require('./server');
  let healthy = true;
  const target = http.createServer((req, res) => { res.writeHead(healthy ? 200 : 503); res.end(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  await new Promise(r => target.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const key = fs.readFileSync(path.join(dir, 'admin-token'), 'utf8');
  const request = async (route, data, auth = true) => {
    const r = await fetch(base + route, { headers: { ...(auth ? { Authorization: 'Bearer ' + key } : {}), 'Content-Type': 'application/json' }, ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}) });
    return { code: r.status, data: await r.json() };
  };
  try {
    assert.equal((await request('/api/admin', null, false)).code, 401);
    let admin = (await request('/api/admin')).data;
    for (const s of admin.services) await request('/api/admin/delete-service', { id: s.id });
    assert.equal((await request('/api/admin/service', { name: 'Bad protocol', url: 'file:///etc/passwd', override: 'auto' })).code, 400);
    assert.equal((await request('/api/admin/service', { name: 'No URL', url: '', override: 'auto' })).code, 400);
    assert.equal((await request('/api/admin/service', { name: 'Test service', url: `http://127.0.0.1:${target.address().port}`, override: 'auto' })).code, 200);
    // A prior service edit may still be finishing its check batch.
    await new Promise(r => setTimeout(r, 30));
    await checkAll();
    // Wait for the first observation before asserting the public state.
    for (let n = 0; n < 100; n++) { if ((await request('/api/status', null, false)).data.services[0].lastChecked) break; await new Promise(r => setTimeout(r, 10)); }
    let status = (await request('/api/status', null, false)).data;
    assert.equal(status.services[0].status, 'operational');
    assert.equal(status.services[0].uptime, 100);
    assert.equal('url' in status.services[0], false);
    const id = status.services[0].id;
    healthy = false;
    await checkAll();
    status = (await request('/api/status', null, false)).data;
    assert.equal(status.services[0].status, 'outage');
    assert.ok(status.services[0].uptime < 100);
    const incident = { title: 'Connection issue', message: 'Investigating connections.', status: 'investigating', serviceIds: [id] };
    assert.equal((await request('/api/admin/incident', incident, false)).code, 401);
    assert.equal((await request('/api/admin/incident', incident)).code, 200);
    let incidentData = (await request('/api/status', null, false)).data.incidents[0];
    await request('/api/admin/incident', { ...incident, id: incidentData.id, status: 'resolved', message: 'Recovered.' });
    incidentData = (await request('/api/status', null, false)).data.incidents[0];
    assert.equal(incidentData.updates.length, 2);
    assert.equal(incidentData.status, 'resolved');
    admin = (await request('/api/admin')).data;
    await request('/api/admin/service', { ...admin.services[0], override: 'maintenance' });
    assert.equal((await request('/api/status', null, false)).data.services[0].status, 'maintenance');
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8'));
    assert.equal(stored.services[0].override, 'maintenance');
    assert.equal(stored.incidents[0].updates.length, 2);
    assert.equal(fs.statSync(path.join(dir, 'admin-token')).mode & 0o777, 0o600);
    for (const route of ['/', '/admin', '/app.js', '/style.css']) {
      const r = await fetch(base + route); assert.equal(r.status, 200); assert.ok(r.headers.get('content-security-policy'));
    }
    assert.equal((await request('/missing', null, false)).code, 404);
  } finally {
    await new Promise(r => setTimeout(r, 30));
    await new Promise(r => server.close(r));
    await new Promise(r => target.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
