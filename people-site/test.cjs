'use strict';
// HN Group People: the staff portal's public list (only public fields, About me opt-out, leavers left out) and the site
// serving it with pictures and page addresses.
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const pub = require('../staff-portal/lib/people-public');

const PEOPLE = [
  { id: 'a'.repeat(16), displayName: 'Charlie', firstName: 'Charlie', lastName: 'Livsey', company: 'HN Group', jobTitle: 'Board Chairman', department: 'Board', supervisorId: null, bio: 'Hello there', phone: '07000', email: 'c@example.test', otherRoles: [{ company: 'Horizon Network', jobTitle: 'President', supervisorId: null }] },
  { id: 'b'.repeat(16), displayName: 'Jack', company: 'HN Group', jobTitle: 'Board Director', supervisorId: 'a'.repeat(16), supervisorCompany: 'HN Group', bio: 'Private words', peopleBio: false },
  { id: 'c'.repeat(16), displayName: 'Gone', company: 'Horizon Network', jobTitle: 'Advisor' },
  { id: 'd'.repeat(16), displayName: 'System', system: true },
];
const store = {
  COMPANIES: ['HN Group', 'Horizon Network'],
  employees: () => PEOPLE.filter((p) => !p.system),
  loginsForId: (id) => id === 'c'.repeat(16) ? [{ account: { enabled: false } }] : [{ account: { enabled: true } }],
  avatarFile: (p) => p.id === 'a'.repeat(16) ? { file: __filename, mime: 'image/png' } : null,
  positions: () => ({ 'HN Group': ['Board Chairman', 'Board Director', 'Chief Executive Officer'], 'Horizon Network': ['President', 'Founder'] }),
  positionReports: () => ({ 'HN Group': { 'Board Chairman': null, 'Board Director': { company: 'HN Group', title: 'Board Chairman' }, 'Chief Executive Officer': { company: 'HN Group', title: 'Board Chairman' } }, 'Horizon Network': { President: { company: 'HN Group', title: 'Chief Executive Officer' }, Founder: null } }),
};

test('the staff portal publishes only public fields, respects the About me choice and leaves out leavers', () => {
  const out = pub.publicPeople(store);
  assert.deepEqual(out.people.map((p) => p.name), ['Charlie', 'Jack']);
  const charlie = out.people[0], jack = out.people[1];
  assert.equal(charlie.about, 'Hello there');
  assert.equal(jack.about, '', 'About me hidden when they untick it');
  assert.deepEqual(charlie.roles.map((r) => r.company), ['HN Group', 'Horizon Network']);
  assert.deepEqual(jack.roles[0].reportsTo, { id: 'a'.repeat(16), company: 'HN Group' });
  assert.equal(charlie.photo, true);
  for (const p of out.people) for (const k of ['phone', 'email', 'firstName', 'lastName', 'birthday']) assert.ok(!(k in p), k + ' is never published');
  assert.equal(pub.avatarOf(store, 'c'.repeat(16)), null);
  // Every position, held or vacant, with its reporting line and holders; someone with two positions is in both.
  const pos = (c, t) => out.positions.find((p) => p.company === c && p.title === t);
  assert.equal(out.positions.length, 5);
  assert.deepEqual(pos('HN Group', 'Board Chairman').holders, ['a'.repeat(16)]);
  assert.deepEqual(pos('Horizon Network', 'President').holders, ['a'.repeat(16)]);
  assert.deepEqual(pos('HN Group', 'Chief Executive Officer').holders, [], 'vacant positions are listed');
  assert.deepEqual(pos('Horizon Network', 'President').reportsTo, { company: 'HN Group', title: 'Chief Executive Officer' });
});

test('the site serves the list, pictures and page addresses', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-people-'));
  const secretFile = path.join(dir, 'secret'); fs.writeFileSync(secretFile, 'f'.repeat(64));
  let calls = 0;
  const backend = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      assert.equal(req.headers.authorization, 'Bearer ' + 'f'.repeat(64));
      if (req.url === '/api/auth/people-public') { calls++; res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(pub.publicPeople(store))); }
      if (req.url === '/api/auth/people-avatar' && JSON.parse(body).id === 'a'.repeat(16)) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.from([137, 80, 78, 71])); }
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => backend.listen(0, '127.0.0.1', r));
  process.env.STAFF_PORTAL_BACKEND = 'http://127.0.0.1:' + backend.address().port;
  process.env.STATUS_SSO_SECRET_FILE = secretFile;
  delete require.cache[require.resolve('./server')];
  const { server } = require('./server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const list = await (await fetch(base + '/api/people')).json();
    assert.equal(list.people.length, 2);
    assert.equal(list.positions.length, 5, 'positions are passed on');
    await fetch(base + '/api/people');
    assert.equal(calls, 1, 'cached for half a minute');
    const pic = await fetch(base + '/api/people/' + 'a'.repeat(16) + '/photo');
    assert.equal(pic.status, 200); assert.equal(pic.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(base + '/api/people/' + 'b'.repeat(16) + '/photo')).status, 404);
    for (const page of ['/', '/org', '/org/horizon-network', '/people/' + 'b'.repeat(16)]) {
      const r = await fetch(base + page);
      assert.equal(r.status, 200, page);
      const html = await r.text();
      assert.match(html, /hn-theme\.js/); assert.match(html, /people\.js/);
      assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    }
    assert.equal((await fetch(base + '/nope')).status, 404);
    assert.equal((await fetch(base + '/api/people', { method: 'POST' })).status, 405);
  } finally {
    server.close(); backend.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
});
