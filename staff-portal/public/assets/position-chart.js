/* Position chart adapted from HN Group People's renderer; authoritative data uses the same projection. */
(function () {
 'use strict';
 if(document.documentElement.dataset.hnApp)return;
 var view=null,data=null,context=null,selectedCompanies=[],chartScale=null,fittedScale=1,generation=0,refreshCurrent=null;
 var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
 var slug=function(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');};
 var byId=function(id){return data.people.find(function(p){return p.id===id;}) || null;};
 function setNav(){}
 function pageHead(eyebrow,title,lead,extra){return '<div class="portal-chart-heading"><h2>'+title+'</h2><p>'+lead+'</p>'+extra+'</div>';}
 function link(href,inner,cls,pressed){var company=data.companies.find(function(c){return href==='/org/'+slug(c);})||'';return '<button type="button" class="'+(cls||'')+'" data-chart-company="'+esc(company)+'" aria-pressed="'+!!pressed+'">'+inner+'</button>';}
  var positionLabel = function(p){return p.collective || p.kind === 'board' || p.board ? (p.company === 'Horizon Network' ? 'Board of Directors' : p.company + ' Board of Directors') : p.title;};
  var posKey = function (p) { return p.company + '\n' + String(p.title).toLowerCase(); };
 function normaliseCompanies(companies) {
    var selected = Array.isArray(companies) ? companies : (companies ? [companies] : []);
    return (data && data.companies || []).filter(function (company) { return selected.indexOf(company) >= 0; });
 }
 function companyKey(companies) { return companies.map(slug).join(',') || '*'; }
 function chartNodes(companies) {
    var list = (data.positions || []).filter(function (p) { return !companies.length || companies.indexOf(p.company) >= 0; });
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
    if (chartFilter) {
      var keep = {};
      nodes.forEach(function (n) {
        var holders = n.pos.holders || [];
        var match = chartFilter === 'filled' ? holders.length > 0 || n.pos.collective : chartFilter === 'vacant' ? !holders.length && !n.pos.collective : temporaryHolders(n.pos).length > 0;
        n.context = !match;
        if (match) { var at = n; while (at && !keep[at.id]) { keep[at.id] = true; at = ids[at.parentId]; } }
      });
      nodes = nodes.filter(function (n) { return keep[n.id]; });
    }
    return nodes;
  }
  // The chart sits in a panel with a toolbar: switch company, find a person or position, collapse/expand branches and
  // zoom (Fit by default; zoom out/in in 10% steps from 10% to 200%, 100%, Fit to screen; when zoomed, the chart scrolls
  // and its arrow keys move it). Zoom, scroll position and collapsed branches survive the live redraws.
  var CO_COLOURS = { 'HN Group': 'purple', 'Horizon Network': 'teal', 'Horizon Media Group': 'raspberry', 'Horizon Advertising': 'pink', 'Horizon Development': 'green' };
  var coClass = function (c) { return 'co-' + (CO_COLOURS[c] || 'lavender'); };
  var collapsed = {}, chartQuery = '', chartKey = '', chartFilter = '';
  var ICON_PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>';
  function temporaryHolders(pos){return Array.isArray(pos.temporaryHolders)?pos.temporaryHolders:(pos.holders||[]).filter(function(id){return byId(id)&&byId(id).temporary;});}
  function holderHtml(id, roleCompany, temporary) {
    var person=byId(id); if(!person)return '';
    var record=context.directory.byId[id];
    return '<button type="button" class="org-holder" data-org-person="'+esc(id)+'" data-profile-company="'+esc(roleCompany)+'">'+(record?context.avatar(record,'sm'):'<span class="avatar avatar-sm">'+esc(person.name.slice(0,1))+'</span>')+'<span class="org-who"><span class="org-name">'+esc(person.name)+'</span>'+(temporary?'<span class="temp-tag">Temporary</span>':'')+'</span></button>';
  }
  function treeHtml(nodes, group) {
    var kids = {}, order = {};
    nodes.forEach(function (n, i) { order[n.id] = i; (kids[n.parentId || ''] = kids[n.parentId || ''] || []).push(n); });
    Object.keys(kids).forEach(function (k) { kids[k].sort(function (a, b) { return order[a.id] - order[b.id]; }); });
    var count = function (n) { return (kids[n.id] || []).reduce(function (t, k) { return t + 1 + count(k); }, 0); };
    function li(n) {
      var below = kids[n.id] || [], holders = n.pos.holders || [], shut = !!collapsed[n.id], under = count(n);
      var names = holders.map(function (id) { var p = byId(id); return p ? p.name : ''; }).join(' ');
      return '<li' + (shut ? ' class="collapsed"' : '') + ' data-node="' + esc(n.id) + '"><div class="org-node ' + coClass(n.pos.company) + (holders.length || n.pos.collective ? '' : ' vacant') + (n.context ? ' org-context' : '') + '" data-find="' + esc((positionLabel(n.pos) + ' ' + n.pos.company + ' ' + names).toLowerCase()) + '">' +
        '<div class="org-pos"><strong>' + esc(positionLabel(n.pos)) + '</strong>' + (group ? '<span class="org-co"><i></i>' + esc(n.pos.company) + '</span>' : '') +
        (n.outside ? '<span class="org-outside">Reports to ' + esc(positionLabel(n.outside)) + (n.outside.company !== n.pos.company ? ', ' + esc(n.outside.company) : '') + '</span>' : '') + '</div>' +
        (n.pos.collective ? '' : holders.length ? '<div class="org-holders">' + holders.map(function (id) { return holderHtml(id,n.pos.company,temporaryHolders(n.pos).includes(id)); }).join('') + '</div>' : '<div class="org-vacant"><span class="org-empty">' + ICON_PERSON + '</span><span>'+(n.pos.collective?'Collective board':'Vacant')+'</span></div>') +
        (below.length ? '<button type="button" class="org-toggle" aria-expanded="' + !shut + '" aria-label="' + (shut ? 'Show' : 'Hide') + ' the ' + under + ' position' + (under === 1 ? '' : 's') + ' under ' + esc(positionLabel(n.pos)) + '"><span>' + under + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' : '') +
        '</div>' + (below.length ? '<ul>' + below.map(li).join('') + '</ul>' : '') + '</li>';
    }
    var roots = kids[''] || [];
    return roots.length ? '<div class="org-scroll" role="group" aria-label="Organisation chart. Use arrow keys, drag when zoomed, or pinch to zoom." tabindex="0"><div class="org-canvas"><ul class="org-tree">' + roots.map(li).join('') + '</ul></div></div>' : '<div class="empty card"><p>No positions are listed here yet.</p></div>';
  }
  function renderOrg(companies) {
    setNav('org');
    selectedCompanies = normaliseCompanies(companies);
    var key = companyKey(selectedCompanies), selectedOne = selectedCompanies.length === 1 ? selectedCompanies[0] : '';
    if (chartKey !== key) { chartKey = key; chartQuery = ''; }
    var previous = view.querySelector('.org-scroll'), left = previous ? previous.scrollLeft : 0, top = previous ? previous.scrollTop : 0;
    setTimeout(function () {
      fitChart();
      var box = view.querySelector('.org-scroll');
      if (box && chartScale !== null) { box.scrollLeft = left; box.scrollTop = top; }
    }, 0);
    var count = function (x) { return (data.positions || []).filter(function (p) { return p.company === x; }).length; };
    var nodes = chartNodes(selectedCompanies), filled = nodes.filter(function (n) { return n.pos.collective || n.pos.holders.length; }).length;
    var who = {}; nodes.forEach(function (n) { n.pos.holders.forEach(function (h) { who[h] = 1; }); });
    var stats = '<div class="org-stats"><span><b>' + nodes.length + '</b> positions</span><span><b>' + filled + '</b> filled</span><span><b>' + (nodes.length - filled) + '</b> vacant</span><span><b>' + Object.keys(who).length + '</b> people</span></div>';
    var tools = '<div class="org-tools"><label class="org-find"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="sr-only">Find a person or position</span><input type="search" id="org-q" placeholder="Find a person or position" autocomplete="off" value="' + esc(chartQuery) + '"><span class="org-hits" id="org-hits"></span></label>' +
      '<div class="org-btns"><button type="button" class="org-btn" data-branches="expand">Expand all</button><button type="button" class="org-btn" data-branches="collapse">Collapse all</button>' +
      '<div class="org-zoom" role="group" aria-label="Chart zoom"><button type="button" class="icon" data-zoom="out" aria-label="Zoom out">−</button><output id="org-scale" aria-live="polite">Fit</output><button type="button" class="icon" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="actual">100%</button><button type="button" data-zoom="fit">Fit to screen</button></div></div></div>';
    var legend = '<nav class="org-legend" aria-label="Org chart filters"><button type="button" data-org-everyone class="org-filter' + (!selectedCompanies.length && !chartFilter ? ' active' : '') + '" aria-pressed="' + (!selectedCompanies.length) + '">Everyone</button>' +
      ['filled', 'vacant'].map(function (f) { return '<button type="button" class="org-filter' + (chartFilter === f ? ' active' : '') + '" data-org-filter="' + f + '" aria-pressed="' + (chartFilter === f) + '">' + (f === 'temporary' ? '<span class="temp-tag">Temporary</span>' : '<i class="lg-' + f + '"></i>' + (f === 'filled' ? 'Filled' : 'Vacant')) + '</button>'; }).join('') +
      data.companies.filter(count).map(function (x) { var active = selectedCompanies.indexOf(x) >= 0; return link('/org/' + slug(x), '<i class="' + coClass(x) + '"></i>' + esc(x), 'org-filter' + (active ? ' active' : ''), active); }).join('') + '</nav>';
    var heading = selectedOne ? esc(selectedOne) + '<span class="dot">.</span>' : (selectedCompanies.length ? selectedCompanies.length + ' companies<span class="dot">.</span>' : 'The whole group<span class="dot">.</span>');
    var lead = selectedOne ? 'Every position at ' + esc(selectedOne) + ' and who it reports to.' : (selectedCompanies.length ? 'Every position across ' + selectedCompanies.map(esc).join(' and ') + '.' : 'Every position at HN Group and its companies in one chart.');
    view.innerHTML = pageHead('Org charts', heading, lead, stats) +
      '<section class="section org-section"><div class="wrap org-wrap">' + '<div class="org-panel">' + tools + legend + treeHtml(nodes, selectedCompanies.length !== 1) + '</div>' +
      '<p class="muted small org-note">Select anyone to see their profile. When zoomed in, scroll or use the chart’s arrow keys to move around. When filtering, supervisors remain visible to show reporting lines. Positions and reporting lines are maintained in HN Group HR.</p></div></section>';
    view.querySelectorAll('[data-zoom]').forEach(function (button) { button.addEventListener('click', function () {
      var action = button.dataset.zoom, current = chartScale === null ? fittedScale : chartScale;
      chartScale = action === 'fit' ? null : action === 'actual' ? 1 : Math.max(.1, Math.min(2, Math.round((current + (action === 'in' ? .1 : -.1)) * 100) / 100));
      fitChart();
    }); });
    view.querySelector('[data-org-everyone]').addEventListener('click', function () { chartFilter = ''; selectedCompanies=[]; context.onCompany([]); renderOrg([]); });
    view.querySelectorAll('[data-org-filter]').forEach(function (button) { button.addEventListener('click', function () {
      chartFilter = chartFilter === button.dataset.orgFilter ? '' : button.dataset.orgFilter;
      renderOrg(selectedCompanies);
    }); });
    view.querySelectorAll('[data-chart-company]').forEach(function (button) { button.addEventListener('click',function () { var company=button.dataset.chartCompany; selectedCompanies=selectedCompanies.indexOf(company)>=0?selectedCompanies.filter(function(item){return item!==company;}):selectedCompanies.concat(company); context.onCompany(selectedCompanies.slice()); renderOrg(selectedCompanies); }); });
    view.querySelectorAll('[data-org-person]').forEach(function (button) { button.addEventListener('click',function () { context.onPerson(button.dataset.orgPerson,button.dataset.profileCompany); }); });
    wireChart();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const panel=view.querySelector('.org-scroll');
      if(panel)panel.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'cubic-bezier(.2,.7,.2,1)'});
    }
  }
  function wireChart() {
    var box = view.querySelector('.org-scroll'); if (!box) return;
    wirePan(box);
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
  window.addEventListener('resize',function () { if(view && view.isConnected)fitChart(); });


 function wirePan(box){
  var drag=null,moved=false,pointers={};
  box.addEventListener('keydown',function(e){if(e.target!==box)return;var steps={ArrowLeft:[-90,0],ArrowRight:[90,0],ArrowUp:[0,-90],ArrowDown:[0,90]};if(steps[e.key]){e.preventDefault();box.scrollBy(steps[e.key][0],steps[e.key][1]);}});
  function points(){return Object.keys(pointers).map(function(key){return pointers[key];});}
  box.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse'&&e.button!==0)return;if(e.target.closest('button,a,input'))return;pointers[e.pointerId]={x:e.clientX,y:e.clientY};if(e.pointerType==='touch'&&points().length===2){var pair=points();drag={pinch:true,distance:Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y),scale:chartScale===null?fittedScale:chartScale};box.setPointerCapture(e.pointerId);return;}drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:box.scrollLeft,top:box.scrollTop};moved=false;});
  box.addEventListener('pointermove',function(e){if(pointers[e.pointerId]){pointers[e.pointerId]={x:e.clientX,y:e.clientY};}if(!drag)return;if(drag.pinch){var pair=points();if(pair.length<2)return;var distance=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);if(Math.abs(distance-drag.distance)<4)return;chartScale=Math.max(.1,Math.min(2,Math.round(drag.scale*(distance/drag.distance)*100)/100));moved=true;box.classList.add('dragging');fitChart();return;}if(drag.id!==e.pointerId)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!moved&&Math.abs(dx)+Math.abs(dy)<5)return;moved=true;box.setPointerCapture(e.pointerId);box.scrollLeft=drag.left-dx;box.scrollTop=drag.top-dy;box.classList.add('dragging');});
  var end=function(e){delete pointers[e.pointerId];if(drag&&(drag.id===e.pointerId||drag.pinch))drag=null;box.classList.remove('dragging');};box.addEventListener('pointerup',end);box.addEventListener('pointercancel',end);
  box.addEventListener('click',function(e){if(moved){e.preventDefault();e.stopImmediatePropagation();moved=false;}},true);
 }
 function clean(input){return {...input,companies:input.companies.filter(window.HNPortal.companyVisible),positions:input.positions.filter(function(p){return window.HNPortal.companyVisible(p.company);})};}
 async function mount(target,ctx){
  var token=++generation;
  view=target;context=ctx;selectedCompanies=ctx.companies|| (Array.isArray(ctx.company)?ctx.company:(ctx.company?[ctx.company]:[]));view.classList.add('portal-position-chart');
  target.innerHTML='<div class="loading" role="status">Loading live positions and reporting lines…</div>';
  try{var next=clean(await ctx.api('/api/org-chart'));if(view!==target||generation!==token||!ctx.current())return;data=next;renderOrg(selectedCompanies);if(document.fonts)document.fonts.ready.then(function(){if(view===target&&generation===token&&ctx.current())fitChart();});}
  catch(error){if(view===target&&generation===token&&ctx.current()){target.innerHTML='<div class="empty"><p>'+esc(error.message)+'</p><button class="btn btn-ghost" type="button">Try again</button></div>';target.querySelector('button').onclick=function(){mount(target,ctx);};}return;}
  var signature=JSON.stringify(data);
  async function refresh(schedule=true){if(view!==target||generation!==token||!ctx.current()||!target.isConnected)return;try{if(!document.hidden){var next=clean(await ctx.api('/api/org-chart'));if(view!==target||generation!==token||!ctx.current())return;var raw=JSON.stringify(next);if(raw!==signature){signature=raw;data=next;renderOrg(selectedCompanies);}}}catch(error){/* Keep the last authorized public chart on a transient network failure. */}if(schedule)setTimeout(refresh,15000);}
  refreshCurrent=()=>refresh(false);
  setTimeout(refresh,15000);
 }
 window.HNOrgChart={mount:mount,refresh:async()=>{if(refreshCurrent)await refreshCurrent();}};
})();
