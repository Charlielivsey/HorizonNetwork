'use strict';
// HN Group brand centre — branding.hngroup.org.uk. The approved logos, colours, type and usage
// rules for HN Group and its companies. The catalogue and approved downloads are public.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = process.env.BRANDING_PUBLIC_DIR || path.join(__dirname, 'public');
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const PUBLIC_FILES = new Set(['/assets/hn-theme.js', '/assets/branding.css', '/assets/branding.js', '/assets/favicon.svg', '/assets/fonts/plus-jakarta-sans.woff2', '/robots.txt',
  // The header wordmark is already public on every HN Group website.
  '/assets/brand/svg/hn-group-wordmark.svg', '/assets/brand/svg/hn-group-wordmark-white.svg']);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (dir, file) => fs.existsSync(path.join(PUBLIC, 'assets', 'brand', dir, file));

// ---------- Brand content (from brand/README.md and the approved logo files) ----------

const COMPANIES = [
  { id:'hn-appeals', name:'HN Appeals', note:'The HN Group appeals service.', variants:[['hn-appeals-logo','Logo',false],['hn-appeals-logo-white','Logo, white',true],['hn-appeals-app-icon','Service icon',true]] },
  { id: 'hn-group', name: 'HN Group', note: 'The parent company of the group.', variants: [['hn-group-wordmark', 'Wordmark', false], ['hn-group-wordmark-white', 'Wordmark, white', true]], extras: [['hn-group-google-workspace', 'Google Workspace logo']] },
  { id: 'horizon-network', name: 'Horizon Network', note: 'A subsidiary of HN Group. Horizon Development is part of Horizon Network.', variants: [['horizon-network-wordmark', 'Wordmark', false], ['horizon-network-wordmark-white', 'Wordmark, white', true], ['horizon-network-wordmark-stacked', 'Stacked wordmark', false], ['horizon-network-wordmark-stacked-white', 'Stacked wordmark, white', true]] },
  { id: 'horizon-media-group', name: 'Horizon Media Group', note: 'A subsidiary of HN Group.', variants: [['horizon-media-group-logo', 'Wordmark', false], ['horizon-media-group-logo-white', 'Wordmark, white', true], ['horizon-media-group-roundel', 'Compact mark', false], ['horizon-media-group-roundel-white', 'Compact mark, white', true], ['horizon-media-group-app-icon', 'App icon', false]] },
  { id: 'horizon-advertising', name: 'Horizon Advertising', note: 'A subsidiary of Horizon Media Group, managed by Horizon Network.', variants: roundelSet('horizon-advertising') },
  { id: 'horizon-development', name: 'Horizon Development', note: 'Part of Horizon Network.', variants: [['horizon-development-logo', 'Full logo', false], ['horizon-development-logo-white', 'Full logo, white', true], ['horizon-development-roundel', 'Circle only', false], ['horizon-development-roundel-white', 'Circle only, white', true], ['horizon-development-app-icon', 'App icon', false]] },
  { id: 'hn-secure-access-terminal', name: 'HN Secure Access Terminal', note: 'The HN Group VPN and server terminal application.', variants: [['hn-secure-access-terminal-logo', 'Product logo', false], ['hn-secure-access-terminal-logo-white', 'Product logo, white', true], ['hn-secure-access-terminal-app-icon', 'App icon', true]] },
];
function roundelSet(id) {
  return [[id + '-logo', 'Logo', false], [id + '-logo-white', 'Logo, white', true], [id + '-roundel', 'Roundel', false], [id + '-roundel-white', 'Roundel, white', true], [id + '-app-icon', 'App icon', false]];
}

const COLOURS = [
  ['purple', 'HN Purple', '#5514B4', 'The primary identity colour used in our artwork.'],
  ['pink', 'Pink', '#E97DE8', ''], ['yellow', 'Yellow', '#E3E65B', ''], ['teal', 'Teal', '#3E9BA3', ''],
  ['plum', 'Plum', '#7A1F6C', ''], ['raspberry', 'Raspberry', '#C2306B', ''], ['green', 'Green', '#5FAE7B', ''], ['navy', 'Navy', '#1C2135', ''],
  ['charcoal','Charcoal','#252629','The default page background.'], ['panel','Panel grey','#303136','Cards, menus and panels.'], ['raised','Raised grey','#37383E','Inputs and raised surfaces.'], ['lavender','Lavender','#CCB2F0','Actions and accents on charcoal interfaces.'],
];
// The multicolour stripe, left to right, with each colour's share of the width.
const STRIPE = [['pink', 14], ['purple', 14], ['yellow', 6], ['teal', 20], ['plum', 10], ['raspberry', 10], ['green', 13], ['navy', 13]];

const DISCORD_SERVERS = [['horizon-network-hq', 'Horizon Network HQ'], ['horizon-advertising', 'Horizon Advertising'], ['horizon-development', 'Horizon Development'], ['horizon-network-staff', 'Horizon Network | Staff Server']];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

const artworkVersion = file => /^(?:horizon-advertising|horizon-media-group|horizon-development)/.test(file) ? '?v=20261120-development-full-logo' : /^discord-server-/.test(file) ? '?v=20261117-service-icons' : /^hn-(?:utilities|logs)-(?:avatar|banner)$/.test(file) ? '?v=20261114-horizon-network' : '';
function downloads(file) {
  const links = [];
  if (has('svg', file + '.svg')) links.push('<a class="dl" href="/assets/brand/svg/' + file + '.svg' + artworkVersion(file) + '" download>SVG</a>');
  if (has('png', file + '.png')) links.push('<a class="dl" href="/assets/brand/png/' + file + '.png' + artworkVersion(file) + '" download>PNG</a>');
  return links.join('');
}
function tile(file, label, dark, parameters = '') {
  const src = has('svg', file + '.svg') ? '/assets/brand/svg/' + file + '.svg' : '/assets/brand/png/' + file + '.png';
  return '<figure class="tile"><div class="preview' + (dark ? ' dark' : '') + '"><img src="' + src + artworkVersion(file) + '" alt="' + esc(label) + '" loading="lazy"></div>' +
    '<figcaption><span>' + esc(label) + (parameters ? '<small class="asset-parameters">' + esc(parameters) + '</small>' : '') + '</span><span class="dls">' + downloads(file) + '</span></figcaption></figure>';
}

function homePage(user) {
  const logos = COMPANIES.map((c) => '<section class="company" id="' + c.id + '"><div class="company-head"><h3>' + esc(c.name) + '</h3><p>' + esc(c.note) + '</p></div>' +
    '<div class="tiles">' + c.variants.map((v) => tile(v[0], v[1], v[2])).join('') + (c.extras || []).map((x) => tile(x[0], x[1], false)).join('') + '</div></section>').join('');
  const colours = COLOURS.map(([id, name, hex, use]) => '<button type="button" class="swatch" data-copy="' + hex + '"><span class="chip c-' + id + '"></span><span class="sw-text"><strong>' + esc(name) + '</strong>' +
    '<span class="mono">' + hex + '</span><span class="mono muted">RGB ' + rgb(hex) + '</span>' + (use ? '<span class="muted small">' + esc(use) + '</span>' : '') + '</span><span class="copy-hint">Copy</span></button>').join('');
  const stripe = '<div class="stripe-demo" role="img" aria-label="The HN multicolour stripe">' + STRIPE.map(([id, w]) => '<i class="c-' + id + ' f' + w + '"></i>').join('') + '</div>' +
    '<ol class="stripe-list">' + STRIPE.map(([id, w]) => { const c = COLOURS.find((x) => x[0] === id); return '<li><span class="dot c-' + id + '"></span>' + esc(c[1]) + ' <span class="mono muted">' + c[2] + '</span> · ' + w + '%</li>'; }).join('') + '</ol>';
  // Discord logos (the user's request, 5 November 2026): the server icons and the HN Group Auth bot's picture and banner,
  // shown round as Discord shows them. Copies of brand/discord-servers and brand/discord-bot.
  const discordTile = (file, label, kind, parameters = '') => '<figure class="tile discord-tile' + (kind === 'banner' ? ' wide' : '') + '"><div class="preview discord ' + kind + '"><img src="/assets/brand/png/' + file + '.png' + artworkVersion(file) + '" alt="' + esc(label) + '" loading="eager" decoding="async"></div>' +
    '<figcaption><span>' + esc(label) + (parameters ? '<small class="asset-parameters">' + esc(parameters) + '</small>' : '') + '</span><span class="dls">' + downloads(file) + '</span></figcaption></figure>';
  const discord = '<h3 class="sub">Server icons</h3><div class="tiles">' + DISCORD_SERVERS.map(([f, l]) => discordTile('discord-server-' + f, l, 'icon')).join('') + discordTile('hn-appeals-app-icon', 'HN Appeals', 'icon') + '</div>' +
    '<h3 class="sub">HN Group Auth bot</h3><div class="tiles">' + discordTile('discord-bot-avatar', 'Bot profile picture', 'icon') + discordTile('discord-bot-banner', 'Bot banner', 'banner') + '</div>' +
    [['utilities','HN Utilities'],['logs','HN Logs']].map(([id,name]) => '<div id="hn-' + id + '-discord"><h3 class="sub">' + name + '</h3><p>Upload the PNGs to the bot’s Discord profile. Profile pictures are circle-safe; banner text stays clear of the overlapping avatar.</p><div class="tiles">' + discordTile('hn-' + id + '-avatar', name + ' profile picture', 'icon', '1024 × 1024 · PNG · 1:1') + discordTile('hn-' + id + '-banner', name + ' banner', 'banner', '1360 × 480 · PNG · 17:6') + '</div></div>').join('');
  const emailLogos = COMPANIES.filter((c) => has('png', c.id + '-email-logo.png')).map((c) => tile(c.id + '-email-logo', c.name, false)).join('');

  const body =
    '<section class="hero"><div class="hero-copy"><p class="eyebrow">The HN brand library</p><h1>A shared identity.<br><span>Made for everyone.</span></h1>' +
    '<p class="lede">The approved logos, colours and type for HN Group and its companies. Download what you need, and follow the guidance below so everything we make looks like it belongs together.</p>' +
    '<div class="hero-actions"><a class="button" href="#logos">Explore the library</a><a class="button secondary" href="#rules">Using our brand</a></div></div><div class="hero-art" aria-hidden="true"><img src="/assets/brand/svg/hn-group-wordmark-white.svg" alt=""><span>One family. Distinct identities.</span><div class="brand-ribbon"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></section><nav class="jump" aria-label="On this page"><a href="#logos">Logos</a><a href="#colours">Colours</a><a href="#stripe">Stripe</a><a href="#type">Typography</a><a href="#rules">Using the logos</a><a href="#email">Email signatures</a><a href="#discord">Discord logos</a><a href="#icon">Tab icon</a></nav>' +

    '<section class="block" id="logos"><div class="section-heading"><div><p class="eyebrow">Original artwork</p><h2>Find your identity.</h2></div><label class="library-search"><span>Filter the logo library</span><input type="search" id="asset-search" placeholder="Find a company or product" autocomplete="off"></label></div><p class="intro">Every file is the original artwork supplied for the group. Use the regular version on light backgrounds and the white version on dark ones. SVG is best for websites and print; PNG is for apps that don’t accept SVG.</p>' + '<p class="library-results" id="library-results" role="status" aria-live="polite"></p>' + logos + '<div id="library-empty" hidden>No matching identities. Try another company or product name.</div></section>' +

    '<section class="block" id="colours"><h2>Colours</h2><p class="intro">Our identity colours make up the signature stripe. Charcoal, panel grey and lavender bring the same family into our interfaces. Select a colour to copy its hex code.</p><div class="swatches">' + colours + '</div>' +
    '<p class="note">Keep status colours (such as red for errors and green for success) meaningful. Don’t use brand colours in a way that could be mistaken for a status.</p></section>' +

    '<section class="block" id="stripe"><h2>The multicolour stripe</h2><p class="intro">The stripe runs across the top of our websites and along the bottom of email signatures. Keep the colours in this order and these proportions.</p>' + stripe + '</section>' +

    '<section class="block" id="type"><h2>Typography</h2><div class="type-card"><p class="type-sample">Plus Jakarta Sans</p><p class="type-weights"><span class="w4">Regular</span><span class="w6">Semibold</span><span class="w8">Extra bold</span></p>' +
    '<p class="muted">Our typeface for websites, documents and presentations. It’s self-hosted on our websites and licensed under the SIL Open Font License. Email signatures use Arial so they display the same in every mail app.</p>' +
    '<p class="dls"><a class="dl" href="/assets/fonts/plus-jakarta-sans.woff2" download>Web font (WOFF2)</a><a class="dl" href="/assets/brand/OFL-LICENSE.txt" download>Font licence</a></p></div></section>' +

    '<section class="block" id="rules"><h2>Using the logos</h2><div class="rules">' +
    '<div class="rule do"><h3>Do</h3><ul><li>Use the original files from this page.</li><li>Use the regular logo on light backgrounds and the white logo on dark ones.</li><li>Keep the original proportions; resize by width or height only.</li><li>Leave clear space around the logo.</li><li>Use the logo of the company you’re representing.</li></ul></div>' +
    '<div class="rule dont"><h3>Don’t</h3><ul><li>Crop, stretch, squash or rotate a logo.</li><li>Recolour a logo or change its lettering.</li><li>Redraw a logo or type the name in its place.</li><li>Put a logo on a busy or low-contrast background.</li><li>Swap one company’s logo for another’s.</li></ul></div></div></section>' +

    '<section class="block" id="email"><h2>Email signatures</h2><p class="intro">Make your own branded signature in HN Account. It fills in your details from your staff profile and works in Gmail, Outlook and Apple Mail.</p>' +
    '<p><a class="button" href="https://auth.hngroup.org.uk/account/#signature">Open the signature maker</a></p><h3 class="sub">Signature logos</h3><div class="tiles">' + emailLogos + '</div></section>' +

    '<section class="block" id="discord"><h2>Discord logos</h2><p class="intro">Icons for our Discord servers and matching profile pictures and banners for HN Utilities and HN Logs. Legacy HN Group Auth artwork remains available below. Upload them as they are (1024 × 1024 for icons): Discord shows icons as a circle, as below.</p>' + discord + '</section>' +
    '<section class="block" id="icon"><h2>Tab icon</h2><div class="icon-row"><div class="preview icon-preview"><img src="/assets/favicon.svg" alt="HN Group tab icon" width="64" height="64"></div>' +
    '<p class="muted">The browser tab icon used across HN Group websites. Use it for new HN Group sites and tools.</p><p class="dls"><a class="dl" href="/assets/favicon.svg" download="hn-group-tab-icon.svg">SVG</a></p></div></section>';
  return layout({ title: 'Brand centre', user, body });
}

function layout(o) {
  const user = o.user;
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#252629"><meta name="robots" content="noindex, nofollow"><title>' + esc(o.title) + ' · HN Group</title>' +
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>' +
    '<link rel="stylesheet" href="/assets/branding.css?v=20261125-preview-repair"><script src="/assets/hn-theme.js?v=20261109-midnight"></script><script src="/assets/branding.js?v=20261125-library" defer></script></head><body>' +
    '<div class="stripe" aria-hidden="true">' + STRIPE.map(([id, w]) => '<i class="c-' + id + ' f' + w + '"></i>').join('') + '</div>' +
    '<header class="top"><a class="brand" href="/"><img class="on-light" src="/assets/brand/svg/hn-group-wordmark.svg" alt="HN Group" width="92" height="32"><img class="on-dark" src="/assets/brand/svg/hn-group-wordmark-white.svg" alt="" width="92" height="32"><span class="brand-name">Brand centre</span></a>' +
    (user ? '<div class="user"><span>' + esc(user.name) + '</span><form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="' + esc(user.csrf) + '"><button type="submit" class="link">Sign out</button></form></div>' : '') +
    '<a class="brand-home-link" href="https://hngroup.org.uk">Explore HN Group</a></header><main id="content">' + o.body + '</main>' +
    '<footer class="foot"><div class="footer-brand"><img class="on-light" src="/assets/brand/svg/hn-group-wordmark.svg" alt="" height="32" loading="lazy"><img class="on-dark" src="/assets/brand/svg/hn-group-wordmark-white.svg" alt="" height="32" loading="lazy"></div><p>Approved HN Group brand assets. Please follow the usage guidelines above. © ' + new Date().getFullYear() + ' HN Group Limited.</p></footer>' +
    '<div class="toast" role="status" aria-live="polite" hidden></div></body></html>';
}

function messagePage(res, status, title, text, cookies, action) {
  send(res, status, layout({ title, body: '<section class="hero message"><p class="eyebrow">HN Group · Brand centre</p><h1>' + esc(title) + '</h1><p class="lede">' + esc(text) + '</p>' +
    '<p><a class="button" href="' + esc(action ? action[1] : '/') + '">' + esc(action ? action[0] : 'Try again') + '</a></p></section>' }), cookies ? { 'Set-Cookie': cookies } : {});
}

function send(res, status, html, headers) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) });
  res.end(html);
}

function serveFile(res, route, isPublic) {
  const file = path.normalize(path.join(PUBLIC, route));
  if (!file.startsWith(path.join(PUBLIC, 'assets') + path.sep) && route !== '/robots.txt') return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size,
    // Approved public downloads may be cached; the catalogue always revalidates.
    'Cache-Control': isPublic ? 'public, max-age=3600' : 'private, no-store',
  });
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self' " + (process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk') + "; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = decodeURIComponent(url.pathname);
    if(route==='/api/discord-server-branding'&&['GET','HEAD'].includes(req.method)){
      const crypto=require('node:crypto');
      const items=DISCORD_SERVERS.map(([key,name])=>({key,name,file:'discord-server-'+key+'.png'})).concat([{key:'appeals',name:'HN Appeals',file:'hn-appeals-app-icon.png'}]);
      const assets=items.map(x=>({...x,url:'https://branding.hngroup.org.uk/assets/brand/png/'+x.file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(PUBLIC,'assets/brand/png',x.file))).digest('hex')}));
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-cache'});return res.end(req.method==='HEAD'?'':JSON.stringify({assets}));
    }
    if (route === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end('{"ok":true}'); }
    if (!['GET', 'HEAD'].includes(req.method)) return messagePage(res, 405, 'Not allowed', 'That action isn’t available here.');
    if (route === '/auth/login' || route === '/auth/callback' || route === '/signed-out') { res.writeHead(302,{Location:'/', 'Cache-Control':'no-store'}); return res.end(); }
    if (/hn-group-management/i.test(route)) return messagePage(res,404,'Not found','That brand file is no longer available.');
    if (route === '/') return send(res, 200, homePage(null));
    if (route === '/assets/brand/OFL-LICENSE.txt') return serveFile(res, '/assets/fonts/OFL-LICENSE.txt', true) || messagePage(res, 404, 'Not found', 'That file isn’t here.');
    if ((PUBLIC_FILES.has(route) || route.startsWith('/assets/')) && serveFile(res, route, true)) return;
    return messagePage(res, 404, 'Not found', 'That page isn’t part of the brand centre.', null, ['Go to the brand centre', '/']);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) messagePage(res, err.status || 500, 'Something went wrong', err.status ? err.message : 'The brand centre couldn’t complete that request. Please try again.');
    else res.destroy();
  }
});

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 4800;
  server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('HN Group brand centre on ' + PORT));
}
module.exports = { server };
