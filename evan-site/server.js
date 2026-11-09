'use strict';
// evan.hngroup.org.uk (the user's request, 4 November 2026). One page, private: only the HN Group Auth sign-in accounts
// catnap@hngroup.org.uk and charlie.livsey@hngroup.org.uk can open it (checked by Auth's "evan" client and again here
// before every page), never while impersonating. Everyone else, Evan included, sees "This page is private." Not listed
// on Links, website control, Status or the browser, and search engines are told to stay out.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { createAuth } = require('./lib/auth'), { sessions } = require('./lib/sessions');
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function createServer({ dir = process.env.EVAN_DATA_DIR || '/var/lib/hn-evan' } = {}) {
  const auth = createAuth(sessions(dir));
  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries({ 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' })) res.setHeader(k, v);
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    const page = (response, status, title, message, cookies = []) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookies });
      response.end('<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>HN Group</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/evan.css"><script src="/assets/hn-theme.js?v=20261109-midnight"></script><body class="plain"><main class="wrap problem"><img class="on-light logo" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="140"><img class="on-dark logo" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="140"><h1>' + escape(title) + '</h1><p class="lead">' + escape(message) + '</p>' + (status === 403 ? '' : '<a class="btn btn-primary" href="/auth/login">Sign in with HN Group Auth</a>') + '</main></body></html>');
    };
    try {
      const url = new URL(req.url, auth.ORIGIN), route = url.pathname;
      if (route === '/healthz') return json(200, { ok: true, service: 'hn-evan' });
      if (route === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /\n'); }
      if (await auth.handle(req, res, url, page)) return;
      if (route.startsWith('/assets/') && ['GET', 'HEAD'].includes(req.method)) {
        const target = path.resolve(PUBLIC, '.' + decodeURIComponent(route)), type = TYPES[path.extname(target)];
        if (!target.startsWith(PUBLIC + path.sep) || !type || !fs.existsSync(target) || !fs.statSync(target).isFile()) return json(404, { error: 'Not found.' });
        res.writeHead(200, { 'Content-Type': type }); if (req.method === 'HEAD') return res.end(); return fs.createReadStream(target).pipe(res);
      }
      if (route === '/signed-out') return page(res, 200, 'Signed out.', 'Sign in again whenever you need it.');
      const active = await auth.current(req);
      if (!active) { res.writeHead(302, { Location: '/auth/login?next=' + encodeURIComponent(route === '/' ? '/' : '/') }); return res.end(); }
      if (route !== '/' || req.method !== 'GET') return page(res, 404, 'Nothing here.', 'There’s only one page on this site.');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replace('{{name}}', escape(active.user.displayName || 'you')));
    } catch (e) {
      if (res.headersSent) return res.destroy();
      const status = e.status || 503;
      page(res, status, status === 403 ? 'This page is private.' : 'Unavailable.', status === 403 ? 'You don’t have access to it.' : e.status ? e.message : 'Please try again shortly.');
    }
  });
  return server;
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 5650), '127.0.0.1');
module.exports = { createServer };
