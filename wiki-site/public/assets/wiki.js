// HN Group Wiki: small enhancements. Everything works without JavaScript.
(function () {
  'use strict';
  // Colour swatches (inline styles aren't allowed by the security policy).
  document.querySelectorAll('.swatch[data-colour]').forEach(function (el) {
    if (/^#[0-9A-F]{6}$/i.test(el.dataset.colour)) el.style.background = el.dataset.colour;
  });
  // Mobile menu
  var toggle = document.querySelector('.menu-toggle'), sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    sidebar.classList.toggle('open', open);
  });
  // "/" jumps to search, like Wikipedia.
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(document.activeElement.tagName)) return;
    var s = document.querySelector('.search input');
    if (s) { e.preventDefault(); s.focus(); }
  });
  // Search suggestions as you type, like Wikipedia: matching articles with their short description
  // and logo, then "Search for pages containing …". Arrow keys move, Enter opens, Escape closes.
  var form = document.querySelector('.search'), input = form && form.querySelector('input[name="search"]');
  if (form && input && window.fetch) {
    var list = document.createElement('ul'), items = [], active = -1, timer = 0, seq = 0, cache = {};
    list.className = 'suggestions'; list.id = 'search-suggestions'; list.setAttribute('role', 'listbox'); list.hidden = true;
    form.appendChild(list);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id); input.setAttribute('aria-expanded', 'false');
    var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    var icon = function (path) {
      var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); p.setAttribute('d', path); svg.appendChild(p); return svg;
    };
    // The typed text is shown in bold where it appears in the title.
    var titleWithMatch = function (title, q) {
      var span = el('span', 'sg-title'), i = title.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0 || !q) { span.textContent = title; return span; }
      span.appendChild(document.createTextNode(title.slice(0, i)));
      span.appendChild(el('b', '', title.slice(i, i + q.length)));
      span.appendChild(document.createTextNode(title.slice(i + q.length)));
      return span;
    };
    var close = function () { list.hidden = true; form.classList.remove('suggesting'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    var setActive = function (i) {
      active = i;
      items.forEach(function (li, n) { li.classList.toggle('active', n === i); li.setAttribute('aria-selected', String(n === i)); });
      if (i >= 0) { input.setAttribute('aria-activedescendant', items[i].id); items[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
    };
    var show = function (q, results) {
      list.textContent = ''; items = [];
      results.forEach(function (r) {
        var thumb = el('span', 'sg-thumb'), text = el('span', 'sg-text');
        if (r.image) {
          var light = el('img', r.image.dark ? 'on-light' : ''); light.src = r.image.light; light.alt = ''; thumb.appendChild(light);
          if (r.image.dark) { var dark = el('img', 'on-dark'); dark.src = r.image.dark; dark.alt = ''; thumb.appendChild(dark); }
        } else thumb.appendChild(icon('M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6'));
        text.appendChild(titleWithMatch(r.title, q));
        if (r.redirectFrom) text.appendChild(el('span', 'sg-from', 'Redirected from ' + r.redirectFrom));
        if (r.description) text.appendChild(el('span', 'sg-desc', r.description));
        var a = el('a'); a.href = r.url; a.tabIndex = -1; a.appendChild(thumb); a.appendChild(text);
        var li = el('li', 'suggestion'); li.appendChild(a); items.push(li);
      });
      var thumb = el('span', 'sg-thumb'), text = el('span', 'sg-text'), title = el('span', 'sg-title', 'Search for pages containing ');
      thumb.appendChild(icon('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5'));
      title.appendChild(el('b', '', q)); text.appendChild(title);
      var a = el('a'); a.href = '/wiki/Special:Search?search=' + encodeURIComponent(q) + '&fulltext=1'; a.tabIndex = -1; a.appendChild(thumb); a.appendChild(text);
      var li = el('li', 'suggestion fulltext'); li.appendChild(a); items.push(li);
      items.forEach(function (item, n) {
        item.id = 'search-suggestion-' + n; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
        item.addEventListener('mousemove', function () { if (active !== n) setActive(n); });
        list.appendChild(item);
      });
      list.hidden = false; form.classList.add('suggesting'); input.setAttribute('aria-expanded', 'true'); active = -1;
    };
    var update = function () {
      var q = input.value.trim(), mine = ++seq;
      if (!q) return close();
      if (cache[q]) return show(q, cache[q]);
      fetch('/w/api/suggest?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : { results: [] }; })
        .then(function (d) { cache[q] = d.results || []; if (mine === seq && document.activeElement === input) show(q, cache[q]); })
        .catch(function () {});
    };
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(update, 120); });
    input.addEventListener('focus', function () { if (input.value.trim()) update(); });
    input.addEventListener('keydown', function (e) {
      if (list.hidden) { if (e.key === 'ArrowDown' && input.value.trim()) { e.preventDefault(); update(); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = items.length, next = e.key === 'ArrowDown' ? active + 1 : active - 1;
        setActive(next >= n ? -1 : next < -1 ? n - 1 : next);
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); window.location.href = items[active].querySelector('a').href;
      } else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    // Close when focus or a click goes elsewhere (mousedown on a suggestion keeps it open so the click lands).
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    input.addEventListener('blur', function () { setTimeout(close, 0); });
  }
  // Confirm before deleting a page.
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!window.confirm(f.dataset.confirm)) e.preventDefault(); });
  });
  // Warn before leaving the editor with unsaved changes.
  var box = document.getElementById('wpTextbox');
  if (box && !box.readOnly) {
    var original = box.value, submitting = false;
    box.closest('form').addEventListener('submit', function () { submitting = true; });
    window.addEventListener('beforeunload', function (e) { if (!submitting && box.value !== original) { e.preventDefault(); e.returnValue = ''; } });
  }
})();
