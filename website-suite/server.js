'use strict';
// Shared source, deployed independently with a private data directory per website.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const config=JSON.parse(fs.readFileSync(process.env.SITE_CONFIG||path.join(__dirname,'config.json'),'utf8'));
const ORIGIN='https://'+config.domain;
// News is written once on news.hngroup.org.uk and shown on every website it's sent to. "news" is the
// public newsroom itself; "investors" is only shown to signed-in investors on investors.hngroup.org.uk.
const NEWS_SITES=[['news','HN Group News'],['network','Horizon Network'],['media','Horizon Media Group'],['advertising','Horizon Advertising'],['development','Horizon Development'],['holding','HN Group Management'],['investors','HN Group Investors']];
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
let db={posts:[],tickets:[],customers:[],projects:[],audit:[]};
if(fs.existsSync(stateFile)) db=JSON.parse(fs.readFileSync(stateFile,'utf8'));
function save(edit){const next=structuredClone(db);edit(next);const tmp=stateFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next),{mode:0o600});fs.renameSync(tmp,stateFile);db=next;}
const sessions=new Map(),limits=new Map();const token=()=>crypto.randomBytes(32).toString('hex'),id=()=>crypto.randomBytes(12).toString('hex'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function rate(req,bucket,max=8){const ip=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)?req.headers['x-real-ip']||req.socket.remoteAddress:req.socket.remoteAddress;const key=bucket+ip,now=Date.now();for(const[k,v]of limits)if(v.until<now)limits.delete(k);const entry=limits.get(key)||{count:0,until:now+600000};entry.count++;limits.set(key,entry);if(entry.count>max)throw fail(429,'Too many requests. Please try again in ten minutes.');}
const fail=(status,message)=>Object.assign(new Error(message),{status});
function json(res,status,value,cookies=[]){res.writeHead(status,{'Content-Type':'application/json','Set-Cookie':cookies});res.end(JSON.stringify(value));}
function text(value,max=200,required=false){if(typeof value!=='string')value='';value=value.trim();if(value.length>max||required&&!value)throw fail(400,'Please complete the required fields within the displayed limits.');return value;}
function email(value){value=text(value,160,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw fail(400,'Enter a valid email address.');return value;}
async function body(req){if(!(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'JSON required.');const limit=req.url==='/api/admin/file'?15*1024*1024:65536;let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail(413,'File or request is too large.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks));}catch{throw fail(400,'Invalid request.');}}
function sameOrigin(req){if(req.headers.origin!==ORIGIN)throw fail(403,'Request origin not allowed.');}
function cookie(req){return(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-hn_client='))?.slice(17)||'';}
function client(req){const key=hash(cookie(req)),session=sessions.get(key);if(!session||session.expires<Date.now()){sessions.delete(key);throw fail(401,'Please sign in to your client account.');}const user=db.customers.find(c=>c.id===session.id&&!c.disabled);if(!user)throw fail(401,'This client account is unavailable.');return user;}
function password(value,salt){return crypto.scryptSync(value,salt,64).toString('hex');}
function newPassword(value){if(typeof value!=='string'||value.length<12||value.length>128)throw fail(400,'Use a password between 12 and 128 characters.');const salt=token();return {salt,password:password(value,salt)};}
const safeCustomer=c=>({id:c.id,name:c.name,email:c.email,disabled:!!c.disabled,invited:!c.password});
function publicPost(p){const out={id:p.id,title:p.title,summary:p.summary,body:p.body,category:p.category,updatedAt:p.updatedAt};if(config.kind==='news'){out.publishedAt=p.publishedAt||p.updatedAt;out.sites=postSites(p).filter(s=>s!=='investors').map(s=>NEWS_NAMES[s]);}return out;}
function projectForClient(p){return{...p,files:p.files.map(({data,...f})=>f)};}
function download(res,file){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${file.name.replace(/[^a-zA-Z0-9 ._-]/g,'_')}"`});fs.createReadStream(path.join(FILES,file.id)).on('error',()=>res.destroy()).pipe(res);}
function publicApi(req,res){const backend=process.env.STAFF_PORTAL_BACKEND||'http://127.0.0.1:3200';const headers={'content-type':req.headers['content-type']||'application/json','x-real-ip':req.headers['x-real-ip']||req.socket.remoteAddress,'x-forwarded-proto':'https'};for(const key of ['x-application','content-length'])if(req.headers[key])headers[key]=req.headers[key];const up=http.request(backend+req.url,{method:req.method,headers,timeout:30000},response=>{res.writeHead(response.statusCode,{'Content-Type':'application/json'});response.pipe(res);});up.on('timeout',()=>up.destroy());up.on('error',()=>{if(!res.headersSent)json(res,503,{error:'The staff service is temporarily unavailable.'});else res.destroy();});req.on('aborted',()=>up.destroy());req.pipe(up);}
const mime={'.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
try{const url=new URL(req.url,ORIGIN),route=url.pathname;
if(route==='/healthz')return json(res,200,{ok:true,site:config.id});
if(await auth.handle(req,res,route))return;
if(route==='/api/config'&&req.method==='GET')return json(res,200,config);
if(config.kind==='careers'&&((route==='/api/public/jobs'&&req.method==='GET')||(/^\/api\/public\/jobs\/[a-f0-9]{16}\/apply$/.test(route)&&req.method==='POST'))){if(req.method==='POST')sameOrigin(req);return publicApi(req,res);}
if(['company','careers'].includes(config.kind)&&route==='/api/public/enquiry'&&req.method==='POST'){sameOrigin(req);return publicApi(req,res);}
if(['docs','news','support'].includes(config.kind)&&route==='/api/posts'&&req.method==='GET'){const site=url.searchParams.get('site')||'news';if(config.kind==='news'&&(site==='investors'||!NEWS_IDS.includes(site)))throw fail(404,'Not found.');return json(res,200,{posts:db.posts.filter(p=>p.published&&(config.kind!=='news'||postSites(p).includes(site))).map(publicPost)});}
if(config.kind==='news'&&route==='/api/private/investor-news'&&req.method==='GET'){service(req);return json(res,200,{posts:db.posts.filter(p=>p.published&&postSites(p).includes('investors')).map(p=>({...publicPost(p),author:p.author||''}))});}
if(config.kind==='company'&&route==='/api/news'&&req.method==='GET')return json(res,200,{posts:await siteNews()});
if(config.kind==='support'&&route==='/api/tickets'&&req.method==='POST'){
sameOrigin(req);rate(req,'ticket',5);const b=await body(req);if(b.website)throw fail(400,'Unable to submit this request.');const tracking=token();const ticket={id:id(),tracking:hash(tracking),name:text(b.name,120,true),email:email(b.email),subject:text(b.subject,160,true),status:'open',messages:[{body:text(b.message,5000,true),by:'customer',at:new Date().toISOString()}],createdAt:new Date().toISOString()};save(d=>d.tickets.push(ticket));return json(res,201,{reference:tracking,id:ticket.id});}
if(config.kind==='support'&&route==='/api/ticket'&&req.method==='POST'){
sameOrigin(req);rate(req,'tracking',30);const b=await body(req);if(!/^[a-f0-9]{64}$/.test(b.reference||''))throw fail(404,'Ticket not found. Check your private reference.');const ticket=db.tickets.find(t=>t.tracking===hash(b.reference));if(!ticket)throw fail(404,'Ticket not found. Check your private reference.');if(b.message){const message=text(b.message,5000,true);save(d=>d.tickets.find(t=>t.id===ticket.id).messages.push({body:message,by:'customer',at:new Date().toISOString()}));}const current=db.tickets.find(t=>t.id===ticket.id);return json(res,200,{id:current.id,subject:current.subject,status:current.status,messages:current.messages});}
if(config.kind==='clients'&&['/api/client/login','/api/client/activate'].includes(route)&&req.method==='POST'){
sameOrigin(req);rate(req,'client-login');const b=await body(req);let user;
if(route.endsWith('activate')){if(!/^[a-f0-9]{64}$/.test(b.invite||''))throw fail(400,'Invitation is invalid or expired.');user=db.customers.find(c=>c.invite===hash(b.invite)&&c.inviteExpires>Date.now()&&!c.disabled);if(!user)throw fail(400,'Invitation is invalid or expired.');const fields=newPassword(b.password);save(d=>{const c=d.customers.find(c=>c.id===user.id);Object.assign(c,fields);delete c.invite;delete c.inviteExpires;});user=db.customers.find(c=>c.id===user.id);
}else{const supplied=email(b.email);user=db.customers.find(c=>c.email===supplied&&!c.disabled);const salt=user?.salt||'invalid-account';const guess=password(String(b.password||'').slice(0,128),salt);if(!user?.password||!crypto.timingSafeEqual(Buffer.from(guess,'hex'),Buffer.from(user.password,'hex')))throw fail(401,'Email or password is incorrect.');}
for(const[k,s]of sessions)if(s.expires<Date.now())sessions.delete(k);if(sessions.size>10000)throw fail(503,'Please try again shortly.');const raw=token();sessions.set(hash(raw),{id:user.id,expires:Date.now()+8*3600000});return json(res,200,{user:safeCustomer(user)},[`__Host-hn_client=${raw}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`]);}
if(config.kind==='clients'&&route.startsWith('/api/client/')){
const user=client(req);if(req.method==='POST')sameOrigin(req);
if(route==='/api/client/me'&&req.method==='GET')return json(res,200,{user:safeCustomer(user),projects:db.projects.filter(p=>p.customerId===user.id).map(projectForClient)});
if(route==='/api/client/logout'&&req.method==='POST'){sessions.delete(hash(cookie(req)));return json(res,200,{ok:true},['__Host-hn_client=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);}
if(route==='/api/client/approve'&&req.method==='POST'){const b=await body(req),p=db.projects.find(p=>p.id===b.id&&p.customerId===user.id);if(!p||p.approval!=='requested')throw fail(400,'This project has no pending approval.');save(d=>{const p=d.projects.find(p=>p.id===b.id);p.approval='approved';p.approvedAt=new Date().toISOString();});return json(res,200,{ok:true});}
const match=route.match(/^\/api\/client\/files\/([a-f0-9]{24})\/([a-f0-9]{24})$/);if(match&&req.method==='GET'){const p=db.projects.find(p=>p.id===match[1]&&p.customerId===user.id),file=p?.files.find(f=>f.id===match[2]);if(!file)throw fail(404,'File not found.');return download(res,file);}throw fail(404,'Not found.');}
if(route==='/admin'||route.startsWith('/api/admin')){
const user=await auth.authorize(req);if(!user)throw fail(401,'Sign in through HN Group Auth.');if(!canManage(user))throw fail(403,config.kind==='news'?'Only staff with a role at HN Group can manage HN Group News.':'Only the system owner and Super Admin members can manage this site.');
if(route==='/admin'&&req.method==='GET')return page(res);
if(route==='/api/admin/avatar'&&req.method==='GET')return auth.avatar(req,res);
const adminFile=route.match(/^\/api\/admin\/files\/([a-f0-9]{24})\/([a-f0-9]{24})$/);if(config.kind==='clients'&&adminFile&&req.method==='GET'){const f=db.projects.find(p=>p.id===adminFile[1])?.files.find(f=>f.id===adminFile[2]);if(!f)throw fail(404,'File not found.');return download(res,f);}
if(route==='/api/admin'&&req.method==='GET')return json(res,200,{user:{displayName:user.displayName,email:user.email,avatarUrl:user.avatarUrl?'/api/admin/avatar':null},posts:config.kind==='news'?db.posts.map(p=>({...p,sites:postSites(p)})):db.posts,newsSites:config.kind==='news'?NEWS_SITES:undefined,tickets:db.tickets.map(({tracking,...t})=>t),customers:db.customers.map(safeCustomer),projects:db.projects.map(projectForClient)});
if(req.method!=='POST')throw fail(405,'Method not allowed.');sameOrigin(req);const b=await body(req);
const audit=(d,action)=>{d.audit.push({by:user.id||user.email,action,at:new Date().toISOString()});d.audit=d.audit.slice(-1000);};
if(route==='/api/admin/post'&&['docs','news','support'].includes(config.kind)){
const now=new Date().toISOString(),existing=b.id?db.posts.find(p=>p.id===b.id):null;if(b.id&&!existing)throw fail(404,'Article not found.');
const post={id:b.id||id(),title:text(b.title,160,true),summary:text(b.summary,300,true),body:text(b.body,40000,true),category:text(b.category,80)||'General',published:b.published===true,updatedAt:now};
if(config.kind==='news'){const sites=[...new Set(Array.isArray(b.sites)?b.sites:[])];if(!sites.length||sites.some(s=>!NEWS_IDS.includes(s)))throw fail(400,'Choose at least one website to show this news on.');Object.assign(post,{sites:NEWS_IDS.filter(s=>sites.includes(s)),author:existing?.author||user.displayName||'',updatedBy:user.displayName||''});if(post.published)post.publishedAt=existing?.publishedAt||now;}save(d=>{d.posts=d.posts.filter(p=>p.id!==post.id);d.posts.unshift(post);audit(d,'Saved article '+post.id);});return json(res,200,{ok:true});}
if(route==='/api/admin/delete-post'&&['docs','news','support'].includes(config.kind)){save(d=>{d.posts=d.posts.filter(p=>p.id!==b.id);audit(d,'Deleted article '+text(b.id,24));});return json(res,200,{ok:true});}
if(route==='/api/admin/ticket'&&config.kind==='support'){
if(!db.tickets.some(t=>t.id===b.id))throw fail(404,'Ticket not found.');const reply=text(b.reply,5000);if(!['open','in-progress','resolved'].includes(b.status))throw fail(400,'Choose a valid status.');save(d=>{const t=d.tickets.find(t=>t.id===b.id);t.status=b.status;if(reply)t.messages.push({body:reply,by:'HN Group support',at:new Date().toISOString()});audit(d,'Updated ticket '+b.id);});return json(res,200,{ok:true});}
if(route==='/api/admin/customer'&&config.kind==='clients'){
const address=email(b.email),name=text(b.name,120,true),raw=token();let customer=db.customers.find(c=>c.email===address);const cid=customer?.id||id();save(d=>{let c=d.customers.find(c=>c.id===cid);if(!c){c={id:cid,email:address,name};d.customers.push(c);}delete c.password;delete c.salt;Object.assign(c,{name,invite:hash(raw),inviteExpires:Date.now()+7*86400000,disabled:false});audit(d,'Issued customer invitation '+cid);});for(const[k,s]of sessions)if(s.id===cid)sessions.delete(k);return json(res,200,{invite:ORIGIN+'/?invite='+raw,expires:'7 days'});}
if(route==='/api/admin/disable-customer'&&config.kind==='clients'){save(d=>{const c=d.customers.find(c=>c.id===b.id);if(!c)throw fail(404,'Account not found.');c.disabled=true;delete c.invite;delete c.inviteExpires;audit(d,'Disabled customer '+b.id);});for(const[k,s]of sessions)if(s.id===b.id)sessions.delete(k);return json(res,200,{ok:true});}
if(route==='/api/admin/project'&&config.kind==='clients'){
if(!db.customers.some(c=>c.id===b.customerId&&!c.disabled))throw fail(400,'Choose an active customer.');if(b.id&&!db.projects.some(p=>p.id===b.id))throw fail(404,'Project not found.');if(!['planned','active','complete'].includes(b.status)||!['none','requested','approved'].includes(b.approval))throw fail(400,'Choose a valid project status.');const existing=db.projects.find(p=>p.id===b.id);const project={id:existing?.id||id(),customerId:b.customerId,title:text(b.title,160,true),status:b.status,update:text(b.update,10000,true),approvedAt:existing?.approval==='approved'&&existing.update===b.update?existing.approvedAt:undefined,approval:existing?.approval==='approved'&&existing.update!==b.update&&b.approval==='approved'?'requested':b.approval,files:existing?.files||[],updatedAt:new Date().toISOString()};save(d=>{d.projects=d.projects.filter(p=>p.id!==project.id);d.projects.unshift(project);audit(d,'Updated project '+project.id);});return json(res,200,{ok:true});}
if(route==='/api/admin/delete-file'&&config.kind==='clients'){
const project=db.projects.find(p=>p.id===b.projectId),file=project?.files.find(f=>f.id===b.id);if(!file)throw fail(404,'File not found.');save(d=>{d.projects.find(p=>p.id===b.projectId).files=d.projects.find(p=>p.id===b.projectId).files.filter(f=>f.id!==b.id);audit(d,'Removed project file '+b.id);});try{fs.unlinkSync(path.join(FILES,file.id));}catch{}return json(res,200,{ok:true});}
if(route==='/api/admin/file'&&config.kind==='clients'){
if(!db.projects.some(p=>p.id===b.projectId))throw fail(404,'Project not found.');const name=text(b.name,180,true);if(typeof b.data!=='string'||!b.data||b.data.length>14*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))throw fail(400,'Choose a file of up to 10 MB.');const bytes=Buffer.from(b.data,'base64');if(bytes.length>10*1024*1024)throw fail(413,'Files must be 10 MB or smaller.');const file={id:id(),name,size:bytes.length,kind:b.kind==='invoice'?'invoice':'file',at:new Date().toISOString()};if(db.projects.reduce((n,p)=>n+p.files.reduce((s,f)=>s+f.size,0),0)+bytes.length>500*1024*1024)throw fail(400,'Storage is full. Contact your system owner.');fs.writeFileSync(path.join(FILES,file.id),bytes,{mode:0o600,flag:'wx'});try{save(d=>{d.projects.find(p=>p.id===b.projectId).files.push(file);audit(d,'Added project file '+file.id);});}catch(e){fs.unlinkSync(path.join(FILES,file.id));throw e;}return json(res,200,{ok:true});}
throw fail(404,'Not found.');}
if(route.startsWith('/api/'))throw fail(404,'Not found.');
if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method not allowed.');
if(['/','/admin/denied'].includes(route))return page(res,200,req.method==='HEAD');
const target=path.resolve(__dirname,'public','.'+decodeURIComponent(route)),root=path.join(__dirname,'public')+path.sep;
if(!target.startsWith(root)||route.split('/').some(s=>s.startsWith('.'))||!mime[path.extname(target)]||!fs.existsSync(target)||!fs.statSync(target).isFile())throw fail(404,'Page not found.');
res.writeHead(200,{'Content-Type':mime[path.extname(target)]});if(req.method==='HEAD')return res.end();fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res);
}catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'The request could not be completed.'});else res.destroy();}});
function page(res,status=200,head=false){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});if(head)return res.end();res.end(fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8').replaceAll('{{TITLE}}',config.name).replaceAll('{{DOMAIN}}',config.domain));}
server.requestTimeout=30000;server.headersTimeout=15000;
if(require.main===module)server.listen(Number(process.env.PORT||config.port),'127.0.0.1');module.exports={server};
