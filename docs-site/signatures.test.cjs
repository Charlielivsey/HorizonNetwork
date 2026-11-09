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
