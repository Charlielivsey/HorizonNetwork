'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const PUBLIC = path.join(__dirname, 'public');
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml'};
const server = http.createServer((req, res) => {
  const headers = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
  function send(status, body, type = 'text/plain; charset=utf-8') {
    res.writeHead(status, {...headers,'Content-Type':type,'Cache-Control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : body);
  }
  if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); return send(405,'Method not allowed'); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { return send(400,'Bad request'); }
  if (pathname === '/healthz') return send(200,JSON.stringify({ok:true,service:'hn-appeals'}),'application/json; charset=utf-8');
  const file = path.resolve(PUBLIC, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(PUBLIC + path.sep) || pathname.includes('\0')) return send(404,'Not found');
  fs.readFile(file,(error, content) => {
    if (error) return send(404,'Not found');
    send(200,content,MIME[path.extname(file)] || 'application/octet-stream');
  });
});
if (require.main === module) server.listen(Number(process.env.PORT || 5720),process.env.HOST || '127.0.0.1');
module.exports = server;
