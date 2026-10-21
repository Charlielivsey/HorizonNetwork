'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
test('direct Auth requires temporary-password replacement and missing PIN setup before any application access',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-auth-setup-'));const store=require('../staff-portal/lib/store');store.init(dir);
 const person=store.saveEmployee({firstName:'Example',lastName:'New',company:store.COMPANIES[0],jobTitle:'Team member',emails:[{local:'new.user',domain:'hngroup.org.uk',primary:true}]});const temporary=store.issueTemporaryPassword(person).temporaryPassword;
 const reset=store.saveEmployee({firstName:'Existing',lastName:'Account',company:store.COMPANIES[0],jobTitle:'Team member',emails:[{local:'reset.user',domain:'hngroup.org.uk',primary:true}]});const resetPassword=store.issueTemporaryPassword(reset).temporaryPassword;store.setCode(reset,'482957');
 const settingsFile=path.join(dir,'settings.json'),settings=JSON.parse(fs.readFileSync(settingsFile));settings.ownerEmail='new.user@hngroup.org.uk';fs.writeFileSync(settingsFile,JSON.stringify(settings));
 const secret=path.join(dir,'secret');fs.writeFileSync(secret,'f'.repeat(64));process.env.STATUS_SSO_SECRET_FILE=secret;
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,[path.resolve(__dirname,'../staff-portal/server.js')],{env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'ignore'});process.env.STAFF_PORTAL_BACKEND='http://127.0.0.1:'+port;
 const {server}=require('./server');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,origin='https://auth.hngroup.org.uk';
 const cookie=(res,name)=>res.headers.getSetCookie().find(c=>c.startsWith(name+'='))?.split(';')[0];
 const post=(route,data,session='',extra={})=>fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:session,...extra},body:JSON.stringify(data)});
 try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(process.env.STAFF_PORTAL_BACKEND+'/healthz')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready);
 assert.equal((await post('/api/password',{newPassword:'Cedar-river-9842!'})).status,401);
 assert.equal((await post('/api/setup-code',{code:'582947'})).status,401);
 const signed=await post('/api/login',{username:'new.user@hngroup.org.uk',password:temporary});assert.equal(signed.status,200);const user=(await signed.json()).user;assert.equal(user.passwordChangeRequired,true);assert.equal(user.codeSetupRequired,true);const session=cookie(signed,'__Host-hn_auth_session');assert.ok(session);
 for(const client_id of ['portal','status','website','network','media','holding','development','support','clients','careers','docs','news'])assert.equal((await post('/api/continue',{client_id,state:'a'.repeat(64)},session)).status,403);
 const serviceSession=crypto.createHash('sha256').update(session.split('=')[1]).digest('hex');
 assert.equal((await post('/api/sso/session',{session:serviceSession},'',{Authorization:'Bearer '+'f'.repeat(64)})).status,401);
 assert.equal((await post('/api/setup-code',{code:'582947'},session)).status,403);
 assert.equal((await post('/api/password',{newPassword:temporary},session)).status,400);
 assert.equal((await post('/api/password',{newPassword:'short'},session)).status,400);
 assert.equal((await post('/api/password',{newPassword:'Cedar-river-9842!'},session,{Origin:'https://evil.example'})).status,403);
 const changed=await post('/api/password',{newPassword:'Cedar-river-9842!'},session);assert.equal(changed.status,200);const afterPassword=(await changed.json()).user;assert.equal(afterPassword.passwordChangeRequired,undefined);assert.equal(afterPassword.codeSetupRequired,true);
 assert.equal((await post('/api/continue',{client_id:'portal',state:'a'.repeat(64)},session)).status,403);
 assert.equal((await post('/api/setup-code',{code:'111111'},session)).status,400);
 const set=await post('/api/setup-code',{code:'582947'},session);assert.equal(set.status,200);const readyUser=(await set.json()).user;assert.equal(readyUser.passwordChangeRequired,undefined);assert.equal(readyUser.codeSetupRequired,undefined);assert.equal(readyUser.statusAdminAllowed,true);assert.ok(cookie(set,'__Host-hn_auth_resume'));
 assert.equal((await post('/api/password',{newPassword:'Different-safe-873!'},session)).status,403);
 assert.equal((await post('/api/setup-code',{code:'482957'},session)).status,403);
 assert.equal((await post('/api/continue',{client_id:'status',state:'a'.repeat(64)},session)).status,200);
 assert.equal((await post('/api/login',{username:'new.user@hngroup.org.uk',password:temporary})).status,401);
 const normal=await post('/api/login',{username:'new.user@hngroup.org.uk',password:'Cedar-river-9842!'});assert.equal((await normal.json()).codeRequired,true);
 const normalCode=await post('/api/login/code',{code:'582947'},cookie(normal,'__Host-hn_auth_flow'));assert.equal(normalCode.status,200);const normalUser=(await normalCode.json()).user;assert.equal(normalUser.passwordChangeRequired,undefined);assert.equal(normalUser.codeSetupRequired,undefined);
 // A temporary password on an account which already has a PIN requires only password replacement.
 const resetLogin=await post('/api/login',{username:'reset.user@hngroup.org.uk',password:resetPassword});assert.equal((await resetLogin.json()).codeRequired,true);
 const resetSigned=await post('/api/login/code',{code:'482957'},cookie(resetLogin,'__Host-hn_auth_flow'));assert.equal(resetSigned.status,200);const resetUser=(await resetSigned.json()).user;assert.equal(resetUser.passwordChangeRequired,true);assert.equal(resetUser.codeSetupRequired,undefined);
 const resetChanged=await post('/api/password',{newPassword:'Amber-garden-8539!'},cookie(resetSigned,'__Host-hn_auth_session'));assert.equal(resetChanged.status,200);const resetDone=(await resetChanged.json()).user;assert.equal(resetDone.passwordChangeRequired,undefined);assert.equal(resetDone.codeSetupRequired,undefined);
 const ordinarySession=cookie(resetSigned,'__Host-hn_auth_session');
 for(const client_id of ['media','holding','development','support','clients','careers','docs']){
   const result=await post('/api/continue',{client_id,state:'b'.repeat(64)},ordinarySession);
   const target=new URL((await result.json()).redirect);
   assert.equal(target.origin,`https://${client_id}.hngroup.org.uk`);
   assert.equal(target.searchParams.get('error'),'access_denied');
   assert.equal(target.searchParams.has('code'),false);
 }
 // HN Group News admits anyone with a role at HN Group, not only owners and Super Admins.
 const newsGrant=new URL((await(await post('/api/continue',{client_id:'news',state:'b'.repeat(64)},ordinarySession)).json()).redirect);
 assert.equal(newsGrant.origin,'https://news.hngroup.org.uk');assert.equal(newsGrant.searchParams.has('code'),true);

 }finally{await new Promise(r=>server.close(r));if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}fs.rmSync(dir,{recursive:true,force:true});}
});
