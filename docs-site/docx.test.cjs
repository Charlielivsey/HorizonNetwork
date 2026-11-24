'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const catalog=require('./lib/catalog'),{renderDocx}=require('./lib/docx');
test('Word exports are native editable OOXML with current body, formatting, history, brand and no active content',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-docx-'));
 try{
 const doc={title:'Policy <review> & update',status:'draft',owner:'Fixture',confidential:true,fields:{owner:'Board',version:'0.2',effective:'Pending approval'},body:'<h2>Article 7 — Special resolutions</h2><p><strong>Bold</strong> <em>Italic</em> <u>Underlined</u> <s>Removed</s><br>Native text &amp; symbols</p><ol><li>First</li><li>Second</li></ol><blockquote><p>Quotation</p></blockquote><table><tr><th colspan="2">Merged heading</th></tr><tr><td>Left</td><td>Right</td></tr></table><p><a href="https://example.test/a?b=1&amp;c=2">Safe link</a></p><script>UNTRUSTED_SCRIPT</script>',history:[],draftHistory:[{draft:true,revision:2,version:'0.2',date:'24 November 2026',by:'Fixture',changes:['Article 7 added']}]};
 fs.writeFileSync(path.join(dir,'policy.docx'),renderDocx(doc,catalog.company('horizon-network'),catalog.template('policy')));
 const py=spawnSync('python3',['-c',`import zipfile,xml.etree.ElementTree as E,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 for f in z.namelist():
  if f.endswith('.xml') or f.endswith('.rels'): E.fromstring(z.read(f))
 n={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 root=E.fromstring(z.read('word/document.xml'));text=''.join(root.itertext())
 assert 'Article 7 — Special resolutions' in text and 'Native text & symbols' in text
 assert '0.2 (draft, save 2)' in text and 'Article 7 added' in text
 assert 'UNTRUSTED_SCRIPT' not in text
 for tag in ['b','i','u','strike','tbl','hyperlink','gridSpan']: assert root.findall('.//w:'+tag,n),tag
 assert b'altChunk' not in z.read('word/document.xml')
 assert 'PRIVATE & CONFIDENTIAL' in ''.join(E.fromstring(z.read('word/header1.xml')).itertext())
 assert z.read('word/media/logo.png').startswith(b'\\x89PNG')
 footer=z.read('word/footer1.xml');assert b'PAGE' in footer and b'NUMPAGES' in footer and b'Horizon Network Limited' in footer
 assert 'https://example.test/a?b=1&amp;c=2' in z.read('word/_rels/document.xml.rels').decode()
 print('Word package validated')`,path.join(dir,'policy.docx')],{encoding:'utf8'});assert.equal(py.status,0,py.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('DOCX endpoint uses the existing sign-in and private document access controls',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-docx-http-'));
 Object.assign(process.env,{DOCS_DATA_DIR:dir,DOCS_ORIGIN:'http://127.0.0.1',AUTH_BACKEND:'http://127.0.0.1:1',STATUS_SSO_SECRET_FILE:path.join(dir,'missing')});
 const{server}=require('./server'),store=require('./lib/store');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const owner={id:'owner',email:'owner@example.test',displayName:'Owner',permissions:[],storageGrants:[]},other={id:'other',email:'other@example.test',displayName:'Other',permissions:[],storageGrants:[]};
 try{const d=store.create(owner,{company:'horizon-network',template:'policy',title:'Private Policy',body:'<p>Private editable text</p>'}),url=base+'/api/documents/'+d.id+'/docx';
 assert.equal((await fetch(url)).status,401);
 const token=store.createSession(owner,'a'.repeat(64),Date.now()+3600000),second=store.createSession(other,'b'.repeat(64),Date.now()+3600000);
 assert.equal((await fetch(url,{headers:{Cookie:'hn_docs_session='+second}})).status,404);
 const before=fs.readFileSync(path.join(dir,'documents.json'));const response=await fetch(url,{headers:{Cookie:'hn_docs_session='+token}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/wordprocessingml.document/);assert.match(response.headers.get('content-disposition'),/\.docx/);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,2).toString(),'PK');assert.deepEqual(fs.readFileSync(path.join(dir,'documents.json')),before,'Export does not update document history');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
