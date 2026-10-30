'use strict';
// Website sign-ins stay signed in (the user's request, 30 October 2026: "not keeping signed in"): a website's Auth
// session isn't ended by Auth's own page loading again or by Auth restarting, and each check extends it to 30 days.
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
test('website sign-ins survive Auth page loads and restarts, and last 30 days from last use',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-website-session-')),store=require('../staff-portal/lib/store');store.init(dir);const person=store.saveEmployee({firstName:'Web',lastName:'Site',company:store.COMPANIES[0],jobTitle:'Team member',emails:[{local:'web.site',domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(person);store.setPassword(person,'Fixture-website-735!');store.setCode(person,'582947');const secret=path.join(dir,'secret');fs.writeFileSync(secret,'f'.repeat(64));
 async function port(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
 const staffPort=await port(),authPort=await port(),base='http://127.0.0.1:'+authPort;let staff,auth;
 async function start(file,env,p){const child=spawn(process.execPath,[path.resolve(__dirname,file)],{env:{...process.env,HOST:'127.0.0.1',PORT:String(p),DATA_DIR:dir,STATUS_SSO_SECRET_FILE:secret,HN_CONTROL_MANAGED:'1',...env},stdio:'ignore'});for(let i=0;i<200;i++){try{if((await fetch('http://127.0.0.1:'+p+'/healthz')).ok)return child;}catch{}if(child.exitCode!==null)throw Error('Fixture exited');await new Promise(r=>setTimeout(r,30));}throw Error('Fixture timed out');}
 async function stop(child){if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
 const cookie=(r,name)=>r.headers.getSetCookie().find(c=>c.startsWith(name+'='))?.split(';')[0]||'';
 const post=(route,data={},session='',token='')=>fetch(base+route,{method:'POST',headers:{Origin:'https://auth.hngroup.org.uk','Content-Type':'application/json',Cookie:session,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 const sso=(route,data)=>post('/api/sso/'+route,{client_id:'docs',...data},'','f'.repeat(64));
 try{
  staff=await start('../staff-portal/server.js',{},staffPort);auth=await start('server.js',{STAFF_PORTAL_BACKEND:'http://127.0.0.1:'+staffPort},authPort);
  const a=await post('/api/login',{username:'web.site@hngroup.org.uk',password:'Fixture-website-735!'});const b=await post('/api/login/code',{code:'582947'},cookie(a,'__Host-hn_auth_flow'));assert.equal(b.status,200);
  const authCookie=cookie(b,'__Host-hn_auth_session'),state=crypto.randomBytes(32).toString('hex');
  const c=await post('/api/continue',{client_id:'docs',state},authCookie);const code=new URL((await c.json()).redirect).searchParams.get('code');
  const exchanged=await sso('exchange',{code,state});assert.equal(exchanged.status,200);const site=await exchanged.json();
  assert.ok(site.expires>Date.now()+29*86400000,'a website sign-in lasts 30 days');
  // Auth's own page loading again ends Auth's browser session, but not the website's.
  const page=await fetch(base+'/',{headers:{Cookie:authCookie}});assert.match(page.headers.get('set-cookie')||'',/__Host-hn_auth_session=;/,'Auth ends its own session');
  assert.equal((await sso('session',{session:site.session})).status,200);
  // Restarting Auth (and the staff service) keeps it.
  await new Promise(r=>setTimeout(r,2500));
  await stop(auth);await stop(staff);staff=await start('../staff-portal/server.js',{},staffPort);auth=await start('server.js',{STAFF_PORTAL_BACKEND:'http://127.0.0.1:'+staffPort},authPort);
  const after=await sso('session',{session:site.session});assert.equal(after.status,200);assert.equal((await after.json()).user.email,'web.site@hngroup.org.uk');
  assert.ok(!fs.readFileSync(path.join(dir,'app-sessions.json'),'utf8').includes(site.session),'only a hash of the token is saved');
 }finally{await stop(auth);await stop(staff);fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
