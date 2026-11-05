'use strict';
// Status follows website control: maintenance shows Under maintenance, switched-off shows offline, and neither counts against
// availability. Run: node --test status-site/control.test.cjs (local servers only).
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
test('maintenance and switched-off websites from website control', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-status-control-'));
  process.env.DATA_DIR = dir;
  fs.writeFileSync(path.join(dir, 'sso-secret'), 'a'.repeat(64)); process.env.STATUS_SSO_SECRET_FILE = path.join(dir, 'sso-secret');
  let sites = [{ id: 'docs', hosts: ['docs.hngroup.org.uk'], maintenance: true, power: 'on' }, { id: 'vpn', hosts: ['vpn.hngroup.org.uk'], maintenance: false, power: 'off' }, { id: 'wiki', hosts: ['wiki.hngroup.org.uk'], maintenance: false, power: 'on' }];
  const control = http.createServer((req, res) => { res.writeHead(req.url === '/_status/sites' ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ sites })); });
  await new Promise((r) => control.listen(0, '127.0.0.1', r));
  process.env.CONTROL_BACKEND = 'http://127.0.0.1:' + control.address().port;
  const original = global.fetch, seeded = new Set(require('./catalog.cjs').websites().map((s) => new URL(s.url).href)), asked = [];
  global.fetch = (input, options) => { const href = new URL(input).href; if (seeded.has(href)) { asked.push(new URL(href).hostname); return Promise.resolve(new Response('', { status: href.includes('vpn.') ? 503 : 200 })); } return original(input, options); };
  try {
    const { checkAll, snapshot } = require('./server');
    await checkAll();
    const by = (host) => snapshot().services.find((s) => s.host === host);
    assert.equal(by('docs.hngroup.org.uk').status, 'maintenance');
    assert.equal(by('docs.hngroup.org.uk').reason, 'maintenance');
    assert.equal(by('vpn.hngroup.org.uk').status, 'outage');
    assert.equal(by('vpn.hngroup.org.uk').reason, 'switched-off');
    assert.equal(by('wiki.hngroup.org.uk').status, 'operational');
    assert.ok(!asked.includes('docs.hngroup.org.uk') && !asked.includes('vpn.hngroup.org.uk'), 'held websites are not counted against availability');
    assert.equal(by('vpn.hngroup.org.uk').uptime, null);
    // Back on: normal checks again.
    sites = sites.map((s) => ({ ...s, maintenance: false, power: 'on' }));
    await checkAll();
    assert.equal(by('docs.hngroup.org.uk').status, 'operational');
    assert.equal(by('docs.hngroup.org.uk').reason, null);
    assert.equal(by('vpn.hngroup.org.uk').status, 'outage', 'a real failure is still an outage');
    assert.equal(by('vpn.hngroup.org.uk').reason, null);
  } finally { global.fetch = original; control.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
