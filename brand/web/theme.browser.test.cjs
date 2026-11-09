'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../../browser-app/node_modules/playwright');
const ROOT=path.join(__dirname,'../..');
test('Midnight Lavender is the shared default and explicit choices keep their colours',async()=>{
 const sources={'staff': 'staff-portal/public/assets/style.css','wiki':'wiki-site/public/assets/wiki.css','mail':'mail-site/public/assets/mail.css','contracts':'contracts-site/public/assets/contracts.css','main':'hngroup-site/public/assets/site.css'};
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');if(u.pathname==='/theme.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(__dirname,'hn-theme.js')));}
  if(u.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync(path.join(ROOT,sources[u.searchParams.get('site')])));}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html data-theme="midnight"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css?site='+u.searchParams.get('site')+'"><script src="/theme.js"></script></head><body><h1>Theme fixture</h1><span class="on-light">Light logo</span><span class="on-dark">Dark logo</span></body></html>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let b;
 try{b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 for(const [cookie,expected,bg]of[['','midnight','#100d1a'],['midnight','midnight','#100d1a'],['light','light','#faf8fd'],['dusk','dusk','#17121f']]){
  const context=await b.newContext();if(cookie)await context.addCookies([{name:'hn_theme',value:cookie,url:'http://127.0.0.1:'+server.address().port}]);const page=await context.newPage();
  for(const site of Object.keys(sources)){await page.goto('http://127.0.0.1:'+server.address().port+'/?site='+site);assert.equal(await page.evaluate(()=>document.documentElement.dataset.hnTheme),expected);assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()),bg,site+' palette');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),expected==='light'?'light':'dark');}
  await context.close();
 }
 }finally{if(b)await b.close();await new Promise(r=>server.close(r));}
});
