'use strict';
// Finance has its own Auth client and session. Financial records have a single writer: hn-accounts.
const http = require('node:http');
const redirectWorkspace=require('./staff-redirect.cjs');
const fs = require('node:fs');
const nodePath = require('node:path');
const ORIGIN = process.env.FINANCE_ORIGIN || 'https://finance.hngroup.org.uk';
const PAGES = new Set(['/home', '/payslips', '/expenses', '/payroll', '/funds', '/invoices', '/bills', '/notifications']);
function allowed(path, method) {
  const read = method === 'GET' || method === 'HEAD';
  if (read && (PAGES.has(path) || ['/', '/healthz', '/login', '/auth/start', '/auth/callback', '/api/me', '/api/live', '/api/meta', '/api/maintenance', '/api/directory', '/api/notifications'].includes(path) || path.startsWith('/assets/') || /^\/api\/(avatar|avatars|discord-avatar)\//.test(path))) return true;
  if (['GET', 'HEAD', 'POST'].includes(method) && /^\/api\/(payslips|expenses|payroll|funds|invoices|bills)(\/|$)/.test(path)) return true;
  return method === 'POST' && ['/api/accounts-handoff', '/api/logout', '/api/me/status', '/api/me/theme', '/api/notifications/read', '/api/notifications/clear'].includes(path);
}
function financeHtml(html) {
  return html.replace(/<aside class="deprecation-banner"[^>]*>[\s\S]*?<\/aside>/g, '').replace('<html', '<html data-hn-app="finance"')
    .replace(/<link[^>]+href="\/assets\/(portal-ui|position-chart|workspace-navigation)\.css[^>]*>/g, '')
    .replace(/<script[^>]+src="\/assets\/(portal-ui|position-chart|personal-calendar|workspace-navigation)\.js[^>]*><\/script>/g, '')
    .replace('</head>', '<link rel="stylesheet" href="/assets/finance-ui.css?v=20261112-finance-1"><link rel="stylesheet" href="/assets/workspace-navigation.css?v=20261112-finance-1"></head>')
    .replace(/<script src="\/assets\/app\.js[^>]*><\/script>/, '<script src="/assets/workspace-navigation.js?v=20261112-finance-1"></script><script src="/assets/finance-ui.js?v=20261112-finance-1"></script><script src="/assets/app.js?v=20261117-governance-1"></script>')
    .replaceAll('HN Group Staff Portal', 'HN Group Finance').replaceAll('>Staff Portal<', '>Finance<')
    .replace('The staff portal for everyone across HN Group, Horizon Network and Horizon Media Group.', 'Payslips, expenses and company finances across HN Group.')
    .replace(/<nav class="pf-col" aria-label="Your work">[\s\S]*?<\/nav>/, '<nav class="pf-col" aria-label="Your money"><h2>Your money</h2><a href="/payslips" data-link>Payslips</a><a href="/expenses" data-link>Expenses</a><a href="/home" data-link>Finance home</a></nav>')
    .replace(/<nav class="pf-col" aria-label="Workplace">[\s\S]*?<\/nav>/, '<nav class="pf-col" aria-label="Workplace"><h2>Workplace</h2><a href="https://staff.hngroup.org.uk/">Staff Portal</a><a href="https://hr.hngroup.org.uk/">HR</a></nav>')
    .replace(/href="\/(helpdesk|on-call|settings|about)" data-link/g, 'href="https://staff.hngroup.org.uk/$1"');
}
function createServer(backend = process.env.PRIVATE_STAFF_BACKEND || 'http://127.0.0.1:3250') {
  return http.createServer((req, res) => {
 if(redirectWorkspace(req,res,'finance'))return;
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/' && ['GET','HEAD'].includes(req.method)) { res.writeHead(302, {Location:'/home'+new URL(req.url,'http://localhost').search, 'Cache-Control':'no-store'}); return res.end(); }
    if (['GET','HEAD'].includes(req.method) && ['/assets/finance-ui.css','/assets/finance-ui.js'].includes(path)) {
      fs.readFile(nodePath.join(__dirname,'public',path), (error,body) => {
        if(error){res.writeHead(404);return res.end('Not found');}
        res.writeHead(200, {'Content-Type':path.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8', 'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
      });return;
    }
    if (!allowed(path, req.method)) { res.writeHead(404); return res.end('Not found'); }
    if (path === '/healthz') { res.writeHead(200, {'Content-Type': 'application/json'}); return res.end('{"ok":true,"service":"hn-finance"}'); }
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== ORIGIN) { res.writeHead(403); return res.end('This request must come from HN Group Finance.'); }
    const headers = {...req.headers, 'x-hn-finance-app': '1', 'accept-encoding': 'identity'};
    delete headers['x-hn-hr-app'];delete headers['x-hn-it-app'];
    const upstream = http.request(backend + req.url, {method: req.method, headers, timeout: 35000}, response => {
      const h = {...response.headers};
      if (String(h['content-type']).startsWith('text/html')) {
        const chunks = []; response.on('data', x => chunks.push(x));
        response.on('end', () => { delete h['content-length']; res.writeHead(response.statusCode, h); res.end(financeHtml(Buffer.concat(chunks).toString('utf8'))); });
      } else { res.writeHead(response.statusCode, h); response.pipe(res); }
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) { res.writeHead(503, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end('{"error":"Finance is temporarily unavailable. Please try again shortly."}'); } else res.destroy(); });
    req.on('aborted', () => upstream.destroy()); req.pipe(upstream);
  });
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 5690), '127.0.0.1');
module.exports = {allowed, financeHtml, createServer};
