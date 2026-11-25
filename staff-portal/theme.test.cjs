'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('Midnight Lavender is the account default and all three explicit themes persist',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-theme-'));try{
 const store=require('./lib/store');store.init(dir);const p=store.saveEmployee({firstName:'Theme',lastName:'Fixture',company:'HN Group',jobTitle:'Analyst',emails:[{local:'theme.fixture',domain:'hngroup.org.uk',primary:true}]});
 assert.equal(store.themeOf(p),'midnight');
 for(const [input,expected]of [['light','light'],['lavender-dusk','dusk'],['midnight','midnight']]){store.setTheme(store.getPerson(p.id),input);assert.equal(store.themeOf(store.getPerson(p.id)),expected);store.init(dir);assert.equal(store.themeOf(store.getPerson(p.id)),expected);}
 assert.throws(()=>store.setTheme(store.getPerson(p.id),'invalid'),/Choose/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Roster charcoal palette stays readable across account themes without changing HR or Finance',async()=>{
 const http=require('node:http'),{chromium}=require('../browser-app/node_modules/playwright');
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/assets/')){const file=path.join(__dirname,'public',url.pathname);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/css');return res.end(fs.readFileSync(file));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html '+(url.searchParams.has('service')?'data-hn-app="'+url.searchParams.get('service')+'"':'data-portal-ui="2"')+'><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/assets/theme-boot.js"></script><script src="/assets/hn-theme.js"></script><link rel="stylesheet" href="/assets/style.css"><link rel="stylesheet" href="/assets/portal-ui.css"></head><body><main class="container"><section class="panel"><h1>Your workspace</h1><p class="muted">People and positions</p><button class="btn btn-ghost">Open directory</button><input aria-label="Search" placeholder="Search"></section></main></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage();for(const theme of ['light','dusk','midnight']){await page.context().addCookies([{name:'hn_theme',value:theme,url:base}]);await page.goto(base);assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(37, 38, 41)');assert.equal(await page.locator('.panel').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(48, 49, 54)');assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).color),'rgb(241, 238, 245)');assert.equal(await page.locator('.btn-ghost').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(155, 123, 183)');assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).colorScheme),'dark');assert.equal((await page.context().cookies()).find(c=>c.name==='hn_theme').value,theme);}
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const service of ['hr','finance']){await page.goto(base+'/?service='+service);assert.notEqual(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(37, 38, 41)');}
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
