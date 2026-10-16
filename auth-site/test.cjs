'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');
test('real staff password and PIN, minimal live profile, avatar, fixed clients and central logout', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-auth-test-'));
  const store = require('../staff-portal/lib/store'); store.init(dir);
  const person = store.saveEmployee({ firstName: 'Test', lastName: 'Owner', jobTitle: 'System owner', company: store.COMPANIES[0], emails: [{ local: 'test.owner', domain: 'hngroup.org.uk', primary: true }] });
  store.issueTemporaryPassword(person); store.setPassword(person, 'Test-password-582!'); store.setCode(person, '582947');
  const avatar = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zSsAAAAASUVORK5CYII=';
  store.saveAvatar(person, 'data:image/png;base64,' + avatar);
  const settingsFile = path.join(dir, 'settings.json'), settings = JSON.parse(fs.readFileSync(settingsFile));
  settings.ownerEmail = 'test.owner@hngroup.org.uk'; fs.writeFileSync(settingsFile, JSON.stringify(settings));
  const secret = path.join(dir, 'secret'); fs.writeFileSync(secret, 'c'.repeat(64));
  process.env.STATUS_SSO_SECRET_FILE = secret;
  const reserve = http.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port; await new Promise(r => reserve.close(r));
  const child = spawn(process.execPath, ['staff-portal/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: ['ignore','ignore','pipe'] });
  let errors=''; child.stderr.on('data', c=>errors+=c);
  process.env.STAFF_PORTAL_BACKEND = `http://127.0.0.1:${port}`;
  const { server } = require('./server'); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`, origin = 'https://auth.hngroup.org.uk';
  async function post(route, data, cookie = '', extra = {}) { return fetch(base + route, { method:'POST', headers:{ Origin:origin, 'Content-Type':'application/json', Cookie:cookie, ...extra }, body:JSON.stringify(data) }); }
  try {
    let started=false; for(let n=0;n<100;n++){try{if((await fetch(process.env.STAFF_PORTAL_BACKEND+'/healthz')).ok){started=true;break;}}catch{} await new Promise(r=>setTimeout(r,50));} assert.ok(started,errors);
    assert.equal((await fetch(base+'/api/me')).status,401);
    assert.equal((await post('/api/login',{ username:'test.owner@hngroup.org.uk',password:'bad' })).status,401);
    assert.equal((await post('/api/login',{ username:'test.owner@hngroup.org.uk',password:'Test-password-582!' },'',{Origin:'https://evil.example'})).status,403);
    const login = await post('/api/login',{ username:'test.owner@hngroup.org.uk',password:'Test-password-582!' });
    assert.deepEqual(await login.json(),{codeRequired:true});
    const flow = login.headers.getSetCookie()[0].split(';')[0]; assert.match(login.headers.getSetCookie()[0],/HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await post('/api/login/code',{code:'582947'})).status,401);
    assert.equal((await post('/api/login/code',{code:'111111'},flow)).status,401);
    const verified = await post('/api/login/code',{code:'582947'},flow); assert.equal(verified.status,200);
    const account = (await verified.json()).user;
    assert.deepEqual(Object.keys(account).sort(),['id','displayName','email','jobTitle','company','avatarUrl','statusAdminAllowed','ownerAccess'].sort());
    assert.equal(account.email,'test.owner@hngroup.org.uk'); assert.equal(account.displayName,'Test Owner'); assert.equal(account.jobTitle,'System owner'); assert.equal(account.company,store.COMPANIES[0]); assert.equal(account.statusAdminAllowed,true); assert.equal(account.ownerAccess,true);
    const cookie = verified.headers.getSetCookie().find(c=>c.startsWith('__Host-hn_auth_session=')).split(';')[0];
    assert.ok(!verified.headers.get('set-cookie').includes('hn_staff_session='));
    // Every new site uses its registered callback and its own one-use grant.
    for (const client of ['media','holding','development','support','clients','careers','docs','news']) {
      const state = 'e'.repeat(64);
      const grant = await post('/api/continue', {client_id:client,state}, cookie);
      assert.equal(grant.status,200);
      const callback = new URL((await grant.json()).redirect);
      assert.equal(callback.origin,`https://${client}.hngroup.org.uk`);
      assert.equal(callback.pathname,'/auth/callback');
      const exchanged = await post('/api/sso/exchange',{client_id:client,state,code:callback.searchParams.get('code')},'',{Authorization:'Bearer '+'c'.repeat(64)});
      assert.equal(exchanged.status,200);
      const session = (await exchanged.json()).session;
      assert.equal((await post('/api/sso/session',{client_id:client,session},'',{Authorization:'Bearer '+'c'.repeat(64)})).status,200);
      assert.equal((await post('/api/sso/session',{client_id:'wiki',session},'',{Authorization:'Bearer '+'c'.repeat(64)})).status,401);
    }

    assert.equal((await post('/api/login/code',{code:'582947'},flow)).status,401);
    const picture = await fetch(base+'/api/avatar',{headers:{Cookie:cookie}}); assert.equal(picture.status,200); assert.deepEqual(Buffer.from(await picture.arrayBuffer()),Buffer.from(avatar,'base64'));
    assert.equal((await fetch(base+'/api/avatar')).status,401);
    assert.equal((await fetch(base+'/authorize?client_id=evil&state='+'a'.repeat(64)+'&redirect_uri=https://evil.example')).status,400);
    assert.equal((await post('/api/continue',{client_id:'evil',state:'a'.repeat(64)},cookie)).status,400);
    const state='a'.repeat(64), grant=await post('/api/continue',{client_id:'status',state},cookie), callback=new URL((await grant.json()).redirect);
    assert.equal(callback.origin,'https://status.hngroup.org.uk');
    assert.equal((await post('/api/sso/exchange',{code:callback.searchParams.get('code'),state})).status,401);
    const exchange=await post('/api/sso/exchange',{code:callback.searchParams.get('code'),state},'',{Authorization:'Bearer '+'c'.repeat(64)}); assert.equal(exchange.status,200);
    const sso=await exchange.json();
    assert.equal((await post('/api/sso/exchange',{code:callback.searchParams.get('code'),state},'',{Authorization:'Bearer '+'c'.repeat(64)})).status,401);
    const authHeader={Authorization:'Bearer '+'c'.repeat(64)};
    assert.equal((await post('/api/sso/session',{session:sso.session},'',authHeader)).status,200);
    const ssoAvatar = await post('/api/sso/avatar',{session:sso.session},'',authHeader);
    assert.equal(ssoAvatar.status,200); assert.equal(ssoAvatar.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await ssoAvatar.arrayBuffer()),Buffer.from(avatar,'base64'));
    assert.equal((await post('/api/sso/avatar',{session:sso.session})).status,401);
    const refreshed = await fetch(base + '/', { headers: { Cookie: cookie } });
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.headers.getSetCookie().filter(c => /Max-Age=0/.test(c)).length, 2);
    assert.equal((await post('/api/sso/session',{session:sso.session},'',authHeader)).status,401);
    assert.equal((await post('/api/logout',{},cookie)).status,200);
    assert.equal((await post('/api/sso/session',{session:sso.session},'',authHeader)).status,401);
    assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,401);
    const pendingLogin = await post('/api/login',{ username:'test.owner@hngroup.org.uk',password:'Test-password-582!' });
    const pendingFlow = pendingLogin.headers.getSetCookie()[0].split(';')[0];
    const pinRefresh = await fetch(base + '/authorize?client_id=status&state=' + state, { headers: { Cookie: pendingFlow } });
    assert.equal(pinRefresh.status, 200);
    assert.equal((await post('/api/login/code',{code:'582947'},pendingFlow)).status,401);
    // Remembering an account is separate from signing in, and is isolated per browser.
    const resumeCookie = verified.headers.getSetCookie().find(c=>c.startsWith('__Host-hn_auth_resume=')).split(';')[0];
    assert.match(verified.headers.getSetCookie().find(c=>c.startsWith('__Host-hn_auth_resume=')), /HttpOnly; Secure; SameSite=Lax; Max-Age=2592000/);
    assert.deepEqual(await (await fetch(base+'/api/resume')).json(), { available:false });
    assert.equal((await fetch(base+'/api/me',{headers:{Cookie:resumeCookie}})).status,401);
    const remembered = await (await fetch(base+'/api/resume',{headers:{Cookie:resumeCookie}})).json();
    assert.equal(remembered.available,true); assert.equal(remembered.firstName,'Test'); assert.equal(remembered.username,'test.owner@hngroup.org.uk');
    const rememberedAvatar = await fetch(base+'/api/resume/avatar',{headers:{Cookie:resumeCookie}});
    assert.equal(rememberedAvatar.status,200); assert.deepEqual(Buffer.from(await rememberedAvatar.arrayBuffer()),Buffer.from(avatar,'base64'));
    assert.equal((await fetch(base+'/api/resume/avatar')).status,401);
    assert.equal((await post('/api/resume',{code:'582947'})).status,401);
    assert.equal((await post('/api/resume',{code:'582947'},resumeCookie,{Origin:'https://evil.example'})).status,403);
    assert.equal((await post('/api/resume',{code:'111111'},resumeCookie)).status,401);
    const resumed = await post('/api/resume',{code:'582947'},resumeCookie);
    assert.equal(resumed.status,200); assert.equal((await resumed.json()).user.email,account.email);
    const rotated = resumed.headers.getSetCookie().find(c=>c.startsWith('__Host-hn_auth_resume=')).split(';')[0];
    assert.notEqual(rotated,resumeCookie);
    assert.equal((await (await fetch(base+'/api/resume',{headers:{Cookie:resumeCookie}})).json()).available,false);
    const resumedSession = resumed.headers.getSetCookie().find(c=>c.startsWith('__Host-hn_auth_session=')).split(';')[0];
    const resumeGrant = await post('/api/continue',{client_id:'website',state},resumedSession);
    const resumeCallback = new URL((await resumeGrant.json()).redirect);
    assert.equal(resumeCallback.origin,'https://hngroup.org.uk');
    assert.equal((await post('/api/sso/exchange',{client_id:'website',code:resumeCallback.searchParams.get('code'),state},'',authHeader)).status,200);
    await fetch(base+'/',{headers:{Cookie:resumedSession+'; '+rotated}});
    assert.equal((await fetch(base+'/api/me',{headers:{Cookie:resumedSession}})).status,401);
    assert.equal((await (await fetch(base+'/api/resume',{headers:{Cookie:rotated}})).json()).available,true);
    for(let i=0;i<5;i++) {
      const wrong = await post('/api/resume',{code:'111111'},rotated); assert.equal(wrong.status,401);
      if(i===4) { assert.equal((await wrong.json()).restart,true); assert.match(wrong.headers.get('set-cookie'),/Max-Age=0/); }
    }
    assert.equal((await post('/api/resume',{code:'582947'},rotated)).status,401);
    const again = await post('/api/login',{username:account.email,password:'Test-password-582!'});
    const againVerified = await post('/api/login/code',{code:'582947'},again.headers.getSetCookie()[0].split(';')[0]);
    const againRemembered = againVerified.headers.getSetCookie().find(c=>c.startsWith('__Host-hn_auth_resume=')).split(';')[0];
    assert.equal((await post('/api/resume/forget',{},againRemembered)).status,200);
    assert.equal((await (await fetch(base+'/api/resume',{headers:{Cookie:againRemembered}})).json()).available,false);

  } finally { await new Promise(r=>server.close(r)); if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));} fs.rmSync(dir,{recursive:true,force:true}); }
});
