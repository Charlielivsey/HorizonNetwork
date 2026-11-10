'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {allowed}=require('./server');
test('HR proxy exposes migrated tools and required session assets only',()=>{
 for(const path of ['/leave','/auth/start','/api/leave','/api/leave/grid','/api/leave/extra','/rotas','/reviews','/objectives','/feedback','/flexible','/exit-interview','/exit-interviews','/staff-files','/training','/cases','/employees','/onboarding','/jobs','/job-descriptions','/home','/notifications','/api/meta','/assets/app.js'])assert.equal(allowed(path,'GET'),true,path);
 for(const path of ['/roles','/api/roles','/api/logins','/api/auth/profile','/api/system','/api/recruitment'])assert.equal(allowed(path,'GET'),false,path);
 assert.equal(allowed('/api/accounts-handoff','POST'),true);assert.equal(allowed('/api/accounts-handoff','GET'),false);
 assert.equal(allowed('/api/public/jobs','GET'),false);
 assert.equal(allowed('/api/leave/extra','POST'),true);assert.equal(allowed('/api/me/theme','POST'),true);
 for(const prefix of ['leave','rotas','timesheets','reviews','objectives','feedback','flexible','exit-interview','exit-interviews','staff-files','training','cases','employees','onboarding','jobs','job-descriptions','positions']) { assert.equal(allowed('/api/'+prefix,'GET'),true);assert.equal(allowed('/api/'+prefix+'/item','POST'),true);assert.equal(allowed('/api/'+prefix+'-unrelated','GET'),false); }
 for(const method of ['PUT','DELETE','OPTIONS'])assert.equal(allowed('/api/leave',method),false);
 for(const p of ['/api/notifications/anything','/api/me/password','/api/payroll','/api/payslips','/api/funds','/api/directory'])assert.equal(allowed(p,'POST'),false,p);
});
test('the Staff Portal redirects HR tools and rejects their APIs, even if its private HR header is spoofed',async()=>{
 const http=require('node:http'),{spawn}=require('node:child_process'),path=require('node:path');
 const upstream=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({privateHeader:req.headers['x-hn-hr-app']||null}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,[path.join(__dirname,'../staff-portal/public-proxy.js')],{env:{...process.env,PORT:String(port),PRIVATE_STAFF_BACKEND:'http://127.0.0.1:'+upstream.address().port},stdio:'ignore'}),base='http://127.0.0.1:'+port;
 try{
  for(let i=0;i<50;i++){try{await fetch(base+'/healthz');break;}catch{await new Promise(r=>setTimeout(r,30));}}
  for(const path of ['/leave','/rotas','/reviews','/objectives','/feedback','/flexible','/exit-interview','/exit-interviews','/staff-files','/training','/cases','/employees','/onboarding','/jobs','/job-descriptions']) {
 const page=await fetch(base+path+'?person=test&year=2026',{redirect:'manual'});assert.equal(page.status,302);assert.equal(page.headers.get('location'),'https://hr.hngroup.org.uk'+path+'?person=test&year=2026');
 assert.equal((await fetch(base+'/api'+path,{headers:{'x-hn-hr-app':'1'}})).status,410);
 }
  assert.equal((await fetch(base+'/api/leave',{headers:{'x-hn-hr-app':'1'}})).status,410);
  assert.equal((await(await fetch(base+'/api/me',{headers:{'x-hn-hr-app':'1'}})).json()).privateHeader,null);
 }finally{child.kill();await new Promise(r=>upstream.close(r));}
});

test('HR return paths stay on approved tools and preserve queries',()=>{
 const {nextFor}=require('../staff-portal/lib/portal-auth');const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-hn-hr-app':'1'}};
 for(const p of ['/home','/reviews?person=abc','/staff-files?person=abc#files','/employees','/onboarding','/jobs','/job-descriptions'])assert.equal(nextFor(req,p,()=>null),p);
 for(const p of ['https://evil.test/leave','//evil.test/leave','//[','/api/system','/roles','/leave\\evil','/leave\n'])assert.equal(nextFor(req,p,()=>null),null);
});

test('HR shell isolates its assets and removes portal-only components',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{hrHtml}=require('./server');
 const html=hrHtml(fs.readFileSync(path.join(__dirname,'../staff-portal/public/app.html'),'utf8'));
 assert.doesNotMatch(html,/deprecation-banner|\/assets\/(portal-ui|position-chart|personal-calendar)\.(?:css|js)/);
 assert.ok(html.indexOf('/assets/hr-ui.js?')<html.indexOf('/assets/app.js?'));
 assert.match(html,/\/assets\/hr-ui\.css\?v=/);
 assert.equal((html.match(/src="\/assets\/workspace-navigation\.js/g)||[]).length,1);assert.equal((html.match(/href="\/assets\/workspace-navigation\.css/g)||[]).length,1);
 assert.ok(html.indexOf('/assets/workspace-navigation.js?')<html.indexOf('/assets/hr-ui.js?'));
 const script=fs.readFileSync(path.join(__dirname,'public/assets/hr-ui.js'),'utf8');
 for(const mode of [undefined,'finance']){const dataset=mode?{hnApp:mode}:{};vm.runInNewContext(script,{document:{documentElement:{dataset}}});assert.equal(dataset.hrUi,undefined);}
});
