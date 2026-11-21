'use strict';
// IT has its own hostname, Auth client and host-only session cookie. IT records stay with the private staff service.
const http=require('node:http');
const redirectWorkspace=require('./staff-redirect.cjs');
const fs=require('node:fs');
const nodePath=require('node:path');
const ORIGIN=process.env.IT_ORIGIN || 'https://it.hngroup.org.uk';
const PAGES = new Set(['/home','/cases','/accounts','/staff-accounts','/status','/on-call','/notifications']);
const IT_API = /^\/api\/(it-requests|status|oncall)(\/|$)/;
function allowed(path,method){
 const read = method==='GET'||method==='HEAD';
 if(read && (PAGES.has(path) || ['/','/healthz','/login','/auth/start','/auth/callback','/api/me','/api/live','/api/meta','/api/directory','/api/maintenance','/api/notifications'].includes(path) || path.startsWith('/assets/') || /^\/api\/(avatar|avatars|discord-avatar)\//.test(path))) return true;
 if(read && path==='/api/employees')return true;
 if(method==='POST' && /^\/api\/employees\/[a-f0-9]{16}\/(account(?:\/(disable|enable))?|code\/reset)$/.test(path))return true;
 if(['GET','HEAD','POST'].includes(method) && /^\/api\/logins(?:\/[a-f0-9]{16}(?:\/(reset|code\/reset|disable|enable|lock|unlock|delete|permanent))?)?$/.test(path))return true;
 if(['GET','HEAD','POST'].includes(method) && IT_API.test(path)) return true;
 return method==='POST' && ['/api/accounts-handoff','/api/logout','/api/me/status','/api/me/theme','/api/notifications/read','/api/notifications/clear'].includes(path);
}
function itHtml(html){
 return html.replace(/<aside class="deprecation-banner"[^>]*>[\s\S]*?<\/aside>/g,'').replace('<html','<html data-hn-app="it"')
  .replace(/<link[^>]+href="\/assets\/(portal-ui|position-chart|workspace-navigation)\.css[^>]*>/g,'')
  .replace(/<script[^>]+src="\/assets\/(portal-ui|position-chart|personal-calendar|workspace-navigation)\.js[^>]*><\/script>/g,'')
  .replace('</head>','<link rel="stylesheet" href="/assets/account-administration.css?v=20261112-redesign-2"><script src="/assets/it-status.js?v=20261112-1" defer></script><script src="/assets/account-administration.js?v=20261112-redesign-2" defer></script><link rel="stylesheet" href="/assets/it-ui.css?v=it-account-redesign-20261112-1"><link rel="stylesheet" href="/assets/workspace-navigation.css?v=20261110-navigation-1-it-cases-1"></head>')
  .replace(/<script src="\/assets\/app\.js[^>]*><\/script>/, '<script src="/assets/workspace-navigation.js?v=20261110-navigation-1-it-cases-1"></script><script src="/assets/it-ui.js?v=it-account-redesign-20261112-1"></script><script src="/assets/app.js?v=it-account-redesign-20261112-1"></script>')
  .replaceAll('HN Group Staff Portal','HN Group IT').replaceAll('>Staff Portal<','>IT<')
  .replace('The staff portal for everyone across HN Group, Horizon Network and Horizon Media Group.','IT support, service operations and tools across HN Group.')
  .replace(/<nav class="pf-col" aria-label="Your work">[\s\S]*?<\/nav>/, '<nav class="pf-col" aria-label="Your work"><h2>Your work</h2><a href="/cases" data-link>IT cases</a><a href="/status" data-link>Service status</a><a href="/on-call" data-link>On-call rota</a></nav>')
  .replace(/<nav class="pf-col" aria-label="Workplace">[\s\S]*?<\/nav>/, '<nav class="pf-col" aria-label="Workplace"><h2>Workplace</h2><a href="https://staff.hngroup.org.uk/">Staff Portal</a><a href="https://finance.hngroup.org.uk/">HN Group Finance</a><a href="/home" data-link>IT overview</a></nav>')
  .replace(/href="\/(helpdesk|on-call|settings|about)" data-link/g, 'href="https://staff.hngroup.org.uk/$1"');
}
const server=http.createServer((req,res)=>{
 if(redirectWorkspace(req,res,'it'))return;
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/' && ['GET','HEAD'].includes(req.method)){res.writeHead(302,{'Location':'/home'+new URL(req.url,'http://localhost').search,'Cache-Control':'no-store'});return res.end();}
 if(path==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true,"service":"hn-it"}');}
 if((req.method==='GET'||req.method==='HEAD') && ['/assets/it-ui.css','/assets/it-ui.js','/assets/account-administration.css','/assets/account-administration.js','/assets/it-status.js'].includes(path)) {
  const file=nodePath.join(__dirname,'public',path);
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);});return;
 }
 if(!allowed(path,req.method)){res.writeHead(404);return res.end('Not found');}
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==ORIGIN){res.writeHead(403);return res.end('This request must come from HN Group IT.');}
 const url=req.url;
 const headers={...req.headers,'x-hn-it-app':'1','accept-encoding':'identity'};delete headers['x-hn-finance-app'];delete headers['x-hn-hr-app'];
 const upstream=http.request((process.env.PRIVATE_STAFF_BACKEND||'http://127.0.0.1:3250')+url,{method:req.method,headers,timeout:35000},response=>{
  const h={...response.headers};
  if(String(h['content-type']).startsWith('text/html')){
   const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>{const html=itHtml(Buffer.concat(chunks).toString('utf8'));delete h['content-length'];res.writeHead(response.statusCode,h);res.end(html);});
  }else{res.writeHead(response.statusCode,h);response.pipe(res);}
 });
 upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"IT is temporarily unavailable. Please try again shortly."}');}else res.destroy();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
if(require.main===module)server.listen(Number(process.env.PORT||5710),'127.0.0.1');
module.exports={server,allowed,itHtml,PAGES};
