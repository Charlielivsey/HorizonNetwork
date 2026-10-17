'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const{fixture,freePort}=require('./test-support.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function stop(child){if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
test('independent admin login, PIN, account setup, resume and revocation survive stopping real Auth and public staff',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-control-real-accounts-')),store=require('../staff-portal/lib/store');store.init(dir);
 function person(local){const p=store.saveEmployee({firstName:local,lastName:'Fixture',company:store.COMPANIES[0],jobTitle:'Team member',emails:[{local,domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(p);store.setPassword(p,'Fixture-password-584!');store.setCode(p,'582947');return p;}
 person('dogday');const ordinaryPerson=person('ordinary.fixture');const disabled=person('disabled.fixture');store.setAccountEnabled(disabled,false);
 const newbie=store.saveEmployee({firstName:'New',lastName:'Fixture',company:store.COMPANIES[0],jobTitle:'Team member',emails:[{local:'new.fixture',domain:'hngroup.org.uk',primary:true}]});const temporary=store.issueTemporaryPassword(newbie).temporaryPassword;
 const privatePort=await freePort(),authPort=await freePort(),publicPort=await freePort(),f=await fixture();
 const options=path.join(dir,'options.json');fs.writeFileSync(options,JSON.stringify({DATA_DIR:dir}));let errors='';
 const accounts=spawn(process.execPath,[path.resolve(__dirname,'accounts-server.js')],{env:{...process.env,AUTH_ACCOUNTS_CONFIG:options,AUTH_STAFF_SERVER:path.resolve(__dirname,'../staff-portal/server.js'),AUTH_PRIVATE_PORT:String(privatePort),STATUS_SSO_SECRET_FILE:f.secret},stdio:['ignore','ignore','pipe']});accounts.stderr.on('data',c=>errors+=c);
 let auth,proxy;
 const cookie=(res,name)=>res.headers.getSetCookie().find(c=>c.startsWith(name+'='))?.split(';')[0];
 const sign=(name,data,session='',extra={})=>f.request('/api/sign-in/'+name,data,session,extra);
 async function passwordLogin(username='dogday@hngroup.org.uk',password='Fixture-password-584!'){
  const first=await sign('login',{username,password});assert.equal(first.status,200);const data=await first.clone().json();if(!data.codeRequired)return first;
  const flow=cookie(first,'__Host-hn_control_flow');assert.equal((await sign('login/code',{code:'482957'},flow)).status,401);
  const verified=await sign('login/code',{code:'582947'},flow);assert.equal(verified.status,200);return verified;
 }
 try{
  for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:'+privatePort+'/healthz')).ok)break;}catch{}await wait(30);}
  f.env.CONTROL_ACCOUNTS_BACKEND='http://127.0.0.1:'+privatePort;await f.restart();
  auth=spawn(process.execPath,[path.resolve(__dirname,'../auth-site/server.js')],{env:{...process.env,PORT:String(authPort),STAFF_PORTAL_BACKEND:f.env.CONTROL_ACCOUNTS_BACKEND,STATUS_SSO_SECRET_FILE:f.secret},stdio:'ignore'});
  proxy=spawn(process.execPath,[path.resolve(__dirname,'../staff-portal/public-proxy.js')],{env:{...process.env,PORT:String(publicPort),PRIVATE_STAFF_BACKEND:f.env.CONTROL_ACCOUNTS_BACKEND},stdio:'ignore'});
  for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:'+authPort+'/healthz')).ok&&(await fetch('http://127.0.0.1:'+publicPort+'/healthz')).ok)break;}catch{}await wait(30);}
  assert.equal((await f.request('/auth/login')).headers.get('location'),'/login');
  assert.equal((await sign('login',{username:'dogday@hngroup.org.uk',password:'wrong'})).status,401);
  assert.equal((await sign('login',{username:'disabled.fixture@hngroup.org.uk',password:'Fixture-password-584!'})).status,401);
  const ownerLogin=await passwordLogin(),owner=cookie(ownerLogin,'__Host-hn_control_session'),remembered=cookie(ownerLogin,'__Host-hn_control_resume');assert.ok(remembered);
  assert.equal((await sign('continue',{},owner)).status,200);assert.equal((await f.request('/api/audit',undefined,owner)).status,200);
  const ordinary=await passwordLogin('ordinary.fixture@hngroup.org.uk'),ordinarySession=cookie(ordinary,'__Host-hn_control_session');
  assert.equal((await f.request('/api/state',undefined,ordinarySession)).status,403);
  // Stop isolated real broker/proxy processes, never production PM2 applications.
  await stop(auth);await stop(proxy);assert.equal((await fetch(f.env.CONTROL_ACCOUNTS_BACKEND+'/healthz')).status,200);
  assert.equal((await f.request('/api/state',undefined,owner)).status,200,'existing admin session survives Auth shutdown');
  const fresh=await passwordLogin();assert.equal((await sign('continue',{},cookie(fresh,'__Host-hn_control_session'))).status,200,'fresh sign-in works with Auth down');
  assert.equal((await sign('resume',undefined,remembered)).status,200);
  const wrong=await sign('resume',{code:'482957'},remembered);assert.equal(wrong.status,401);
  const resumed=await sign('resume',{code:'582947'},remembered);assert.equal(resumed.status,200);assert.ok(cookie(resumed,'__Host-hn_control_resume'));assert.notEqual(cookie(resumed,'__Host-hn_control_resume'),remembered,'remembered token rotates');
  await f.request('/api/access',{email:'new.fixture@hngroup.org.uk',permissions:['audit']},owner);
  const pending=await passwordLogin('new.fixture@hngroup.org.uk',temporary),pendingSession=cookie(pending,'__Host-hn_control_session');assert.equal((await pending.json()).user.passwordChangeRequired,true);
  assert.equal((await f.request('/api/state',undefined,pendingSession)).status,403);assert.equal((await sign('continue',{},pendingSession)).status,403);
  assert.equal((await sign('setup-code',{code:'582947'},pendingSession)).status,403);
  assert.equal((await sign('password',{newPassword:'Cedar-river-9842!'},pendingSession,{Origin:'https://evil.test'})).status,403);
  assert.equal((await sign('password',{newPassword:'Cedar-river-9842!'},pendingSession)).status,200);
  assert.equal((await sign('continue',{},pendingSession)).status,403);
  assert.equal((await sign('setup-code',{code:'582947'},pendingSession)).status,200);assert.equal((await sign('continue',{},pendingSession)).status,200);
  assert.equal((await f.request('/api/audit',undefined,pendingSession)).status,200);
  assert.equal((await f.request('/api/power',{action:'shutdown',site:'auth'},pendingSession)).status,403);
  await f.request('/api/access',{email:'new.fixture@hngroup.org.uk',remove:true},owner);assert.equal((await f.request('/api/state',undefined,pendingSession)).status,403);
  // Disabling a staff account invalidates its independent admin session immediately.
  const second=await passwordLogin('ordinary.fixture@hngroup.org.uk'),secondSession=cookie(second,'__Host-hn_control_session');
  await f.request('/api/access',{email:'ordinary.fixture@hngroup.org.uk',permissions:['audit']},owner);
  assert.equal((await f.request('/api/audit',undefined,secondSession)).status,200);
  const staffPost=(route,data,c='')=>fetch(f.env.CONTROL_ACCOUNTS_BACKEND+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:c},body:JSON.stringify(data)});
  const staffFirst=await staffPost('/api/login',{username:'dogday@hngroup.org.uk',password:'Fixture-password-584!'});
  const challenge=(await staffFirst.json()).challenge;
  const staffSigned=await staffPost('/api/login/code',{challenge,code:'582947'});
  const staffCookie=cookie(staffSigned,'hn_staff_session');
  assert.equal((await staffPost('/api/employees/'+ordinaryPerson.id+'/account/disable',{},staffCookie)).status,200);
  assert.equal((await f.request('/api/state',undefined,secondSession)).status,401);
  assert.equal((await sign('logout',{},owner)).status,200);assert.equal((await f.request('/api/state',undefined,owner)).status,401);
  const old=cookie(fresh,'__Host-hn_control_session');await f.restart();assert.equal((await f.request('/api/state',undefined,old)).status,401);
  assert.ok(!errors.split('\n').filter(line=>line&&!line.startsWith('Failed login for ')).length,errors);
 }finally{await stop(auth);await stop(proxy);await stop(accounts);await f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
