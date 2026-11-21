/* Shared HN Group themes: Midnight Lavender is the default from 9 November 2026.
   Explicit Light and Lavender Dusk choices remain available. Account preferences sync through
   the hn_theme cookie; identical copies are listed in brand/web/theme-copies.json. */
(function () {
  'use strict';
  var root = document.documentElement;
  var LIGHT = { bg: '#faf8fd', tint: '#f3eefa', surface: '#ffffff', raised: '#efe8f9', line: '#e8e0f2', line2: '#d9cdea', ink: '#1d1630', muted: '#66597c',
    accent: '#6731ad', accentHover: '#5514b4', accentSoft: '#efe8f9', onAccent: '#ffffff', danger: '#b4234f', dangerSoft: 'rgba(180, 35, 79, 0.1)', warn: '#8a6d00', warnSoft: 'rgba(227, 196, 60, 0.18)',
    good: '#2f7d4f', goodSoft: 'rgba(95, 174, 123, 0.15)', shadow: '0 1px 2px rgba(52, 28, 92, 0.06), 0 10px 28px -14px rgba(52, 28, 92, 0.25)', scheme: 'light' };
  var DUSK = { bg: '#17121f', tint: '#1a1424', surface: '#201a2b', raised: '#281f35', line: '#33293f', line2: '#43374f', ink: '#efe9fb', muted: '#a99cbf',
    accent: '#b79cf2', accentHover: '#a586ec', accentSoft: 'rgba(183, 156, 242, 0.15)', onAccent: '#1d1530', danger: '#ff94bd', dangerSoft: 'rgba(194, 48, 107, 0.16)', warn: '#e6e88f', warnSoft: 'rgba(227, 230, 91, 0.1)',
    good: '#8fd6a8', goodSoft: 'rgba(95, 174, 123, 0.15)', shadow: '0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 28px -14px rgba(0, 0, 0, 0.6)', scheme: 'dark' };
  var MIDNIGHT = Object.assign({}, DUSK, { bg: '#100d1a', tint: '#171222', surface: '#211a2e', raised: '#2b233c', line: '#372d48', line2: '#49395d', ink: '#f4f0fd', muted: '#b3a6c5', accent: '#c3a2ff', accentHover: '#b48ced', accentSoft: 'rgba(195, 162, 255, .15)', onAccent: '#1b122b' });
  function vars(p) {
    return [
      'color-scheme:' + p.scheme,
      '--brand-deep:linear-gradient(120deg,' + p.bg + ',' + p.surface + ',' + p.raised + ')',
      '--ml-bg:' + p.bg, '--ml-side:' + p.tint, '--ml-surface:' + p.surface, '--ml-raised:' + p.raised, '--ml-hover:' + p.raised, '--ml-line:' + p.line, '--ml-line-2:' + p.line2, '--ml-ink:' + p.ink, '--ml-muted:' + p.muted, '--ml-accent:' + p.accent, '--ml-accent-2:' + p.accentHover, '--ml-on-accent:' + p.onAccent, '--ml-reader:' + p.bg,
      '--bg:' + p.bg, '--page:' + p.bg, '--tint:' + p.tint, '--soft:' + p.tint, '--surface-soft:' + p.tint, '--sidebar:' + p.tint,
      '--surface:' + p.surface, '--panel:' + p.surface, '--surface-2:' + p.raised, '--surface2:' + p.raised, '--input-bg:' + p.surface,
      '--text:' + p.ink, '--ink:' + p.ink, '--muted:' + p.muted, '--text-muted:' + p.muted,
      '--border:' + p.line, '--line:' + p.line, '--border-strong:' + p.line2,
      '--accent:' + p.accent, '--accent-hover:' + p.accentHover, '--accent-soft:' + p.accentSoft, '--on-accent:' + p.onAccent,
      '--primary:' + p.accent, '--primary-hover:' + p.accentHover, '--on-primary:' + p.onAccent, '--primary-tint:' + p.accentSoft, '--primary-soft-border:' + p.line2, '--focus-ring:' + p.accentSoft, '--row-hover:' + p.raised, '--border-hover:' + p.line2, '--inverse-bg:' + p.surface, '--inverse-text:' + p.ink,
      '--button:' + p.accent, '--on-button:' + p.onAccent, '--link:' + p.accent,
      '--danger:' + p.danger, '--error:' + p.danger, '--bad:' + p.danger, '--danger-soft:' + p.dangerSoft, '--bad-soft:' + p.dangerSoft,
      '--warn:' + p.warn, '--warn-soft:' + p.warnSoft, '--success:' + p.good, '--good:' + p.good, '--success-soft:' + p.goodSoft, '--good-soft:' + p.goodSoft,
      '--shadow:' + p.shadow
    ].join(';');
  }
  var CSS = 'html:root[data-hn-theme="light"]{' + vars(LIGHT) + '}html:root[data-hn-theme="dusk"]{' + vars(DUSK) + '}html:root[data-hn-theme="midnight"]{' + vars(MIDNIGHT) + '}' +
    'html:root[data-hn-theme="light"] body,html:root:is([data-hn-theme="dusk"],[data-hn-theme="midnight"]) body{background-color:var(--bg);color:var(--text)}' +
    'html:root[data-hn-theme="light"] .on-dark{display:none!important}html:root:is([data-hn-theme="dusk"],[data-hn-theme="midnight"]) .on-light{display:none!important}' +
    'html:root:is([data-hn-theme="dusk"],[data-hn-theme="midnight"]) img.on-dark{display:inline-block!important}html:root[data-hn-theme="light"] img.on-light{display:inline-block!important}' +
    // Light footers: page tint, muted text, dark links; buttons and the stripe keep their own colours.
    '.hn-light-footer{background:var(--tint)!important;background-image:none!important;color:var(--muted)!important;border-top-color:var(--line)!important}' +
    '.hn-light-footer a:not(.btn):not([class*="button"]){color:var(--ink)!important}.hn-light-footer a:not(.btn):not([class*="button"]):hover{color:var(--accent)!important}' +
    '.hn-light-footer strong,.hn-light-footer b,.hn-light-footer h2,.hn-light-footer h3,.hn-light-footer h4,.hn-light-footer .footer-company{color:var(--ink)!important}' +
    '.hn-light-footer p,.hn-light-footer small,.hn-light-footer .small,.hn-light-footer .muted,.hn-light-footer .footer-parent{color:var(--muted)!important}' +
    '.hn-light-footer [class*="legal"],.hn-light-footer hr{border-color:var(--line)!important}' +
    '.hn-light-footer img.hn-logo-inverted{filter:invert(1) hue-rotate(180deg)}';

  var originals = typeof WeakMap === 'function' ? new WeakMap() : null;
  var DARK = /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/gi, LIGHTQ = /\(\s*prefers-color-scheme\s*:\s*light\s*\)/gi;
  var YES = '(min-width: 0px)', NO = '(max-width: -1px)';
  function rewrite(text, theme) { return text.replace(DARK, theme !== 'light' ? YES : NO).replace(LIGHTQ, theme !== 'light' ? NO : YES); }
  function walk(rules, theme) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.media && r.cssRules) {
        var original = originals ? originals.get(r) : null;
        if (original == null && /prefers-color-scheme/i.test(r.media.mediaText)) { original = r.media.mediaText; if (originals) originals.set(r, original); }
        if (original != null) { var next = rewrite(original, theme); if (r.media.mediaText !== next) r.media.mediaText = next; }
      }
      if (r.cssRules) walk(r.cssRules, theme);
    }
  }
  function sheets(theme) {
    for (var i = 0; i < document.styleSheets.length; i++) {
      var s = document.styleSheets[i], rules;
      try { rules = s.cssRules; } catch (e) { continue; }
      if (rules) walk(rules, theme);
    }
  }
  var palette = null;
  function addPalette() {
    if (palette || !('adoptedStyleSheets' in document)) return;
    try { palette = new CSSStyleSheet(); palette.replaceSync(CSS); document.adoptedStyleSheets = document.adoptedStyleSheets.concat([palette]); } catch (e) { palette = null; }
  }
  // Footers drawn dark by a site's own styles (navy): found by their colour, so every site is covered.
  function dark(el) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(getComputedStyle(el).backgroundColor || '');
    if (!m || (m[4] !== undefined && +m[4] < 0.5)) return false;
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 < 0.3;
  }
  var WHITE = /-white(\.(?:svg|png|webp))(\?.*)?$/i;
  function logos(footer, light) {
    var imgs = footer.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i], dark0 = img.getAttribute('data-hn-dark-src');
      if (light) {
        if (dark0 || img.classList.contains('on-dark') || img.classList.contains('on-light')) continue;
        var src = img.getAttribute('src') || '';
        if (!WHITE.test(src)) continue;
        img.setAttribute('data-hn-dark-src', src);
        // The coloured version beside it; if a site doesn't have one, the white logo is shown darkened instead.
        img.onerror = function () { this.onerror = null; this.src = this.getAttribute('data-hn-dark-src'); this.classList.add('hn-logo-inverted'); };
        img.src = src.replace(WHITE, '$1$2');
      } else if (dark0) {
        img.onerror = null; img.classList.remove('hn-logo-inverted'); img.src = dark0; img.removeAttribute('data-hn-dark-src');
      }
    }
  }
  function footers(theme) {
    if (!document.body) return;
    var list = document.querySelectorAll('footer, .site-footer, .footer, [class*="-footer"]');
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.parentElement && f.parentElement.closest('.hn-light-footer')) continue;
      if (theme === 'light') {
        if (f.classList.contains('hn-light-footer') || !dark(f)) continue;
        f.classList.add('hn-light-footer'); logos(f, true);
      } else if (f.classList.contains('hn-light-footer')) {
        f.classList.remove('hn-light-footer'); logos(f, false);
      }
    }
  }
  function read() { var m = /(?:^|;\s*)hn_theme=(light|dusk|midnight)(?:;|$)/.exec(document.cookie || ''); return m ? m[1] : 'midnight'; }
  var current = null;
  function apply(theme) {
    theme = ['light', 'dusk', 'midnight'].includes(theme) ? theme : 'midnight';
    current = theme;
    root.setAttribute('data-hn-theme', theme);
    root.style.colorScheme = theme !== 'light' ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', theme === 'midnight' ? '#100d1a' : theme === 'dusk' ? '#17121f' : '#faf8fd');
    addPalette();
    sheets(theme);
    footers(theme);
    try { document.dispatchEvent(new CustomEvent('hn-theme', { detail: { theme: theme } })); } catch (e) {}
  }
  apply(read());
  // Stylesheets that arrive later (and the page's own scripts) are brought in line too.
  document.addEventListener('DOMContentLoaded', function () { sheets(current); footers(current); });
  window.addEventListener('load', function () { sheets(current); footers(current); });
  // A change made in another tab or site (the staff portal's Appearance) shows when you come back to this one.
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { var t = read(); if (t !== current) apply(t); } });
  window.hnTheme = { get: function () { return current; }, apply: apply, refresh: function () { sheets(current); footers(current); } };
})();
