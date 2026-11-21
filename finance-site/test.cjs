'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http');
const {allowed, financeHtml, createServer} = require('./server');
test('Finance exposes its screens and APIs, with exact API path boundaries', () => {
 for (const p of ['/home','/notifications','/api/live','/payslips','/expenses','/payroll','/funds','/invoices','/bills','/auth/start','/auth/callback','/api/meta','/api/directory','/api/payslips/p60','/api/payroll/year-end.csv','/api/expenses/abc/receipt','/assets/app.js']) assert.equal(allowed(p,'GET'),true,p);
 for (const p of ['/employees','/leave','/api/leave','/api/system','/api/auth/profile','/api/logins','/api/employees','/api/payroll-evil','/api/me/password']) assert.equal(allowed(p,'GET'),false,p);
 assert.equal(allowed('/api/funds/add','POST'),true);assert.equal(allowed('/api/me/theme','POST'),true);assert.equal(allowed('/api/directory','POST'),false);assert.equal(allowed('/api/payroll/run','DELETE'),false);
 const html=financeHtml(fs.readFileSync(require('node:path').join(__dirname,'../staff-portal/public/app.html'),'utf8'));
 assert.doesNotMatch(html,/deprecation-banner/);assert.match(html,/data-hn-app="finance"/);assert.match(html,/<title>HN Group Finance<\/title>/);assert.doesNotMatch(html,/>Staff Portal<\/span>/);assert.match(html,/href="\/payslips"/);assert.match(html,/finance-ui.css/);assert.match(html,/finance-ui.js/);assert.doesNotMatch(html,/src="\/assets\/portal-ui.js/);
});
test('Finance proxy blocks foreign origins and forwards bodies, trust marker, downloads and upstream failure',async()=>{
 const backend=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({url:req.url,finance:req.headers['x-hn-finance-app'],hr:req.headers['x-hn-hr-app'],body:Buffer.concat(chunks).toString()}));});});
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));const server=createServer('http://127.0.0.1:'+backend.address().port);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/system')).status,404);
  assert.equal((await fetch(base+'/api/funds/add',{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
  const r=await fetch(base+'/api/funds/add',{method:'POST',headers:{Origin:'https://finance.hngroup.org.uk','X-HN-HR-App':'1','Content-Type':'application/json'},body:'{"amount":5}'});assert.deepEqual(await r.json(),{url:'/api/funds/add',finance:'1',body:'{"amount":5}'});
  const home=await fetch(base+'/?section=company',{redirect:'manual'});assert.equal(home.status,302);assert.equal(home.headers.get('location'),'/home?section=company');
  backend.closeAllConnections();await new Promise(r=>backend.close(r));assert.equal((await fetch(base+'/api/me')).status,503);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(backend.listening)await new Promise(r=>backend.close(r));}
});
