'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
test('Auth callback is state-bound; management requires an authorised session and same-origin JSON',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-bots-site-')),secret=path.join(dir,'secret');fs.writeFileSync(secret,'a'.repeat(64));process.env.STATUS_SSO_SECRET_FILE=secret;
 let role=true,owner=true,calls=[];const backend=http.createServer(async(req,res)=>{let text='';for await(const c of req)text+=c;const data=JSON.parse(text||'{}');assert.equal(req.headers.authorization,'Bearer '+'a'.repeat(64));res.setHeader('Content-Type','application/json');if(req.url==='/api/service/bots'){calls.push(data);res.end(JSON.stringify({result:{settings:{enabled:true},credentials:{botTokenSet:true}}}));}else res.end(JSON.stringify({session:'b'.repeat(64),expires:Date.now()+86400000,user:{id:'owner',accountId:'owner-account',email:'owner@hngroup.org.uk',displayName:'Owner',ownerAccess:owner,statusAdminAllowed:role}}));});await new Promise(r=>backend.listen(0,'127.0.0.1',r));process.env.AUTH_BACKEND='http://127.0.0.1:'+backend.address().port;
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const base='http://127.0.0.1:'+port;process.env.BOTS_ORIGIN=base;
 const{createServer}=require('./server'),server=createServer({dir});await new Promise(r=>server.listen(port,'127.0.0.1',r));let cookie;
 try{
  assert.equal((await fetch(base+'/',{redirect:'manual'})).headers.get('location'),'/auth/login');assert.equal((await fetch(base+'/api/me')).status,401);assert.equal((await fetch(base+'/assets/site.css')).status,200);
  const start=await fetch(base+'/auth/login',{redirect:'manual'}),stateCookie=start.headers.getSetCookie()[0].split(';')[0],authURL=new URL(start.headers.get('location'));assert.equal(authURL.origin,'https://auth.hngroup.org.uk');assert.equal(authURL.searchParams.get('client_id'),'bots');
  const callback='/auth/callback?code='+'c'.repeat(64)+'&state='+authURL.searchParams.get('state');assert.equal((await fetch(base+callback,{redirect:'manual'})).status,400);
  const accepted=await fetch(base+callback,{headers:{Cookie:stateCookie},redirect:'manual'});assert.equal(accepted.status,302);cookie=accepted.headers.getSetCookie().find(c=>c.startsWith('hn_bots_session=')).split(';')[0];
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,200);
  const send=(origin,data,content='application/json')=>fetch(base+'/api/bot',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':content},body:JSON.stringify(data)});
  assert.equal((await send('https://evil.test',{action:'connection',payload:{operation:'stop'}})).status,403);assert.equal((await send(base,{action:'state'},'text/plain')).status,403);assert.equal((await send(base,{action:'not-a-real-operation'})).status,400);assert.equal(calls.length,0);
  assert.equal((await send(base,{action:'state'})).status,200);assert.equal(calls[0].session,'b'.repeat(64));assert.equal(calls[0].action,'state');
  const now=Date.now;role=false;owner=false;Date.now=()=>now()+61000;
  try{assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,403);}finally{Date.now=now;}
  role=true;owner=true;
  assert.equal((await fetch(base+'/../sessions.json',{headers:{Cookie:cookie}})).status,403);
 }finally{server.closeAllConnections();backend.closeAllConnections();await new Promise(r=>server.close(r));await new Promise(r=>backend.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
