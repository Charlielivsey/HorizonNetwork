'use strict';
// Generates the independent service website directories and their registrations:
//   node service-suite/generate.cjs
// Writes <id>-site/ (config, PM2, installer, nginx, assets), the HN Group Auth client entries, the
// central website-control catalog entries and service-suite/catalog.json (used by Links and tests).
const fs = require('node:fs');
const path = require('node:path');
const { sites } = require('./sites.cjs');
const ROOT = path.resolve(__dirname, '..');
const IP = '217.154.34.205';

const ports = [];
for (let p = 4800; ports.length < 40; p += 10) if (p !== 5000) ports.push(p);
if (sites.length > ports.length) throw new Error('Not enough ports.');

const brandRoot = path.join(ROOT, 'brand/logos');
const LOGO_LABELS = {
  'hn-group-wordmark': ['HN Group', 'Wordmark'], 'horizon-network-wordmark': ['Horizon Network', 'Wordmark'], 'horizon-network-wordmark-stacked': ['Horizon Network', 'Stacked wordmark'],
  'horizon-advertising-logo': ['Horizon Advertising', 'Logo'], 'horizon-advertising-roundel': ['Horizon Advertising', 'Roundel'], 'horizon-advertising-app-icon': ['Horizon Advertising', 'App icon'],
  'horizon-development-logo': ['Horizon Development', 'Logo'], 'horizon-development-roundel': ['Horizon Development', 'Roundel'], 'horizon-development-app-icon': ['Horizon Development', 'App icon'],
  'horizon-media-group-logo': ['Horizon Media Group', 'Logo'], 'horizon-media-group-roundel': ['Horizon Media Group', 'Roundel'], 'horizon-media-group-app-icon': ['Horizon Media Group', 'App icon'],
  'horizon-holding-co-logo': ['Horizon Holding Co', 'Logo'], 'horizon-holding-co-roundel': ['Horizon Holding Co', 'Roundel'], 'horizon-holding-co-app-icon': ['Horizon Holding Co', 'App icon']
};
function brandkit() {
  const logos = [];
  for (const [base, [company, kind]] of Object.entries(LOGO_LABELS)) {
    logos.push({ file: base + '.svg', label: kind, company, dark: false });
    if (fs.existsSync(path.join(brandRoot, base + '-white.svg'))) logos.push({ file: base + '-white.svg', label: kind + ' (white, for dark backgrounds)', company, dark: true });
  }
  return {
    title: 'Logos & assets', intro: 'Approved original logos for every HN Group company, the group colour palette and typography. Download the SVG files and use them as supplied.',
    logos,
    colours: [['Pink', '#E97DE8'], ['Purple (core accent)', '#5514B4'], ['Yellow', '#E3E65B'], ['Teal', '#3E9BA3'], ['Plum', '#7A1F6C'], ['Raspberry', '#C2306B'], ['Green', '#5FAE7B'], ['Navy', '#1C2135'], ['Horizon Advertising lavender', '#7B52C4']].map(([name, hex]) => ({ name, hex })),
    typography: 'HN Group websites use Plus Jakarta Sans. Purple is the group’s core accent and is used for actions such as buttons and links. The eight-colour stripe appears under the HN Group and Horizon Network wordmarks and across the top of group websites.',
    rules: [
      'Use the regular logo on light backgrounds and the white version on dark backgrounds.',
      'Keep the original SVG intact; control its size with CSS or your design tool.',
      'Preserve the aspect ratio. Do not crop, stretch, recolour or redraw a logo, or replace its lettering.',
      'Choose the logo of the company concerned. Horizon Holding Co has its own logo and is not a substitute for HN Group.',
      'Leave clear space around each logo so it is not crowded by other elements.'
    ]
  };
}

const ALL_COMPANY_SITES = [];
function aliasFor(domain) {
  if (domain.endsWith('.horizon-network.co.uk')) return domain.replace(/\.horizon-network\.co\.uk$/, '.horizonetwork.com');
  if (domain.endsWith('.horizonetwork.com')) return domain.replace(/\.horizonetwork\.com$/, '.horizon-network.co.uk');
  return null;
}
function nginx(id, port, domain, alias) {
  const acme = `    location ^~ /.well-known/acme-challenge/ { auth_request off; root /var/www/hn-${id}-acme; default_type text/plain; }\n`;
  const gate = `    include /etc/nginx/hn-control/enabled/${id}-*.conf; # HN website control\n`;
  const proxy = `    client_max_body_size 30m;\n    location / {\n        proxy_pass http://127.0.0.1:${port};\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_connect_timeout 5s;\n        proxy_read_timeout 60s;\n        proxy_send_timeout 60s;\n    }\n`;
  const tls = `    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n    add_header Strict-Transport-Security "max-age=15552000" always;\n`;
  const http = `server {\n    listen 80;\n    listen [::]:80;\n    server_name ${domain};\n${gate}\n${acme}${proxy}}\n` +
    (alias ? `# Alias: redirects to the primary hostname.\nserver {\n    listen 80;\n    listen [::]:80;\n    server_name ${alias};\n${gate}\n${acme}    location / { return 301 https://${domain}$request_uri; }\n}\n` : '');
  const https = `server {\n    listen 443 ssl;\n    listen [::]:443 ssl;\n    server_name ${domain};\n${gate}\n${tls}${acme}${proxy}}\n`;
  const aliasHttps = alias ? `server {\n    listen 443 ssl;\n    listen [::]:443 ssl;\n    server_name ${alias};\n${gate}\n${tls}${acme}    location / { return 301 https://${domain}$request_uri; }\n}\n` : '';
  return { http, https, aliasHttps };
}

function copy(src, dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }

const generated = [];
sites.forEach((site, index) => {
  const id = site.id;
  if (!/^[a-z]{2,20}$/.test(id)) throw new Error('Bad id ' + id);
  const port = ports[index];
  const company = site.company;
  const domain = site.domain || `${id}.hngroup.org.uk`;
  const alias = company === 'network' ? aliasFor(domain) : null;
  const logo = site.logo || (company === 'network' ? 'horizon-network-wordmark' : 'hn-group-wordmark');
  const brand = site.brand || (company === 'network' ? 'Horizon Network' : 'HN Group');
  const modules = site.modules.map(m => {
    const out = { ...m };
    if (out.type === 'items' && out.create === 'public' && out.view === 'manager' && !out.empty) out.empty = 'Submissions are private to the person who sent them and our team. Use the button above to send one, or check an existing one with your private reference.';
    if (out.type === 'health') out.targets = null; // filled below once all ports are known
    return out;
  });
  const config = {
    engine: 'service-suite', id, domain, aliases: alias ? [alias] : [], port, company, name: site.name, brand, logo, staffOnly: !!site.staffOnly, staffSignIn: site.staffSignIn || 'admin', staffLabel: site.staffLabel || brand,
    hero: site.hero, sections: site.sections || [], notices: site.notices || [], related: site.related || [], providers: site.providers || {}, accounts: site.accounts || null,
    securityTxt: site.securityTxt || null, brandkit: site.brandkit ? brandkit() : null, tools: site.tools ? { title: 'Tools', intro: 'Everything runs in your browser. Nothing you enter is sent to Horizon Network.' } : null,
    privacy: company === 'network' ? 'https://horizon-network.co.uk/privacy' : 'https://hngroup.org.uk/privacy',
    footer: company === 'network'
      ? { text: site.footerText || 'Horizon Network brings together digital infrastructure, advertising and software. A subsidiary of HN Group Limited.', copyright: 'Horizon Network · A subsidiary of HN Group Limited', links: [{ label: 'horizon-network.co.uk', url: 'https://horizon-network.co.uk' }, { label: 'Network status', url: 'https://status.horizon-network.co.uk' }, { label: 'All HN Group links', url: 'https://links.hngroup.org.uk' }] }
      : { text: 'HN Group brings together Horizon Network, Horizon Media Group and Horizon Holding Co.', copyright: 'HN Group Limited', links: [{ label: 'hngroup.org.uk', url: 'https://hngroup.org.uk' }, { label: 'Support', url: 'https://support.hngroup.org.uk' }, { label: 'Service status', url: 'https://status.hngroup.org.uk' }, { label: 'All HN Group links', url: 'https://links.hngroup.org.uk' }] },
    storageLimitMb: 2048,
    modules,
    seedAuthor: brand
  };
  generated.push({ site, config });
  ALL_COMPANY_SITES.push({ id, name: site.name, port, domain, company: company === 'network' ? 'Horizon Network' : 'HN Group' });
});

// Existing websites, from the fixed website-control catalog, for the private health dashboard.
const EXISTING = [['website', 'HN Group website', 3500, 'hngroup.org.uk'], ['network', 'Horizon Network website', 3600, 'horizon-network.co.uk'], ['staff', 'Staff portal', 3200, 'staff.hngroup.org.uk'], ['status', 'Service status', 3300, 'status.hngroup.org.uk'], ['links', 'HN Group Links', 3700, 'links.hngroup.org.uk'], ['wiki', 'HN Group Wiki', 3800, 'wiki.hngroup.org.uk'],
  ['media', 'Horizon Media Group', 3900, 'media.hngroup.org.uk'], ['holding', 'Horizon Holding Co', 4000, 'holding.hngroup.org.uk'], ['development', 'Horizon Development', 4100, 'development.hngroup.org.uk'], ['support', 'Support', 4200, 'support.hngroup.org.uk'], ['clients', 'Client portal', 4300, 'clients.hngroup.org.uk'], ['careers', 'Careers', 4400, 'careers.hngroup.org.uk'], ['docs', 'Documentation', 4500, 'docs.hngroup.org.uk'], ['news', 'News', 4600, 'news.hngroup.org.uk']]
  .map(([id, name, port, domain]) => ({ id, name, port, domain, company: ['network'].includes(id) ? 'Horizon Network' : 'HN Group' }));
const targets = [...EXISTING, ...ALL_COMPANY_SITES];

const catalog = [];
for (const { site, config } of generated) {
  for (const m of config.modules) if (m.type === 'health') m.targets = targets;
  const dir = path.join(ROOT, config.id + '-site');
  fs.mkdirSync(path.join(dir, 'public/assets/brand'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'ecosystem.config.cjs'), `module.exports={apps:[{name:'hn-${config.id}',script:'/opt/hn-${config.id}/server.js',cwd:'/opt/hn-${config.id}',instances:1,exec_mode:'fork',autorestart:true,max_memory_restart:'160M',node_args:'--max-old-space-size=64 --max-semi-space-size=2',env:{NODE_ENV:'production',PORT:${config.port},DATA_DIR:'/var/lib/hn-${config.id}'}}]};\n`);
  fs.writeFileSync(path.join(dir, 'install.sh'), `#!/usr/bin/env bash\n# Installs or updates ${config.domain} only (PM2 hn-${config.id}, port ${config.port}). Data in /var/lib/hn-${config.id} is preserved.\nset -euo pipefail\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nbash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "\${1:-}"\n`, { mode: 0o755 });
  const n = nginx(config.id, config.port, config.domain, config.aliases[0]);
  fs.writeFileSync(path.join(dir, 'nginx-http.conf'), n.http);
  fs.writeFileSync(path.join(dir, 'nginx-https.conf'), n.https);
  if (n.aliasHttps) fs.writeFileSync(path.join(dir, 'nginx-alias-https.conf'), n.aliasHttps); else fs.rmSync(path.join(dir, 'nginx-alias-https.conf'), { force: true });
  // Each website gets its own copies of the original approved assets.
  const logos = config.brandkit ? config.brandkit.logos.map(l => l.file) : [config.logo + '.svg', config.logo + '-white.svg'];
  for (const file of new Set(logos)) copy(path.join(brandRoot, file), path.join(dir, 'public/assets/brand', file));
  copy(path.join(ROOT, config.company === 'network' ? 'horizon-network-site/public/assets/favicon.svg' : 'hngroup-site/public/assets/favicon.svg'), path.join(dir, 'public/assets/favicon.svg'));
  copy(path.join(ROOT, 'media-site/public/assets/fonts/plus-jakarta-sans.woff2'), path.join(dir, 'public/assets/fonts/plus-jakarta-sans.woff2'));
  copy(path.join(ROOT, 'media-site/public/assets/fonts/OFL-LICENSE.txt'), path.join(dir, 'public/assets/fonts/OFL-LICENSE.txt'));
  const bridge = config.modules.some(m => m.type === 'bridge' || m.completion?.portal || m.portalBill);
  catalog.push({ id: config.id, name: config.name, title: site.title, process: 'hn-' + config.id, port: config.port, domain: config.domain, aliases: config.aliases, company: config.company, logo: config.logo, staffOnly: config.staffOnly, staffSignIn: config.staffSignIn, bridge, links: site.links, ip: IP });
}
fs.writeFileSync(path.join(__dirname, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');

// ---- marked blocks in other applications ----
function replaceBlock(file, begin, end, content, anchor) {
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes(begin)) {
    if (!text.includes(anchor)) throw new Error('Anchor not found in ' + file);
    text = text.replace(anchor, begin + '\n' + end + '\n' + anchor);
  }
  const start = text.indexOf(begin), stop = text.indexOf(end);
  text = text.slice(0, start + begin.length) + '\n' + content + text.slice(stop);
  fs.writeFileSync(file, text);
}
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
// Auth: fixed registered callbacks. Staff tools admit any staff (the website then applies its own
// permissions); management-only websites admit the system owner and Super Admin members.
replaceBlock(path.join(ROOT, 'auth-site/server.js'), '  // BEGIN SERVICE SITES (generated by service-suite/generate.cjs)', '  // END SERVICE SITES',
  catalog.map(c => `  ${c.id}: { name: ${q(c.name)}, callback: 'https://${c.domain}/auth/callback', allowed: ${c.staffSignIn === 'any' ? '() => true' : 'user => user.statusAdminAllowed'}, denied: ${q(c.staffSignIn === 'any' ? 'This account cannot use ' + c.name + '.' : 'Only the system owner and Super Admin members can manage ' + c.name + '.')}${c.bridge ? ', bridge: true' : ''} },`).join('\n') + '\n',
  '};\nconst HEX = /^[a-f0-9]{64}$/;');
replaceBlock(path.join(ROOT, 'auth-site/public/app.js'), '  // BEGIN SERVICE SITES (generated by service-suite/generate.cjs)', '  // END SERVICE SITES',
  catalog.map(c => `  ${c.id}: { name: ${q(c.name)}, short: ${q(c.name)}, allowed: ${c.staffSignIn === 'any' ? '() => true' : 'user => user.statusAdminAllowed'}, granted: ${q(c.staffSignIn === 'any' ? 'You can use ' + c.name + '.' : 'You can manage this website.')}, restricted: ${q(c.staffSignIn === 'any' ? '' : 'Only the system owner and Super Admin members can manage this website.')} },`).join('\n') + '\n',
  '};\nconst app = Object.prototype');
// Central website control: fixed allowlist of process names, ports and hostnames.
replaceBlock(path.join(ROOT, 'admin-site/lib/catalog.js'), '// BEGIN SERVICE SITES (generated by service-suite/generate.cjs)', '// END SERVICE SITES',
  catalog.map(c => `,[${q(c.id)},${q(c.name)},${q(c.process)},${c.port},[${[c.domain, ...c.aliases].map(q).join(',')}]]`).join('\n') + '\n',
  '].map(([id,name,process,port,hosts])=>({id,name,process,port,hosts}));');
delete require.cache[require.resolve(path.join(ROOT, 'admin-site/lib/catalog.js'))];
const { sites: controlled } = require(path.join(ROOT, 'admin-site/lib/catalog.js'));
fs.writeFileSync(path.join(ROOT, 'admin-site/catalog.json'), JSON.stringify(controlled, null, 2) + '\n');
// HN Group Links: one card per service website. The coordinated installer removes any card whose
// website is not running, so Links never presents an unavailable website as operational.
const LINK_CATEGORY = { staff: ['portals', 'STAFF SERVICE'], support: ['help', 'SUPPORT'], resources: ['help', 'RESOURCES'], company: ['group', 'GROUP SERVICE'], community: ['group', 'COMMUNITY'], network: ['network', 'HORIZON NETWORK'] };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cards = catalog.map((c, i) => {
  const [cat, label] = LINK_CATEGORY[c.links.category] || ['help', 'SERVICE'];
  const host = c.domain;
  const extra = c.aliases.length ? ` Also at ${c.aliases[0]}.` : '';
  return `<a class="link-card${i % 3 ? ' tone-' + (i % 3) : ''}" data-category="${cat}" data-service="${c.id}" href="https://${host}/"><div class="card-top"><div class="card-logo"><img class="on-light" src="/assets/brand/${c.logo}.svg" alt=""><img class="on-dark" src="/assets/brand/${c.logo}-white.svg" alt=""></div><span class="card-arrow" aria-hidden="true">↗</span></div><p class="card-label">${label}${c.staffOnly ? ' · SIGN-IN' : ''}</p><h3>${esc(c.name)}</h3><p class="description">${esc(c.links.description + extra)}</p><div class="card-foot"><span>${esc(host)}</span><span aria-hidden="true">→</span></div></a>`;
}).join('\n');
const linksFile = path.join(ROOT, 'links-site/public/index.html');
let links = fs.readFileSync(linksFile, 'utf8');
const BEGIN = '<!-- BEGIN SERVICE SITES (generated by service-suite/generate.cjs) -->', END = '<!-- END SERVICE SITES -->';
if (!links.includes(BEGIN)) links = links.replace('</div><div class="empty" id="empty"', BEGIN + '\n' + END + '\n</div><div class="empty" id="empty"');
links = links.slice(0, links.indexOf(BEGIN) + BEGIN.length) + '\n' + cards + '\n' + links.slice(links.indexOf(END));
if (!links.includes('data-filter="group"')) links = links.replace('<button type="button" data-filter="help" aria-pressed="false">Services &amp; resources</button>', '<button type="button" data-filter="group" aria-pressed="false">Group services</button><button type="button" data-filter="network" aria-pressed="false">Horizon Network</button><button type="button" data-filter="help" aria-pressed="false">Services &amp; resources</button>');
fs.writeFileSync(linksFile, links);

console.log(`Generated ${catalog.length} service websites (ports ${catalog[0].port}–${catalog.at(-1).port}); website control now manages ${controlled.length} websites.`);
