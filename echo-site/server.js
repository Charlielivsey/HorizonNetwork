'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createAuth}=require('./lib/auth'),{sessions}=require('./lib/sessions'),{createStore,MAX_FILE,fail}=require('./lib/store');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function body(req,limit){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>limit)throw fail(413,'Upload too large. Each image can be up to 40 MB.');parts.push(part);}return Buffer.concat(parts);}
function createServer({dir=process.env.ECHO_DATA_DIR||'/var/lib/hn-echo'}={}) {
 const auth=createAuth(sessions(dir)),store=createStore(dir),publicDir=path.join(__dirname,'public');
 const server=http.createServer(async(req,res)=>{
  for(const[k,v]of Object.entries({'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive'}))res.setHeader(k,v);
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const page=(response,status,title,message,cookies=[])=>{response.writeHead(status,{'Content-Type':'text/html','Set-Cookie':cookies});response.end('<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Echo · HN Group</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/echo.css"><script src="/assets/hn-theme.js"></script><body><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="120"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="120"><span>Echo</span></a></div></header><main class="wrap problem"><p class="eyebrow">YOUR CHARACTER LIBRARY</p><h1>'+escape(title)+'</h1><p class="lead">'+escape(message)+'</p><a class="btn btn-primary" href="/auth/login">Sign in with HN Group Auth</a></main></body></html>');};
  try {
   const url=new URL(req.url,auth.ORIGIN),route=url.pathname;
   if(route==='/healthz')return json(200,{ok:true,service:'hn-echo'});
   if(await auth.handle(req,res,url,page))return;
   if(route.startsWith('/assets/')&&['GET','HEAD'].includes(req.method)){
    const target=path.resolve(publicDir,'.'+decodeURIComponent(route)),type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(target)];
    if(!target.startsWith(publicDir+path.sep)||!type||!fs.existsSync(target)||!fs.statSync(target).isFile())return json(404,{error:'Not found.'});
    res.writeHead(200,{'Content-Type':type});if(req.method==='HEAD')return res.end();return fs.createReadStream(target).pipe(res);
   }
   if(route==='/signed-out')return page(res,200,'See you soon.','Your library is safely stored. Sign in to return to your characters.');
   const active=await auth.current(req);
   if(!active){if(route.startsWith('/api/'))return json(401,{error:'Sign in with HN Group Auth to open Echo.'});res.writeHead(302,{Location:'/auth/login?next='+encodeURIComponent(route)});return res.end();}
   if(route==='/api/me'&&req.method==='GET')return json(200,{user:active.user});
   if(route==='/api/avatar'&&req.method==='GET'){const picture=await auth.ownPicture(active.authSession);if(!picture){res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end(fs.readFileSync(path.join(publicDir,'assets/avatar.svg')));}res.writeHead(200,{'Content-Type':picture.type});return res.end(picture.bytes);}
   if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==auth.ORIGIN)throw fail(403,'Request origin not allowed.');
   const characterRoute=/^\/api\/characters\/([a-f0-9]{32})$/.exec(route),uploadRoute=/^\/api\/characters\/([a-f0-9]{32})\/art$/.exec(route),artRoute=/^\/api\/art\/([a-f0-9]{32})$/.exec(route),fileRoute=/^\/api\/art\/([a-f0-9]{32})\/file$/.exec(route);
   if(uploadRoute&&req.method==='POST'){const a=store.upload(uploadRoute[1],Object.fromEntries(url.searchParams),await body(req,MAX_FILE));return json(201,{art:a});}
   let data={};if(['POST','PATCH'].includes(req.method)){if(!(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'Use JSON for this request.');try{data=JSON.parse((await body(req,16000)).toString());}catch(e){if(e.status)throw e;throw fail(400,'Invalid JSON.');}if(!data||typeof data!=='object'||Array.isArray(data))throw fail(400,'Invalid request.');}
   if(route==='/api/characters'&&req.method==='GET')return json(200,store.library());
   if(route==='/api/characters'&&req.method==='POST')return json(201,{character:store.create(data)});
   if(characterRoute){const id=characterRoute[1];if(req.method==='GET')return json(200,store.detail(id));if(req.method==='PATCH')return json(200,{character:store.update(id,data)});if(req.method==='DELETE')return json(200,store.remove(id));}
   if(artRoute){if(req.method==='PATCH')return json(200,{art:store.editArt(artRoute[1],data)});if(req.method==='DELETE')return json(200,store.removeArt(artRoute[1]));}
   if(fileRoute&&['GET','HEAD'].includes(req.method)){const file=store.file(fileRoute[1]);res.writeHead(200,{'Content-Type':file.art.type,'Content-Length':file.art.size,'Content-Disposition':(url.searchParams.has('download')?'attachment':'inline')+"; filename=\"artwork."+file.art.extension+'"; filename*=UTF-8\'\''+encodeURIComponent(file.art.title+'.'+file.art.extension)});if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(file.path);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);}
   if(route.startsWith('/api/'))return json(404,{error:'Not found.'});
   if(req.method!=='GET')return json(405,{error:'GET required.'});
   if(route!=='/'&&!/^\/characters\/[a-f0-9]{32}$/.test(route))return page(res,404,'Page not found.','Return to your character library.');
   res.writeHead(200,{'Content-Type':'text/html'});res.end(fs.readFileSync(path.join(publicDir,'index.html')));
  }catch(e){if(res.headersSent)return res.destroy();const status=e.status||503;if(req.url.startsWith('/api/'))return json(status,{error:e.status?e.message:'Echo is temporarily unavailable. Please try again.'});page(res,status,status===403?'This library is private.':'Unable to open Echo.',e.status?e.message:'Please try again shortly.');}
 });server.requestTimeout=180000;return server;
}
if(require.main===module)createServer().listen(Number(process.env.PORT||5630),'127.0.0.1');module.exports={createServer};
