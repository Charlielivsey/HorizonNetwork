'use strict';
// End to end with the real staff portal (the user's request, 30 October 2026): support requests sent from a company
// website reach Website enquiries, staff replies show on the website with the private reference, old support.hngroup.org.uk
// references keep working, and HN Group Careers lists vacancies, takes applications with a CV and shows their stage.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), { spawn } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
async function freePort() { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
async function start(file, env, port) {
  const child = spawn(process.execPath, [file], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; child.stderr.on('data', (c) => { errors += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch('http://127.0.0.1:' + port + '/healthz')).ok) return child; } catch {} if (child.exitCode !== null) throw Error(errors || 'exited'); await new Promise((r) => setTimeout(r, 30)); }
  throw Error('timed out ' + errors);
}
async function stop(child) { if (child && child.exitCode === null) { child.kill(); await new Promise((r) => child.once('exit', r)); } }
function site(slug, dir) {
  const runtime = path.join(dir, slug); fs.mkdirSync(runtime);
  fs.cpSync(path.join(__dirname, 'public'), path.join(runtime, 'public'), { recursive: true });
  fs.cpSync(path.join(ROOT, slug + '-site/public'), path.join(runtime, 'public'), { recursive: true });
  for (const f of ['config.json', 'auth.js']) fs.copyFileSync(path.join(ROOT, slug + '-site', f), path.join(runtime, f));
  fs.copyFileSync(path.join(__dirname, 'server.js'), path.join(runtime, 'server.js'));
  return path.join(runtime, 'server.js');
}

test('support requests and job applications go through to the staff portal and back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-suite-e2e-')), staffData = path.join(dir, 'staff');
  fs.mkdirSync(staffData);
  // A request from the retired support site, stored there as the SHA-256 of its reference.
  const oldReference = crypto.randomBytes(32).toString('hex'), oldFile = path.join(dir, 'old-support.json');
  fs.writeFileSync(oldFile, JSON.stringify({ tickets: [{ id: 'x', tracking: crypto.createHash('sha256').update(oldReference).digest('hex'), name: 'Old Visitor', email: 'old@example.test', subject: 'From the old site', status: 'in-progress', messages: [{ body: 'My first message', by: 'customer', at: '2026-10-01T10:00:00.000Z' }, { body: 'We are looking into it', by: 'HN Group support', at: '2026-10-02T10:00:00.000Z' }], createdAt: '2026-10-01T10:00:00.000Z' }] }));
  const store = require('../staff-portal/lib/store'); store.init(staffData);
  const owner = store.saveEmployee({ firstName: 'Hiring', lastName: 'Manager', company: store.COMPANIES[0], jobTitle: 'Manager', emails: [{ local: 'hiring.manager', domain: 'hngroup.org.uk', primary: true }] });
  const recruitment = require('../staff-portal/lib/recruitment'); recruitment.init(staffData);
  const vacancy = recruitment.saveVacancy({ title: 'Platform Engineer', company: 'Horizon Network', location: 'Remote (UK)', contract: 'full-time', salary: '£40,000', description: 'Look after our servers.', publicListing: true }, owner);
  recruitment.saveVacancy({ title: 'Internal only', company: 'HN Group', publicListing: false }, owner);
  const staffPort = await freePort(), mediaPort = await freePort(), careersPort = await freePort();
  const staffEnv = { DATA_DIR: staffData, HN_CONTROL_MANAGED: '1', SUPPORT_IMPORT_FILE: oldFile, STATUS_SSO_SECRET_FILE: path.join(dir, 'none') };
  const suiteEnv = (slug) => ({ DATA_DIR: path.join(dir, slug + '-data'), STAFF_PORTAL_BACKEND: 'http://127.0.0.1:' + staffPort, NEWS_BACKEND: 'http://127.0.0.1:9' });
  let staff, media, careers;
  try {
    staff = await start(path.join(ROOT, 'staff-portal/server.js'), staffEnv, staffPort);
    media = await start(site('media', dir), suiteEnv('media'), mediaPort);
    careers = await start(site('careers', dir), suiteEnv('careers'), careersPort);
    const post = (port, slug, route, data) => fetch('http://127.0.0.1:' + port + route, { method: 'POST', headers: { Origin: 'https://' + slug + '.hngroup.org.uk', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

    // Pages: the support page, the HN Group theme and the footer with the company and its parent.
    const page = await (await fetch('http://127.0.0.1:' + mediaPort + '/support')).text();
    assert.match(page, /assets\/site\.css/); assert.match(page, /<p class="footer-company"><span class="footer-parent">A subsidiary of HN Group Limited<\/span><\/p>/); assert.doesNotMatch(page, /<strong>Horizon Media Group<\/strong>/, 'the logo already names the company');
    assert.match(page, /horizon-media-group-logo-white\.svg/);
    assert.equal((await fetch('http://127.0.0.1:' + mediaPort + '/assets/hn-support.js')).status, 200);
    assert.equal((await fetch('http://127.0.0.1:' + mediaPort + '/nowhere')).status, 404);

    // A support request: only through the site, with a private reference.
    assert.equal((await post(mediaPort, 'evil', '/api/public/support', {})).status, 403);
    let r = await post(mediaPort, 'media', '/api/public/support', { name: 'Visitor', email: 'visitor@example.test', subject: 'Can’t sign in', message: 'HN Browser says my PIN is wrong.', topic: 'account', site: 'media' });
    assert.equal(r.status, 201); const { reference } = await r.json(); assert.match(reference, /^[a-f0-9]{64}$/);
    assert.equal((await post(mediaPort, 'media', '/api/public/support/track', { reference: 'f'.repeat(64) })).status, 404);
    r = await post(mediaPort, 'media', '/api/public/support/track', { reference, message: 'It still happens today.' });
    let seen = (await r.json()).request; assert.equal(seen.status, 'Received'); assert.equal(seen.site, 'Horizon Media Group'); assert.equal(seen.messages.length, 2);
    // Old references keep working.
    seen = (await (await post(mediaPort, 'media', '/api/public/support/track', { reference: oldReference })).json()).request;
    assert.equal(seen.subject, 'From the old site'); assert.equal(seen.status, 'In progress'); assert.deepEqual(seen.messages.map((m) => m.from), ['you', 'staff']);

    // Staff reply in Website enquiries; the visitor reads it on the website. Notes stay private.
    await stop(staff);
    const enquiries = require('../staff-portal/lib/enquiries'); enquiries.init(staffData);
    const request = enquiries.list().find((e) => e.subject === 'Can’t sign in');
    assert.equal(request.kind, 'support'); assert.ok(!('reference' in request), 'staff never see the reference');
    enquiries.update(enquiries.get(request.id), { reply: 'Try resetting your PIN on HN Account.', note: 'Internal: checked logs' }, owner);
    staff = await start(path.join(ROOT, 'staff-portal/server.js'), staffEnv, staffPort);
    seen = (await (await post(mediaPort, 'media', '/api/public/support/track', { reference })).json()).request;
    assert.equal(seen.status, 'In progress'); assert.equal(seen.messages.at(-1).from, 'staff'); assert.equal(seen.messages.at(-1).byName, 'Hiring Manager');
    assert.ok(!JSON.stringify(seen).includes('Internal: checked logs'));
    assert.equal(enquiries.list().filter((e) => e.subject === 'From the old site').length, 1, 'imported once');

    // Careers: public roles only; apply with a CV; check its stage.
    const jobs = (await (await fetch('http://127.0.0.1:' + careersPort + '/api/public/jobs')).json()).jobs;
    assert.deepEqual(jobs.map((j) => j.title), ['Platform Engineer']);
    for (const k of ['location', 'contract', 'salary', 'closingDate']) assert.ok(!(k in jobs[0]), k + ' is no longer published');
    assert.equal((await fetch('http://127.0.0.1:' + careersPort + '/jobs/' + vacancy.id)).status, 200);
    assert.equal((await fetch('http://127.0.0.1:' + careersPort + '/application')).status, 200);
    assert.equal((await post(mediaPort, 'media', '/api/public/jobs/application', { reference })).status, 404, 'company sites do not proxy careers routes');
    r = await fetch('http://127.0.0.1:' + careersPort + '/api/public/jobs/' + vacancy.id + '/apply', { method: 'POST', headers: { Origin: 'https://careers.hngroup.org.uk', 'Content-Type': 'application/octet-stream', 'X-Application': encodeURIComponent(JSON.stringify({ name: 'Ada Applicant', email: 'ada@example.test', message: 'Hello' })) } });
    assert.equal(r.status, 201); const applied = await r.json(); assert.match(applied.reference, /^[a-f0-9]{64}$/);
    let status = (await (await post(careersPort, 'careers', '/api/public/jobs/application', { reference: applied.reference })).json()).application;
    assert.equal(status.title, 'Platform Engineer'); assert.equal(status.stage, 'Received'); assert.equal(status.company, 'Horizon Network');
    await stop(staff);
    recruitment.init(staffData);
    const data = JSON.parse(fs.readFileSync(path.join(staffData, 'recruitment.json'), 'utf8'));
    const a = data.applicants.find((x) => x.email === 'ada@example.test'); assert.ok(a && a.reference && a.reference !== applied.reference, 'only a hash is kept'); assert.equal(a.cv, null, 'no CV is taken');
    recruitment.setStage(recruitment.getApplicant(a.id), 'interview', owner);
    staff = await start(path.join(ROOT, 'staff-portal/server.js'), staffEnv, staffPort);
    status = (await (await post(careersPort, 'careers', '/api/public/jobs/application', { reference: applied.reference })).json()).application;
    assert.equal(status.stage, 'Interview');
  } finally { await stop(careers); await stop(media); await stop(staff); fs.rmSync(dir, { recursive: true, force: true }); }
});
