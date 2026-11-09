'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),catalog=require('./lib/catalog'),{renderDocument}=require('./lib/pdf'),{loadPdfjs}=require('../contracts-site/lib/stamp');
test('a short executive directive and its actual sign-off fit together on one page',async()=>{
 const t=catalog.template('executive-directive'),c=catalog.company('hn-group');
 const s=catalog.start(t,c,{fullName:'Example Author',jobTitle:'Board Chairman'});
 Object.assign(s.fields,{reference:'ED0001',scope:'Everyone',effective:'09/11/2026 @ 05:00',end:'Until withdrawn',signature:''});
 const body='<h2>Authority and purpose</h2><p>This directive is issued on behalf of HN Group Limited (HN Group) by the Board Chairman under Article 10 of the Operations Policy. It records the instructions below.</p><p>To explain the updated procedures.</p><h2>Direction</h2><p>The specified procedure is to be followed.</p><h2>Effective period and review</h2><p>Effective until it is withdrawn.</p><h2>Communication and records</h2><p>To be communicated via Discord.</p>';
 const bytes=renderDocument({title:'Executive Directive',fields:s.fields,body},c,t);
 const lib=await loadPdfjs(),pdf=await lib.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,verbosity:0}).promise;
 try {assert.equal(pdf.numPages,1,'do not reserve an empty signature line or an arbitrary sign-off block');const items=(await(await pdf.getPage(1)).getTextContent()).items;assert.ok(items.some(i=>i.str==='Example Author'));const name=items.find(i=>i.str==='Example Author');assert.ok(name.transform[5]>26*72/25.4,'sign-off stays above the footer');}finally{await pdf.destroy();}
});
