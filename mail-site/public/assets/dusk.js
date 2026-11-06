/* Lavender Dusk for email content (the user's requests, 6 November 2026: emails shouldn't sit in a white box, and "the
   coloured bars should sta the same colour"). Instead of turning the whole email round with a colour filter, which
   changes every colour, only the colourless parts change: white and grey backgrounds become dark, black and grey text
   and borders become light. Anything with a colour of its own (the signature's stripe and divider, coloured boxes,
   buttons) keeps exactly that colour; coloured text is only lightened if it would be too hard to read on the dark page.
   Pictures are never touched (HN Group's logos are swapped for their Lavender Dusk copies, *-email-logo-dusk.png).
   Used by the reading pane (inlined into each email's page by server.js) and by the composer (mail.js), which undoes
   it on a copy before saving or sending, so recipients get the email exactly as written. */
(function (global) {
  'use strict';
  var BG = [23, 18, 31];
  function parse(c) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(c || '');
    if (!m) return null;
    var a = m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a: a };
  }
  // Colourless: greys, black and white (HSL saturation under 12%), so dark navies and other deep colours count as colours.
  function neutral(c) {
    var mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), ch = (mx - mn) / 255, l = (mx + mn) / 510;
    return ch < 0.04 || ch / (1 - Math.abs(2 * l - 1) || 1) < 0.12;
  }
  function light(c) { return (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 510; }
  function lum(r, g, b) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  var BGL = lum(BG[0], BG[1], BG[2]);
  function contrast(r, g, b) { return (lum(r, g, b) + 0.05) / (BGL + 0.05); }
  // A lavender-tinted grey at lightness l (0..1), like Lavender Dusk's own text and surfaces.
  function tint(l, a) {
    var t = function (base) { return Math.round(Math.max(0, Math.min(255, l * 255 + base))); };
    var r = t(-2), g = t(-8), b = t(10);
    return a < 1 ? 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')' : 'rgb(' + r + ', ' + g + ', ' + b + ')';
  }
  function text(c) {
    if (neutral(c) && light(c) > 0.7) return null;   // white/light text (on coloured buttons) already reads on dark
    if (neutral(c)) return tint(Math.max(0.5, Math.min(0.93, 0.95 - light(c) * 0.75)), c.a);
    var r = c.r, g = c.g, b = c.b, k = 0;
    while (contrast(r, g, b) < 4.5 && k < 12) { r += (255 - r) * 0.18; g += (255 - g) * 0.18; b += (255 - b) * 0.18; k++; }
    if (!k) return null;
    return 'rgba(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b) + ', ' + c.a + ')';
  }
  function back(c) {
    var l = light(c);
    if (l > 0.88) return 'transparent';          // white, near-white and pale tints: the page shows through
    if (!neutral(c)) return null;               // coloured (bars, buttons): kept exactly
    return tint(0.07 + (1 - l) * 0.22, c.a);
  }
  function line(c) { return neutral(c) ? tint(Math.max(0.22, Math.min(0.8, 0.95 - light(c) * 0.7)), c.a) : null; }
  var SIDES = ['top', 'right', 'bottom', 'left'];
  var SKIP = { IMG: 1, VIDEO: 1, PICTURE: 1, CANVAS: 1, SVG: 1, svg: 1, SCRIPT: 1, STYLE: 1, BR: 1 };
  // opts.own: only colours the element sets itself (the composer, whose own text already uses the theme's colour).
  function apply(root, opts) {
    if (!root) return;
    opts = opts || {};
    var logoSrc = opts.logoSrc, own = !!opts.own;
    var els = [root].concat([].slice.call(root.querySelectorAll('*'))), plan = [];
    // Everything is read first, then changed, so inherited colours aren't changed twice.
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.tagName === 'IMG') {
        if (logoSrc && el.getAttribute('data-hn-logo') === '1') { var dusk = logoSrc(el.getAttribute('src') || ''); if (dusk) plan.push([el, null, dusk]); }
        continue;
      }
      if (SKIP[el.tagName] || el.hasAttribute('data-hn-dusk')) continue;
      var cs = getComputedStyle(el), set = [], v, c;
      var st = el.style;
      if ((!own || st.color || (el.tagName === 'FONT' && el.hasAttribute('color'))) && (c = parse(cs.color)) && (v = text(c))) set.push(['color', v]);
      if ((!own || st.backgroundColor || st.background || el.hasAttribute('bgcolor')) && (c = parse(cs.backgroundColor)) && c.a > 0 && (v = back(c))) set.push(['background-color', v]);
      for (var s = 0; s < 4; s++) {
        var side = SIDES[s];
        if (own && !st['border-' + side + '-color'] && !st.borderColor) continue;
        if (cs['border-' + side + '-style'] === 'none' || parseFloat(cs['border-' + side + '-width']) === 0) continue;
        if ((c = parse(cs['border-' + side + '-color'])) && c.a > 0 && (v = line(c))) set.push(['border-' + side + '-color', v]);
      }
      if (set.length) plan.push([el, set]);
    }
    for (var j = 0; j < plan.length; j++) {
      var p = plan[j], e = p[0];
      if (p[2]) { e.setAttribute('data-hn-dusk-src', e.getAttribute('src')); e.setAttribute('src', p[2]); e.setAttribute('data-hn-dusk', ''); continue; }
      e.setAttribute('data-hn-dusk', e.getAttribute('style') == null ? '' : e.getAttribute('style'));
      if (e.getAttribute('style') == null) e.setAttribute('data-hn-dusk-none', '');
      for (var k = 0; k < p[1].length; k++) e.style.setProperty(p[1][k][0], p[1][k][1], 'important');
    }
  }
  // Puts everything back exactly as it was (works on a copy too: it only reads the saved attributes).
  function undo(root) {
    if (!root) return;
    var els = [].slice.call(root.querySelectorAll('[data-hn-dusk]'));
    if (root.hasAttribute && root.hasAttribute('data-hn-dusk')) els.push(root);
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.hasAttribute('data-hn-dusk-src')) { e.setAttribute('src', e.getAttribute('data-hn-dusk-src')); e.removeAttribute('data-hn-dusk-src'); }
      else if (e.hasAttribute('data-hn-dusk-none')) { e.removeAttribute('style'); e.removeAttribute('data-hn-dusk-none'); }
      else e.setAttribute('style', e.getAttribute('data-hn-dusk'));
      e.removeAttribute('data-hn-dusk');
    }
  }
  global.hnDusk = { apply: apply, undo: undo };
})(typeof window !== 'undefined' ? window : this);
