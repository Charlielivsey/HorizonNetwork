'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const PUBLIC=process.env.NETWORK_PUBLIC_DIR || path.join(__dirname,'public');
const BACKEND=process.env.STAFF_PORTAL_BACKEND || 'http://127.0.0.1:3200';
const SECRET=process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain','.xml':'application/xml'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
async function leadership(route,res,id){
 const secret=fs.readFileSync(SECRET,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Configuration unavailable');
 const result=await fetch(BACKEND+'/api/auth/network-'+route,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(id?{id}:{}),signal:AbortSignal.timeout(6000),redirect:'error'});
 if(!result.ok)return json(res,result.status===404?404:503,{error:'Our leadership team is temporarily unavailable.'});
 if(id){res.writeHead(200,{'Content-Type':result.headers.get('content-type')});return res.end(Buffer.from(await result.arrayBuffer()));}
 return json(res,200,await result.json());
}
function enquiries(req,res){
 const headers={'Content-Type':req.headers['content-type'] || 'application/json','User-Agent':String(req.headers['user-agent']||'').slice(0,300),'X-Forwarded-Proto':'https'};
 const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
 headers['X-Real-IP']=local?(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress;
 if(req.headers['content-length'])headers['Content-Length']=req.headers['content-length'];
 const upstream=http.request(BACKEND+'/api/public/enquiry',{method:'POST',headers,timeout:15000},response=>{res.writeHead(response.statusCode,{'Content-Type':'application/json'});response.pipe(res);});
 upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)json(res,503,{error:'Please try again shortly.'});else res.destroy();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
 try{
 const route=new URL(req.url,'https://horizon-network.co.uk').pathname;
 if(route==='/healthz')return json(res,200,{ok:true});
 if(req.method==='POST'&&route==='/api/public/enquiry')return enquiries(req,res);
 if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
 if(route==='/api/leadership'&&req.method==='GET')return await leadership('leadership',res);
 const match=/^\/api\/leadership\/avatar\/([a-f0-9]{16})$/.exec(route);
 if(match&&req.method==='GET')return await leadership('avatar',res,match[1]);
 if(route.startsWith('/api/'))return json(res,404,{error:'Not found.'});
 const decoded=decodeURIComponent(route);if(decoded.split('/').some(p=>p.startsWith('.')))return json(res,404,{error:'Not found.'});
 let target=path.resolve(PUBLIC,'.'+decoded);
 if(!target.startsWith(path.resolve(PUBLIC)+path.sep)&&target!==path.resolve(PUBLIC))return json(res,404,{error:'Not found.'});
 if(decoded.endsWith('/'))target=path.join(target,'index.html');else if(!path.extname(target))target+='.html';
 let status=200;if(!Object.hasOwn(mime,path.extname(target))||!fs.existsSync(target)||!fs.statSync(target).isFile()){status=404;target=path.join(PUBLIC,'404.html');}
 res.writeHead(status,{'Content-Type':mime[path.extname(target)]});if(req.method==='HEAD')return res.end();fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res);
 }catch{if(!res.headersSent)json(res,503,{error:'This service is temporarily unavailable. Please try again shortly.'});else res.destroy();}
});
if(require.main===module)server.listen(Number(process.env.PORT||3600),process.env.HOST||'127.0.0.1');
module.exports={server};
