'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{createAuth}=require('./lib/auth'),{sessions}=require('./lib/sessions');
function createServer({dir=process.env.BOTS_DATA_DIR||'/var/lib/hn-bots',fetcher=fetch}={}){
 const auth=createAuth(sessions(dir)),publicDir=path.join(__dirname,'public'),types={'.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.svg':'image/svg+xml'},actions=new Set(['state','overview','guilds','channels','messages','commands','accounts','audit','settings','connection','sync','profile','application','nickname','leave','send','delete-message','save-commands','credentials','api']);
 return http.createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const page=(response,code,title,message,cookies=[])=>{response.writeHead(code,{'Content-Type':'text/html','Set-Cookie':cookies});response.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HN Group Bots</title><link rel="stylesheet" href="/assets/site.css"><body><main class="section wrap"><img src="/assets/brand/hn-group-wordmark.svg" width="150" alt="HN Group"><h1>'+escape(title)+'</h1><p>'+escape(message)+'</p><a class="btn btn-primary" href="/auth/login">Sign in with HN Group Auth</a></main></body></html>');};
  try{const url=new URL(req.url,auth.ORIGIN);if(url.pathname==='/healthz')return json(200,{ok:true,service:'hn-bots'});if(await auth.handle(req,res,url,page))return;
   if(url.pathname.startsWith('/assets/')){const file=path.resolve(publicDir,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(publicDir+path.sep)||!types[path.extname(file)]||!fs.existsSync(file))return json(404,{error:'Not found.'});res.writeHead(200,{'Content-Type':types[path.extname(file)]});return fs.createReadStream(file).pipe(res);}
   const active=await auth.current(req);if(!active){if(url.pathname.startsWith('/api/'))return json(401,{error:'Sign in with HN Group Auth.'});res.writeHead(302,{Location:'/auth/login'});return res.end();}
   if(url.pathname==='/api/me')return json(200,{user:active.user});
   if(url.pathname==='/api/avatar'){const picture=await auth.ownPicture(active.authSession);if(!picture)return json(404,{error:'No picture.'});res.writeHead(200,{'Content-Type':picture.type});return res.end(picture.bytes);}
   if(url.pathname==='/api/bot'&&req.method==='POST'){
    if(req.headers.origin!==auth.ORIGIN||!(req.headers['content-type']||'').startsWith('application/json'))return json(403,{error:'Request origin not allowed.'});let text='';for await(const c of req){text+=c;if(Buffer.byteLength(text)>6500000)throw Object.assign(Error('Request too large.'),{status:413});}const input=JSON.parse(text);if(!actions.has(input.action))return json(400,{error:'Unknown bot action.'});if(input.action==='credentials'&&!active.user.owner)return json(403,{error:'Only owner-level accounts can change credentials.'});
    const secret=fs.readFileSync(process.env.STATUS_SSO_SECRET_FILE||'/var/lib/hn-status-sso/secret','utf8').trim();const response=await fetcher((process.env.AUTH_BACKEND||'http://127.0.0.1:3400')+'/api/service/bots',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({session:active.authSession,action:input.action,payload:input.payload||{}}),signal:AbortSignal.timeout(120000),redirect:'error'});return json(response.status,await response.json());
   }
   if(url.pathname.startsWith('/api/'))return json(404,{error:'Not found.'});if(req.method!=='GET')return json(405,{error:'GET required.'});res.writeHead(200,{'Content-Type':'text/html'});res.end(fs.readFileSync(path.join(publicDir,'index.html')));
  }catch(e){json(e.status||503,{error:e.status?e.message:'The bot management service is temporarily unavailable.'});}
 });
}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
if(require.main===module)createServer().listen(Number(process.env.PORT||5600),'127.0.0.1');module.exports={createServer};
