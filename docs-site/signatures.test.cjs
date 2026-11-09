'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const catalog=require('./lib/catalog'),{renderDocument}=require('./lib/pdf'),stamp=require('../contracts-site/lib/stamp');
test('staff contracts have two complete signing columns on the same page',async()=>{
 for(const id of ['contract','contract-company']){
  const t=catalog.template(id),company=catalog.company('horizon-network'),start=catalog.start(t,company,{fullName:'Test Author'});
  const bytes=renderDocument({title:'Employee Agreement',fields:start.fields,body:start.body},company,t);
  const blocks=await stamp.blocks(bytes,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(blocks.length,2);const employee=blocks.find(b=>b.heading==='The Employee'),employer=blocks.find(b=>/^On behalf of/.test(b.heading));
  assert(employee&&employer);assert.equal(employee.page,employer.page);assert(employee.name.x<employer.name.x);
  const layout=await stamp.placementLayout(bytes,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(layout.length,2);assert.equal(layout[0].role,'Employee');
  for(const l of layout){assert.deepEqual(l.fields.map(f=>f.type),['name','signature','jobTitle','date']);for(const f of l.fields){assert(f.x>=0&&f.y>=0&&f.x+f.w<=1&&f.y+f.h<=1);}}
  for(const b of blocks){assert(b.jobTitle);assert(b.name.y>b.signature.y&&b.signature.y>b.jobTitle.y&&b.jobTitle.y>b.date.y);}
  const pdfjs=await stamp.loadPdfjs(),doc=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,verbosity:0}).promise;
  const items=(await(await doc.getPage(employee.page+1)).getTextContent()).items.map(i=>i.str);
  assert(items.includes('Signatures'),'heading stays with signing columns');await doc.destroy();
 }
});

test('automatic signed text sits above the printed rules for new and previously imported layouts',async()=>{
 const zlib=require('node:zlib'),t=catalog.template('contract'),company=catalog.company('hn-group'),s=catalog.start(t,company,{});
 const bytes=renderDocument({title:'Agreement',fields:{},body:s.body},company,t),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const block=(await stamp.blocks(bytes,hash)).find(b=>b.heading==='The Employee');
 const rules=[];let at=0;
 while((at=bytes.indexOf(Buffer.from('stream\n'),at))>=0){at+=7;const end=bytes.indexOf(Buffer.from('\nendstream'),at);if(end<0)break;try{const content=zlib.inflateSync(bytes.subarray(at,end)).toString('latin1');for(const m of content.matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g))if(Math.abs(+m[1]-block.left)<.1&&m[2]===m[4])rules.push(+m[2]);}catch{}at=end+10;}
 assert(rules.length>=4);
 const current=(await stamp.placementLayout(bytes,hash)).find(l=>l.role==='Employee');
 const old={role:'Employee',fields:['name','signature','jobTitle','date'].map(type=>({type,page:block.page,x:block.left/block.width,y:(block.height-block[type].y+5)/block.height,w:(block.right-block.left-8)/block.width,h:(type==='signature'?32:18)/block.height}))};
 for(const layout of [current,old]){
  const c={id:crypto.randomUUID(),file:{sha256:hash},source:{signatureLayout:[layout]},fields:layout.fields.map(f=>({...f,signer:'employee'})),signers:[{key:'employee',id:'example',role:'Employee',status:'signed',signedAt:'2026-11-09T02:30:00Z',signature:{typed:'Example Employee'},jobTitle:'Senior Advisor'}]};
  const signed=await stamp.signedCopy(bytes,c),pdfjs=await stamp.loadPdfjs(),doc=await pdfjs.getDocument({data:new Uint8Array(signed),isEvalSupported:false,verbosity:0}).promise;
  const items=(await(await doc.getPage(block.page+1)).getTextContent()).items.filter(i=>['Example Employee','Senior Advisor','9 November 2026'].includes(i.str));
  assert.equal(items.length,4);
  for(const item of items){const below=rules.filter(y=>y<item.transform[5]).sort((a,b)=>b-a)[0];assert(Math.abs(item.transform[5]-below-1.5)<.1, item.str+' sits on its own printed line');}
  await doc.destroy();
 }
});
