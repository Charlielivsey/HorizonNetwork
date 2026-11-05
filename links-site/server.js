'use strict';
// HN Group Sites (sites.hngroup.org.uk; links.hngroup.org.uk redirects here): every HN Group website in one searchable
// directory (the user's request, 5 November 2026: "improve the links website please, and change the domain to sites").
// The page is drawn here from sites.json so every card is in the HTML (search engines, no-JS); public/app.js adds search,
// filters, pins and live status. GET /api/status passes on just each listed site's status from the Status site (loopback,
// cached a minute). Internal names stay `links` (folder links-site, PM2 hn-links, port 3700, website control id links).
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const PUBLIC = path.join(__dirname, 'public'), ORIGIN = process.env.SITES_ORIGIN || 'https://sites.hngroup.org.uk';
const STATUS_BACKEND = process.env.STATUS_BACKEND || 'http://127.0.0.1:3300';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'sites.json'), 'utf8')).sites;
const GROUPS = [
  ['companies', 'Our companies', 'The group and the companies in it.'],
  ['staff', 'Staff services', 'Sign in with your HN Group Auth account. Some need a named account or a separate permission.'],
  ['services', 'Services & resources', 'Help, updates, careers and information, open to everyone.'],
];
// Simple line icons (24 × 24, drawn with the current colour) for sites without a company logo.
const ICONS = {
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l2 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  pen: '<path d="m15.5 4.5 4 4L9 19H5v-4z"/><path d="M4 21h16"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.4-1.2-1.9-1.2-3.1 0-1 .8-1.6 1.8-1.6H16a5 5 0 0 0 5-5c0-3.7-4-6.7-9-6.7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  'building-lock': '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6M8 8h3M8 12h3M8 16h2M4 21h7"/><rect x="14" y="15" width="7" height="6" rx="1.2"/><path d="M15.5 15v-1.5a2 2 0 0 1 4 0V15"/>',
  'book-lock': '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v12M5 4.5V19a2 2 0 0 0 2 2h4M5 17.5A1.5 1.5 0 0 1 6.5 16H11"/><rect x="14" y="15" width="7" height="6" rx="1.2"/><path d="M15.5 15v-1.5a2 2 0 0 1 4 0V15"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  sliders: '<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="19" cy="8" r="2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 4 4M14.4 14.4l4 4M18.4 5.6l-4 4M9.6 14.4l-4 4"/>',
  pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  sparkles: '<path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9z"/><path d="M19 3v4M17 5h4"/>',
  news: '<rect x="3" y="4" width="15" height="16" rx="2"/><path d="M18 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-4 0M7 8h7M7 12h7M7 16h4"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>',
};
const ACCESS = { public: ['Open to everyone', 'open'], staff: ['Staff sign-in', 'staff'], restricted: ['Restricted', 'restricted'] };

function card(s) {
  const mark = s.logo
    ? '<img class="on-light" src="/assets/brand/' + esc(s.logo) + '.svg" alt="" loading="lazy"><img class="on-dark" src="/assets/brand/' + esc(s.logo) + '-white.svg" alt="" loading="lazy">'
    : '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[s.icon] || ICONS.building) + '</svg>';
  const [accessText, accessKind] = ACCESS[s.access] || ACCESS.public;
  const shown = s.url.replace(/^https:\/\//, '').replace(/\/$/, '').replace(/\/auth\/start$/, '');
  const search = [s.name, s.label, s.desc, shown, s.keywords, accessText].join(' ').toLowerCase();
  return '<article class="site-card' + (s.logo ? ' has-logo' : '') + (s.wide ? ' wide' : '') + '" data-id="' + esc(s.id) + '" data-group="' + esc(s.group) + '" data-host="' + esc(s.host) + '" data-search="' + esc(search) + '">' +
    '<div class="card-head"><span class="card-mark' + (s.logo ? ' logo' : ' icon') + '">' + mark + '</span>' +
    '<button type="button" class="pin" aria-pressed="false" aria-label="Pin ' + esc(s.name) + '" title="Pin to the top"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg></button></div>' +
    '<p class="card-label">' + esc(s.label) + '</p><h3><a class="card-link" href="' + esc(s.url) + '"><span class="name">' + esc(s.name) + '</span></a></h3><p class="card-desc">' + esc(s.desc) + '</p>' +
    '<div class="card-foot"><span class="card-host"><span class="dot" aria-hidden="true"></span><span class="host-text">' + esc(shown) + '</span><span class="sr-only status-text"></span></span>' +
    '<span class="access ' + accessKind + '">' + esc(accessText) + '</span></div></article>';
}

function page() {
  const counts = Object.fromEntries(GROUPS.map(([g]) => [g, DATA.filter((s) => s.group === g).length]));
  const popular = DATA.filter((s) => s.popular).map((s) => '<a class="chip" href="' + esc(s.url) + '">' + esc(s.name) + '</a>').join('');
  const sections = GROUPS.map(([g, title, intro]) => '<section class="group" id="' + g + '" data-group-section="' + g + '" aria-labelledby="' + g + '-title"><div class="group-head"><div><h2 id="' + g + '-title">' + esc(title) + '</h2><p class="muted">' + esc(intro) + '</p></div><span class="group-count" data-count-for="' + g + '">' + counts[g] + '</span></div>' +
    '<div class="site-grid' + (g === 'companies' ? ' companies' : '') + '">' + DATA.filter((s) => s.group === g).map(card).join('') + '</div></section>').join('');
  const stripe = '<span></span>'.repeat(8);
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#5514B4">' +
    '<meta name="description" content="Every HN Group website in one place: our companies, staff services, help, status, careers and more.">' +
    '<title>HN Group Sites</title><link rel="canonical" href="' + ORIGIN + '/"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">' +
    '<link rel="preload" href="/assets/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>' +
    '<link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/hn-motion.css"><link rel="stylesheet" href="/assets/sites.css?v=2">' +
    '<script src="/assets/hn-motion.js" defer></script><script src="/app.js?v=2" defer></script></head><body>' +
    '<a class="skip" href="#directory">Skip to the sites</a>' +
    '<header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="HN Group Sites home"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="120" height="42"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="120" height="42"><span class="brand-label">Sites</span></a>' +
    '<nav class="site-nav sites-nav" aria-label="Sections"><a href="#companies">Companies</a><a href="#staff">Staff</a><a href="#services">Services</a></nav>' +
    '<a class="status-pill" id="status-pill" href="https://status.hngroup.org.uk/"><span class="dot" aria-hidden="true"></span><span id="status-pill-text">Service status</span></a></div></header>' +
    '<main id="main"><section class="hero sites-hero hn-glow"><div class="wrap">' +
    '<div class="head-steps" data-hn-steps="alive" aria-hidden="true"></div>' +
    '<p class="eyebrow">The HN Group directory</p><h1>Every HN Group site,<br><span>in one place.</span></h1>' +
    '<p class="lead">Our companies, the tools staff use every day, and where to get help. Search, pin your favourites and see what’s up at a glance.</p>' +
    '<div class="finder"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><label class="sr-only" for="search">Search every HN Group site</label>' +
    '<input id="search" type="search" placeholder="Search sites, e.g. payslips, sign a contract, logos…" autocomplete="off" maxlength="100" enterkeyhint="go"><kbd aria-hidden="true">/</kbd></div>' +
    '<p class="popular"><span class="muted">Popular:</span>' + popular + '</p></div></section>' +
    '<div class="wrap directory" id="directory">' +
    '<section class="group pinned" id="pinned" aria-labelledby="pinned-title" hidden><div class="group-head"><div><h2 id="pinned-title">Pinned</h2><p class="muted">Your favourites, saved in this browser. Select the star on any site to pin or unpin it.</p></div></div><div class="site-grid" id="pinned-grid"></div></section>' +
    '<div class="toolbar"><div class="tabs" role="group" aria-label="Show"><button type="button" data-filter="all" aria-pressed="true">All <span>' + DATA.length + '</span></button>' +
    GROUPS.map(([g, title]) => '<button type="button" data-filter="' + g + '" aria-pressed="false">' + esc(title.replace(' & resources', '')) + ' <span>' + counts[g] + '</span></button>').join('') + '</div>' +
    '<p class="result-count" id="count" role="status" aria-live="polite"></p></div>' + sections +
    '<div class="empty" id="empty" hidden><h2>No sites match that.</h2><p class="muted">Try another word, or see every site.</p><button type="button" class="btn btn-ghost btn-small" id="reset">Show every site</button></div></div></main>' +
    '<footer class="site-footer"><div class="stripe" aria-hidden="true">' + stripe + '</div><div class="wrap footer-inner sites-footer"><div class="footer-brand"><img src="/assets/brand/hn-group-wordmark-white.svg" alt="HN Group" height="38" loading="lazy"></div>' +
    '<nav class="footer-links" aria-label="More"><a href="https://hngroup.org.uk/">hngroup.org.uk</a><a href="https://status.hngroup.org.uk/">Service status</a><a href="https://hngroup.org.uk/support">Support</a><a href="https://hngroup.org.uk/privacypolicy">Privacy</a></nav></div>' +
    '<div class="wrap footer-legal small">© <span id="year">' + new Date().getFullYear() + '</span> HN Group Limited</div></footer></body></html>';
}
const HTML = page();

// Live status: each listed host's status, from the Status site's public snapshot (its monitors are keyed by host).
const HOSTS = new Set(DATA.map((s) => s.host));
let statusCache = { at: 0, body: null };
async function liveStatus() {
  if (statusCache.body && Date.now() - statusCache.at < 60000) return statusCache.body;
  let hosts = {};
  try {
    const r = await fetch(STATUS_BACKEND + '/api/status', { signal: AbortSignal.timeout(4000), redirect: 'error' });
    const v = r.ok ? await r.json() : null;
    for (const s of (v && Array.isArray(v.services) ? v.services : [])) {
      const host = String(s.id || '').split(':').pop();
      if (HOSTS.has(host) && typeof s.status === 'string' && /^[a-z-]{1,20}$/.test(s.status)) hosts[host] = s.status;
    }
  } catch { hosts = {}; }
  statusCache = { at: Date.now(), body: JSON.stringify({ updatedAt: new Date().toISOString(), hosts }) };
  return statusCache.body;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end('Method not allowed'); }
  let route;
  try { route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (route === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(req.method === 'HEAD' ? '' : '{"ok":true,"service":"hn-links"}'); }
  if (route === '/api/status') { const body = await liveStatus(); res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(req.method === 'HEAD' ? '' : body); }
  if (route === '/' || route === '/index.html') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }); return res.end(req.method === 'HEAD' ? '' : HTML); }
  let target = path.resolve(PUBLIC, '.' + route);
  const valid = target.startsWith(PUBLIC + path.sep) && !route.split('/').some((p) => p.startsWith('.')) && Object.hasOwn(MIME, path.extname(target)) && fs.existsSync(target) && fs.statSync(target).isFile();
  if (!valid) target = path.join(PUBLIC, '404.html');
  res.writeHead(valid ? 200 : 404, { 'Content-Type': MIME[path.extname(target)], 'Cache-Control': route.startsWith('/assets/') ? 'public, max-age=300' : 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
});
if (require.main === module) server.listen(Number(process.env.PORT || 3700), '127.0.0.1');
module.exports = { server, DATA, page };
