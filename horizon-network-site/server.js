'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { createAuth, STATUS_ORIGIN: ORIGIN } = require('./auth');
const auth = createAuth();
const BACKEND=process.env.STAFF_PORTAL_BACKEND || 'http://127.0.0.1:3200';
const SECRET=process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
async function leadership(route,res,id){
 const secret=fs.readFileSync(SECRET,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Configuration unavailable');
 const result=await fetch(BACKEND+'/api/auth/network-'+route,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(id?{id}:{}),signal:AbortSignal.timeout(6000),redirect:'error'});
 if(!result.ok)return json(res,result.status===404?404:503,{error:'Our leadership team is temporarily unavailable.'});
 if(id){res.writeHead(200,{'Content-Type':result.headers.get('content-type')});return res.end(Buffer.from(await result.arrayBuffer()));}
 return json(res,200,await result.json());
}

const PUBLIC = process.env.NETWORK_PUBLIC_DIR || path.join(__dirname,'public');
const CONTROL = path.join(__dirname,'control');
const DATA = process.env.NETWORK_DATA_DIR || '/var/lib/hn-network';
fs.mkdirSync(DATA,{recursive:true,mode:0o700});
const stateFile=path.join(DATA,'settings.json');
let settings={maintenance:false,updatedAt:null,updatedBy:null};
if(fs.existsSync(stateFile)) { try { settings=JSON.parse(fs.readFileSync(stateFile,'utf8')); if(typeof settings.maintenance!=='boolean')throw Error(); } catch { settings={maintenance:true,updatedAt:null,updatedBy:null}; } }
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain','.xml':'application/xml'};
function json(res,code,value){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
function file(res,filename,code=200){res.writeHead(code,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});fs.createReadStream(filename).on('error',()=>res.destroy()).pipe(res);}
function save(value,user){const next={maintenance:value,updatedAt:new Date().toISOString(),updatedBy:user.displayName};const temp=stateFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(next)+'\n',{mode:0o600});fs.renameSync(temp,stateFile);settings=next;}
async function body(req){if(!(req.headers['content-type']||'').startsWith('application/json'))throw Error('JSON required.');let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw Error('Request too large.');}return JSON.parse(text);}
function publicApi(req,res){
  const backend=process.env.STAFF_PORTAL_BACKEND || 'http://127.0.0.1:3200';
  // Only public portal routes can be reached through the public website.
  const headers={'content-type':req.headers['content-type']||'application/json','user-agent':String(req.headers['user-agent']||'').slice(0,300),'x-forwarded-proto':'https'};
  if(req.headers['x-application'])headers['x-application']=req.headers['x-application'];
  if(req.headers['content-length'])headers['content-length']=req.headers['content-length'];
  const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  headers['x-real-ip']=local?(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress;
  const upstream=http.request(backend+req.url,{method:req.method,headers,timeout:30000},response=>{
    res.writeHead(response.statusCode,{'Content-Type':response.headers['content-type']||'application/json','Cache-Control':'no-store'});response.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)json(res,503,{error:'This service is temporarily unavailable.'});else res.destroy();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  try{
    const url=new URL(req.url,ORIGIN),route=url.pathname;
    // Always start admin sign-in on the registered callback domain, so cookies and state match.
    const host=String(req.headers.host || '').split(':')[0].toLowerCase();
    if(['horizonetwork.com','www.horizonetwork.com'].includes(host) && (route==='/admin' || route.startsWith('/auth/'))) {
      res.writeHead(302,{Location:ORIGIN+url.pathname+url.search});return res.end();
    }
    if(route==='/healthz')return json(res,200,{ok:true});
    if(await auth.handle(req,res,route))return;
    if(route==='/admin/denied')return file(res,path.join(CONTROL,'denied.html'));
    if(route==='/admin' || route.startsWith('/api/admin')){
      let user;try{user=await auth.authorize(req);}catch(e){return json(res,e.status||503,{error:e.message});}
      if(!user)return json(res,401,{error:'Sign in through HN Group Auth.'});
      if(route==='/admin'&&req.method==='GET')return file(res,path.join(CONTROL,'admin.html'));
      if(route==='/api/admin/avatar'&&req.method==='GET')return await auth.avatar(req,res);
      if(route==='/api/admin'&&req.method==='GET')return json(res,200,{...settings,centralMaintenance:process.env.HN_CONTROL_MANAGED==='1',user:{...user,avatarUrl:user.avatarUrl?'/api/admin/avatar':null}});
      if(route==='/api/admin/maintenance'&&req.method==='POST'){
        if(process.env.HN_CONTROL_MANAGED==='1')return json(res,409,{error:'Maintenance is managed at https://admin.hngroup.org.uk.'});
        if(req.headers.origin!==ORIGIN)return json(res,403,{error:'Request origin not allowed.'});
        const data=await body(req);if(typeof data.maintenance!=='boolean')return json(res,400,{error:'Choose whether maintenance is enabled.'});
        save(data.maintenance,user);return json(res,200,{...settings});
      }
      return json(res,404,{error:'Not found.'});
    }
    const assets={
      '/_control/style.css':path.join(CONTROL,'style.css'),'/_control/app.js':path.join(CONTROL,'app.js'),
      '/_maintenance/style.css':path.join(CONTROL,'style.css'),
      '/_maintenance/logo.svg':path.join(PUBLIC,'assets/brand/horizon-network-wordmark.svg'),
      '/_maintenance/logo-white.svg':path.join(PUBLIC,'assets/brand/horizon-network-wordmark-white.svg'),
      '/_maintenance/font.woff2':path.join(PUBLIC,'assets/fonts/plus-jakarta-sans.woff2'),
      '/_maintenance/favicon.svg':path.join(PUBLIC,'assets/favicon.svg')
    };
    if(Object.hasOwn(assets,route)&&req.method==='GET')return file(res,assets[route]);
    if(settings.maintenance&&process.env.HN_CONTROL_MANAGED!=='1'){res.setHeader('Retry-After','300');if(route.startsWith('/api/'))return json(res,503,{error:'The website is undergoing maintenance.'});res.setHeader('X-Robots-Tag','noindex');return file(res,path.join(CONTROL,'maintenance.html'),503);}
    if(route==='/api/leadership'&&req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
    if(route==='/api/leadership'&&req.method==='GET')return await leadership('leadership',res);
    const match=/^\/api\/leadership\/avatar\/([a-f0-9]{16})$/.exec(route);
    if(match&&req.method==='GET')return await leadership('avatar',res,match[1]);
    if(route==='/api/public/enquiry'&&req.method==='POST')return publicApi(req,res);
    if(route.startsWith('/api/'))return json(res,404,{error:'Not found.'});
    if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
    const decoded=decodeURIComponent(route);
    if(decoded.split('/').some(part=>part.startsWith('.')))return json(res,404,{error:'Not found.'});
    let target=path.resolve(PUBLIC,'.'+decoded);
    if(!target.startsWith(path.resolve(PUBLIC)+path.sep)&&target!==path.resolve(PUBLIC))return json(res,404,{error:'Not found.'});
    if(decoded.endsWith('/'))target=path.join(target,'index.html');
    else if(!path.extname(target))target+='.html';
    if(!Object.hasOwn(mime,path.extname(target))||!fs.existsSync(target)||!fs.statSync(target).isFile())return file(res,path.join(PUBLIC,'404.html'),404);
    return file(res,target);
  }catch{if(!res.headersSent)json(res,400,{error:'The request could not be completed. Please try again.'});else res.destroy();}
});
if(require.main===module)server.listen(Number(process.env.PORT||3600),process.env.HOST||'127.0.0.1');
module.exports={server};
