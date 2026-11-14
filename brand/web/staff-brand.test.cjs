'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const branding=require('./hn-staff-brand.js'),root=path.resolve(__dirname,'../..');
test('selected Auth profile determines staff chrome; main company is a legacy fallback',()=>{
 assert.equal(branding.resolve({mainCompany:'Horizon Network',company:'Horizon Advertising',otherRoles:[{company:'HN Group'}]}).name,'Horizon Advertising');
 assert.equal(branding.caption(branding.resolve({company:'Horizon Advertising Limited'})),'Horizon Advertising Limited, a subsidiary of Horizon Media Group');
 assert.equal(branding.caption(branding.resolve({company:'Horizon Network'})),'Horizon Network Limited, a subsidiary of HN Group');
 assert.equal(branding.resolve({company:'Horizon Media Group'}).legal,'Horizon Media Group Limited');
 assert.equal(branding.resolve({company:'<script>fake</script>'}).name,'HN Group');
 assert.equal(branding.resolve(null).name,'HN Group');
 assert.equal(branding.resolve({mainCompany:'HN Group',company:'Horizon Advertising',profileCompany:'Horizon Development'}).name,'Horizon Development');
 assert.equal(branding.resolve({mainCompany:'Horizon Network'}).name,'Horizon Network');
 assert.equal(branding.resolve({mainCompany:'Horizon Network',company:'Unknown company'}).name,'HN Group');
 for(const site of ['staff-portal','accounts-site','docs-site','contracts-site','mail-site'])assert.equal(fs.readFileSync(path.join(root,site,'public/assets/hn-staff-brand.js'),'utf8'),fs.readFileSync(path.join(__dirname,'hn-staff-brand.js'),'utf8'),site);
});
test('desktop branding uses local approved assets in every theme and preserves document artwork',async()=>{
 const {chromium}=require('../../browser-app/node_modules/playwright');
 const server=http.createServer((req,res)=>{const p=path.join(root,'staff-portal/public',new URL(req.url,'http://localhost').pathname);if(p.startsWith(path.join(root,'staff-portal/public'))&&fs.existsSync(p)&&fs.statSync(p).isFile()){res.setHeader('Content-Type',p.endsWith('.svg')?'image/svg+xml':'application/javascript');res.end(fs.readFileSync(p));}else{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:'+server.address().port+'/assets/hn-staff-brand.js');
 await page.setContent('<style>.on-dark{display:none}html[data-theme=midnight] .on-dark,html[data-theme=dusk] .on-dark{display:block}html[data-theme=midnight] .on-light,html[data-theme=dusk] .on-light{display:none}</style><header><a class="brand"><img class="on-light" width="160" height="58"><img class="on-dark" width="160" height="58"><span>Staff Portal</span></a></header><article><img id="document-art" src="/document-logo.svg"></article><footer><div class="pf-bottom"><p></p><a></a></div></footer>');await page.addScriptTag({path:path.join(__dirname,'hn-staff-brand.js')});
 for(const company of ['HN Group','Horizon Network','Horizon Media','Horizon Advertising','Horizon Development'])for(const theme of ['light','midnight','dusk']){
 await page.evaluate(({company,theme})=>{document.documentElement.dataset.theme=theme;HNStaffBrand.apply({mainCompany:'HN Group',company,otherRoles:[{company:'Another company'}]});},{company,theme});
 const logo=page.locator('header img:visible');await logo.evaluate(img=>img.decode());assert.ok(await logo.evaluate(img=>img.naturalWidth>0));assert.equal(await logo.getAttribute('alt'),company);
 assert.match(await page.locator('.pf-bottom p').textContent(),new RegExp(branding.resolve({company}).legal));assert.equal(await page.locator('#document-art').getAttribute('src'),'/document-logo.svg');
 }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
