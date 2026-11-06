/* HN Group themes (the user's request, 6 November 2026: "accross every single HN website there will now be only 2
   themes: the Light theme from HN mail or Lavender Dusk from HN staff Portal. the theme will be synced via auth accounts
   once signed in and default theme will be the light theme. and it will be controlled through appearance in the Staff
   Portal").

   The choice is kept on the sign-in account and shared with every *.hngroup.org.uk site through the `hn_theme` cookie
   (light | dusk), which HN Group Auth sets at every sign-in and the staff portal sets when it's changed. No cookie means
   Light. This script runs in each page's <head> straight after its stylesheets, before anything is drawn:
   - each site's own dark-mode styles (@media (prefers-color-scheme: dark)) are switched on for Lavender Dusk and off for
     Light, whatever the computer's setting, so every site keeps the dark version designed for it;
   - the two palettes' exact colours are set on the colour names the HN sites use (a constructed stylesheet, which the
     sites' security policies allow);
   - logos made for light or dark backgrounds (.on-light / .on-dark) follow the theme.
   Identical copies live in every site (brand/web/theme-copies.json, checked by brand/web/test.cjs). */
(function () {
  'use strict';
  var root = document.documentElement;
  var LIGHT = { bg: '#faf8fd', tint: '#f3eefa', surface: '#ffffff', raised: '#efe8f9', line: '#e8e0f2', line2: '#d9cdea', ink: '#1d1630', muted: '#66597c',
    accent: '#6731ad', accentHover: '#5514b4', accentSoft: '#efe8f9', onAccent: '#ffffff', danger: '#b4234f', dangerSoft: 'rgba(180, 35, 79, 0.1)', warn: '#8a6d00', warnSoft: 'rgba(227, 196, 60, 0.18)',
    good: '#2f7d4f', goodSoft: 'rgba(95, 174, 123, 0.15)', shadow: '0 1px 2px rgba(52, 28, 92, 0.06), 0 10px 28px -14px rgba(52, 28, 92, 0.25)', scheme: 'light' };
  var DUSK = { bg: '#17121f', tint: '#1a1424', surface: '#201a2b', raised: '#281f35', line: '#33293f', line2: '#43374f', ink: '#efe9fb', muted: '#a99cbf',
    accent: '#b79cf2', accentHover: '#a586ec', accentSoft: 'rgba(183, 156, 242, 0.15)', onAccent: '#1d1530', danger: '#ff94bd', dangerSoft: 'rgba(194, 48, 107, 0.16)', warn: '#e6e88f', warnSoft: 'rgba(227, 230, 91, 0.1)',
    good: '#8fd6a8', goodSoft: 'rgba(95, 174, 123, 0.15)', shadow: '0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 28px -14px rgba(0, 0, 0, 0.6)', scheme: 'dark' };
  function vars(p) {
    return [
      'color-scheme:' + p.scheme,
      '--bg:' + p.bg, '--page:' + p.bg, '--tint:' + p.tint, '--soft:' + p.tint, '--surface-soft:' + p.tint, '--sidebar:' + p.tint,
      '--surface:' + p.surface, '--panel:' + p.surface, '--surface-2:' + p.raised, '--surface2:' + p.raised, '--input-bg:' + p.surface,
      '--text:' + p.ink, '--ink:' + p.ink, '--muted:' + p.muted, '--text-muted:' + p.muted,
      '--border:' + p.line, '--line:' + p.line, '--border-strong:' + p.line2,
      '--accent:' + p.accent, '--accent-hover:' + p.accentHover, '--accent-soft:' + p.accentSoft, '--on-accent:' + p.onAccent,
      '--button:' + p.accent, '--on-button:' + p.onAccent, '--link:' + p.accent,
      '--danger:' + p.danger, '--error:' + p.danger, '--bad:' + p.danger, '--danger-soft:' + p.dangerSoft, '--bad-soft:' + p.dangerSoft,
      '--warn:' + p.warn, '--warn-soft:' + p.warnSoft, '--success:' + p.good, '--good:' + p.good, '--success-soft:' + p.goodSoft, '--good-soft:' + p.goodSoft,
      '--shadow:' + p.shadow
    ].join(';');
  }
  var CSS = 'html[data-hn-theme="light"]{' + vars(LIGHT) + '}html[data-hn-theme="dusk"]{' + vars(DUSK) + '}' +
    'html[data-hn-theme="light"] body,html[data-hn-theme="dusk"] body{background-color:var(--bg);color:var(--text)}' +
    'html[data-hn-theme="light"] .on-dark{display:none!important}html[data-hn-theme="dusk"] .on-light{display:none!important}' +
    'html[data-hn-theme="dusk"] img.on-dark{display:inline-block!important}html[data-hn-theme="light"] img.on-light{display:inline-block!important}';

  var originals = typeof WeakMap === 'function' ? new WeakMap() : null;
  var DARK = /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/gi, LIGHTQ = /\(\s*prefers-color-scheme\s*:\s*light\s*\)/gi;
  var YES = '(min-width: 0px)', NO = '(max-width: -1px)';
  function rewrite(text, theme) { return text.replace(DARK, theme === 'dusk' ? YES : NO).replace(LIGHTQ, theme === 'dusk' ? NO : YES); }
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
  function read() { var m = /(?:^|;\s*)hn_theme=(light|dusk)(?:;|$)/.exec(document.cookie || ''); return m ? m[1] : 'light'; }
  var current = null;
  function apply(theme) {
    theme = theme === 'dusk' ? 'dusk' : 'light';
    current = theme;
    root.setAttribute('data-hn-theme', theme);
    root.style.colorScheme = theme === 'dusk' ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', theme === 'dusk' ? '#17121f' : '#faf8fd');
    addPalette();
    sheets(theme);
    try { document.dispatchEvent(new CustomEvent('hn-theme', { detail: { theme: theme } })); } catch (e) {}
  }
  apply(read());
  // Stylesheets that arrive later (and the page's own scripts) are brought in line too.
  document.addEventListener('DOMContentLoaded', function () { sheets(current); });
  window.addEventListener('load', function () { sheets(current); });
  // A change made in another tab or site (the staff portal's Appearance) shows when you come back to this one.
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { var t = read(); if (t !== current) apply(t); } });
  window.hnTheme = { get: function () { return current; }, apply: apply, refresh: function () { sheets(current); } };
})();
