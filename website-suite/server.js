'use strict';
// Shared source for media.hngroup.org.uk, development.hngroup.org.uk, careers.hngroup.org.uk and news.hngroup.org.uk,
// deployed independently with a private data directory per website. Pages use the HN Group website theme (site.css
// copied from hngroup-site, the motion kit and the support section from brand/web).
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const config=JSON.parse(fs.readFileSync(process.env.SITE_CONFIG||path.join(__dirname,'config.json'),'utf8'));
const ORIGIN='https://'+config.domain;
// News is written once on news.hngroup.org.uk and shown on every website it's sent to. "news" is the
// public newsroom itself; "investors" is only shown to signed-in investors on investors.hngroup.org.uk.
const NEWS_SITES=[['news','HN Group News'],['network','Horizon Network'],['media','Horizon Media Group'],['development','Horizon Development'],['investors','HN Group Investors']];
const NEWS_IDS=NEWS_SITES.map(s=>s[0]),NEWS_NAMES=Object.fromEntries(NEWS_SITES);
const postSites=p=>Array.isArray(p.sites)?p.sites:['news'];
const companiesOf=u=>Array.isArray(u.companies)?u.companies:[u.company];
const canManage=u=>config.kind==='news'?!!(u.statusAdminAllowed||u.ownerAccess||companiesOf(u).includes('HN Group')):!!u.statusAdminAllowed;
const SERVICE_SECRET=process.env.STATUS_SSO_SECRET_FILE||'/var/lib/hn-status-sso/secret';
// Server-to-server only: nginx always adds X-Real-IP, so requests from the internet are refused.
function service(req){let secret='';try{secret=fs.readFileSync(SERVICE_SECRET,'utf8').trim();}catch{}const given=String(req.headers.authorization||'').replace(/^Bearer /,'');if(req.headers['x-real-ip']||!/^[a-f0-9]{64}$/.test(secret)||given.length!==secret.length||!crypto.timingSafeEqual(Buffer.from(given),Buffer.from(secret)))throw fail(404,'Not found.');}
// Company websites show the news sent to them, read from the News service over loopback.
let newsCache={at:0,posts:[]};
async function siteNews(){if(Date.now()-newsCache.at<30000)return newsCache.posts;newsCache.at=Date.now();try{const r=await fetch((process.env.NEWS_BACKEND||'http://127.0.0.1:4600')+'/api/posts?site='+encodeURIComponent(config.id),{signal:AbortSignal.timeout(4000),redirect:'error'});if(r.ok){const v=await r.json();if(Array.isArray(v.posts))newsCache.posts=v.posts.slice(0,12);}}catch{}return newsCache.posts;}
const {createAuth}=require('./auth'); const auth=createAuth();
const DATA=process.env.DATA_DIR||'/var/lib/hn-'+config.id;fs.mkdirSync(DATA,{recursive:true,mode:0o700});
const stateFile=path.join(DATA,'records.json');
const FILES=path.join(DATA,'files');fs.mkdirSync(FILES,{recursive:true,mode:0o700});
let db={posts:[],audit:[]};
if(fs.existsSync(stateFile)) db={posts:[],audit:[],...JSON.parse(fs.readFileSync(stateFile,'utf8'))};
// Announcements shipped with the site (news-site/announcements/*.json, with an optional PDF beside them) are
// published once when the site starts; after that they're ordinary posts, so edits and deletions are kept.
function announce(){const dir=process.env.ANNOUNCEMENTS_DIR||path.join(__dirname,'announcements');if(config.kind!=='news'||!fs.existsSync(dir))return;const done=new Set(db.announced||[]);
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort()){let a;try{a=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch{continue;}if(!a.key||done.has(a.key)||!/^[a-f0-9]{24}$/.test(a.id||''))continue;
  let document=null;if(a.document?.file&&/^[a-z0-9-]+\.pdf$/.test(a.document.file)){const fileId=id();fs.copyFileSync(path.join(dir,a.document.file),path.join(FILES,fileId));document={id:fileId,name:String(a.document.name||'Document.pdf'),label:String(a.document.label||'Document (PDF)')};}
  const post={id:a.id,title:a.title,summary:a.summary,body:a.body,category:a.category||'General',published:true,sites:NEWS_IDS.filter(s=>(a.sites||['news']).includes(s)),author:a.author||'',publishedAt:a.publishedAt||new Date().toISOString(),updatedAt:a.publishedAt||new Date().toISOString(),...(document?{document}:{})};
  save(d=>{d.posts=d.posts.filter(p=>p.id!==post.id);d.posts.unshift(post);d.announced=[...(d.announced||[]),a.key];d.audit.push({by:'system',action:'announcement '+a.key,at:new Date().toISOString()});});}}
function save(edit){const next=structuredClone(db);edit(next);const tmp=stateFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next),{mode:0o600});fs.renameSync(tmp,stateFile);db=next;}
const id=()=>crypto.randomBytes(12).toString('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function json(res,status,value,cookies=[]){res.writeHead(status,{'Content-Type':'application/json','Set-Cookie':cookies});res.end(JSON.stringify(value));}
function text(value,max=200,required=false){if(typeof value!=='string')value='';value=value.trim();if(value.length>max||required&&!value)throw fail(400,'Please complete the required fields within the displayed limits.');return value;}
async function body(req){if(!(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'JSON required.');let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw fail(413,'Request is too large.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks));}catch{throw fail(400,'Invalid request.');}}
function sameOrigin(req){if(req.headers.origin!==ORIGIN)throw fail(403,'Request origin not allowed.');}
function publicPost(p){const out={id:p.id,title:p.title,summary:p.summary,body:p.body,category:p.category,updatedAt:p.updatedAt};if(p.document)out.document={name:p.document.name,label:p.document.label,url:ORIGIN+'/api/posts/'+p.id+'/document'};if(config.kind==='news'){out.publishedAt=p.publishedAt||p.updatedAt;out.sites=postSites(p).filter(s=>s!=='investors'&&NEWS_NAMES[s]).map(s=>NEWS_NAMES[s]);}return out;}
// Only these staff portal public routes can be reached from each kind of site.
const PUBLIC_ROUTES={
 company:[['POST',/^\/api\/public\/enquiry$/],['POST',/^\/api\/public\/support$/],['POST',/^\/api\/public\/support\/track$/]],
 careers:[['GET',/^\/api\/public\/jobs$/],['POST',/^\/api\/public\/jobs\/[a-f0-9]{16}\/apply$/],['POST',/^\/api\/public\/jobs\/application$/],['POST',/^\/api\/public\/enquiry$/]],
 news:[]
};
function publicApi(req,res){const backend=process.env.STAFF_PORTAL_BACKEND||'http://127.0.0.1:3200';const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);const headers={'content-type':req.headers['content-type']||'application/json','x-real-ip':local?(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress,'x-forwarded-proto':'https'};for(const key of ['x-application','content-length'])if(req.headers[key])headers[key]=req.headers[key];const up=http.request(backend+req.url,{method:req.method,headers,timeout:30000},response=>{res.writeHead(response.statusCode,{'Content-Type':'application/json'});response.pipe(res);});up.on('timeout',()=>up.destroy());up.on('error',()=>{if(!res.headersSent)json(res,503,{error:'This service is temporarily unavailable. Please try again shortly.'});else res.destroy();});req.on('aborted',()=>up.destroy());req.pipe(up);}
const mime={'.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};

// ----- The page shell: the HN Group website header and footer -----
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NAV={
 company:[['/#about','About'],['/#news','News'],['https://careers.hngroup.org.uk','Careers'],['/support','Support'],['/#contact','Contact']],
 careers:[['/#roles','Open roles'],['/#companies','Our companies'],['/#hiring','How we hire'],['/application','Your application'],['https://hngroup.org.uk/support','Support']],
 news:[['/','Latest news'],['https://hngroup.org.uk','HN Group'],['https://wiki.hngroup.org.uk','Wiki'],['https://hngroup.org.uk/support','Support']]
};
const FOOT={
 company:[['/#about','About'],['/#news','News'],['/support','Support'],['/#contact','Contact'],['https://careers.hngroup.org.uk','Careers'],['https://hngroup.org.uk','HN Group ↗'],['https://status.hngroup.org.uk','Service status ↗'],['https://hngroup.org.uk/privacypolicy','Privacy']],
 careers:[['/#roles','Open roles'],['/application','Your application'],['https://hngroup.org.uk/companies','Our companies ↗'],['https://hngroup.org.uk/support','Support ↗'],['https://hngroup.org.uk/contact','Contact ↗'],['https://staff.hngroup.org.uk/jobs','Staff vacancies ↗'],['https://hngroup.org.uk/privacypolicy','Privacy']],
 news:[['/','Latest news'],['https://hngroup.org.uk','HN Group ↗'],['https://wiki.hngroup.org.uk','Wiki ↗'],['https://hngroup.org.uk/support','Support ↗'],['https://status.hngroup.org.uk','Service status ↗'],['https://hngroup.org.uk/privacypolicy','Privacy']]
};
const link=([href,label])=>`<a href="${esc(href)}">${esc(label)}</a>`;
function page(res,status=200,head=false){
 res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});if(head)return res.end();
 const logo=config.logo,company=config.company||config.name;
 const fill={TITLE:esc(config.name),DOMAIN:esc(config.domain),KIND:esc(config.kind),SITE:esc(config.id),LOGO:esc(logo),COMPANY:esc(company),
  DESCRIPTION:esc(config.description||config.name+' — part of HN Group.'),
  NAV:NAV[config.kind].map(link).join(''),FOOTER_LINKS:FOOT[config.kind].map(link).join(''),
  SUBSIDIARY:config.subsidiaryOf?`<p class="footer-company"><span class="footer-parent">${esc(config.subsidiaryOf)}</span></p>`:'',
  LEGAL:esc(config.legal||company)};
 res.end(fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8').replace(/\{\{([A-Z_]+)\}\}/g,(m,k)=>fill[k]??m));}
function pageRoute(route){if(['/','/admin/denied'].includes(route))return true;if(config.kind==='company')return route==='/support';if(config.kind==='careers')return route==='/application'||/^\/jobs\/[a-f0-9]{16}$/.test(route);return false;}

announce();
const server=http.createServer(async(req,res)=>{
res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
try{const url=new URL(req.url,ORIGIN),route=url.pathname;
if(route==='/healthz')return json(res,200,{ok:true,site:config.id});
if(await auth.handle(req,res,route))return;
if(route==='/api/config'&&req.method==='GET'){const{port,...pub}=config;return json(res,200,pub);}
if(route.startsWith('/api/public/')){const allowed=(PUBLIC_ROUTES[config.kind]||[]).some(([m,re])=>m===req.method&&re.test(route));if(!allowed)throw fail(404,'Not found.');if(req.method==='POST')sameOrigin(req);return publicApi(req,res);}
if(config.kind==='news'&&route==='/api/posts'&&req.method==='GET'){const site=url.searchParams.get('site')||'news';if(site==='investors'||!NEWS_IDS.includes(site))throw fail(404,'Not found.');return json(res,200,{posts:db.posts.filter(p=>p.published&&postSites(p).includes(site)).map(publicPost)});}
const doc=route.match(/^\/api\/posts\/([a-f0-9]{24})\/document$/);if(config.kind==='news'&&doc&&req.method==='GET'){const p=db.posts.find(p=>p.id===doc[1]&&p.published&&p.document&&postSites(p).some(s=>s!=='investors'));if(!p)throw fail(404,'Not found.');res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${p.document.name.replace(/[^a-zA-Z0-9 ._-]/g,'_')}"`});return fs.createReadStream(path.join(FILES,p.document.id)).on('error',()=>res.destroy()).pipe(res);}
if(config.kind==='news'&&route==='/api/private/investor-news'&&req.method==='GET'){service(req);return json(res,200,{posts:db.posts.filter(p=>p.published&&postSites(p).includes('investors')).map(p=>({...publicPost(p),author:p.author||''}))});}
if(config.kind==='company'&&route==='/api/news'&&req.method==='GET')return json(res,200,{posts:await siteNews()});
if(route==='/admin'||route.startsWith('/api/admin')){
const user=await auth.authorize(req);if(!user)throw fail(401,'Sign in through HN Group Auth.');if(!canManage(user))throw fail(403,config.kind==='news'?'Only staff with a role at HN Group can manage HN Group News.':'Only the system owner and Super Admin members can manage this site.');
if(route==='/admin'&&req.method==='GET')return page(res);
if(route==='/api/admin/avatar'&&req.method==='GET')return auth.avatar(req,res);
if(route==='/api/admin'&&req.method==='GET')return json(res,200,{user:{displayName:user.displayName,email:user.email,avatarUrl:user.avatarUrl?'/api/admin/avatar':null},posts:config.kind==='news'?db.posts.map(p=>({...p,sites:postSites(p).filter(s=>NEWS_NAMES[s])})):[],newsSites:config.kind==='news'?NEWS_SITES:undefined});
if(req.method!=='POST')throw fail(405,'Method not allowed.');sameOrigin(req);const b=await body(req);
const audit=(d,action)=>{d.audit.push({by:user.id||user.email,action,at:new Date().toISOString()});d.audit=d.audit.slice(-1000);};
if(route==='/api/admin/post'&&config.kind==='news'){
const now=new Date().toISOString(),existing=b.id?db.posts.find(p=>p.id===b.id):null;if(b.id&&!existing)throw fail(404,'Article not found.');
const sites=[...new Set(Array.isArray(b.sites)?b.sites:[])];if(!sites.length||sites.some(s=>!NEWS_IDS.includes(s)))throw fail(400,'Choose at least one website to show this news on.');
const post={id:b.id||id(),title:text(b.title,160,true),summary:text(b.summary,300,true),body:text(b.body,40000,true),category:text(b.category,80)||'General',published:b.published===true,updatedAt:now,...(existing?.document?{document:existing.document}:{}),sites:NEWS_IDS.filter(s=>sites.includes(s)),author:existing?.author||user.displayName||'',updatedBy:user.displayName||''};
if(post.published)post.publishedAt=existing?.publishedAt||now;
save(d=>{d.posts=d.posts.filter(p=>p.id!==post.id);d.posts.unshift(post);audit(d,'Saved article '+post.id);});return json(res,200,{ok:true});}
if(route==='/api/admin/delete-post'&&config.kind==='news'){save(d=>{d.posts=d.posts.filter(p=>p.id!==b.id);audit(d,'Deleted article '+text(b.id,24));});return json(res,200,{ok:true});}
throw fail(404,'Not found.');}
if(route.startsWith('/api/'))throw fail(404,'Not found.');
if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method not allowed.');
if(pageRoute(route))return page(res,200,req.method==='HEAD');
const target=path.resolve(__dirname,'public','.'+decodeURIComponent(route)),root=path.join(__dirname,'public')+path.sep;
if(!target.startsWith(root)||route.split('/').some(s=>s.startsWith('.'))||!mime[path.extname(target)]||!fs.existsSync(target)||!fs.statSync(target).isFile())return page(res,404,req.method==='HEAD');
res.writeHead(200,{'Content-Type':mime[path.extname(target)]});if(req.method==='HEAD')return res.end();fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res);
}catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'The request could not be completed.'});else res.destroy();}});
server.requestTimeout=30000;server.headersTimeout=15000;
if(require.main===module)server.listen(Number(process.env.PORT||config.port),'127.0.0.1');module.exports={server};
