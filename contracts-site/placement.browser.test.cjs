'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('../browser-app/node_modules/playwright');
const catalog=require('../docs-site/lib/catalog'),{renderDocument}=require('../docs-site/lib/pdf'),{placementLayout}=require('./lib/stamp');
test('Docs signing boxes appear automatically and remain manually editable',async()=>{
 const company=catalog.company('hn-group'),template=catalog.template('contract'),start=catalog.start(template,company,{});
 const pdf=renderDocument({title:'Agreement',fields:{},body:start.body},company,template);
 const layout=await placementLayout(pdf,crypto.createHash('sha256').update(pdf).digest('hex'));
 const c={id:crypto.randomUUID(),title:'Agreement',message:'',status:'draft',order:'any',dueDate:'',sender:{name:'Sender'},source:{kind:'docs',signatureLayout:layout},file:{name:'Agreement.pdf',pages:layout[0].fields[0].page+1},fields:[],signers:[],events:[],can:{edit:true}};
 let saved;
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  const json=x=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
  if(u.pathname==='/api/me')return json({user:{id:'sender',displayName:'Sender'},canSend:true,roles:['Employee','On behalf of HN Group Limited','Witness']});
  if(u.pathname==='/api/people')return json({people:[{id:'person',name:'Echo',jobTitle:'Board Chairman',company:'HN Group'}]});
  if(u.pathname==='/api/contracts/'+c.id+'/send')return json({contract:c,access:[{name:'Echo',roles:['Employee','On behalf of HN Group Limited'],url:'https://contract.hngroup.org.uk/s/'+ 'a'.repeat(90),pin:'123456'}]});
  if(u.pathname.endsWith('/file')){res.setHeader('Content-Type','application/pdf');return res.end(pdf);}
  if(u.pathname==='/api/contracts/'+c.id){if(req.method==='PUT'){let s='';for await(const b of req)s+=b;saved=JSON.parse(s);}return json({contract:c});}
  if(u.pathname.startsWith('/assets/')){
   const file=path.join(__dirname,'public',u.pathname);try{res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'image/svg+xml');return res.end(fs.readFileSync(file));}catch{res.statusCode=404;return res.end();}
  }
  res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(__dirname,'public/index.html')));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://127.0.0.1:'+server.address().port+'/contract/'+c.id);
  await page.locator('#c-search').fill('Echo');await page.locator('button[role=option]').filter({hasText:'Echo'}).click();
  await page.locator('.sheet').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('.field-box').length===4);
  await page.locator('#c-search').fill('Echo');await page.locator('button[role=option]').filter({hasText:'Echo'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.field-box').length===8);
  const fields=page.locator('.field-box');
  const initial=await fields.first().evaluate(n=>n.style.left);await fields.first().focus();await page.keyboard.press('ArrowRight');assert.notEqual(await fields.first().evaluate(n=>n.style.left),initial,'automatically placed fields can be moved manually');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForTimeout(100);assert.equal(saved.fields.length,8);assert.deepEqual(saved.signers.map(s=>s.role),['Employee','On behalf of HN Group Limited']);
  assert.equal(new Set(saved.fields.filter(f=>f.signer===0).map(f=>f.type)).size,4);
  assert(saved.fields.filter(f=>f.signer===0).every(f=>f.x<.5));assert(saved.fields.filter(f=>f.signer===1).every(f=>f.x>.5));
  await fields.first().focus();await page.keyboard.press('Delete');assert.equal(await fields.count(),7,'boxes can still be removed manually');
  await page.getByRole('button',{name:'Send for signing',exact:true}).click();
  await page.locator('#ask-ok').click();
  await page.waitForFunction(()=>document.querySelector('#ask-title').textContent==='Signing link and PIN');
  for(const width of [1280,768,390,320]){
   await page.setViewportSize({width,height:1000});
   const overflow=await page.locator('#ask').evaluate(d=>({scroll:d.scrollWidth,width:d.clientWidth,buttons:Array.from(d.querySelectorAll('button')).filter(b=>!b.hidden).map(b=>{const r=b.getBoundingClientRect(),box=d.getBoundingClientRect();return r.left<box.left||r.right>box.right;})}));
   assert(overflow.scroll<=overflow.width+1,'signing-link dialog has no horizontal scrolling at '+width);
   assert(overflow.buttons.every(x=>!x),'all copy controls remain inside the dialog');
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
