'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { directory } = require('../homepage.cjs');
const { host } = require('../library.cjs');

const ENGINE_LABELS = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function greetingText(user, enabled) {
  if (!enabled) return 'Compass';
  const name = String(user?.firstName || user?.displayName || '').trim().split(/\s+/)[0];
  return name ? `Hello, ${name}.` : 'Welcome home.';
}

function renderNewTab({ uiDir, user, preferences, library }) {
  const recent = preferences.recentSites && preferences.saveHistory ? library.topSites(6) : [];
  const recentHtml = recent.length
    ? `<section class="recent" aria-labelledby="recent-title">
        <p class="eyebrow" id="recent-title">PICK UP WHERE YOU LEFT OFF</p>
        <div class="recent-grid">${recent.map((item, index) =>
          `<a href="${esc(item.url)}" style="--i:${index}"><b aria-hidden="true">${esc((item.title.trim()[0] || '•').toUpperCase())}</b><span>${esc(item.title)}</span><small>${esc(host(item.url))}</small></a>`
        ).join('')}</div>
      </section>`
    : '';

  return fs.readFileSync(path.join(uiDir, 'newtab.html'), 'utf8')
    .replace('<!--SHORTCUTS-->', directory())
    .replace('<!--GREETING-->', esc(greetingText(user, preferences.greeting)))
    .replace('<!--ROLE-->', esc(user?.jobTitle || 'Your HN Group workspace'))
    .replace('<!--ENGINE-->', esc(ENGINE_LABELS[preferences.searchEngine] || 'Google'))
    .replace('<!--RECENT-->', recentHtml)
    .replace('<body>', `<body data-theme="${preferences.theme}"${preferences.reduceMotion ? ' data-motion="reduced"' : ''}>`);
}

module.exports = { renderNewTab, greetingText };
