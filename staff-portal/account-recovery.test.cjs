'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
test('terminal recovery requires local service credentials, restores only lock state and rejects retired providers',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-account-recovery-'));process.env.STATUS_SSO_SECRET_FILE=path.join(dir,'secret');fs.writeFileSync(process.env.STATUS_SSO_SECRET_FILE,'a'.repeat(64));
 const store=require('./lib/store');store.init(dir);
 const make=(name)=>{const p=store.saveEmployee({firstName:name,lastName:'Fixture',company:'HN Group',jobTitle:'Analyst',emails:[{local:name.toLowerCase(),domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(p);store.setPassword(p,'Fixture-password-582!');store.setCode(p,'582947');return p;};
 const a=make('Locked'),b=make('Disabled');store.setAccountEnabled(b,false);store.setAccountLocked(b,true,'Fixture');store.noteAccountFailure(a);store.noteAccountFailure(a);
 const events=[];const{createStatusSso}=require('./lib/status-sso');const handle=createStatusSso({store,sessions:new Map(),sendJson(res,status,value){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));},async readJsonBody(req){let s='';for await(const c of req)s+=c;return JSON.parse(s||'{}');},logEvent(...v){events.push(v)}});
 const server=http.createServer(async(req,res)=>{try{if(!await handle(req,res,new URL(req.url,'http://localhost').pathname,null)){res.writeHead(404);res.end();}}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}))}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(email,headers={},route='/api/auth/account-unlock')=>fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64),'Content-Type':'application/json',...headers},body:JSON.stringify({email})});
 try{
  assert.equal((await fetch(base+'/api/auth/account-unlock')).status,405);
  for(const headers of [{Authorization:''},{Origin:'https://staff.hngroup.org.uk'},{'X-Forwarded-For':'203.0.113.1'}])assert.equal((await post('locked@hngroup.org.uk',headers)).status,403);
  assert.ok(a.account.locked);assert.equal((await post('locked')).status,400);assert.equal((await post('missing@hngroup.org.uk')).status,404);
  assert.equal((await post(' LOCKED@HNGROUP.ORG.UK ')).status,200);assert.equal(a.account.locked,undefined);assert.equal(a.account.enabled,true);assert.equal(a.account.failedSignIns,0);assert.ok(store.verifyPassword(a,'Fixture-password-582!'));assert.ok(store.verifyCode(a,'582947'));assert.ok(b.account.locked);
  assert.equal((await post('disabled@hngroup.org.uk')).status,200);assert.equal(b.account.enabled,false);assert.equal(b.account.locked,undefined);assert.equal(events.length,2);
  for(const provider of ['google','discord'])for(const action of ['login','link'])assert.equal((await post('',{},'/api/auth/'+provider+'-'+action)).status,410);
  store.init(dir);assert.equal(store.findByLogin('locked@hngroup.org.uk',true).account.enabled,true);assert.equal(store.findByLogin('locked@hngroup.org.uk',true).account.failedSignIns,0);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
