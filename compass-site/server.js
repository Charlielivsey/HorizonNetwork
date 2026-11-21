'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, 'public');
const DOWNLOADS_ORIGIN = (process.env.DOWNLOADS_ORIGIN || 'https://downloads.hngroup.org.uk').replace(/\/$/, '');
const RELEASES_URL = process.env.RELEASES_URL || DOWNLOADS_ORIGIN + '/api/releases';
const CACHE_MS = 5 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.json': 'application/json; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

const PLATFORMS = [
  { id: 'mac-arm64', os: 'mac', name: 'macOS', arch: 'Apple silicon (M1 or newer)', ext: 'DMG installer', note: 'Intel Macs are not supported.' },
  { id: 'windows-x64', os: 'win', name: 'Windows', arch: '64-bit (Windows 10 & 11)', ext: 'EXE installer', note: 'Installs per user and updates in place.' },
  { id: 'linux-x64', os: 'linux', name: 'Linux', arch: '64-bit AppImage (Bazzite, Fedora & more)', ext: 'AppImage', note: 'Make executable or install via HN Group App Manager.' }
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

function formatVersion(version) {
  if (!version || typeof version !== 'string') return null;
  const [semver, build] = version.split('-');
  return build ? `v${semver} (build ${build})` : `v${semver}`;
}

function safeDownloadHref(asset, downloadsOrigin) {
  const raw = asset && typeof asset.url === 'string' ? asset.url : '';
  if (raw.startsWith('/download/')) return downloadsOrigin + raw;
  if (raw.startsWith(downloadsOrigin + '/download/')) return raw;
  return null;
}

function renderDownloads(release, downloadsOrigin) {
  const versionLabel = release ? formatVersion(release.version) : null;
  const metaHtml = versionLabel
    ? `<span class="release-pill">Latest release: <strong>${esc(versionLabel)}</strong></span>`
    : `<span class="release-pill release-pill-muted">Latest installers available on HN Group Downloads</span>`;

  const cardsHtml = PLATFORMS.map(p => {
    const asset = release?.assets?.[p.id] || null;
    const href = safeDownloadHref(asset, downloadsOrigin);
    const size = asset ? formatBytes(asset.size) : '';
    const detail = [p.ext, size].filter(Boolean).join(' · ');
    const action = href
      ? `<a class="btn btn-primary download-btn" href="${esc(href)}" data-os="${p.os}">Download for ${esc(p.name)} <span aria-hidden="true">↓</span></a>`
      : `<a class="btn btn-ghost download-btn" href="${esc(downloadsOrigin)}/" data-os="${p.os}">Get on HN Downloads <span aria-hidden="true">↗</span></a>`;
    return `<article class="platform-card" data-platform="${p.os}">
      <div class="platform-head">
        <h3>${esc(p.name)}</h3>
        <span class="platform-badge">${esc(p.ext)}</span>
      </div>
      <p class="platform-arch">${esc(p.arch)}</p>
      <p class="platform-note small muted">${esc(p.note)}</p>
      ${detail ? `<p class="platform-meta small muted">${esc(detail)}</p>` : ''}
      <div class="platform-action">${action}</div>
    </article>`;
  }).join('');

  return { metaHtml, cardsHtml };
}

function createServer({ fetcher = fetch, releasesUrl = RELEASES_URL, downloadsOrigin = DOWNLOADS_ORIGIN } = {}) {
  const template = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  let cachedRelease = null;
  let cachedAt = 0;
  let pending = null;

  async function getRelease() {
    if (Date.now() - cachedAt < CACHE_MS) return cachedRelease;
    if (pending) return pending;
    pending = (async () => {
      try {
        const res = await fetcher(releasesUrl, {
          headers: { Accept: 'application/json', 'User-Agent': 'HN-Group-Compass-Site' },
          signal: AbortSignal.timeout(5000)
        });
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.release && typeof data.release === 'object') {
            cachedRelease = data.release;
          }
        }
      } catch {
        // Keep last known release (or null) on network failure.
      } finally {
        cachedAt = Date.now();
        pending = null;
      }
      return cachedRelease;
    })();
    return pending;
  }

  return http.createServer(async (req, res) => {
    function send(status, body, type = 'text/plain; charset=utf-8') {
      res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return send(405, 'Method not allowed');
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send(400, 'Bad request');
    }

    if (pathname === '/healthz') {
      return send(200, JSON.stringify({ ok: true, service: 'hn-compass', release: cachedRelease?.version || null }), 'application/json; charset=utf-8');
    }

    if (pathname === '/' || pathname === '/index.html') {
      const release = await getRelease();
      const { metaHtml, cardsHtml } = renderDownloads(release, downloadsOrigin);
      const html = template
        .replace('<!--RELEASE_META-->', metaHtml)
        .replace('<!--DOWNLOAD_CARDS-->', cardsHtml);
      return send(200, html, MIME['.html']);
    }

    const file = path.resolve(PUBLIC, '.' + pathname);
    if (!file.startsWith(PUBLIC + path.sep) || pathname.includes('\0')) {
      return send(404, 'Not found');
    }
    fs.readFile(file, (error, content) => {
      if (error) return send(404, 'Not found');
      send(200, content, MIME[path.extname(file)] || 'application/octet-stream');
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(Number(process.env.PORT || 5690), process.env.HOST || '127.0.0.1');
}

module.exports = { createServer, renderDownloads, formatVersion, formatBytes };
