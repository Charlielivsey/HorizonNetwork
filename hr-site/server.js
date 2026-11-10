'use strict';
// HR has its own hostname, Auth client and host-only session cookie. Leave records stay with the private staff service.
const http=require('node:http');
const ORIGIN=process.env.HR_ORIGIN || 'https://hr.hngroup.org.uk';
function allowed(path,method){
 if(path==='/healthz')return true;
 if(method==='GET'||method==='HEAD')return ['/','/leave','/login','/auth/start','/auth/callback','/api/me','/api/meta','/api/maintenance','/api/notifications'].includes(path)||path.startsWith('/assets/')||path.startsWith('/api/leave')||/^\/api\/(avatar|avatars|discord-avatar)\//.test(path);
 return path.startsWith('/api/leave')||path==='/api/logout'||path.startsWith('/api/notifications/');
}
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true,"service":"hn-hr"}');}
 if(!allowed(path,req.method)){res.writeHead(404);return res.end('Not found');}
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==ORIGIN){res.writeHead(403);return res.end('This request must come from HN Group HR.');}
 const url=path==='/'?'/leave':req.url;
 const headers={...req.headers,'x-hn-hr-app':'1'};delete headers['x-hn-finance-app'];
 const upstream=http.request((process.env.PRIVATE_STAFF_BACKEND||'http://127.0.0.1:3250')+url,{method:req.method,headers,timeout:35000},response=>{
  const h={...response.headers};
  if(h.location==='/home')h.location='/leave';
  if(String(h['content-type']).startsWith('text/html')){
   const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>{let html=Buffer.concat(chunks).toString('utf8');html=html.replace(/<aside class="deprecation-banner"[^>]*>[\s\S]*?<\/aside>/g,'').replace('<html','<html data-hn-app="hr"').replaceAll('HN Group Staff Portal','HN Group HR').replaceAll('>Staff Portal<','>HR<').replace('href="/home"','href="/leave"').replace('The staff portal for everyone across HN Group, Horizon Network and Horizon Media Group.','Leave, absence and annual leave requests for everyone across HN Group.');delete h['content-length'];res.writeHead(response.statusCode,h);res.end(html);});
  }else{res.writeHead(response.statusCode,h);response.pipe(res);}
 });
 upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"HR is temporarily unavailable. Please try again shortly."}');}else res.destroy();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
if(require.main===module)server.listen(Number(process.env.PORT||5680),'127.0.0.1');
module.exports={server,allowed};
