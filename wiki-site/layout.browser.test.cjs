'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../browser-app/node_modules/playwright');
test('the shared theme does not replace the wiki sidebar width',async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/assets/')){
   const name=req.url.split('/').pop();if(!['wiki.css','hn-theme.js'].includes(name)){res.statusCode=404;return res.end();}
   res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'application/javascript');return res.end(fs.readFileSync(path.join(__dirname,'public/assets',name)));
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/wiki.css"><script src="/assets/hn-theme.js"></script></head><body><header class="site-header"><a class="brand">HN Group Wiki</a></header><div class="page"><nav class="sidebar"><ul>'+Array.from({length:15},(_,i)=>'<li><a href="#">Navigation '+i+'</a></li>').join('')+'</ul></nav><main class="content"><article class="article"><h1>Welcome to HN Group Wiki</h1><p>The article starts beside the sidebar.</p></article></main></div></body></html>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  for(const theme of ['light','dusk']){
   const context=await browser.newContext();await context.addCookies([{name:'hn_theme',value:theme,url:'http://127.0.0.1:'+server.address().port}]);const page=await context.newPage();
   for(const width of [1440,1024,390]){
    await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:'+server.address().port);
    const layout=await page.evaluate(()=>{
     const sidebar=document.querySelector('.sidebar'),content=document.querySelector('.content'),s=sidebar.getBoundingClientRect(),c=content.getBoundingClientRect();
     return {width:s.width,sidebarHidden:getComputedStyle(sidebar).display==='none',left:c.left,top:c.top,sidebarTop:s.top,right:s.right,overflow:document.documentElement.scrollWidth>innerWidth,theme:document.documentElement.dataset.hnTheme};
    });
    assert.equal(layout.theme,theme);
    if(width>820){assert.equal(layout.width,200);assert(layout.left>=layout.right-1);assert(Math.abs(layout.top-layout.sidebarTop)<2,'article stays beside the sidebar');}
    else assert(layout.sidebarHidden);
    assert.equal(layout.overflow,false);
   }
   await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
