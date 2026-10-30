// HN Group motion kit: the movement of the main HN Group website (hngroup.org.uk) for every HN Group website. The
// master copy is brand/web/hn-motion.js; each website keeps an identical copy in its own assets (brand/web/test.cjs).
// Load it with defer on any page. It:
//  - gives the header a border once the page scrolls (.site-header or [data-hn-header] gets .scrolled) and slides it in;
//  - makes cards, rows and sections rise into view one after another as they appear or scroll in, including ones a
//    page's own script adds later (lists, search results, pages of a one-page app);
//  - plays an entrance when a page or view comes on screen;
//  - draws the stepped stripe into any [data-hn-steps] element and counts up [data-hn-count] numbers;
//  - opens dialogs and menus with a small pop.
// Which things rise in can be changed with <html data-hn-reveal="selector">. Nothing moves when reduce motion is on.
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js', 'hn-motion');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEFAULT = '.card, .tile, .row, .company, .pillar, .job, .panel, .stat, .doc, .template, .person-row, .file-row, ' +
    '.site-card, .service, .app-card, .device, .incident, .monitor, .list-item, [data-reveal], .reveal';
  var selector = root.getAttribute('data-hn-reveal') || DEFAULT;
  var typing = function () { var a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio'; };

  // ---------- Rising into view ----------
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('hn-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -6% 0px' }) : null;
  var batch = 0, batchTimer = null;
  // Things rise in just after a page opens, a view changes or the address changes. A page redrawing itself later (a
  // status page refreshing every minute, a list after saving) shows on-screen changes at once, and only what's still
  // below the fold rises in as it's scrolled to.
  var lively = 0;
  var wake = function (ms) { lively = Math.max(lively, Date.now() + (ms || 1500)); };
  wake(2500);
  function reveal(el) {
    if (el.__hnSeen || el.closest('[data-hn-still]')) return;
    el.__hnSeen = true;
    if (still || !io) return;
    // Results that change while someone types appear at once rather than replaying.
    if (typing()) return;
    if (Date.now() > lively) { var r = el.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) return; }
    el.classList.add('hn-reveal');
    el.style.setProperty('--hn-delay', Math.min(batch++, 10) * 0.055 + 's');
    clearTimeout(batchTimer); batchTimer = setTimeout(function () { batch = 0; }, 120);
    io.observe(el);
  }
  function scan(rootEl) {
    if (!rootEl || rootEl.nodeType !== 1) return;
    if (rootEl.matches && rootEl.matches(selector)) reveal(rootEl);
    var found = rootEl.querySelectorAll ? rootEl.querySelectorAll(selector) : [];
    for (var i = 0; i < found.length; i++) reveal(found[i]);
  }

  // ---------- Views coming on screen ----------
  function enter(el) {
    wake();
    if (still || !el || el.nodeType !== 1) return;
    el.classList.remove('hn-enter'); void el.offsetWidth; el.classList.add('hn-enter');
  }

  // ---------- Steps and numbers ----------
  function steps(el) {
    if (el.__hnSteps) return; el.__hnSteps = true;
    el.classList.add('hn-steps'); if (el.getAttribute('data-hn-steps') === 'alive') el.classList.add('hn-alive');
    el.setAttribute('aria-hidden', 'true');
    for (var i = 1; i <= 8; i++) { var s = document.createElement('span'); s.className = 's' + i; el.appendChild(s); }
  }
  function count(el) {
    var to = Number(el.getAttribute('data-hn-count')); if (!isFinite(to) || el.__hnCounted === to) return; el.__hnCounted = to;
    if (still || to <= 0) { el.textContent = String(to); return; }
    var start = performance.now(), from = Number(el.textContent) || 0;
    (function tick(now) { var t = Math.min(1, (now - start) / 700), v = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))); el.textContent = String(v); if (t < 1) requestAnimationFrame(tick); })(start);
  }
  function extras(rootEl) {
    if (!rootEl.querySelectorAll) return;
    var s = rootEl.querySelectorAll('[data-hn-steps]'); for (var i = 0; i < s.length; i++) steps(s[i]);
    var c = rootEl.querySelectorAll('[data-hn-count]'); for (var j = 0; j < c.length; j++) count(c[j]);
    if (rootEl.matches && rootEl.matches('[data-hn-steps]')) steps(rootEl);
    if (rootEl.matches && rootEl.matches('[data-hn-count]')) count(rootEl);
    var d = rootEl.querySelectorAll('dialog'); for (var k = 0; k < d.length; k++) d[k].classList.add('hn-pop');
  }

  function start() {
    var header = document.querySelector('.site-header, [data-hn-header]');
    if (header) {
      if (!still) header.classList.add('hn-header-in');
      var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
      window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    }
    var main = document.querySelector('main, [data-hn-main]') || document.body;
    scan(document.body); extras(document.body);
    if (!still) enter(main);
    // Whatever a page's script adds or shows later rises in too.
    if ('MutationObserver' in window) new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === 'attributes') {
          var t = m.target;
          // A view that was hidden coming back on screen (one-page apps switching section).
          if (m.attributeName === 'hidden' && !t.hidden && t.parentElement === main) { enter(t); scan(t); }
          if (m.attributeName === 'data-hn-count') count(t);
          return;
        }
        for (var i = 0; i < m.addedNodes.length; i++) {
          var n = m.addedNodes[i]; if (n.nodeType !== 1) continue;
          if (n.parentElement === main && !typing() && Date.now() <= lively) enter(n);
          scan(n); extras(n);
        }
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-hn-count'] });
  }
  // One-page apps changing address count as a new page.
  ['pushState', 'replaceState'].forEach(function (k) { var f = history[k]; if (f) history[k] = function () { wake(); return f.apply(this, arguments); }; });
  window.addEventListener('popstate', function () { wake(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.HNMotion = { reveal: scan, enter: enter };
})();
