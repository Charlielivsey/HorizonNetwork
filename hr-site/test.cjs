'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {allowed}=require('./server');
test('HR proxy only exposes leave screens and required session assets',()=>{
 for(const path of ['/leave','/auth/start','/api/leave','/api/leave/grid','/api/leave/extra','/api/meta','/assets/app.js'])assert.equal(allowed(path,'GET'),true,path);
 for(const path of ['/employees','/home','/api/employees','/api/logins','/api/auth/profile','/api/system','/api/recruitment'])assert.equal(allowed(path,'GET'),false,path);
 assert.equal(allowed('/api/leave/extra','POST'),true);assert.equal(allowed('/api/me/theme','POST'),false);
});
test('the Staff Portal redirects leave and rejects leave APIs, even if its private HR header is spoofed',async()=>{
 const http=require('node:http'),{spawn}=require('node:child_process'),path=require('node:path');
 const upstream=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({privateHeader:req.headers['x-hn-hr-app']||null}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,[path.join(__dirname,'../staff-portal/public-proxy.js')],{env:{...process.env,PORT:String(port),PRIVATE_STAFF_BACKEND:'http://127.0.0.1:'+upstream.address().port},stdio:'ignore'}),base='http://127.0.0.1:'+port;
 try{
  for(let i=0;i<50;i++){try{await fetch(base+'/healthz');break;}catch{await new Promise(r=>setTimeout(r,30));}}
  const page=await fetch(base+'/leave',{redirect:'manual'});assert.equal(page.status,302);assert.equal(page.headers.get('location'),'https://hr.hngroup.org.uk/leave');
  assert.equal((await fetch(base+'/api/leave',{headers:{'x-hn-hr-app':'1'}})).status,410);
  assert.equal((await(await fetch(base+'/api/me',{headers:{'x-hn-hr-app':'1'}})).json()).privateHeader,null);
 }finally{child.kill();await new Promise(r=>upstream.close(r));}
});
