// HN Group People: the public staff list, org charts and profiles, drawn from /api/people (live from the staff portal).
(function () {
  'use strict';
  var view = document.getElementById('view');
  var data = null, raw = '', query = '', company = '';
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
      '<span class="person-text"><strong class="person-name">' + esc(p.name) + '</strong>' +
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
    var nodes = list.map(function (p) { return { id: posKey(p), pos: p, parentId: p.reportsTo ? posKey(p.reportsTo) : null, outside: null }; });
    var ids = {}; nodes.forEach(function (n) { ids[n.id] = n; });
    nodes.forEach(function (n) { if (n.parentId && !ids[n.parentId]) { n.outside = n.pos.reportsTo; n.parentId = null; } });
    nodes.forEach(function (n) {
      var seen = {}, at = n;
      while (at && at.parentId) { if (seen[at.id]) { n.parentId = null; break; } seen[at.id] = true; at = ids[at.parentId]; }
    });
    return nodes;
  }
  function holderHtml(id) {
    var p = byId(id);
    return p ? link('/people/' + p.id, avatar(p, 'sm') + '<span class="org-name">' + esc(p.name) + '</span>', 'org-holder') : '';
  }
  function treeHtml(nodes, group) {
    var kids = {}, order = {};
    nodes.forEach(function (n, i) { order[n.id] = i; (kids[n.parentId || ''] = kids[n.parentId || ''] || []).push(n); });
    Object.keys(kids).forEach(function (k) { kids[k].sort(function (a, b) { return order[a.id] - order[b.id]; }); });
    function li(n) {
      var below = kids[n.id] || [], holders = n.pos.holders || [];
      return '<li><div class="org-node' + (holders.length ? '' : ' vacant') + '"><div class="org-pos"><strong>' + esc(n.pos.title) + '</strong>' +
        (group ? '<span class="org-co">' + esc(n.pos.company) + '</span>' : '') +
        (n.outside ? '<span class="org-outside">Reports to ' + esc(n.outside.title) + (n.outside.company !== n.pos.company ? ', ' + esc(n.outside.company) : '') + '</span>' : '') + '</div>' +
        (holders.length ? '<div class="org-holders">' + holders.map(holderHtml).join('') + '</div>' : '<div class="org-vacant">Vacant</div>') +
        '</div>' + (below.length ? '<ul>' + below.map(li).join('') + '</ul>' : '') + '</li>';
    }
    var roots = kids[''] || [];
    return roots.length ? '<div class="org-scroll" tabindex="0" aria-label="Org chart, scroll to see more"><ul class="org-tree">' + roots.map(li).join('') + '</ul></div>' : '<div class="empty card"><p>No positions are listed here yet.</p></div>';
  }
  function renderOrg(c) {
    setNav('org');
    var count = function (x) { return (data.positions || []).filter(function (p) { return p.company === x; }).length; };
    var tabs = '<nav class="tabs" aria-label="Org charts">' + link('/org', 'Whole group', !c ? 'tab active' : 'tab') +
      data.companies.filter(count).map(function (x) { return link('/org/' + slug(x), esc(x) + ' <span>' + count(x) + '</span>', c === x ? 'tab active' : 'tab'); }).join('') + '</nav>';
    var nodes = chartNodes(c), filled = nodes.filter(function (n) { return n.pos.holders.length; }).length;
    view.innerHTML = pageHead('Org charts', c ? esc(c) + '<span class="dot">.</span>' : 'The whole group<span class="dot">.</span>',
      (c ? 'Every position at ' + esc(c) + ' and who it reports to.' : 'Every position at HN Group and its companies in one chart.') + ' ' + filled + ' of ' + nodes.length + ' positions are filled.', '') +
      '<section class="section org-section"><div class="wrap">' + tabs + treeHtml(nodes, !c) + '<p class="muted small org-note">Select anyone to see their profile. Positions and reporting lines are set on the HN Group staff portal.</p></div></section>';
  }

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
      '<div><h1>' + esc(p.name) + '</h1><p class="lead">' + esc(title(r0)) + ' · ' + esc(r0.company) + '</p></div></div><div class="head-steps" data-hn-steps aria-hidden="true"></div></div></section>' +
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

  // Live from the staff portal: checked every minute and when the tab is shown again; redrawn only when something changed
  // (and never while someone is typing in the search box).
  function load(first) {
    return fetch('/api/people', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(); return r.text(); }).then(function (text) {
      var next = JSON.parse(text), key = JSON.stringify({ c: next.companies, p: next.people });
      if (key === raw) return;
      raw = key; data = next;
      var typing = document.activeElement && document.activeElement.id === 'q';
      if (first || !typing) render(); else document.getElementById('results').innerHTML = listResults();
    }).catch(function () {
      if (first) view.innerHTML = '<section class="section"><div class="wrap"><div class="empty card"><p>The staff list is temporarily unavailable. Please try again shortly.</p></div></div></section>';
    });
  }
  load(true);
  setInterval(function () { if (!document.hidden) load(false); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(false); });

  // Header: border once scrolled and the phone menu.
  var header = document.querySelector('.site-header'), toggle = document.querySelector('.menu-toggle'), nav = document.getElementById('site-nav');
  window.addEventListener('scroll', function () { header.classList.toggle('scrolled', window.scrollY > 8); }, { passive: true });
  toggle.addEventListener('click', function () { var open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); } });
  var year = document.getElementById('year'); if (year) year.textContent = new Date().getFullYear();
})();
