'use strict';
// The sign-in page (public/app.js) keeps its own list of applications: a client the server knows but the page
// doesn't leaves people stuck after signing in, so the two lists must always match.
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const keys=(file,start,end)=>{const text=fs.readFileSync(path.join(__dirname,file),'utf8'),from=text.indexOf(start),block=text.slice(from,text.indexOf(end,from));return[...block.matchAll(/^\s+'?([a-z][a-z-]*)'?\s*:\s*\{/gm)].map(m=>m[1]).sort();};
test('every application registered in server.js is known to the sign-in page',()=>{
 const server=keys('server.js','const CLIENTS','\n};'),page=keys('public/app.js','const APPS','\n};');
 assert.ok(server.includes('devices')&&server.includes('app-manager'));
 assert.deepEqual(page,server);
 assert.ok(!server.includes('evan'), 'retired private site has no Auth entry');
});

// Guest accounts (the user's request, 6 November 2026) only get the websites and apps ticked for them, and each
// website's own rule still applies.
test('guest accounts only reach the websites and apps ticked for them', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hn-auth-clients-'));
  process.env.DATA_DIR = dir; // Never load the live bot configuration in a test.
  require('node:test').after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { CLIENTS } = require('./server');
  const guest = { guest: true, guestSites: ['docs', 'portal', 'status'], username: 'visitor@example.com' };
  assert.equal(CLIENTS.docs.allowed(guest), true);
  assert.equal(CLIENTS.contracts.allowed(guest), false, 'not ticked');
  assert.equal(CLIENTS.browser.allowed(guest), false, 'apps too');
  assert.equal(CLIENTS.portal.allowed({ ...guest, standalone: true }), false, 'the staff portal still needs a staff profile');
  assert.equal(CLIENTS.status.allowed(guest), false, 'ticking an admin site doesn’t make them an admin');
  assert.equal(CLIENTS.contracts.allowed({ username: 'staff@hngroup.org.uk' }), true, 'ordinary accounts are unchanged');
});
