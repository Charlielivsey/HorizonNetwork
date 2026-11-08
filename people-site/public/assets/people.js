// HN Group People: the public staff list, org charts and profiles, drawn from /api/people (live from the staff portal).
(function () {
  'use strict';
  var view = document.getElementById('view');
  var data = null, raw = '', query = '', company = '';
  var chartScale = null, fittedScale = 1;
  var LOGOS = { 'HN Group': 'hn-group-wordmark', 'Horizon Network': 'horizon-network-wordmark', 'Horizon Advertising': 'horizon-advertising-logo', 'Horizon Development': 'horizon-development-logo', 'Horizon Media Group': 'horizon-media-group-logo' };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var slug = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var byId = function (id) { return data.people.find(function (p) { return p.id === id; }) || null; };
  var companyOfSlug = function (s) { return data.companies.find(function (c) { return slug(c) === s; }) || null; };
  var mainRole = function (p) { return p.roles.find(function (r) { return r.main; }) || p.roles[0] || { company: '', jobTitle: '', department: '' }; };
  var roleAt = function (p, c) { return p.roles.find(function (r) { return r.company === c; }) || null; };
  var inCompany = function (p, c) { return !!roleAt(p, c); };
  var initials = function (name) { return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };

  function avatar(p, size) {
    return '<span class="avatar avatar-' + size + '" aria-hidden="true">' + (p.photo ? '<img src="/api/people/' + p.id + '/photo" alt="" loading="lazy" width="96" height="96">' : '<span>' + esc(initials(p.name)) + '</span>') + '</span>';
  }
  function logo(c, cls) {
    var f = LOGOS[c];
    if (!f) return '<span class="' + (cls || 'co-logo') + ' co-text">' + esc(c) + '</span>';
    return '<span class="' + (cls || 'co-logo') + '"><img class="on-light" src="/assets/brand/' + f + '.svg" alt="' + esc(c) + '"><img class="on-dark" src="/assets/brand/' + f + '-white.svg" alt=""></span>';
  }
  function title(r) { return r.jobTitle || 'Team member'; }
  function link(href, inner, cls) { return '<a href="' + href + '"' + (cls ? ' class="' + cls + '"' : '') + ' data-route>' + inner + '</a>'; }
  function pageHead(eyebrow, h1, lead, extra) {
    return '<section class="page-head"><div class="wrap"><p class="eyebrow">' + eyebrow + '</p><h1>' + h1 + '</h1>' + (lead ? '<p class="lead">' + lead + '</p>' : '') + (extra || '') + '<div class="head-steps" data-hn-steps aria-hidden="true"></div></div></section>';
  }
  function setNav(which) {
    document.querySelectorAll('[data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === which) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }

  // ---------- Staff list ----------
  function matches(p) {
    if (company && !inCompany(p, company)) return false;
    if (!query) return true;
    var hay = [p.name, p.about].concat(p.skills, p.languages, p.roles.map(function (r) { return r.jobTitle + ' ' + r.department + ' ' + r.company; })).join(' ').toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function card(p) {
    var r = company ? roleAt(p, company) : mainRole(p);
    var others = p.roles.filter(function (x) { return x !== r; });
    return '<a class="card person" href="/people/' + p.id + '" data-route>' + avatar(p, 'md') +
      '<span class="person-text"><strong class="person-name">' + esc(p.name) + (p.temporary ? ' <span class="temp-tag">Temporary</span>' : '') + '</strong>' +
      '<span class="person-title">' + esc(title(r)) + '</span>' +
      '<span class="person-meta">' + esc(r.company) + (r.department ? ' · ' + esc(r.department) : '') + '</span>' +
      (others.length ? '<span class="chips small-chips">' + others.map(function (o) { return '<span class="chip">' + esc(o.company) + '</span>'; }).join('') + '</span>' : '') +
      (p.about ? '<span class="person-about">' + esc(p.about) + '</span>' : '') + '</span></a>';
  }
  function listResults() {
    var list = data.people.filter(matches);
    var label = list.length + (list.length === 1 ? ' person' : ' people') + (company ? ' at ' + company : '') + (query ? ' matching “' + query + '”' : '');
    return '<p class="muted results-count">' + esc(label) + '</p>' + (list.length ? '<div class="people-grid">' + list.map(card).join('') + '</div>' : '<div class="empty card"><p>No one matches that. Try another name, position or skill.</p></div>');
  }
  function renderList() {
    setNav('list');
    var count = function (c) { return data.people.filter(function (p) { return inCompany(p, c); }).length; };
    var chips = '<div class="chips filter" role="group" aria-label="Company"><button type="button" class="chip-btn" data-company="" aria-pressed="' + (!company) + '">Everyone <span>' + data.people.length + '</span></button>' +
      data.companies.filter(count).map(function (c) { return '<button type="button" class="chip-btn" data-company="' + esc(c) + '" aria-pressed="' + (company === c) + '">' + esc(c) + ' <span>' + count(c) + '</span></button>'; }).join('') + '</div>';
    view.innerHTML = pageHead('HN Group People', 'The people of HN Group<span class="dot">.</span>', 'Everyone across HN Group and its companies: who they are, what they do and who they work with. Profiles are kept up to date from the HN Group staff portal.',
      '<div class="head-stats"><span><b>' + data.people.length + '</b> people</span><span><b>' + data.companies.filter(count).length + '</b> companies</span>' + link('/org', 'See the org charts', 'btn btn-primary btn-small') + '</div>') +
      '<section class="section list-section"><div class="wrap"><div class="toolbar"><label class="search"><span class="sr-only">Search people</span><input type="search" id="q" placeholder="Search by name, position, department or skill" value="' + esc(query) + '" autocomplete="off"></label>' + chips + '</div><div id="results">' + listResults() + '</div></div></section>';
    var q = document.getElementById('q');
    q.addEventListener('input', function () { query = q.value.trim(); document.getElementById('results').innerHTML = listResults(); remember(); });
    view.querySelectorAll('[data-company]').forEach(function (b) {
      b.addEventListener('click', function () {
        company = b.getAttribute('data-company');
        view.querySelectorAll('[data-company]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        document.getElementById('results').innerHTML = listResults(); remember();
      });
    });
  }
  function remember() {
    var u = new URL(location.href);
    if (query) u.searchParams.set('q', query); else u.searchParams.delete('q');
    if (company) u.searchParams.set('company', slug(company)); else u.searchParams.delete('company');
    history.replaceState(null, '', u.pathname + u.search);
  }

  // ---------- Org charts ----------
  // Charts are made of positions, held or vacant (People → Job descriptions → Positions on the staff portal), each under
  // the position it reports to. Everyone holding a position is shown in it, so someone with several positions appears
  // once for each. A company's chart has that company's positions; a position reporting to another company's starts a
  // branch with "Reports to …". The whole-group chart has every company's positions together.
  var posKey = function (p) { return p.company + '\n' + String(p.title).toLowerCase(); };
  function chartNodes(c) {
    var list = (data.positions || []).filter(function (p) { return !c || p.company === c; });
    var nodes = list.map(function (p) { return { id: p.key || posKey(p), pos: p, parentId: null, outside: null }; });
    nodes.forEach(function (n) {
      if (!n.pos.reportsTo) return;
      var parent = nodes.find(function (x) { return posKey(x.pos) === posKey(n.pos.reportsTo); });
      if (parent) n.parentId = parent.id; else n.outside = n.pos.reportsTo;
    });
    var ids = {}; nodes.forEach(function (n) { ids[n.id] = n; });
    nodes.forEach(function (n) { if (n.parentId && !ids[n.parentId]) { n.outside = n.pos.reportsTo; n.parentId = null; } });
    nodes.forEach(function (n) {
      var seen = {}, at = n;
      while (at && at.parentId) { if (seen[at.id]) { n.parentId = null; break; } seen[at.id] = true; at = ids[at.parentId]; }
    });
    return nodes;
  }
  // The chart sits in a panel with a toolbar: switch company, find a person or position, collapse/expand branches and
  // zoom (Fit by default; zoom out/in in 10% steps from 10% to 200%, 100%, Fit to screen; when zoomed, the chart scrolls
  // and its arrow keys move it). Zoom, scroll position and collapsed branches survive the live redraws.
  var CO_COLOURS = { 'HN Group': 'purple', 'Horizon Network': 'teal', 'Horizon Media Group': 'raspberry', 'Horizon Advertising': 'pink', 'Horizon Development': 'green' };
  var coClass = function (c) { return 'co-' + (CO_COLOURS[c] || 'lavender'); };
  var collapsed = {}, chartQuery = '', chartKey = '';
  var ICON_PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>';
  function holderHtml(id) {
    var p = byId(id);
    return p ? link('/people/' + p.id, avatar(p, 'sm') + '<span class="org-who"><span class="org-name">' + esc(p.name) + '</span>' + (p.temporary ? '<span class="temp-tag">Temporary</span>' : '') + '</span>', 'org-holder') : '';
  }
  function treeHtml(nodes, group) {
    var kids = {}, order = {};
    nodes.forEach(function (n, i) { order[n.id] = i; (kids[n.parentId || ''] = kids[n.parentId || ''] || []).push(n); });
    Object.keys(kids).forEach(function (k) { kids[k].sort(function (a, b) { return order[a.id] - order[b.id]; }); });
    var count = function (n) { return (kids[n.id] || []).reduce(function (t, k) { return t + 1 + count(k); }, 0); };
    function li(n) {
      var below = kids[n.id] || [], holders = n.pos.holders || [], shut = !!collapsed[n.id], under = count(n);
      var names = holders.map(function (id) { var p = byId(id); return p ? p.name : ''; }).join(' ');
      return '<li' + (shut ? ' class="collapsed"' : '') + ' data-node="' + esc(n.id) + '"><div class="org-node ' + coClass(n.pos.company) + (holders.length ? '' : ' vacant') + '" data-find="' + esc((n.pos.title + ' ' + n.pos.company + ' ' + names).toLowerCase()) + '">' +
        '<div class="org-pos"><strong>' + esc(n.pos.title) + '</strong>' + (group ? '<span class="org-co"><i></i>' + esc(n.pos.company) + '</span>' : '') +
        (n.outside ? '<span class="org-outside">Reports to ' + esc(n.outside.title) + (n.outside.company !== n.pos.company ? ', ' + esc(n.outside.company) : '') + '</span>' : '') + '</div>' +
        (holders.length ? '<div class="org-holders">' + holders.map(holderHtml).join('') + '</div>' : '<div class="org-vacant"><span class="org-empty">' + ICON_PERSON + '</span><span>Vacant</span></div>') +
        (below.length ? '<button type="button" class="org-toggle" aria-expanded="' + !shut + '" aria-label="' + (shut ? 'Show' : 'Hide') + ' the ' + under + ' position' + (under === 1 ? '' : 's') + ' under ' + esc(n.pos.title) + '"><span>' + under + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' : '') +
        '</div>' + (below.length ? '<ul>' + below.map(li).join('') + '</ul>' : '') + '</li>';
    }
    var roots = kids[''] || [];
    return roots.length ? '<div class="org-scroll" role="group" aria-label="Org chart; use arrow keys to move when zoomed" tabindex="0"><div class="org-canvas"><ul class="org-tree">' + roots.map(li).join('') + '</ul></div></div>' : '<div class="empty card"><p>No positions are listed here yet.</p></div>';
  }
  function renderOrg(c) {
    setNav('org');
    if (chartKey !== (c || '*')) { chartKey = c || '*'; chartQuery = ''; }
    var previous = view.querySelector('.org-scroll'), left = previous ? previous.scrollLeft : 0, top = previous ? previous.scrollTop : 0;
    setTimeout(function () {
      fitChart();
      var box = view.querySelector('.org-scroll');
      if (box && chartScale !== null) { box.scrollLeft = left; box.scrollTop = top; }
    }, 0);
    var count = function (x) { return (data.positions || []).filter(function (p) { return p.company === x; }).length; };
    var tabs = '<nav class="org-switch" aria-label="Org charts">' + link('/org', 'Whole group', !c ? 'active' : '') +
      data.companies.filter(count).map(function (x) { return link('/org/' + slug(x), '<i class="' + coClass(x) + '"></i>' + esc(x) + ' <span>' + count(x) + '</span>', c === x ? 'active' : ''); }).join('') + '</nav>';
    var nodes = chartNodes(c), filled = nodes.filter(function (n) { return n.pos.holders.length; }).length;
    var who = {}; nodes.forEach(function (n) { n.pos.holders.forEach(function (h) { who[h] = 1; }); });
    var stats = '<div class="org-stats"><span><b>' + nodes.length + '</b> positions</span><span><b>' + filled + '</b> filled</span><span><b>' + (nodes.length - filled) + '</b> vacant</span><span><b>' + Object.keys(who).length + '</b> people</span></div>';
    var tools = '<div class="org-tools"><label class="org-find"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="sr-only">Find a person or position</span><input type="search" id="org-q" placeholder="Find a person or position" autocomplete="off" value="' + esc(chartQuery) + '"><span class="org-hits" id="org-hits"></span></label>' +
      '<div class="org-btns"><button type="button" class="org-btn" data-branches="expand">Expand all</button><button type="button" class="org-btn" data-branches="collapse">Collapse all</button>' +
      '<div class="org-zoom" role="group" aria-label="Chart zoom"><button type="button" class="icon" data-zoom="out" aria-label="Zoom out">−</button><output id="org-scale" aria-live="polite">Fit</output><button type="button" class="icon" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="actual">100%</button><button type="button" data-zoom="fit">Fit to screen</button></div></div></div>';
    var legend = '<div class="org-legend"><span><i class="lg-filled"></i>Filled</span><span><i class="lg-vacant"></i>Vacant</span><span><span class="temp-tag">Temporary</span></span>' +
      (!c ? data.companies.filter(count).map(function (x) { return '<span><i class="' + coClass(x) + '"></i>' + esc(x) + '</span>'; }).join('') : '') + '</div>';
    view.innerHTML = pageHead('Org charts', c ? esc(c) + '<span class="dot">.</span>' : 'The whole group<span class="dot">.</span>',
      (c ? 'Every position at ' + esc(c) + ' and who it reports to.' : 'Every position at HN Group and its companies in one chart.'), stats) +
      '<section class="section org-section"><div class="wrap org-wrap">' + tabs + '<div class="org-panel">' + tools + legend + treeHtml(nodes, !c) + '</div>' +
      '<p class="muted small org-note">Select anyone to see their profile. When zoomed in, scroll or use the chart’s arrow keys to move around. Positions and reporting lines are set on the HN Group staff portal.</p></div></section>';
    view.querySelectorAll('[data-zoom]').forEach(function (button) { button.addEventListener('click', function () {
      var action = button.dataset.zoom, current = chartScale === null ? fittedScale : chartScale;
      chartScale = action === 'fit' ? null : action === 'actual' ? 1 : Math.max(.1, Math.min(2, Math.round((current + (action === 'in' ? .1 : -.1)) * 100) / 100));
      fitChart();
    }); });
    wireChart();
  }
  function wireChart() {
    var box = view.querySelector('.org-scroll'); if (!box) return;
    var q = document.getElementById('org-q');
    var find = function () {
      chartQuery = q.value.trim();
      var words = chartQuery.toLowerCase().split(/\s+/).filter(Boolean), hits = 0;
      box.classList.toggle('searching', words.length > 0);
      box.querySelectorAll('.org-node').forEach(function (card) {
        var on = words.length > 0 && words.every(function (w) { return card.getAttribute('data-find').indexOf(w) >= 0; });
        card.classList.toggle('match', on);
        // Open any collapsed branch a match is in.
        if (on) { hits++; for (var li = card.parentNode.parentNode.closest('li'); li; li = li.parentNode.closest('li')) if (li.classList.contains('collapsed')) setBranch(li, false); }
      });
      document.getElementById('org-hits').textContent = words.length ? (hits ? hits + ' found' : 'None found') : '';
      fitChart();
    };
    q.addEventListener('input', find);
    if (chartQuery) find();
    view.querySelectorAll('[data-branches]').forEach(function (b) { b.addEventListener('click', function () {
      var shut = b.dataset.branches === 'collapse';
      // Collapse all keeps the top positions open, so the chart still shows where everything starts.
      box.querySelectorAll('li').forEach(function (li) { if (li.querySelector(':scope > ul')) setBranch(li, shut && !li.parentNode.classList.contains('org-tree')); });
      fitChart();
    }); });
    box.addEventListener('click', function (e) {
      var t = e.target.closest('.org-toggle'); if (!t) return;
      var li = t.closest('li'); setBranch(li, !li.classList.contains('collapsed')); fitChart();
    });
  }
  function setBranch(li, shut) {
    li.classList.toggle('collapsed', shut);
    if (shut) collapsed[li.getAttribute('data-node')] = 1; else delete collapsed[li.getAttribute('data-node')];
    var t = li.querySelector(':scope > .org-node .org-toggle');
    if (t) { t.setAttribute('aria-expanded', String(!shut)); t.setAttribute('aria-label', t.getAttribute('aria-label').replace(/^(Show|Hide)/, shut ? 'Show' : 'Hide')); }
  }

  // Fit is the default. Manual zoom uses a scaled canvas, so every enlarged card remains reachable by scrolling.
  // On phones the underlying layout stays an indented list.
  function fitChart() {
    var box = view.querySelector('.org-scroll'), tree = box && box.querySelector('.org-tree');
    var canvas = box && box.querySelector('.org-canvas');
    if (!tree || !canvas) return;
    tree.style.transform = ''; tree.style.marginLeft = ''; box.style.height = '';
    var cs = getComputedStyle(box), avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    canvas.style.width = avail + 'px';
    var w = tree.offsetWidth, h = tree.offsetHeight;
    fittedScale = Math.min(1, avail / w);
    var s = chartScale === null ? fittedScale : chartScale;
    box.classList.toggle('zoomed', chartScale !== null);
    canvas.style.width = Math.max(avail, Math.ceil(w * s)) + 'px';
    canvas.style.height = Math.ceil(h * s) + 24 + 'px';
    tree.style.marginLeft = Math.max(0, (avail - w * s) / 2) + 'px';
    tree.style.transform = 'scale(' + s + ')';
    var label = view.querySelector('#org-scale');
    if (label) label.textContent = Math.round(s * 100) + '%';
    view.querySelector('[data-zoom="out"]').disabled = s <= .1;
    view.querySelector('[data-zoom="in"]').disabled = s >= 2;
    if (chartScale === null) { box.scrollLeft = 0; box.scrollTop = 0; }
  }
  window.addEventListener("resize", fitChart);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitChart);

  // ---------- Profile ----------
  function renderPerson(id) {
    var p = byId(id);
    if (!p) { setNav(''); view.innerHTML = pageHead('HN Group People', 'Person not found', 'They may no longer be listed.', link('/', 'Back to the staff list', 'btn btn-primary')); return; }
    setNav('list');
    document.title = p.name + ' · HN Group People';
    var r0 = mainRole(p);
    var reports = function (c) { return data.people.filter(function (x) { var r = roleAt(x, c); return r && r.reportsTo && r.reportsTo.id === p.id; }); };
    var roles = p.roles.map(function (r) {
      var boss = r.reportsTo && byId(r.reportsTo.id), team = reports(r.company);
      return '<article class="card role">' + logo(r.company) + '<h3>' + esc(title(r)) + '</h3><p class="muted">' + esc(r.company) + (r.department ? ' · ' + esc(r.department) : '') + (r.main ? ' · <span class="tag">Main role</span>' : '') + '</p>' +
        (boss ? '<p class="small"><span class="muted">Reports to</span> ' + link('/people/' + boss.id, avatar(boss, 'xs') + esc(boss.name), 'mini-person') + '</p>' : '') +
        (team.length ? '<p class="small"><span class="muted">Their team</span></p><div class="mini-list">' + team.map(function (t) { return link('/people/' + t.id, avatar(t, 'xs') + esc(t.name), 'mini-person'); }).join('') + '</div>' : '') +
        '<p class="small">' + link('/org/' + slug(r.company), 'See ' + esc(r.company) + '’s org chart', 'link-arrow') + '</p></article>';
    }).join('');
    var tags = function (label, list) { return list && list.length ? '<div class="facts"><h2 class="h-small">' + label + '</h2><div class="chips">' + list.map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('') + '</div></div>' : ''; };
    view.innerHTML = '<section class="page-head profile-head"><div class="wrap"><p class="crumbs">' + link('/', 'Staff list') + ' / ' + esc(p.name) + '</p><div class="profile-top">' + avatar(p, 'xl') +
      '<div><h1>' + esc(p.name) + '</h1>' + (p.temporary ? '<p><span class="temp-tag big">Temporary position</span></p>' : '') + '<p class="lead">' + esc(title(r0)) + ' · ' + esc(r0.company) + '</p></div></div><div class="head-steps" data-hn-steps aria-hidden="true"></div></div></section>' +
      '<section class="section profile-body"><div class="wrap profile-grid"><div class="profile-main"><div class="card about"><h2 class="h-small">About me</h2>' + (p.about ? '<p class="about-text">' + esc(p.about) + '</p>' : '<p class="muted">' + esc(p.name.split(' ')[0]) + ' hasn’t written an About me yet.</p>') + '</div>' +
      tags('Skills', p.skills) + tags('Languages', p.languages) + '</div><div class="profile-roles"><h2 class="h-small">' + (p.roles.length > 1 ? 'Positions' : 'Position') + '</h2>' + roles + '</div></div></section>';
  }

  // ---------- Routing ----------
  function render() {
    if (!data) return;
    var path = location.pathname.replace(/\/+$/, '') || '/';
    document.title = 'HN Group People';
    var m;
    if (path === '/') {
      var u = new URL(location.href); query = u.searchParams.get('q') || ''; company = companyOfSlug(u.searchParams.get('company') || '') || '';
      renderList();
    } else if (path === '/org') renderOrg('');
    else if ((m = /^\/org\/([a-z0-9-]+)$/.exec(path))) { var c = companyOfSlug(m[1]); if (c) { renderOrg(c); document.title = c + ' org chart · HN Group People'; } else renderOrg(''); }
    else if ((m = /^\/people\/([a-f0-9]{16})$/.exec(path))) renderPerson(m[1]);
    else renderList();
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-route]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (a.getAttribute('href') !== location.pathname + location.search) history.pushState(null, '', a.getAttribute('href'));
    render(); window.scrollTo(0, 0); document.getElementById('main').focus({ preventScroll: true });
  });
  window.addEventListener('popstate', render);

  // Live from the staff portal: checked every 15 seconds and when the tab is shown again; redrawn only when something changed
  // (and never while someone is typing in the search box).
  function load(first) {
    return fetch('/api/people', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(); return r.text(); }).then(function (text) {
      var next = JSON.parse(text), key = JSON.stringify({ c: next.companies, p: next.people, positions: next.positions });
      if (key === raw) return;
      raw = key; data = next;
      // Never redraw under someone typing: the staff list just refreshes its results, the org chart waits.
      var active = document.activeElement, typing = active && active.tagName === 'INPUT';
      if (first || !typing) render(); else if (active.id === 'q' && document.getElementById('results')) document.getElementById('results').innerHTML = listResults();
    }).catch(function () {
      if (first) view.innerHTML = '<section class="section"><div class="wrap"><div class="empty card"><p>The staff list is temporarily unavailable. Please try again shortly.</p></div></div></section>';
    });
  }
  load(true);
  setInterval(function () { if (!document.hidden) load(false); }, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(false); });

  // Header: border once scrolled and the phone menu.
  var header = document.querySelector('.site-header'), toggle = document.querySelector('.menu-toggle'), nav = document.getElementById('site-nav');
  window.addEventListener('scroll', function () { header.classList.toggle('scrolled', window.scrollY > 8); }, { passive: true });
  toggle.addEventListener('click', function () { var open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); } });
  var year = document.getElementById('year'); if (year) year.textContent = new Date().getFullYear();
})();
