'use strict';
// HR has its own hostname, Auth client and host-only session cookie. HR records stay with the private staff service.
const http=require('node:http');
const fs=require('node:fs');
const nodePath=require('node:path');
const ORIGIN=process.env.HR_ORIGIN || 'https://hr.hngroup.org.uk';
const PAGES = new Set(['/home', '/leave', '/rotas', '/reviews', '/objectives', '/feedback', '/flexible', '/exit-interview', '/exit-interviews', '/staff-files', '/training', '/cases', '/employees', '/onboarding', '/jobs', '/job-descriptions', '/notifications']);
const HR_API = /^\/api\/(leave|rotas|timesheets|reviews|objectives|feedback|flexible|exit-interview|exit-interviews|staff-files|training|cases|employees|onboarding|jobs|job-descriptions|positions)(\/|$)/;
function allowed(path,method){
 const read = method==='GET'||method==='HEAD';
 if(read && (PAGES.has(path) || ['/','/healthz','/login','/auth/start','/auth/callback','/api/me','/api/meta','/api/maintenance','/api/notifications'].includes(path) || path.startsWith('/assets/') || /^\/api\/(avatar|avatars|discord-avatar)\//.test(path))) return true;
 if(['GET','HEAD','POST'].includes(method) && HR_API.test(path)) return true;
 return method==='POST' && ['/api/accounts-handoff','/api/logout','/api/me/theme','/api/notifications/read','/api/notifications/clear'].includes(path);
}
function hrHtml(html){
 return html.replace(/<aside class="deprecation-banner"[^>]*>[\s\S]*?<\/aside>/g,'').replace('<html','<html data-hn-app="hr"')
  .replace(/<link[^>]+href="\/assets\/(portal-ui|position-chart|workspace-navigation)\.css[^>]*>/g,'')
  .replace(/<script[^>]+src="\/assets\/(portal-ui|position-chart|personal-calendar|workspace-navigation)\.js[^>]*><\/script>/g,'')
  .replace('</head>','<link rel="stylesheet" href="/assets/hr-ui.css?v=hr-navigation-2"><link rel="stylesheet" href="/assets/workspace-navigation.css?v=20261110-navigation-1"></head>')
  .replace(/<script src="\/assets\/app\.js[^>]*><\/script>/, '<script src="/assets/workspace-navigation.js?v=20261110-navigation-1"></script><script src="/assets/hr-ui.js?v=hr-navigation-2"></script><script src="/assets/app.js?v=hr-navigation-2"></script>')
  .replaceAll('HN Group Staff Portal','HN Group HR').replaceAll('>Staff Portal<','>HR<')
  .replace('The staff portal for everyone across HN Group, Horizon Network and Horizon Media Group.','Leave, working hours, development and staff records across HN Group.')
  .replace(/<nav class="pf-col" aria-label="Your work">[\s\S]*?<\/nav>/, '<nav class="pf-col" aria-label="Your work"><h2>Your work</h2><a href="/leave" data-link>Leave &amp; absence</a><a href="/rotas" data-link>Rotas &amp; timesheets</a><a href="/reviews" data-link>Probation &amp; reviews</a><a href="/training" data-link>Training</a><a href="/staff-files" data-link>Staff documents</a></nav>')
  .replace(/<nav class="pf-col" aria-label="Workplace">[\s\S]*?<\/nav>/, '<nav class="pf-col" aria-label="Workplace"><h2>Workplace</h2><a href="https://staff.hngroup.org.uk/">Staff Portal</a><a href="https://finance.hngroup.org.uk/">HN Group Finance</a><a href="/home" data-link>HR overview</a></nav>')
  .replace(/href="\/(helpdesk|on-call|settings|about)" data-link/g, 'href="https://staff.hngroup.org.uk/$1"');
}
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true,"service":"hn-hr"}');}
 if((req.method==='GET'||req.method==='HEAD') && ['/assets/hr-ui.css','/assets/hr-ui.js'].includes(path)) {
  const file=nodePath.join(__dirname,'public',path);
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);});return;
 }
 if(!allowed(path,req.method)){res.writeHead(404);return res.end('Not found');}
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==ORIGIN){res.writeHead(403);return res.end('This request must come from HN Group HR.');}
 const url=path==='/'?'/home'+new URL(req.url,'http://localhost').search:req.url;
 const headers={...req.headers,'x-hn-hr-app':'1','accept-encoding':'identity'};delete headers['x-hn-finance-app'];
 const upstream=http.request((process.env.PRIVATE_STAFF_BACKEND||'http://127.0.0.1:3250')+url,{method:req.method,headers,timeout:35000},response=>{
  const h={...response.headers};
  if(String(h['content-type']).startsWith('text/html')){
   const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>{const html=hrHtml(Buffer.concat(chunks).toString('utf8'));delete h['content-length'];res.writeHead(response.statusCode,h);res.end(html);});
  }else{res.writeHead(response.statusCode,h);response.pipe(res);}
 });
 upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"HR is temporarily unavailable. Please try again shortly."}');}else res.destroy();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
if(require.main===module)server.listen(Number(process.env.PORT||5680),'127.0.0.1');
module.exports={server,allowed,hrHtml,PAGES};
