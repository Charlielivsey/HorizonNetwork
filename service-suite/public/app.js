'use strict';
// HN Group service website front-end. All content is built with DOM APIs (no HTML strings from data).
(() => {
  const $ = s => document.querySelector(s);
  const main = $('#main');
  let site = null, staff = null, account = null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- helpers ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }
  async function api(path, opts = {}) {
    const init = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: {} };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    let res;
    try { res = await fetch(path, init); } catch { throw new Error('Connection problem. Check your internet connection and try again.'); }
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
    return data;
  }
  function toast(message, tone = 'ok') { const t = $('#toast'); t.textContent = message; t.dataset.tone = tone; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 4200); }
  const tz = { timeZone: 'Europe/London' };
  const fmtDate = v => { if (!v) return ''; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00Z' : v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...tz }); };
  const fmtWhen = v => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...tz }); };
  const fmtPence = v => v === '' || v === null || v === undefined ? '' : '£' + (Number(v) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPounds = v => v === '' || v === null || v === undefined ? '' : '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function readFile(file) { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok({ name: file.name, data: String(r.result).split(',')[1] || '' }); r.onerror = () => no(new Error('That file could not be read.')); r.readAsDataURL(file); }); }
  const params = () => new URLSearchParams(location.hash.split('?')[1] || '');
  const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
  const mod = key => site.modules.find(m => m.key === key);
  const errorBox = () => h('p', { class: 'form-error', role: 'alert', hidden: true });
  function showError(box, e) { box.textContent = e.message; box.hidden = false; box.focus?.(); }
  function busy(button, on) { if (!button) return; button.disabled = on; button.setAttribute('aria-busy', on ? 'true' : 'false'); }
  function copyButton(value, label = 'Copy') { return h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(value); toast('Copied.'); } catch { toast('Select and copy it manually.', 'warn'); } } }, label); }
  function chip(text, tone) { return h('span', { class: 'chip' + (tone ? ' tone-' + tone : '') }, text); }
  function statusChip(m, id) { const s = (m.statuses || []).find(x => x.id === id); return chip(s?.label || id || '', s?.tone || toneFor(id)); }
  function toneFor(id) { return /approv|confirm|complete|resolved|operational|signed|paid|valid|done|accepted|published|active|live|received|won/.test(id || '') ? 'good' : /reject|declin|cancel|outage|void|expired|closed|withdrawn/.test(id || '') ? 'bad' : /pending|review|progress|submitted|sent|degraded|investigat|monitor|expiring|new|requested|open|planned|waiting|identified/.test(id || '') ? 'info' : ''; }
  function link(url, text) { try { const u = new URL(url); if (!['https:', 'http:'].includes(u.protocol)) return text || url; return h('a', { href: u.href, rel: 'noopener noreferrer', target: '_blank' }, text || u.host + u.pathname.replace(/\/$/, '')); } catch { return text || url; } }
  function display(f, v) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null;
    switch (f.type) {
      case 'money': return fmtPence(v);
      case 'date': return fmtDate(v);
      case 'datetime': return fmtWhen(v);
      case 'checkbox': return v ? 'Yes' : 'No';
      case 'url': return link(v);
      case 'select': return (f.options || []).map(o => typeof o === 'string' ? { value: o, label: o } : o).find(o => o.value === v)?.label || v;
      case 'multiselect': return v.map(x => (f.options || []).map(o => typeof o === 'string' ? { value: o, label: o } : o).find(o => o.value === x)?.label || x).join(', ');
      case 'user': return userName(v);
      case 'account': return accountName(v);
      default: return String(v);
    }
  }
  let usersCache = null, accountsCache = null;
  const userName = id => usersCache?.find(u => u.id === id)?.name || 'Staff member';
  const accountName = id => accountsCache?.find(a => a.id === id)?.name || 'Account';
  async function loadUsers() { if (staff && !usersCache) usersCache = (await api('/api/users')).users; return usersCache || []; }
  async function loadAccounts() { if (staff && site.accounts && !accountsCache) { try { accountsCache = (await api('/api/account/list')).accounts; } catch { accountsCache = []; } } return accountsCache || []; }
  function paragraphs(text) { return String(text || '').split(/\n{2,}/).map(p => h('p', {}, ...p.split('\n').flatMap((line, i) => i ? [h('br'), line] : [line]))); }
  function section(title, ...kids) { return h('section', { class: 'panel reveal' }, title ? h('h2', {}, title) : null, ...kids); }
  function pageHead(eyebrow, title, lead, ...actions) { return h('div', { class: 'page-head reveal' }, h('div', {}, eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null, h('h1', {}, title), lead ? h('p', { class: 'lead' }, lead) : null), actions.length ? h('div', { class: 'head-actions' }, ...actions) : null); }
  function empty(text, ...actions) { return h('div', { class: 'empty reveal' }, h('p', {}, text), ...actions); }
  function canSeeModule(m) {
    if (m.hidden) return false;
    if (m.type === 'items') return m.view === 'public' || m.create === 'public' || (m.view === 'members' && (account?.member || staff)) || (m.view === 'account' && (account || staff)) || (['staff', 'admin'].includes(m.view) && staff) || (m.create === 'account' && true);
    if (['bridge', 'sign', 'health'].includes(m.type)) return !!staff;
    return !m.staffOnly || !!staff;
  }
  function moduleHref(m) { return { items: '#/m/', builder: '#/b/', forum: '#/forum/', status: '#/status/', health: '#/health/', sign: '#/signing/', bridge: '#/bridge/' }[m.type] + m.key; }

  // ---------- layout ----------
  function logo(dark) {
    const file = site.logo + (dark ? '-white' : '');
    return h('img', { src: `/assets/brand/${file}.svg`, alt: dark ? '' : site.brand || 'HN Group', class: 'logo ' + (dark ? 'on-dark' : 'on-light'), width: 132, height: 36 });
  }
  function header() {
    const nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, ...site.modules.filter(m => m.nav !== false && canSeeModule(m)).map(m => h('a', { href: moduleHref(m) }, m.nav || m.title)),
      site.brandkit ? h('a', { href: '#/brand' }, 'Logos & assets') : null, site.tools ? h('a', { href: '#/tools' }, 'Tools') : null);
    const tools = h('div', { class: 'header-tools' },
      site.accounts ? (account ? h('a', { class: 'btn ghost small', href: '#/account' }, account.name) : h('a', { class: 'btn ghost small', href: '#/account' }, 'Sign in')) : null,
      staff ? h('a', { class: 'btn small', href: '#/staff' }, staff.admin ? 'Manage' : 'Staff') : h('a', { class: 'btn small', href: '/admin' }, 'Staff sign in'));
    const toggle = h('button', { class: 'menu-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'menu', onclick: () => { const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); menu.classList.toggle('open', open); } }, h('span', { class: 'sr-only' }, 'Menu'), h('span', { 'aria-hidden': 'true' }), h('span', { 'aria-hidden': 'true' }), h('span', { 'aria-hidden': 'true' }));
    const menu = h('div', { class: 'menu', id: 'menu' }, nav, tools);
    $('#header').replaceChildren(h('div', { class: 'wrap header-inner' }, h('a', { class: 'brand', href: '#/', 'aria-label': site.name + ' home' }, logo(false), logo(true), h('span', { class: 'brand-name' }, site.name.replace(/^HN Group |^Horizon Network /, ''))), toggle, menu));
  }
  function footer() {
    const f = site.footer || {};
    $('#footer').replaceChildren(h('div', { class: 'wrap footer-inner' },
      h('div', {}, logo(true), h('p', { class: 'small' }, f.text || ''), f.ownership ? h('p', { class: 'small muted' }, f.ownership) : null),
      h('nav', { 'aria-label': 'Footer' }, ...(f.links || []).map(l => link(l.url, l.label)), site.privacy ? link(site.privacy, 'Privacy') : null),
      h('p', { class: 'small copyright' }, '© ' + new Date().getFullYear() + ' ' + (f.copyright || 'HN Group Limited') + '. All rights reserved.')));
  }
  function view(...kids) {
    const wrap = h('div', { class: 'wrap view' }, ...kids);
    main.replaceChildren(wrap);
    main.setAttribute('aria-busy', 'false');
    if (!reduced()) requestAnimationFrame(() => wrap.querySelectorAll('.reveal').forEach((el, i) => setTimeout(() => el.classList.add('in'), Math.min(i, 8) * 45)));
    else wrap.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    const heading = wrap.querySelector('h1');
    if (heading) document.title = heading.textContent + ' · ' + site.name;
  }
  function needStaff(message) {
    return view(pageHead(site.brand, 'Staff sign in required', message || 'This area is for HN Group staff. Sign in with your staff account through HN Group Auth.'), h('p', {}, h('a', { class: 'btn', href: '/admin' }, 'Sign in with HN Group Auth')));
  }
  function failure(e) {
    if (e.status === 401 && !staff && !account) return needStaff(e.message);
    view(pageHead('', e.status === 404 ? 'Not found' : 'Something went wrong', e.message), h('p', {}, h('a', { class: 'btn ghost', href: '#/' }, 'Back to home')));
  }

  // ---------- home ----------
  function home() {
    if (site.staffOnly && !staff) return needStaff(site.hero?.lead);
    const visible = site.modules.filter(m => canSeeModule(m) && m.card !== false);
    view(
      h('section', { class: 'hero reveal' }, h('div', { class: 'glow g1', 'aria-hidden': 'true' }), h('div', { class: 'glow g2', 'aria-hidden': 'true' }),
        h('p', { class: 'eyebrow' }, site.hero?.eyebrow || site.brand), h('h1', {}, site.hero?.title || site.name), h('p', { class: 'lead' }, site.hero?.lead || ''),
        h('div', { class: 'hero-actions' }, ...(site.hero?.actions || []).filter(a => !a.staff || staff).map((a, i) => h('a', { class: 'btn' + (i ? ' ghost' : ''), href: a.href }, a.label)))),
      ...site.notices.map(n => h('div', { class: 'notice reveal', role: 'note' }, h('strong', {}, n.title), ' ', n.text)),
      visible.length ? h('div', { class: 'cards reveal' }, ...visible.map(m => h('a', { class: 'card', href: moduleHref(m) }, h('h2', {}, m.title), h('p', {}, m.intro || ''), h('span', { class: 'card-link' }, m.cardCta || 'Open')))) : null,
      ...site.sections.map(s => h('section', { class: 'panel reveal' }, s.eyebrow ? h('p', { class: 'eyebrow' }, s.eyebrow) : null, h('h2', {}, s.title), ...paragraphs(s.text), s.points ? h('ul', { class: 'ticks' }, ...s.points.map(p => h('li', {}, p))) : null, s.link ? h('p', {}, link(s.link.url, s.link.label)) : null)),
      Object.keys(site.providers).length ? providersPanel() : null,
      site.related.length ? h('section', { class: 'panel reveal' }, h('h2', {}, 'Related'), h('ul', { class: 'related' }, ...site.related.map(r => h('li', {}, link(r.url, r.label), r.text ? h('span', { class: 'muted' }, ' — ' + r.text) : null)))) : null);
  }
  function providersPanel() {
    return h('section', { class: 'panel reveal' }, h('h2', {}, 'Integrations'),
      h('ul', { class: 'providers' }, ...Object.values(site.providers).map(p => h('li', {}, h('div', {}, h('strong', {}, p.label), h('p', { class: 'small muted' }, p.note || '')), chip(p.status === 'configured' ? 'Connected' : 'Awaiting configuration', p.status === 'configured' ? 'good' : 'warn')))));
  }

  // ---------- generic form fields ----------
  async function fieldInput(f, value, idPrefix) {
    const id = idPrefix + f.name;
    const label = h('label', { for: id }, f.label || f.name, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null);
    const help = f.help ? h('p', { class: 'help', id: id + '-help' }, f.help) : null;
    const common = { id, name: f.name, required: f.required, 'aria-describedby': f.help ? id + '-help' : null };
    let input;
    const options = (f.options || []).map(o => typeof o === 'string' ? { value: o, label: o } : o);
    switch (f.type) {
      case 'textarea': input = h('textarea', { ...common, rows: f.rows || 5, maxlength: f.max || 10000 }); input.value = value ?? ''; break;
      case 'select': input = h('select', common, h('option', { value: '' }, f.required ? 'Choose…' : '—'), ...options.map(o => h('option', { value: o.value }, o.label))); input.value = value ?? ''; break;
      case 'multiselect': {
        const box = h('fieldset', { class: 'checks', id }, h('legend', {}, f.label), ...options.map(o => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: o.value, checked: (value || []).includes(o.value) }), o.label)));
        box.read = () => [...box.querySelectorAll('input:checked')].map(i => i.value);
        return h('div', { class: 'field' }, box, help);
      }
      case 'checkbox': { input = h('input', { ...common, type: 'checkbox', checked: !!value }); return h('div', { class: 'field check-field' }, h('label', { class: 'check', for: id }, input, f.label), help); }
      case 'money': input = h('input', { ...common, inputmode: 'decimal', pattern: '\\d+(\\.\\d{1,2})?', placeholder: '0.00' }); input.value = value === '' || value === undefined || value === null ? '' : (Number(value) / 100).toFixed(2); break;
      case 'number': input = h('input', { ...common, type: 'number', min: f.min, max: f.max, step: f.integer === false ? 'any' : 1 }); input.value = value ?? ''; break;
      case 'date': case 'time': case 'email': case 'url': input = h('input', { ...common, type: f.type }); input.value = value ?? ''; break;
      case 'datetime': input = h('input', { ...common, type: 'datetime-local' }); input.value = value ?? ''; break;
      case 'user': { const users = await loadUsers(); input = h('select', common, h('option', { value: '' }, '—'), ...users.map(u => h('option', { value: u.id }, u.name))); input.value = value ?? ''; break; }
      case 'account': { const list = await loadAccounts(); input = h('select', common, h('option', { value: '' }, 'Choose…'), ...list.filter(a => !a.disabled).map(a => h('option', { value: a.id }, `${a.name} (${a.email})`))); input.value = value ?? ''; break; }
      case 'item': { let list = []; try { list = (await api('/api/m/' + f.of)).items; } catch {} input = h('select', common, h('option', { value: '' }, 'Choose…'), ...list.map(i => h('option', { value: i.id }, i.fields.title || i.fields.name || i.id))); input.value = value ?? ''; break; }
      default: input = h('input', { ...common, type: 'text', maxlength: f.max || 200, autocomplete: f.autocomplete || null }); input.value = value ?? '';
    }
    return h('div', { class: 'field' + (f.wide || f.type === 'textarea' ? ' wide' : '') }, label, input, help);
  }
  function readFields(form, fields) {
    const out = {};
    for (const f of fields) {
      if (f.readonly) continue;
      if (f.type === 'multiselect') { out[f.name] = form.querySelector('#' + CSS.escape(form.dataset.prefix + f.name)).read(); continue; }
      const el = form.querySelector('[name="' + f.name + '"]');
      if (!el) continue;
      out[f.name] = f.type === 'checkbox' ? el.checked : el.value;
    }
    return out;
  }
  async function fieldGrid(fields, values, prefix) { const grid = h('div', { class: 'grid-fields' }); for (const f of fields) grid.append(await fieldInput(f, values?.[f.name], prefix)); return grid; }

  // ---------- items ----------
  async function itemsList(m) {
    let data;
    try { data = await api('/api/m/' + m.key); } catch (e) { return failure(e); }
    if (m.fields.some(f => f.type === 'user')) await loadUsers().catch(() => {});
    if (m.fields.some(f => f.type === 'account')) await loadAccounts();
    const filters = m.fields.filter(f => f.filter && f.type === 'select');
    const search = h('input', { type: 'search', placeholder: 'Search ' + m.title.toLowerCase(), 'aria-label': 'Search ' + m.title });
    const selects = filters.map(f => { const s = h('select', { 'aria-label': f.label }, h('option', { value: '' }, 'All ' + f.label.toLowerCase()), ...(f.options || []).map(o => typeof o === 'string' ? { value: o, label: o } : o).map(o => h('option', { value: o.value }, o.label))); s.dataset.field = f.name; return s; });
    const statusFilter = data.manager && m.statuses?.length ? h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'All statuses'), ...m.statuses.map(s => h('option', { value: s.id }, s.label))) : null;
    const list = h('div', { class: (m.display || 'cards') === 'table' ? 'rows' : 'cards' });
    const count = h('p', { class: 'small muted', 'aria-live': 'polite' });
    const listFields = (m.listFields || []).map(n => m.fields.find(f => f.name === n)).filter(Boolean);
    function draw() {
      const q = search.value.trim().toLowerCase();
      const shown = data.items.filter(i => (!q || JSON.stringify(i.fields).toLowerCase().includes(q)) && selects.every(s => !s.value || i.fields[s.dataset.field] === s.value) && (!statusFilter?.value || i.status === statusFilter.value));
      count.textContent = shown.length + (shown.length === 1 ? ' ' + (m.singular || 'item') : ' ' + (m.plural || m.title.toLowerCase()));
      list.replaceChildren(...shown.map(i => {
        const title = i.fields.title || i.fields.name || i.fields.subject || m.singular;
        return h('a', { class: 'card item', href: `#/m/${m.key}/${i.id}` },
          h('div', { class: 'item-top' }, h('h2', {}, title), m.statuses?.length && (data.manager || i.mine || m.showStatus) ? statusChip(m, i.status) : null, data.manager && m.publish ? chip(i.published ? (i.visibility === 'public' ? 'Published' : 'Published · ' + i.visibility) : 'Draft', i.published ? 'good' : '') : null),
          i.fields.summary ? h('p', {}, i.fields.summary) : null,
          h('dl', { class: 'meta' }, ...listFields.flatMap(f => { const v = display(f, i.fields[f.name]); return v === null ? [] : [h('dt', {}, f.label), h('dd', {}, v)]; })),
          i.parentTitle ? h('p', { class: 'small muted' }, (m.parent?.label || 'For') + ': ' + i.parentTitle) : null,
          h('p', { class: 'small muted' }, data.manager && i.createdBy ? 'From ' + i.createdBy.name + ' · ' : '', 'Updated ' + fmtDate(i.updatedAt)));
      }));
      if (!shown.length) list.replaceChildren(empty(data.items.length ? 'Nothing matches your search.' : (m.empty || 'Nothing here yet.')));
    }
    [search, ...selects, statusFilter].filter(Boolean).forEach(el => el.addEventListener('input', draw));
    const actions = [];
    if (data.canCreate && !m.parent) actions.push(h('a', { class: 'btn', href: `#/m/${m.key}/new` }, m.cta || 'Add ' + (m.singular || 'item')));
    if (data.manager && !m.private) actions.push(h('a', { class: 'btn ghost', href: `/api/m/${m.key}/export.csv` }, 'Export CSV'));
    if (m.reference) actions.push(h('a', { class: 'btn ghost', href: '#/ref' }, 'Check a reference'));
    view(pageHead(site.brand, m.title, m.intro, ...actions),
      m.notice ? h('div', { class: 'notice reveal', role: 'note' }, m.notice) : null,
      (data.items.length > 3 || filters.length) ? h('div', { class: 'toolbar reveal' }, search, ...selects, statusFilter) : null,
      count, list,
      !data.manager && !data.items.length && m.create === 'public' && !m.parent ? null : null);
    draw();
  }

  async function itemForm(m, item) {
    const p = params();
    const parentKey = m.parent?.module, parentId = item?.parentId || p.get('parent');
    let parent = null;
    if (parentKey && parentId) { try { parent = (await api(`/api/m/${parentKey}/${parentId}`)).item; } catch {} }
    let fieldsDef = m.fields;
    let manager = false;
    try { const meta = await api('/api/m/' + m.key); fieldsDef = meta.fields; manager = meta.manager; if (!item && !meta.canCreate) throw Object.assign(new Error(m.create === 'account' ? 'Sign in to your account to continue.' : 'You do not have permission to add this.'), { status: staff || account ? 403 : 401 }); }
    catch (e) { if (e.status === 401 && m.create === 'account') return go('#/account?next=' + encodeURIComponent(location.hash)); return failure(e); }
    const prefix = 'f-' + m.key + '-';
    const form = h('form', { class: 'panel form reveal', novalidate: true, dataset: { prefix } });
    const err = errorBox();
    const editable = fieldsDef.filter(f => !f.readonly && !(m.slots && ['date', 'time'].includes(f.name)));
    form.append(err);
    if (parentKey && !item) {
      if (parent) form.append(h('p', { class: 'parent-note' }, (m.parent.label || 'For') + ': ', h('strong', {}, parent.fields.title || parent.fields.name)));
      else {
        let options = [];
        try { options = (await api('/api/m/' + parentKey)).items; } catch {}
        const select = h('select', { id: prefix + 'parent', name: '__parent', required: true }, h('option', { value: '' }, 'Choose…'), ...options.map(o => h('option', { value: o.id }, o.fields.title || o.fields.name)));
        form.append(h('div', { class: 'field' }, h('label', { for: prefix + 'parent' }, m.parent.label || 'Choose'), select));
        if (!options.length) form.append(h('p', { class: 'notice' }, mod(parentKey).empty || 'Nothing is open right now.'));
      }
    }
    let slotState = null;
    if (m.slots && !item) slotState = slotPicker(m, () => parent?.id || form.querySelector('[name="__parent"]')?.value);
    if (slotState) form.append(slotState.el);
    form.append(await fieldGrid(editable, item?.fields, prefix));
    let fileInput = null;
    if (m.files && !item && (manager || m.files === 'creator')) { fileInput = h('input', { type: 'file', id: prefix + 'file', accept: m.accept || null }); form.append(h('div', { class: 'field' }, h('label', { for: prefix + 'file' }, m.fileLabel || 'Attach a file (optional)'), fileInput)); }
    let published = null, visibility = null;
    if (m.publish && manager) {
      published = h('input', { type: 'checkbox', id: prefix + 'published', checked: item ? item.published : false });
      visibility = h('select', { id: prefix + 'visibility' }, h('option', { value: 'public' }, 'Everyone'), m.membersVisibility ? h('option', { value: 'members' }, 'Members only') : null, h('option', { value: 'staff' }, 'Staff only'));
      visibility.value = item?.visibility || m.defaultVisibility || 'public';
      form.append(h('div', { class: 'field-row' }, h('label', { class: 'check', for: prefix + 'published' }, published, 'Published'), h('div', { class: 'field' }, h('label', { for: prefix + 'visibility' }, 'Visible to'), visibility)));
    }
    const consent = !item && !staff && !account && m.consent ? h('input', { type: 'checkbox', id: prefix + 'consent', required: true }) : null;
    if (consent) form.append(h('div', { class: 'field check-field' }, h('label', { class: 'check', for: prefix + 'consent' }, consent, m.consent)));
    const honey = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' });
    form.append(honey);
    const submit = h('button', { class: 'btn', type: 'submit' }, item ? 'Save changes' : (m.submitLabel || 'Submit'));
    form.append(h('div', { class: 'form-actions' }, submit, h('a', { class: 'btn ghost', href: item ? `#/m/${m.key}/${item.id}` : (parent ? `#/m/${parentKey}/${parent.id}` : `#/m/${m.key}`) }, 'Cancel')));
    form.addEventListener('submit', async ev => {
      ev.preventDefault(); err.hidden = true; busy(submit, true);
      try {
        const fields = readFields(form, editable);
        if (slotState) { if (!slotState.value()) throw new Error('Choose a date and time.'); Object.assign(fields, slotState.value()); }
        else if (item && m.slots) Object.assign(fields, { date: item.fields.date, time: item.fields.time });
        const payload = { fields, website: honey.value };
        if (parentKey) payload.parentId = parent?.id || form.querySelector('[name="__parent"]')?.value || item?.parentId;
        if (published) { payload.published = published.checked; payload.visibility = visibility.value; }
        if (consent) payload.consent = consent.checked;
        if (fileInput?.files[0]) { if (fileInput.files[0].size > 10 * 1048576) throw new Error('Files must be 10 MB or smaller.'); payload.file = await readFile(fileInput.files[0]); }
        const result = await api(item ? `/api/m/${m.key}/${item.id}` : `/api/m/${m.key}`, { body: payload });
        if (result.reference) return referenceIssued(m, result.reference);
        toast(item ? 'Saved.' : (m.successText || 'Submitted.'));
        go(`#/m/${m.key}/${result.item.id}`);
      } catch (e) { showError(err, e); } finally { busy(submit, false); }
    });
    view(pageHead(site.brand, item ? 'Edit ' + (m.singular || 'item') : (m.formTitle || m.cta || 'New ' + (m.singular || 'item')), item ? '' : m.formIntro), form);
  }

  function slotPicker(m, typeId) {
    const date = h('input', { type: 'date', id: 'slot-date', required: true });
    const times = h('div', { class: 'slots', role: 'radiogroup', 'aria-label': 'Available times' });
    const msg = h('p', { class: 'small muted', 'aria-live': 'polite' }, 'Choose a date to see available times (UK time).');
    let chosen = null;
    async function load() {
      chosen = null; times.replaceChildren();
      const t = typeId();
      if (!t || !date.value) return;
      msg.textContent = 'Checking availability…';
      try {
        const r = await api(`/api/slots/${m.key}/${t}?date=${date.value}`);
        msg.textContent = r.slots.length ? `${r.slots.length} available · ${r.duration} minutes · UK time` : 'No times are available on this date. Try another day.';
        times.replaceChildren(...r.slots.map(s => { const b = h('button', { type: 'button', class: 'slot', role: 'radio', 'aria-checked': 'false', onclick: () => { chosen = s; times.querySelectorAll('.slot').forEach(x => x.setAttribute('aria-checked', String(x === b))); } }, s); return b; }));
      } catch (e) { msg.textContent = e.message; }
    }
    date.addEventListener('change', load);
    setTimeout(() => { const sel = document.querySelector('[name="__parent"]'); sel?.addEventListener('change', load); }, 0);
    const el = h('fieldset', { class: 'slot-picker' }, h('legend', {}, 'Date and time'), h('div', { class: 'field' }, h('label', { for: 'slot-date' }, 'Date'), date), msg, times);
    return { el, value: () => chosen && date.value ? { date: date.value, time: chosen } : null };
  }

  function referenceIssued(m, reference) {
    view(pageHead(site.brand, m.successTitle || 'Thank you', m.successText || 'We have received your submission.'),
      section('Your private reference', h('p', {}, 'Keep this reference safe. It is the only way to check progress and read replies here. Anyone who has it can view this submission, so do not share it publicly.'),
        h('div', { class: 'reference' }, h('code', {}, reference), copyButton(reference)),
        site.notices.some(n => n.email === false) ? null : h('p', { class: 'small muted' }, 'We do not send email notifications from this website. Check back here using your reference.'),
        h('p', {}, h('a', { class: 'btn', href: '#/ref' }, 'Check progress'))));
  }

  async function itemDetail(m, itemId) {
    let data;
    try { data = await api(`/api/m/${m.key}/${itemId}`); } catch (e) { return failure(e); }
    const i = data.item;
    if (m.fields.some(f => f.type === 'user')) await loadUsers().catch(() => {});
    if (m.fields.some(f => f.type === 'account')) await loadAccounts();
    const title = i.fields.title || i.fields.name || i.fields.subject || m.singular;
    const shownFields = m.fields.filter(f => !['title', 'body'].includes(f.name) && !(f.name === 'summary' && !i.can.edit));
    const actions = [];
    if (i.can.edit) actions.push(h('a', { class: 'btn ghost', href: `#/m/${m.key}/${i.id}/edit` }, 'Edit'));
    const children = site.modules.filter(c => c.type === 'items' && c.parent?.module === m.key && c.parent.cta);
    for (const c of children) {
      const closes = i.fields[c.parent.closes || 'closes'];
      const closed = (closes && closes < new Date().toISOString().slice(0, closes.length > 10 ? 16 : 10)) || i.fields.open === false || (Number(i.fields[c.parent.capacity || 'capacity']) > 0 && i.taken >= Number(i.fields[c.parent.capacity || 'capacity']));
      if (!closed && (c.create === 'public' || (c.create === 'account' && (account || staff)) || (c.create === 'staff' && staff))) actions.push(h('a', { class: 'btn', href: `#/m/${c.key}/new?parent=${i.id}` }, c.parent.cta));
      else if (!closed && c.create === 'account') actions.push(h('a', { class: 'btn', href: '#/account?next=' + encodeURIComponent(`#/m/${c.key}/new?parent=${i.id}`) }, 'Sign in to ' + c.parent.cta.toLowerCase()));
      else if (closed) actions.push(chip('Closed', 'bad'));
    }
    const body = h('article', { class: 'panel reveal detail' },
      h('div', { class: 'item-top' }, m.statuses?.length && (data.history || i.mine || m.showStatus) ? statusChip(m, i.status) : null, m.publish && data.history ? chip(i.published ? 'Published' : 'Draft', i.published ? 'good' : '') : null, i.parentTitle ? chip((m.parent?.label || 'For') + ': ' + i.parentTitle) : null),
      i.fields.summary && !i.can.edit ? h('p', { class: 'lead' }, i.fields.summary) : null,
      h('dl', { class: 'meta wide' }, ...shownFields.flatMap(f => { const v = display(f, i.fields[f.name]); return v === null ? [] : [h('dt', {}, f.label), h('dd', {}, f.type === 'textarea' ? paragraphs(v) : v)]; })),
      i.fields.body ? h('div', { class: 'prose' }, ...paragraphs(i.fields.body)) : null,
      i.taken !== undefined && i.fields.capacity ? h('p', { class: 'small muted' }, `${Math.max(0, Number(i.fields.capacity) - i.taken)} of ${i.fields.capacity} places left`) : null,
      i.createdBy && data.history ? h('p', { class: 'small muted' }, 'Submitted by ' + i.createdBy.name + ' (' + i.createdBy.type + ') · ' + fmtWhen(i.createdAt)) : h('p', { class: 'small muted' }, 'Updated ' + fmtDate(i.updatedAt)));
    const extra = [];
    if (i.files?.length || i.can.upload) extra.push(filesPanel(m, i));
    if (m.completion && staff) extra.push(completionPanel(m, i));
    if (i.can.status?.length) extra.push(statusPanel(m, i));
    if (m.portalBill && data.history && ['approved', 'ordered', 'received'].includes(i.status)) extra.push(portalBillPanel(m, i));
    if (m.invite && data.history) extra.push(invitePanel(m, i));
    if (m.comments && (i.comments || i.can.comment)) extra.push(commentsPanel(m, i));
    if (data.history) extra.push(h('details', { class: 'panel reveal' }, h('summary', {}, 'History'), h('ul', { class: 'history' }, ...data.history.slice().reverse().map(x => h('li', {}, fmtWhen(x.at) + ' · ' + x.by + ' · ' + x.action)))));
    if (i.can.delete) extra.push(h('p', {}, h('button', { class: 'btn danger', type: 'button', onclick: async e => { if (!confirm('Delete this ' + (m.singular || 'item') + '? This cannot be undone.')) return; busy(e.target, true); try { await api(`/api/m/${m.key}/${i.id}/delete`, { body: {} }); toast('Deleted.'); go('#/m/' + m.key); } catch (er) { toast(er.message, 'bad'); busy(e.target, false); } } }, 'Delete')));
    view(pageHead(m.title, title, '', ...actions), body, ...extra, h('p', {}, h('a', { href: '#/m/' + m.key }, '← All ' + m.title.toLowerCase())));
  }
  function filesPanel(m, i) {
    const list = h('ul', { class: 'files' }, ...(i.files || []).map(f => h('li', {}, h('a', { href: `/api/m/${m.key}/${i.id}/file/${f.id}`, download: f.name }, f.label || f.name), h('span', { class: 'small muted' }, ` ${fmtSize(f.size)} · ${fmtDate(f.at)}${f.internal ? ' · internal' : ''}`), f.sha256 && m.showHash ? h('code', { class: 'hash' }, 'SHA-256 ' + f.sha256) : null,
      i.can.upload ? h('button', { class: 'link-button', type: 'button', onclick: async () => { if (!confirm('Remove ' + f.name + '?')) return; try { await api(`/api/m/${m.key}/${i.id}/remove-file/${f.id}`, { body: {} }); toast('Removed.'); render(); } catch (e) { toast(e.message, 'bad'); } } }, 'Remove') : null)));
    const panel = section(m.filesTitle || 'Files', i.files?.length ? list : h('p', { class: 'muted' }, 'No files yet.'));
    if (i.can.upload) {
      const input = h('input', { type: 'file', id: 'upload-file', accept: m.accept || null });
      const label = h('input', { type: 'text', id: 'upload-label', maxlength: 120, placeholder: 'Optional label, e.g. version 1.2.0' });
      const err = errorBox();
      const button = h('button', { class: 'btn small', type: 'submit' }, 'Upload');
      panel.append(h('form', { class: 'inline-form', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; if (!input.files[0]) return showError(err, new Error('Choose a file.')); if (input.files[0].size > 10 * 1048576) return showError(err, new Error('Files must be 10 MB or smaller.')); busy(button, true); try { const file = await readFile(input.files[0]); file.label = label.value; await api(`/api/m/${m.key}/${i.id}/upload`, { body: { file } }); toast('Uploaded.'); render(); } catch (e) { showError(err, e); } finally { busy(button, false); } } },
        err, h('label', { for: 'upload-file' }, 'Add a file'), input, h('label', { for: 'upload-label', class: 'sr-only' }, 'File label'), label, button));
    }
    return panel;
  }
  function statusPanel(m, i) {
    const select = h('select', { id: 'status-select' }, ...i.can.status.map(s => h('option', { value: s }, (m.statuses || []).find(x => x.id === s)?.label || s)));
    const note = h('textarea', { id: 'status-note', rows: 2, maxlength: 2000, placeholder: m.comments ? 'Optional note (shared with the submitter)' : 'Optional note' });
    const button = h('button', { class: 'btn small', type: 'submit' }, 'Update status');
    const err = errorBox();
    return section('Update status', h('form', { class: 'inline-form', onsubmit: async ev => { ev.preventDefault(); busy(button, true); err.hidden = true; try { await api(`/api/m/${m.key}/${i.id}/status`, { body: { status: select.value, note: note.value } }); toast('Status updated.'); render(); } catch (e) { showError(err, e); } finally { busy(button, false); } } },
      err, h('label', { for: 'status-select' }, 'New status'), select, h('label', { for: 'status-note', class: 'sr-only' }, 'Note'), note, button));
  }
  function commentsPanel(m, i) {
    const list = h('ol', { class: 'thread' }, ...(i.comments || []).map(c => h('li', { class: 'msg from-' + c.from + (c.internal ? ' internal' : '') }, h('p', { class: 'msg-meta' }, h('strong', {}, c.by), ' · ', fmtWhen(c.at), c.internal ? chip('Internal note') : null), ...paragraphs(c.body))));
    const panel = section(m.commentsTitle || 'Conversation', (i.comments || []).length ? list : h('p', { class: 'muted' }, 'No messages yet.'));
    if (i.can.comment) {
      const text = h('textarea', { id: 'reply-text', rows: 3, maxlength: 5000, required: true });
      const internal = staff && m.internalNotes !== false ? h('input', { type: 'checkbox', id: 'reply-internal' }) : null;
      const button = h('button', { class: 'btn small', type: 'submit' }, 'Send');
      const err = errorBox();
      panel.append(h('form', { class: 'reply-form', onsubmit: async ev => { ev.preventDefault(); busy(button, true); err.hidden = true; try { await api(`/api/m/${m.key}/${i.id}/comment`, { body: { body: text.value, internal: internal?.checked } }); toast('Sent.'); render(); } catch (e) { showError(err, e); } finally { busy(button, false); } } },
        err, h('label', { for: 'reply-text' }, 'Add a message'), text, internal && data_manager(m) ? h('label', { class: 'check', for: 'reply-internal' }, internal, 'Internal note (staff only)') : null, button));
    }
    return panel;
  }
  const data_manager = m => !!staff && (m.manage === 'staff' || staff.admin);
  function completionPanel(m, i) {
    if (i.completed) return section('Your progress', h('p', {}, chip('Completed', 'good'), ' on ' + fmtDate(i.completed)), m.completion.portal ? h('p', { class: 'small muted' }, 'Completed courses are also added to your training records in the staff portal.') : null);
    const button = h('button', { class: 'btn', type: 'button', onclick: async () => { if (!confirm('Mark this course as completed?')) return; busy(button, true); try { const r = await api(`/api/m/${m.key}/${i.id}/complete`, { body: {} }); toast(r.portal === 'recorded' ? 'Completed and added to your staff portal training records.' : r.portal.startsWith('failed') ? 'Completed here. The staff portal record was not added: ' + r.portal.slice(8) : 'Completed.', r.portal.startsWith('failed') ? 'warn' : 'ok'); render(); } catch (e) { toast(e.message, 'bad'); busy(button, false); } } }, 'Mark as completed');
    return section('Your progress', h('p', {}, 'When you have finished this course, record it here.' + (m.completion.portal ? ' It will also be added to your training records in the staff portal.' : '')), button);
  }
  function portalBillPanel(m, i) {
    if (i.portalBill) return section('Staff portal', h('p', {}, chip('Recorded as a bill', 'good'), ` by ${i.portalBill.by} on ${fmtDate(i.portalBill.at)}.`));
    const due = h('input', { type: 'date', id: 'bill-due', required: true });
    const cat = h('input', { type: 'text', id: 'bill-cat', maxlength: 60, placeholder: 'Other' });
    const button = h('button', { class: 'btn small', type: 'submit' }, 'Record bill in staff portal');
    const err = errorBox();
    return section('Record in the staff portal', h('p', { class: 'small muted' }, 'Adds this approved purchase to Bills in the staff portal, so finance tracks it in one place. Requires payroll & finance permission there.'),
      h('form', { class: 'inline-form', onsubmit: async ev => { ev.preventDefault(); busy(button, true); err.hidden = true; try { await api(`/api/m/${m.key}/${i.id}/portal-bill`, { body: { dueDate: due.value, category: cat.value } }); toast('Recorded in the staff portal.'); render(); } catch (e) { showError(err, e); } finally { busy(button, false); } } },
        err, h('label', { for: 'bill-due' }, 'Due date'), due, h('label', { for: 'bill-cat' }, 'Category'), cat, button));
  }
  function invitePanel(m, i) {
    const out = h('div');
    const button = h('button', { class: 'btn small', type: 'button', onclick: async () => { if (!confirm('Approve and create a member account invitation?')) return; busy(button, true); try { const r = await api(`/api/m/${m.key}/${i.id}/invite`, { body: {} }); out.replaceChildren(h('p', {}, 'Share this single-use link privately with the applicant. It expires in 7 days.'), h('div', { class: 'reference' }, h('code', {}, r.invite), copyButton(r.invite))); } catch (e) { toast(e.message, 'bad'); } finally { busy(button, false); } } }, i.invited ? 'Issue a new invitation' : 'Approve and invite');
    return section('Membership', i.invited ? h('p', { class: 'small muted' }, `Invited by ${i.invited.by} on ${fmtDate(i.invited.at)}.`) : null, button, out);
  }

  // ---------- references ----------
  function referencePage() {
    const input = h('input', { id: 'ref-input', autocomplete: 'off', spellcheck: 'false', maxlength: 64, required: true, inputmode: 'latin' });
    const out = h('div');
    const err = errorBox();
    const button = h('button', { class: 'btn', type: 'submit' }, 'View');
    async function show() {
      const ref = input.value.trim();
      const r = await api('/api/ref', { body: { reference: ref } });
      const reply = r.canReply ? (() => { const t = h('textarea', { id: 'ref-reply', rows: 3, maxlength: 5000, required: true }); const b = h('button', { class: 'btn small', type: 'submit' }, 'Send reply'); return h('form', { class: 'reply-form', onsubmit: async ev => { ev.preventDefault(); busy(b, true); try { await api('/api/ref/reply', { body: { reference: ref, body: t.value } }); toast('Reply sent.'); await show(); } catch (e) { toast(e.message, 'bad'); } finally { busy(b, false); } } }, h('label', { for: 'ref-reply' }, 'Reply'), t, b); })() : null;
      const cancel = r.canCancel ? h('button', { class: 'btn danger small', type: 'button', onclick: async () => { if (!confirm('Cancel this?')) return; try { await api('/api/ref/cancel', { body: { reference: ref } }); toast('Cancelled.'); await show(); } catch (e) { toast(e.message, 'bad'); } } }, 'Cancel') : null;
      out.replaceChildren(section(r.title, h('p', {}, chip(r.statusLabel, toneFor(r.status)), r.parentTitle ? ' · ' + r.parentTitle : '', ' · submitted ' + fmtWhen(r.createdAt)),
        h('dl', { class: 'meta wide' }, ...Object.entries(r.fields).flatMap(([k, v]) => v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length) ? [] : [h('dt', {}, k), h('dd', {}, Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v))])),
        r.comments.length ? h('ol', { class: 'thread' }, ...r.comments.map(c => h('li', { class: 'msg' }, h('p', { class: 'msg-meta' }, h('strong', {}, c.from), ' · ', fmtWhen(c.at)), ...paragraphs(c.body)))) : h('p', { class: 'muted' }, 'No replies yet.'), reply, cancel));
    }
    view(pageHead(site.brand, 'Check a reference', 'Enter the private 64-character reference you were given when you submitted.'),
      h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; busy(button, true); try { await show(); } catch (e) { out.replaceChildren(); showError(err, e); } finally { busy(button, false); } } }, err, h('div', { class: 'field wide' }, h('label', { for: 'ref-input' }, 'Private reference'), input), button), out);
  }

  // ---------- accounts ----------
  function accountPage() {
    const next = params().get('next');
    if (account) {
      const current = h('input', { type: 'password', id: 'pw-current', autocomplete: 'current-password', required: true });
      const pw = h('input', { type: 'password', id: 'pw-new', autocomplete: 'new-password', minlength: 12, maxlength: 128, required: true });
      const err = errorBox();
      return view(pageHead(site.accounts.label || 'Your account', 'Hello, ' + account.name, account.member ? 'Your membership is active.' : ''),
        section('Account', h('dl', { class: 'meta wide' }, h('dt', {}, 'Display name'), h('dd', {}, account.name), h('dt', {}, 'Email'), h('dd', {}, account.email)),
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await api('/api/account/logout', { body: {} }); account = null; header(); toast('Signed out.'); go('#/'); } }, 'Sign out')),
        section('Change password', h('form', { class: 'form', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; try { await api('/api/account/password', { body: { current: current.value, password: pw.value } }); toast('Password changed.'); current.value = pw.value = ''; } catch (e) { showError(err, e); } } }, err, h('div', { class: 'field' }, h('label', { for: 'pw-current' }, 'Current password'), current), h('div', { class: 'field' }, h('label', { for: 'pw-new' }, 'New password (12+ characters)'), pw), h('button', { class: 'btn', type: 'submit' }, 'Change password'))));
    }
    const mail = h('input', { type: 'email', id: 'acc-email', autocomplete: 'email', required: true });
    const pass = h('input', { type: 'password', id: 'acc-pass', autocomplete: 'current-password', required: true });
    const err = errorBox();
    const submit = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
    const login = h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; busy(submit, true); try { account = (await api('/api/account/login', { body: { email: mail.value, password: pass.value } })).account; header(); toast('Signed in.'); go(next && next.startsWith('#/') ? next : '#/'); } catch (e) { showError(err, e); } finally { busy(submit, false); } } },
      h('h2', {}, 'Sign in'), err, h('div', { class: 'field' }, h('label', { for: 'acc-email' }, 'Email'), mail), h('div', { class: 'field' }, h('label', { for: 'acc-pass' }, 'Password'), pass), submit,
      h('p', { class: 'small muted' }, 'Staff should use ', h('a', { href: '/admin' }, 'Staff sign in'), ' instead. Accounts here are separate from staff accounts.'));
    let register = null;
    if (site.accounts.mode === 'register') {
      const name = h('input', { id: 'reg-name', autocomplete: 'nickname', maxlength: 60, required: true });
      const email2 = h('input', { type: 'email', id: 'reg-email', autocomplete: 'email', required: true });
      const pw = h('input', { type: 'password', id: 'reg-pass', autocomplete: 'new-password', minlength: 12, maxlength: 128, required: true });
      const terms = h('input', { type: 'checkbox', id: 'reg-terms', required: true });
      const honey = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' });
      const err2 = errorBox();
      const b = h('button', { class: 'btn', type: 'submit' }, 'Create account');
      register = h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err2.hidden = true; busy(b, true); try { account = (await api('/api/account/register', { body: { name: name.value, email: email2.value, password: pw.value, terms: terms.checked, website: honey.value } })).account; header(); toast('Welcome!'); go(next && next.startsWith('#/') ? next : '#/'); } catch (e) { showError(err2, e); } finally { busy(b, false); } } },
        h('h2', {}, 'Create an account'), err2, h('div', { class: 'field' }, h('label', { for: 'reg-name' }, 'Display name (shown publicly)'), name), h('div', { class: 'field' }, h('label', { for: 'reg-email' }, 'Email (never shown publicly)'), email2), h('div', { class: 'field' }, h('label', { for: 'reg-pass' }, 'Password (12+ characters)'), pw),
        site.accounts.guidelines ? h('div', { class: 'notice' }, site.accounts.guidelines) : null,
        h('label', { class: 'check', for: 'reg-terms' }, terms, 'I agree to follow the community guidelines.'), honey, b);
    }
    view(pageHead(site.brand, site.accounts.label || 'Account', site.accounts.mode === 'invite' ? 'Accounts are created by invitation from our team.' : ''), h('div', { class: 'two-col' }, login, register));
  }
  function activatePage(invite) {
    const pw = h('input', { type: 'password', id: 'act-pass', autocomplete: 'new-password', minlength: 12, maxlength: 128, required: true });
    const pw2 = h('input', { type: 'password', id: 'act-pass2', autocomplete: 'new-password', minlength: 12, maxlength: 128, required: true });
    const err = errorBox();
    view(pageHead(site.brand, 'Activate your account', 'Choose a password to finish setting up your account.'),
      h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; if (pw.value !== pw2.value) return showError(err, new Error('The passwords do not match.')); try { account = (await api('/api/account/activate', { body: { invite, password: pw.value } })).account; header(); toast('Account activated.'); history.replaceState(null, '', '#/'); render(); } catch (e) { showError(err, e); } } },
        err, h('div', { class: 'field' }, h('label', { for: 'act-pass' }, 'Password (12–128 characters)'), pw), h('div', { class: 'field' }, h('label', { for: 'act-pass2' }, 'Confirm password'), pw2), h('button', { class: 'btn', type: 'submit' }, 'Activate account')));
  }
  async function accountsAdmin() {
    let data; try { data = await api('/api/account/list'); } catch (e) { return failure(e); }
    const name = h('input', { id: 'inv-name', maxlength: 120, required: true }), mail = h('input', { id: 'inv-email', type: 'email', required: true });
    const member = site.accounts.memberships ? h('input', { type: 'checkbox', id: 'inv-member' }) : null;
    const out = h('div'); const err = errorBox();
    const rows = data.accounts.map(a => h('tr', {}, h('td', {}, a.name), h('td', {}, a.email), h('td', {}, a.disabled ? chip('Disabled', 'bad') : a.invited ? chip('Invited', 'info') : chip('Active', 'good'), a.member ? chip('Member', 'good') : null), h('td', {}, a.lastLogin ? fmtDate(a.lastLogin) : '—'),
      h('td', { class: 'row-actions' }, h('button', { class: 'link-button', type: 'button', onclick: async () => { try { await api('/api/account/' + (a.disabled ? 'enable' : 'disable'), { body: { id: a.id } }); toast('Updated.'); render(); } catch (e) { toast(e.message, 'bad'); } } }, a.disabled ? 'Enable' : 'Disable'),
        site.accounts.memberships ? h('button', { class: 'link-button', type: 'button', onclick: async () => { try { await api('/api/account/member', { body: { id: a.id, member: !a.member } }); toast('Updated.'); render(); } catch (e) { toast(e.message, 'bad'); } } }, a.member ? 'Remove membership' : 'Make member') : null)));
    view(pageHead('Staff', site.accounts.label ? site.accounts.label + 's' : 'Accounts', 'Accounts on this website are separate from staff accounts. Invitations are single-use and expire after 7 days. No emails are sent: share links privately.'),
      section('Invite someone', h('form', { class: 'inline-form', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; try { const r = await api('/api/account/invite', { body: { name: name.value, email: mail.value, member: member?.checked } }); out.replaceChildren(h('div', { class: 'reference' }, h('code', {}, r.invite), copyButton(r.invite))); accountsCache = null; } catch (e) { showError(err, e); } } },
        err, h('label', { for: 'inv-name' }, 'Name'), name, h('label', { for: 'inv-email' }, 'Email'), mail, member ? h('label', { class: 'check', for: 'inv-member' }, member, 'Member') : null, h('button', { class: 'btn small', type: 'submit' }, 'Create invitation')), out),
      section('All accounts', data.accounts.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['Name', 'Email', 'Status', 'Last sign-in', ''].map(t => h('th', { scope: 'col' }, t)))), h('tbody', {}, ...rows))) : h('p', { class: 'muted' }, 'No accounts yet.')));
  }

  // ---------- forms & surveys ----------
  async function builderList(m) {
    let data; try { data = await api('/api/b/' + m.key); } catch (e) { return failure(e); }
    view(pageHead(site.brand, m.title, m.intro, data.manager ? h('a', { class: 'btn', href: `#/b/${m.key}/edit/new` }, 'Create ' + (m.mode === 'survey' ? 'survey' : 'form')) : null),
      data.forms.length ? h('div', { class: 'cards reveal' }, ...data.forms.map(f => h('a', { class: 'card item', href: `#/b/${m.key}/${f.id}` }, h('div', { class: 'item-top' }, h('h2', {}, f.title), chip(f.open ? 'Open' : 'Closed', f.open ? 'good' : ''), data.manager ? chip(f.published ? (f.audience === 'staff' ? 'Staff' : 'Public') : 'Draft') : null), h('p', {}, f.description), data.manager ? h('p', { class: 'small muted' }, f.responses + ' responses') : null)))
        : empty(m.empty || 'Nothing is open right now.'));
  }
  async function builderFill(m, formId) {
    let f; try { f = (await api(`/api/b/${m.key}/${formId}`)).form; } catch (e) { return failure(e); }
    const manager = !!staff && (m.manage === 'staff' || staff.admin);
    const form = h('form', { class: 'panel form reveal' });
    const err = errorBox(); form.append(err);
    const inputs = {};
    for (const q of f.questions) {
      const id = 'q-' + q.id, label = h('label', { for: id }, q.label, q.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null);
      let input;
      if (q.type === 'textarea') input = h('textarea', { id, rows: 4, maxlength: 5000, required: q.required });
      else if (q.type === 'select') input = h('select', { id, required: q.required }, h('option', { value: '' }, 'Choose…'), ...q.options.map(o => h('option', { value: o }, o)));
      else if (q.type === 'multi' || q.type === 'rating' || q.type === 'yesno') {
        const opts = q.type === 'multi' ? q.options : q.type === 'rating' ? ['1', '2', '3', '4', '5'] : ['yes', 'no'];
        const box = h('fieldset', { class: 'checks' + (q.type === 'rating' ? ' rating' : ''), id }, h('legend', {}, q.label, q.required ? ' *' : ''), ...opts.map(o => h('label', { class: 'check' }, h('input', { type: q.type === 'multi' ? 'checkbox' : 'radio', name: id, value: o }), q.type === 'yesno' ? (o === 'yes' ? 'Yes' : 'No') : o)));
        inputs[q.id] = () => { const c = [...box.querySelectorAll('input:checked')].map(i => i.value); return q.type === 'multi' ? c : q.type === 'rating' ? (c[0] ? Number(c[0]) : '') : (c[0] || ''); };
        form.append(h('div', { class: 'field wide' }, box, q.help ? h('p', { class: 'help' }, q.help) : null)); continue;
      } else input = h('input', { id, type: q.type === 'email' ? 'email' : q.type === 'number' ? 'number' : 'text', maxlength: 500, required: q.required });
      inputs[q.id] = () => q.type === 'number' && input.value !== '' ? Number(input.value) : input.value;
      form.append(h('div', { class: 'field wide' }, label, input, q.help ? h('p', { class: 'help' }, q.help) : null));
    }
    const honey = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' });
    const submit = h('button', { class: 'btn', type: 'submit', disabled: !f.open }, f.open ? 'Submit' : 'Closed');
    form.append(honey, f.anonymous ? h('p', { class: 'small muted' }, 'Responses are anonymous unless you include identifying details in your answers.') : null, submit);
    form.addEventListener('submit', async ev => { ev.preventDefault(); err.hidden = true; busy(submit, true); try { const answers = {}; for (const [k, read] of Object.entries(inputs)) answers[k] = read(); await api(`/api/b/${m.key}/${f.id}/respond`, { body: { answers, website: honey.value } }); view(pageHead(site.brand, 'Thank you', 'Your response has been recorded.'), f.resultsPublic ? h('p', {}, h('a', { class: 'btn', href: `#/b/${m.key}/${f.id}/results` }, 'See results')) : null); } catch (e) { showError(err, e); busy(submit, false); } });
    const actions = [];
    if (manager) actions.push(h('a', { class: 'btn ghost', href: `#/b/${m.key}/edit/${f.id}` }, 'Edit'), h('a', { class: 'btn ghost', href: `#/b/${m.key}/${f.id}/results` }, 'Results'), h('a', { class: 'btn ghost', href: `/api/b/${m.key}/${f.id}/responses/export.csv` }, 'Export CSV'));
    else if (f.resultsPublic) actions.push(h('a', { class: 'btn ghost', href: `#/b/${m.key}/${f.id}/results` }, 'Results'));
    view(pageHead(m.title, f.title, f.description, ...actions), f.closes ? h('p', { class: 'small muted' }, 'Closes ' + fmtDate(f.closes)) : null, form);
  }
  async function builderResults(m, formId) {
    let f, r; try { f = (await api(`/api/b/${m.key}/${formId}`)).form; r = await api(`/api/b/${m.key}/${formId}/results`); } catch (e) { return failure(e); }
    view(pageHead(m.title, 'Results: ' + f.title, r.total + ' responses'),
      ...r.results.map(q => section(q.label, h('p', { class: 'small muted' }, q.answered + ' answered'),
        q.counts ? h('ul', { class: 'bars' }, ...q.counts.map(c => h('li', {}, h('span', { class: 'bar-label' }, c.option === 'yes' ? 'Yes' : c.option === 'no' ? 'No' : c.option), h('span', { class: 'bar' }, h('span', { class: 'fill', style: null, dataset: { pct: q.answered ? Math.round(c.count / q.answered * 100) : 0 } })), h('span', { class: 'bar-value' }, c.count + (q.answered ? ` (${Math.round(c.count / q.answered * 100)}%)` : ''))))) : null,
        q.average !== undefined ? h('p', {}, 'Average: ', h('strong', {}, q.average ?? '—')) : null,
        q.answers ? h('ul', { class: 'answers' }, ...q.answers.map(a => h('li', {}, a))) : null)));
    document.querySelectorAll('.fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
  }
  async function builderEdit(m, formId) {
    let f = { title: '', description: '', audience: 'public', open: true, published: false, resultsPublic: false, anonymous: true, closes: '', questions: [{ label: '', type: 'text', required: true, options: [] }] };
    if (formId !== 'new') { try { f = (await api(`/api/b/${m.key}/${formId}`)).form; } catch (e) { return failure(e); } }
    const title = h('input', { id: 'bf-title', maxlength: 160, required: true }); title.value = f.title;
    const desc = h('textarea', { id: 'bf-desc', rows: 3, maxlength: 2000 }); desc.value = f.description || '';
    const audience = h('select', { id: 'bf-aud' }, h('option', { value: 'public' }, 'Anyone'), h('option', { value: 'staff' }, 'Staff only (one response each)')); audience.value = f.audience;
    const closes = h('input', { type: 'date', id: 'bf-closes' }); closes.value = f.closes || '';
    const flags = ['open', 'published', 'anonymous', ...(m.mode === 'survey' ? ['resultsPublic'] : [])].map(k => { const c = h('input', { type: 'checkbox', id: 'bf-' + k, checked: !!f[k] }); c.dataset.key = k; return h('label', { class: 'check', for: 'bf-' + k }, c, { open: 'Accepting responses', published: 'Published', anonymous: 'Anonymous (do not record staff names)', resultsPublic: 'Share results publicly' }[k]); });
    const qs = h('ol', { class: 'question-list' });
    function addQuestion(q = { label: '', type: 'text', required: true, options: [] }) {
      const li = h('li', { class: 'question' });
      const label = h('input', { maxlength: 300, required: true, 'aria-label': 'Question', placeholder: 'Question' }); label.value = q.label;
      const type = h('select', { 'aria-label': 'Answer type' }, ...[['text', 'Short text'], ['textarea', 'Long text'], ['email', 'Email'], ['number', 'Number'], ['select', 'Choose one'], ['multi', 'Choose several'], ['rating', 'Rating 1–5'], ['yesno', 'Yes / No']].map(([v, l]) => h('option', { value: v }, l))); type.value = q.type;
      const options = h('textarea', { rows: 3, 'aria-label': 'Options, one per line', placeholder: 'Options, one per line' }); options.value = (q.options || []).join('\n');
      const req = h('input', { type: 'checkbox', checked: q.required !== false });
      const sync = () => { options.hidden = !['select', 'multi'].includes(type.value); }; type.addEventListener('change', sync); sync();
      li.read = () => ({ id: q.id, label: label.value, type: type.value, options: options.value.split('\n').map(s => s.trim()).filter(Boolean), required: req.checked });
      li.append(label, type, options, h('label', { class: 'check' }, req, 'Required'), h('button', { class: 'link-button', type: 'button', onclick: () => li.remove() }, 'Remove'));
      qs.append(li);
    }
    f.questions.forEach(addQuestion);
    const err = errorBox(); const save = h('button', { class: 'btn', type: 'submit' }, 'Save');
    const form = h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; busy(save, true);
      try { const payload = { id: f.id, title: title.value, description: desc.value, audience: audience.value, closes: closes.value, questions: [...qs.children].map(li => li.read()) }; form.querySelectorAll('[data-key]').forEach(c => { payload[c.dataset.key] = c.checked; }); const r = await api('/api/b/' + m.key, { body: payload }); toast('Saved.'); go(`#/b/${m.key}/${r.form.id}`); } catch (e) { showError(err, e); } finally { busy(save, false); } } },
      err, h('div', { class: 'field wide' }, h('label', { for: 'bf-title' }, 'Title'), title), h('div', { class: 'field wide' }, h('label', { for: 'bf-desc' }, 'Description'), desc),
      h('div', { class: 'grid-fields' }, h('div', { class: 'field' }, h('label', { for: 'bf-aud' }, 'Who can respond'), audience), h('div', { class: 'field' }, h('label', { for: 'bf-closes' }, 'Closing date (optional)'), closes)),
      h('div', { class: 'checks-row' }, ...flags), h('h2', {}, 'Questions'), qs, h('button', { class: 'btn ghost small', type: 'button', onclick: () => addQuestion() }, 'Add question'), h('div', { class: 'form-actions' }, save,
        f.id ? h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (!confirm('Delete this and all its responses?')) return; try { await api(`/api/b/${m.key}/${f.id}/delete`, { body: {} }); toast('Deleted.'); go('#/b/' + m.key); } catch (e) { toast(e.message, 'bad'); } } }, 'Delete') : null));
    view(pageHead(m.title, formId === 'new' ? 'New ' + (m.mode === 'survey' ? 'survey' : 'form') : 'Edit ' + f.title, ''), form);
  }

  // ---------- forum ----------
  async function forumList(m) {
    let data; try { data = await api('/api/forum/' + m.key); } catch (e) { return failure(e); }
    const cat = params().get('c') || '';
    const tabs = h('div', { class: 'tabs reveal', role: 'tablist' }, h('a', { href: `#/forum/${m.key}`, class: !cat ? 'active' : '' }, 'All'), ...data.categories.map(c => h('a', { href: `#/forum/${m.key}?c=${c.id}`, class: cat === c.id ? 'active' : '' }, c.label)));
    const threads = data.threads.filter(t => !cat || t.category === cat);
    const canPost = account || staff;
    view(pageHead(site.brand, m.title, m.intro, canPost ? h('a', { class: 'btn', href: `#/forum/${m.key}/new` }, 'Start a discussion') : h('a', { class: 'btn', href: '#/account?next=' + encodeURIComponent(`#/forum/${m.key}/new`) }, 'Sign in to post')),
      tabs, data.guidelines ? h('details', { class: 'panel reveal' }, h('summary', {}, 'Community guidelines'), ...paragraphs(data.guidelines)) : null,
      threads.length ? h('ul', { class: 'threads reveal' }, ...threads.map(t => h('li', {}, h('a', { href: `#/forum/${m.key}/${t.id}` }, t.pinned ? chip('Pinned', 'info') : null, t.locked ? chip('Locked') : null, t.hidden ? chip('Hidden', 'bad') : null, h('strong', {}, t.title)), h('span', { class: 'small muted' }, `${data.categories.find(c => c.id === t.category)?.label || ''} · ${t.author}${t.staff ? '' : ''} · ${t.replies} ${t.replies === 1 ? 'reply' : 'replies'} · ${fmtWhen(t.lastAt)}`), data.manager && t.reports ? chip(t.reports + ' reports', 'bad') : null))) : empty('No discussions yet. Start the first one.'));
  }
  async function forumThread(m, tid) {
    let data; try { data = await api(`/api/forum/${m.key}/${tid}`); } catch (e) { return failure(e); }
    const t = data.thread;
    const post = (p, isThread) => h('article', { class: 'post panel reveal' + (p.staff ? ' staff' : '') + (p.hidden ? ' hidden-post' : '') },
      h('p', { class: 'msg-meta' }, h('strong', {}, p.author), p.staff ? chip('Staff', 'info') : null, ' · ', fmtWhen(isThread ? t.createdAt : p.at), p.hidden ? chip('Hidden', 'bad') : null, data.manager && p.reports ? chip(p.reports + ' reports', 'bad') : null),
      ...paragraphs(p.body),
      h('div', { class: 'post-actions' },
        (account || staff) && !p.mine ? h('button', { class: 'link-button', type: 'button', onclick: async () => { const reason = prompt('Why are you reporting this post?'); if (!reason) return; try { await api(`/api/forum/${m.key}/${t.id}/report`, { body: { postId: isThread ? undefined : p.id, reason } }); toast('Reported to moderators.'); } catch (e) { toast(e.message, 'bad'); } } }, 'Report') : null,
        data.manager ? h('button', { class: 'link-button', type: 'button', onclick: async () => { try { await api(`/api/forum/${m.key}/${t.id}/moderate`, { body: { postId: isThread ? undefined : p.id, hidden: !p.hidden, clearReports: true } }); toast('Updated.'); render(); } catch (e) { toast(e.message, 'bad'); } } }, p.hidden ? 'Unhide' : 'Hide') : null));
    const reply = (account || staff) && (!t.locked || data.manager) ? (() => { const text = h('textarea', { id: 'forum-reply', rows: 4, maxlength: 10000, required: true }); const b = h('button', { class: 'btn', type: 'submit' }, 'Post reply'); const err = errorBox(); return h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; busy(b, true); try { await api(`/api/forum/${m.key}/${t.id}/reply`, { body: { body: text.value } }); toast('Posted.'); render(); } catch (e) { showError(err, e); busy(b, false); } } }, err, h('label', { for: 'forum-reply' }, 'Your reply'), text, b); })()
      : t.locked ? h('p', { class: 'notice' }, 'This discussion is locked.') : h('p', {}, h('a', { class: 'btn', href: '#/account?next=' + encodeURIComponent(location.hash) }, 'Sign in to reply'));
    const mod = data.manager ? section('Moderation', h('div', { class: 'row-actions' },
      ...[['pinned', t.pinned ? 'Unpin' : 'Pin'], ['locked', t.locked ? 'Unlock' : 'Lock']].map(([k, label]) => h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { try { await api(`/api/forum/${m.key}/${t.id}/moderate`, { body: { [k]: !t[k] } }); render(); } catch (e) { toast(e.message, 'bad'); } } }, label)),
      h('button', { class: 'btn danger small', type: 'button', onclick: async () => { if (!confirm('Delete this whole discussion?')) return; try { await api(`/api/forum/${m.key}/${t.id}/delete`, { body: {} }); toast('Deleted.'); go('#/forum/' + m.key); } catch (e) { toast(e.message, 'bad'); } } }, 'Delete discussion'))) : null;
    view(pageHead(m.title, t.title, ''), post(t, true), ...t.posts.map(p => post(p, false)), reply, mod, h('p', {}, h('a', { href: '#/forum/' + m.key }, '← All discussions')));
  }
  async function forumNew(m) {
    if (!account && !staff) return go('#/account?next=' + encodeURIComponent(location.hash));
    let data; try { data = await api('/api/forum/' + m.key); } catch (e) { return failure(e); }
    const cat = h('select', { id: 'fn-cat', required: true }, h('option', { value: '' }, 'Choose…'), ...data.categories.map(c => h('option', { value: c.id }, c.label)));
    const title = h('input', { id: 'fn-title', maxlength: 140, required: true }), body = h('textarea', { id: 'fn-body', rows: 8, maxlength: 10000, required: true });
    const err = errorBox(), b = h('button', { class: 'btn', type: 'submit' }, 'Post');
    view(pageHead(m.title, 'Start a discussion', 'Posting as ' + (account?.name || staff.name + ' (staff)') + '. Be kind and respect the community guidelines.'),
      h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; busy(b, true); try { const r = await api('/api/forum/' + m.key, { body: { category: cat.value, title: title.value, body: body.value } }); go(`#/forum/${m.key}/${r.thread.id}`); } catch (e) { showError(err, e); busy(b, false); } } },
        err, h('div', { class: 'field' }, h('label', { for: 'fn-cat' }, 'Category'), cat), h('div', { class: 'field wide' }, h('label', { for: 'fn-title' }, 'Title'), title), h('div', { class: 'field wide' }, h('label', { for: 'fn-body' }, 'Message'), body), b));
  }

  // ---------- status & health ----------
  const stateLabel = { operational: 'Operational', degraded: 'Degraded performance', outage: 'Outage', maintenance: 'Maintenance', unknown: 'Checking…' };
  async function statusPage(m) {
    let data; try { data = await api('/api/status/' + m.key); } catch (e) { return failure(e); }
    const worst = ['outage', 'degraded', 'maintenance'].find(s => data.components.some(c => c.state === s));
    const active = data.incidents.filter(i => !['resolved'].includes(i.status));
    const bars = c => h('div', { class: 'uptime', 'aria-label': `Last ${c.recent.length} checks: ${c.recent.filter(Boolean).length} successful` }, ...c.recent.map(ok => h('span', { class: ok ? 'up' : 'down' })));
    view(h('section', { class: 'hero compact reveal' }, h('p', { class: 'eyebrow' }, site.brand), h('h1', {}, m.title), h('p', { class: 'status-banner tone-' + (worst ? (worst === 'outage' ? 'bad' : 'warn') : 'good') }, worst ? (worst === 'outage' ? 'Some services are unavailable' : worst === 'maintenance' ? 'Maintenance in progress' : 'Some services are degraded') : data.components.length ? 'All monitored services are operational' : 'No services are monitored yet')),
      active.length ? section('Current incidents', ...active.map(incident)) : null,
      section('Services', data.components.length ? h('ul', { class: 'components' }, ...data.components.map(c => h('li', {}, h('div', {}, h('strong', {}, c.name), c.group ? h('span', { class: 'small muted' }, ' · ' + c.group) : null, h('p', { class: 'small muted' }, c.monitored ? (c.uptime24h === null ? 'Waiting for first check' : `${c.uptime24h}% uptime (24h) · checked ${fmtWhen(c.lastChecked)}`) : 'Status set manually')), chip(stateLabel[c.state] || c.state, c.state === 'operational' ? 'good' : c.state === 'outage' ? 'bad' : 'warn'), c.recent.length ? bars(c) : null))) : h('p', { class: 'muted' }, m.empty || 'No services have been added yet.')),
      section('Past incidents (14 days)', data.incidents.filter(i => i.status === 'resolved').length ? h('div', {}, ...data.incidents.filter(i => i.status === 'resolved').map(incident)) : h('p', { class: 'muted' }, 'No incidents in the last 14 days.')),
      data.manager ? await statusAdmin(m, data) : null,
      h('p', { class: 'small muted' }, 'Services are checked automatically every minute from our server.'));
  }
  function incident(i) { return h('article', { class: 'incident' }, h('h3', {}, i.title, ' ', chip(i.status, toneFor(i.status))), h('ol', { class: 'thread' }, ...i.updates.slice().reverse().map(u => h('li', {}, h('p', { class: 'msg-meta' }, h('strong', {}, u.status), ' · ', fmtWhen(u.at), u.by ? ' · ' + u.by : ''), ...paragraphs(u.message))))); }
  async function statusAdmin(m, data) {
    const cName = h('input', { id: 'sc-name', maxlength: 80, required: true }), cUrl = h('input', { id: 'sc-url', type: 'url', placeholder: 'https://' }), cGroup = h('input', { id: 'sc-group', maxlength: 60 });
    const cOverride = h('select', { id: 'sc-ov' }, ...['auto', 'operational', 'degraded', 'outage', 'maintenance'].map(s => h('option', { value: s }, s === 'auto' ? 'Automatic (from checks)' : stateLabel[s])));
    const cId = { value: '' };
    const iTitle = h('input', { id: 'si-title', maxlength: 160, required: true }), iStatus = h('select', { id: 'si-status' }, ...['investigating', 'identified', 'monitoring', 'resolved', 'scheduled'].map(s => h('option', { value: s }, s)));
    const iImpact = h('select', { id: 'si-impact' }, ...['degraded', 'outage', 'maintenance', 'none'].map(s => h('option', { value: s }, s))), iMsg = h('textarea', { id: 'si-msg', rows: 3, required: true, maxlength: 3000 });
    const iComps = h('fieldset', { class: 'checks' }, h('legend', {}, 'Affected services'), ...data.components.map(c => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: c.id }), c.name)));
    const iId = { value: '' };
    const err1 = errorBox(), err2 = errorBox();
    return h('div', {}, section('Manage services',
      h('ul', { class: 'files' }, ...data.components.map(c => h('li', {}, h('strong', {}, c.name), h('span', { class: 'small muted' }, ' ' + (c.url || 'manual') + ' · ' + c.override), h('button', { class: 'link-button', type: 'button', onclick: () => { cId.value = c.id; cName.value = c.name; cUrl.value = c.url || ''; cGroup.value = c.group; cOverride.value = c.override; cName.focus(); } }, 'Edit'), h('button', { class: 'link-button', type: 'button', onclick: async () => { if (!confirm('Remove ' + c.name + '?')) return; await api(`/api/status/${m.key}/delete-component`, { body: { id: c.id } }); render(); } }, 'Remove')))),
      h('form', { class: 'inline-form', onsubmit: async ev => { ev.preventDefault(); err1.hidden = true; try { await api(`/api/status/${m.key}/component`, { body: { id: cId.value || undefined, name: cName.value, url: cUrl.value, group: cGroup.value, override: cOverride.value } }); toast('Saved.'); render(); } catch (e) { showError(err1, e); } } },
        err1, h('label', { for: 'sc-name' }, 'Name'), cName, h('label', { for: 'sc-url' }, 'Address to check (optional)'), cUrl, h('label', { for: 'sc-group' }, 'Group'), cGroup, h('label', { for: 'sc-ov' }, 'Status'), cOverride, h('button', { class: 'btn small', type: 'submit' }, 'Save service'))),
      section('Post an incident update',
        data.incidents.length ? h('ul', { class: 'files' }, ...data.incidents.map(i => h('li', {}, h('strong', {}, i.title), ' ', chip(i.status, toneFor(i.status)), h('button', { class: 'link-button', type: 'button', onclick: () => { iId.value = i.id; iTitle.value = i.title; iStatus.value = i.status; iImpact.value = i.impact; iComps.querySelectorAll('input').forEach(x => { x.checked = i.componentIds.includes(x.value); }); iMsg.focus(); } }, 'Add update'), h('button', { class: 'link-button', type: 'button', onclick: async () => { if (!confirm('Delete this incident?')) return; await api(`/api/status/${m.key}/delete-incident`, { body: { id: i.id } }); render(); } }, 'Delete')))) : null,
        h('form', { class: 'form', onsubmit: async ev => { ev.preventDefault(); err2.hidden = true; try { await api(`/api/status/${m.key}/incident`, { body: { id: iId.value || undefined, title: iTitle.value, status: iStatus.value, impact: iImpact.value, message: iMsg.value, componentIds: [...iComps.querySelectorAll('input:checked')].map(x => x.value) } }); toast('Published.'); render(); } catch (e) { showError(err2, e); } } },
          err2, h('div', { class: 'grid-fields' }, h('div', { class: 'field wide' }, h('label', { for: 'si-title' }, 'Title'), iTitle), h('div', { class: 'field' }, h('label', { for: 'si-status' }, 'Status'), iStatus), h('div', { class: 'field' }, h('label', { for: 'si-impact' }, 'Impact'), iImpact)), iComps, h('div', { class: 'field wide' }, h('label', { for: 'si-msg' }, 'Update message (public)'), iMsg), h('button', { class: 'btn', type: 'submit' }, 'Publish update'))));
  }
  async function healthPage(m) {
    if (!staff) return needStaff();
    let data; try { data = await api('/api/health/' + m.key); } catch (e) { return failure(e); }
    const groups = {};
    for (const t of data.targets) (groups[t.company] ||= []).push(t);
    view(pageHead('Staff', m.title, m.intro), ...Object.entries(groups).map(([company, list]) => section(company, h('ul', { class: 'components' }, ...list.map(t => h('li', {}, h('div', {}, h('strong', {}, t.name), h('p', { class: 'small muted' }, t.domain + (t.at ? ' · checked ' + fmtWhen(t.at) + (t.ms !== undefined ? ` · ${t.ms} ms` : '') : ''))), chip(t.ok === null || t.ok === undefined ? 'Checking…' : t.ok ? 'Running' : 'Not responding', t.ok ? 'good' : t.ok === false ? 'bad' : '')))))),
      h('p', { class: 'small muted' }, 'Checked every minute on this server. “Not responding” can mean stopped from website control, maintenance or a fault; check website control before restarting anything.'));
  }

  // ---------- signing ----------
  async function signingAdmin(m) {
    if (!staff) return needStaff();
    let data; try { data = await api('/api/sign/' + m.key); } catch (e) { return failure(e); }
    view(pageHead('Staff', m.title, m.intro, h('a', { class: 'btn', href: `#/signing/${m.key}/new` }, 'Request signatures')),
      h('div', { class: 'notice reveal', role: 'note' }, m.disclaimer),
      data.documents.length ? h('div', { class: 'cards reveal' }, ...data.documents.map(d => h('a', { class: 'card item', href: `#/signing/${m.key}/${d.id}` }, h('div', { class: 'item-top' }, h('h2', {}, d.title), chip(d.status, toneFor(d.status))), h('p', { class: 'small muted' }, `${d.signers.filter(s => s.status === 'signed').length} of ${d.signers.length} signed · ${fmtDate(d.createdAt)} · ${d.createdBy}`)))) : empty('No signing requests yet.'));
  }
  function signingNew(m) {
    const title = h('input', { id: 'sg-title', maxlength: 160, required: true }), message = h('textarea', { id: 'sg-msg', rows: 3, maxlength: 2000 });
    const file = h('input', { type: 'file', id: 'sg-file', accept: 'application/pdf,.pdf', required: true });
    const signers = h('ol', { class: 'question-list' });
    const addSigner = () => { const li = h('li', { class: 'question' }, h('input', { maxlength: 120, placeholder: 'Full name', 'aria-label': 'Signer name', required: true }), h('input', { type: 'email', placeholder: 'Email', 'aria-label': 'Signer email', required: true }), h('button', { class: 'link-button', type: 'button', onclick: () => li.remove() }, 'Remove')); signers.append(li); };
    addSigner();
    const err = errorBox(), b = h('button', { class: 'btn', type: 'submit' }, 'Create signing links');
    view(pageHead(m.title, 'Request signatures', 'Upload a PDF and add who needs to sign. You will receive a private link for each signer to share yourself. No emails are sent.'),
      h('div', { class: 'notice reveal', role: 'note' }, m.disclaimer),
      h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; busy(b, true);
        try { if (!file.files[0]) throw new Error('Choose a PDF.'); if (file.files[0].size > 10 * 1048576) throw new Error('The PDF must be 10 MB or smaller.'); const r = await api('/api/sign/' + m.key, { body: { title: title.value, message: message.value, file: await readFile(file.files[0]), signers: [...signers.children].map(li => { const [n, e] = li.querySelectorAll('input'); return { name: n.value, email: e.value }; }) } });
          view(pageHead(m.title, 'Signing links created', 'Share each link privately with that person only. Links are shown once; you can issue a replacement link later.'), section('', h('ul', { class: 'files' }, ...r.links.map(l => h('li', {}, h('strong', {}, l.name), ' ', h('span', { class: 'small muted' }, l.email), h('div', { class: 'reference' }, h('code', {}, l.link), copyButton(l.link)))))), h('p', {}, h('a', { class: 'btn', href: `#/signing/${m.key}/${r.document.id}` }, 'View progress')));
        } catch (e) { showError(err, e); busy(b, false); } } },
        err, h('div', { class: 'field wide' }, h('label', { for: 'sg-title' }, 'Title'), title), h('div', { class: 'field wide' }, h('label', { for: 'sg-msg' }, 'Message to signers'), message), h('div', { class: 'field wide' }, h('label', { for: 'sg-file' }, 'Document (PDF, up to 10 MB)'), file), h('h2', {}, 'Signers'), signers, h('button', { class: 'btn ghost small', type: 'button', onclick: addSigner }, 'Add signer'), h('div', { class: 'form-actions' }, b)));
  }
  async function signingDetail(m, docId) {
    let d; try { d = (await api(`/api/sign/${m.key}/${docId}`)).document; } catch (e) { return failure(e); }
    view(pageHead(m.title, d.title, d.message, h('a', { class: 'btn ghost', href: `/api/sign/${m.key}/${d.id}/file` }, 'Download PDF'), h('a', { class: 'btn ghost', href: `/api/sign/${m.key}/${d.id}/record` }, 'Download signing record')),
      section('Progress', h('p', {}, chip(d.status, toneFor(d.status)), ' · created ' + fmtWhen(d.createdAt) + ' by ' + d.createdBy), h('p', { class: 'small' }, 'Document fingerprint (SHA-256): ', h('code', { class: 'hash' }, d.file.sha256)),
        h('ul', { class: 'files' }, ...d.signers.map(s => h('li', {}, h('strong', {}, s.name), ' ', h('span', { class: 'small muted' }, s.email), ' ', chip(s.status, toneFor(s.status)), s.signedAt ? h('span', { class: 'small muted' }, ` · signed ${fmtWhen(s.signedAt)} as “${s.typedName}” from ${s.ip}`) : s.viewedAt ? h('span', { class: 'small muted' }, ' · opened ' + fmtWhen(s.viewedAt)) : null, s.declineReason ? h('p', { class: 'small' }, 'Reason: ' + s.declineReason) : null,
          s.status === 'pending' && d.status === 'sent' ? h('button', { class: 'link-button', type: 'button', onclick: async ev => { if (!confirm('Replace this signer\'s link? The old link will stop working.')) return; try { const r = await api(`/api/sign/${m.key}/${d.id}/relink`, { body: { signerId: s.id } }); ev.target.replaceWith(h('div', { class: 'reference' }, h('code', {}, r.link), copyButton(r.link))); } catch (e) { toast(e.message, 'bad'); } } }, 'New link') : null)))),
      section('Events', h('ul', { class: 'history' }, ...d.events.map(e => h('li', {}, fmtWhen(e.at) + ' · ' + e.type + (e.signer ? ' · ' + e.signer : '') + (e.ip ? ' · ' + e.ip : ''))))),
      d.status === 'sent' ? h('p', {}, h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (!confirm('Withdraw this document? All links stop working.')) return; try { await api(`/api/sign/${m.key}/${d.id}/void`, { body: {} }); render(); } catch (e) { toast(e.message, 'bad'); } } }, 'Withdraw')) : null,
      h('p', {}, h('a', { href: '#/signing/' + m.key }, '← All signing requests')));
  }
  async function signerPage(raw) {
    const m = site.modules.find(x => x.type === 'sign');
    if (!m) return failure(Object.assign(new Error('Not found.'), { status: 404 }));
    history.replaceState(null, '', location.pathname + '#/sign');
    let d; try { d = await api(`/api/sign/${m.key}/open`, { body: { token: raw } }); } catch (e) { return failure(e); }
    const download = h('button', { class: 'btn ghost', type: 'button', onclick: async () => { try { const res = await fetch(`/api/sign/${m.key}/document`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: raw }) }); if (!res.ok) throw new Error((await res.json()).error); const url = URL.createObjectURL(await res.blob()); const a = h('a', { href: url, download: d.file.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); opened = true; } catch (e) { toast(e.message || 'Download failed.', 'bad'); } } }, 'Download and read the document');
    let opened = false;
    const typed = h('input', { id: 'sig-name', maxlength: 120, autocomplete: 'name', required: true });
    const consent = h('input', { type: 'checkbox', id: 'sig-consent', required: true });
    const err = errorBox(), b = h('button', { class: 'btn', type: 'submit' }, 'Sign');
    const done = d.signer.status !== 'pending' || d.status !== 'sent';
    view(pageHead(site.brand, d.title, d.message || ''), h('div', { class: 'notice reveal', role: 'note' }, m.disclaimer),
      section('Document', h('p', {}, h('strong', {}, d.file.name), ' · ', fmtSize(d.file.size), ' · from ', d.from), h('p', { class: 'small' }, 'Fingerprint (SHA-256): ', h('code', { class: 'hash' }, d.file.sha256)), download,
        d.others.length ? h('p', { class: 'small muted' }, 'Other signers: ' + d.others.map(o => `${o.name} (${o.status})`).join(', ')) : null),
      done ? section('Status', h('p', {}, d.signer.status === 'signed' ? 'You signed this document on ' + fmtWhen(d.signer.signedAt) + '.' : d.status === 'voided' ? 'This document has been withdrawn.' : 'This document is no longer awaiting your signature.'))
        : h('form', { class: 'panel form reveal', onsubmit: async ev => { ev.preventDefault(); err.hidden = true; if (!opened) return showError(err, new Error('Download and read the document before signing.')); busy(b, true); try { await api(`/api/sign/${m.key}/sign`, { body: { token: raw, typedName: typed.value, consent: consent.checked, sha256: d.file.sha256 } }); view(pageHead(site.brand, 'Signed', 'Thank you. Your signature has been recorded.')); } catch (e) { showError(err, e); busy(b, false); } } },
          err, h('h2', {}, 'Sign as ' + d.signer.name), h('div', { class: 'field wide' }, h('label', { for: 'sig-name' }, 'Type your full name exactly as shown above'), typed),
          h('label', { class: 'check', for: 'sig-consent' }, consent, 'I have read this document and agree to sign it electronically. I understand my name, the time, my IP address and browser are recorded.'), b,
          h('details', {}, h('summary', {}, 'Decline instead'), (() => { const r = h('textarea', { id: 'sig-reason', rows: 2, maxlength: 1000, 'aria-label': 'Reason for declining' }); return h('div', {}, r, h('button', { class: 'btn danger small', type: 'button', onclick: async () => { if (!r.value.trim()) return toast('Give a reason for declining.', 'warn'); try { await api(`/api/sign/${m.key}/decline`, { body: { token: raw, reason: r.value } }); view(pageHead(site.brand, 'Declined', 'Your response has been recorded.')); } catch (e) { toast(e.message, 'bad'); } } }, 'Decline')); })())));
  }

  // ---------- staff portal sync (bridge) ----------
  async function bridgePage(m) {
    if (!staff) return needStaff();
    const p = params();
    const q = new URLSearchParams();
    for (const x of m.load.query || []) { const v = p.get(x.name) || (x.default === 'thisMonth' ? new Date().toISOString().slice(0, 7) : ''); if (v) q.set(x.name, v); }
    let data; try { data = await api('/api/bridge/' + m.key + (q.toString() ? '?' + q : '')); } catch (e) { return failure(e); }
    const controls = (m.load.query || []).length ? h('form', { class: 'toolbar reveal', onsubmit: ev => { ev.preventDefault(); const n = new URLSearchParams(); for (const x of m.load.query) { const v = ev.target.querySelector('[name="' + x.name + '"]').value; if (v) n.set(x.name, v); } go('#/bridge/' + m.key + '?' + n); } },
      ...m.load.query.map(x => h('label', {}, x.label + ' ', (() => { const i = h('input', { name: x.name, type: x.type === 'month' ? 'month' : x.type === 'date' ? 'date' : 'text' }); i.value = q.get(x.name) || ''; return i; })())), h('button', { class: 'btn small', type: 'submit' }, 'Show')) : null;
    const portalLink = m.portalUrl ? h('a', { class: 'btn ghost', href: m.portalUrl, rel: 'noopener' }, 'Open in staff portal') : null;
    const forms = (m.forms || []).filter(f => !f.when || truthy(data, f.when)).map(f => h('a', { class: 'btn', href: `#/bridge/${m.key}/form/${f.id}` }, f.label));
    let content;
    if (m.render === 'report') content = reportView(data);
    else if (m.render === 'polls') content = pollsView(m, data);
    else if (m.render === 'ideas') content = ideasView(m, data);
    else if (m.render === 'calendar') content = calendarView(m, data);
    else content = (m.views || []).filter(v => !v.when || truthy(data, v.when)).map(v => tableView(m, v, data));
    view(pageHead(site.brand, m.title, m.intro, ...forms, portalLink), h('p', { class: 'sync-note small reveal' }, chip('Synchronised', 'good'), ' These records live in the staff portal, so changes here appear there instantly and vice versa. The staff portal\'s own permissions apply.'), controls, content);
  }
  const truthy = (obj, path) => { const v = path.split('.').reduce((o, k) => o?.[k], obj); return Array.isArray(v) ? v.length > 0 : !!v; };
  function cell(col, row) {
    const v = col.field.split('.').reduce((o, k) => o?.[k], row);
    if (v === null || v === undefined || v === '') return '—';
    if (col.format === 'pounds') return fmtPounds(v);
    if (col.format === 'date') return fmtDate(v);
    if (col.format === 'when') return fmtWhen(v);
    if (col.format === 'status') return chip(row[col.labelField] || v, toneFor(String(v)));
    if (col.format === 'bool') return v ? 'Yes' : 'No';
    if (col.format === 'count') return Array.isArray(v) ? String(v.length) : String(v);
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return v.displayName || v.name || JSON.stringify(v);
    return String(v);
  }
  function rowActionVisible(a, row) { if (!a.when) return true; if (a.equals !== undefined) return row[a.when] === a.equals; if (a.in) return a.in.includes(row[a.when]); return !!row[a.when]; }
  function tableView(m, v, data) {
    const rows = (v.items.split('.').reduce((o, k) => o?.[k], data)) || [];
    return section(v.label, rows.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...v.columns.map(c => h('th', { scope: 'col' }, c.label)), (v.actions || v.download) ? h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Actions')) : null)),
      h('tbody', {}, ...rows.map(row => h('tr', {}, ...v.columns.map(c => h('td', { 'data-label': c.label }, cell(c, row))),
        (v.actions || v.download) ? h('td', { class: 'row-actions' }, v.download && (!v.download.when || row[v.download.when]) ? h('a', { class: 'link-button', href: `/api/bridge/${m.key}/download/${v.id}?id=${encodeURIComponent(row.id)}` }, v.download.label) : null,
          ...(v.actions || []).filter(a => rowActionVisible(a, row)).map(a => h('button', { class: 'link-button' + (a.danger ? ' danger-text' : ''), type: 'button', onclick: () => bridgeAction(m, v, a, row) }, a.label))) : null))))) : h('p', { class: 'muted' }, v.empty || 'Nothing to show.'));
  }
  async function bridgeAction(m, v, a, row) {
    if (!(a.fields || []).length) {
      if (a.confirm && !confirm(a.confirm)) return;
      try { await api(`/api/bridge/${m.key}/action/${v.id}/${a.id}`, { body: { id: row.id, values: a.values || {} } }); toast('Done.'); render(); } catch (e) { toast(e.message, 'bad'); }
      return;
    }
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
    const form = h('form', { class: 'form', dataset: { prefix: 'a-' } });
    const err = errorBox();
    form.append(h('h2', { id: 'dlg-title' }, a.label), err, await fieldGrid(a.fields, {}, 'a-'), h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'submit' }, a.label), h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Cancel')));
    form.addEventListener('submit', async ev => { ev.preventDefault(); err.hidden = true; try { await api(`/api/bridge/${m.key}/action/${v.id}/${a.id}`, { body: { id: row.id, values: { ...(a.values || {}), ...readFields(form, a.fields) } } }); dlg.close(); toast('Done.'); render(); } catch (e) { showError(err, e); } });
    dlg.append(form); document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
  }
  async function bridgeForm(m, formId) {
    if (!staff) return needStaff();
    const f = (m.forms || []).find(x => x.id === formId);
    if (!f) return failure(Object.assign(new Error('Not found.'), { status: 404 }));
    const form = h('form', { class: 'panel form reveal', dataset: { prefix: 'bf-' } });
    const err = errorBox();
    let lines = null, questions = null;
    form.append(err, await fieldGrid(f.fields.filter(x => !['lines', 'questions'].includes(x.type) && x.fixed === undefined), {}, 'bf-'));
    if (f.fields.some(x => x.type === 'lines')) { lines = linesEditor(); form.append(lines.el); }
    if (f.fields.some(x => x.type === 'questions')) { questions = pollQuestions(); form.append(questions.el); }
    let file = null;
    if (f.upload) { file = h('input', { type: 'file', id: 'bf-file', accept: f.upload.accept || null, required: !!f.upload.required }); form.append(h('div', { class: 'field wide' }, h('label', { for: 'bf-file' }, f.upload.label || 'File'), file, f.upload.help ? h('p', { class: 'help' }, f.upload.help) : null)); }
    const b = h('button', { class: 'btn', type: 'submit' }, f.submit || f.label);
    form.append(h('div', { class: 'form-actions' }, b, h('a', { class: 'btn ghost', href: '#/bridge/' + m.key }, 'Cancel')));
    form.addEventListener('submit', async ev => { ev.preventDefault(); err.hidden = true; busy(b, true);
      try { const values = readFields(form, f.fields.filter(x => !['lines', 'questions'].includes(x.type) && x.fixed === undefined)); for (const x of f.fields) if (x.type === 'checkbox') values[x.name] = !!values[x.name]; if (lines) values.lines = lines.read(); if (questions) values.questions = questions.read();
        const payload = { values }; if (file?.files[0]) { if (file.files[0].size > (f.upload.maxMb || 10) * 1048576) throw new Error(`Files must be ${f.upload.maxMb || 10} MB or smaller.`); payload.file = await readFile(file.files[0]); }
        await api(`/api/bridge/${m.key}/form/${f.id}`, { body: payload }); toast(f.success || 'Saved to the staff portal.'); go('#/bridge/' + m.key); } catch (e) { showError(err, e); } finally { busy(b, false); } });
    view(pageHead(m.title, f.label, f.intro || ''), form);
  }
  function linesEditor() {
    const list = h('ol', { class: 'question-list' });
    const add = () => { const li = h('li', { class: 'question' }, h('input', { maxlength: 200, placeholder: 'Description', 'aria-label': 'Line description' }), h('input', { type: 'number', min: '0', step: 'any', placeholder: 'Qty', 'aria-label': 'Quantity', value: '1' }), h('input', { inputmode: 'decimal', placeholder: 'Unit price £', 'aria-label': 'Unit price in pounds' }), h('button', { class: 'link-button', type: 'button', onclick: () => li.remove() }, 'Remove')); list.append(li); };
    add();
    return { el: h('div', { class: 'field wide' }, h('h3', {}, 'Lines'), list, h('button', { class: 'btn ghost small', type: 'button', onclick: add }, 'Add line')), read: () => [...list.children].map(li => { const [d, q, p] = li.querySelectorAll('input'); return { description: d.value, quantity: Number(q.value), unitPrice: Number(p.value) }; }).filter(l => l.description) };
  }
  function pollQuestions() {
    const list = h('ol', { class: 'question-list' });
    const add = () => { const type = h('select', { 'aria-label': 'Question type' }, ...[['single', 'Choose one'], ['multiple', 'Choose several'], ['rating', 'Rating 1–5'], ['text', 'Text']].map(([v, l]) => h('option', { value: v }, l))); const opts = h('textarea', { rows: 2, placeholder: 'Options, one per line', 'aria-label': 'Options' }); type.addEventListener('change', () => { opts.hidden = !['single', 'multiple'].includes(type.value); }); const li = h('li', { class: 'question' }, h('input', { maxlength: 300, placeholder: 'Question', 'aria-label': 'Question', required: true }), type, opts, h('button', { class: 'link-button', type: 'button', onclick: () => li.remove() }, 'Remove')); list.append(li); };
    add();
    return { el: h('div', { class: 'field wide' }, h('h3', {}, 'Questions'), list, h('button', { class: 'btn ghost small', type: 'button', onclick: add }, 'Add question')), read: () => [...list.children].map(li => ({ text: li.querySelector('input').value, type: li.querySelector('select').value, options: li.querySelector('textarea').value.split('\n').map(s => s.trim()).filter(Boolean), required: true })) };
  }
  function reportView(data) {
    const r = data.report; if (!r) return empty('No report available.');
    const stat = (label, value) => h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(value ?? '—')), h('span', { class: 'stat-label' }, label));
    return [
      section('People · ' + r.month, h('div', { class: 'stats' }, stat('Headcount', r.people?.headcount), stat('Starters', r.people?.starters?.length), stat('Leavers', r.people?.leavers?.length)), r.people?.byCompany?.length ? h('ul', { class: 'bars' }, ...r.people.byCompany.map(c => h('li', {}, h('span', { class: 'bar-label' }, c.company || 'Unassigned'), h('span', { class: 'bar-value' }, c.count)))) : null),
      section('Sign-ins', h('div', { class: 'stats' }, stat('Sign-ins', r.logins?.total), stat('People', r.logins?.people), stat('Busiest day', r.logins?.busiestDay ? fmtDate(r.logins.busiestDay[0]) : '—'))),
      section('Leave', h('div', { class: 'stats' }, stat('Days of leave', r.leave?.total), ...(r.leave?.byType || []).map(t => stat(t.label, t.days)))),
      section('Engagement', h('div', { class: 'stats' }, ...Object.entries(r.engagement || {}).map(([k, v]) => stat({ kudos: 'Kudos', ideas: 'Ideas', announcements: 'Announcements', documents: 'Documents', expenseClaims: 'Expense claims' }[k] || k, v)))),
      r.status ? section('Service status', h('div', { class: 'stats' }, stat('Incidents', r.status.incidents)), h('ul', { class: 'components' }, ...(r.status.services || []).map(s => h('li', {}, h('strong', {}, s.name), chip(s.uptime7d !== undefined ? s.uptime7d + '% (7 days)' : s.state, s.state === 'up' || s.state === 'operational' ? 'good' : ''))))) : null,
      r.money ? section('Money', h('div', { class: 'stats' }, stat('Money in', fmtPounds(r.money.moneyIn)), stat('Spent', fmtPounds(r.money.spent)), stat('Closing balance', fmtPounds(r.money.closing)), stat('Invoices paid', fmtPounds(r.money.invoicesPaid)))) : null,
      r.activity?.length ? section('Top activity', h('ul', { class: 'bars' }, ...r.activity.map(a => h('li', {}, h('span', { class: 'bar-label' }, a.action), h('span', { class: 'bar-value' }, a.count))))) : null,
      h('p', { class: 'small muted' }, 'Generated ' + fmtWhen(r.generatedAt) + ' from the staff portal.')];
  }
  function pollsView(m, data) {
    if (!data.polls?.length) return [empty('There are no staff polls or surveys at the moment.')];
    return data.polls.map(p => {
      const form = p.canRespond ? (() => {
        const f = h('form', { class: 'form' }); const getters = {};
        for (const q of p.questions) {
          const name = 'p' + p.id + q.id;
          if (q.type === 'text') { const t = h('textarea', { rows: 2, maxlength: 2000, 'aria-label': q.text }); getters[q.id] = () => t.value; f.append(h('div', { class: 'field wide' }, h('label', {}, q.text), t)); continue; }
          const opts = q.type === 'rating' ? ['1', '2', '3', '4', '5'] : q.options;
          const box = h('fieldset', { class: 'checks' + (q.type === 'rating' ? ' rating' : '') }, h('legend', {}, q.text), ...opts.map(o => h('label', { class: 'check' }, h('input', { type: q.type === 'multiple' ? 'checkbox' : 'radio', name, value: o }), o)));
          getters[q.id] = () => { const c = [...box.querySelectorAll('input:checked')].map(i => i.value); return q.type === 'multiple' ? c : q.type === 'rating' ? (c[0] ? Number(c[0]) : undefined) : c[0]; };
          f.append(box);
        }
        const b = h('button', { class: 'btn small', type: 'submit' }, 'Submit');
        f.append(b);
        f.addEventListener('submit', async ev => { ev.preventDefault(); busy(b, true); try { const answers = {}; for (const [k, g] of Object.entries(getters)) answers[k] = g(); await api(`/api/bridge/${m.key}/action/polls/respond`, { body: { id: p.id, values: { answers } } }); toast('Thank you.'); render(); } catch (e) { toast(e.message, 'bad'); busy(b, false); } });
        return f;
      })() : null;
      const results = p.results ? h('div', {}, ...p.results.map(q => h('div', { class: 'result' }, h('h4', {}, q.text), q.options ? h('ul', { class: 'bars' }, ...q.options.map(o => h('li', {}, h('span', { class: 'bar-label' }, o.option), h('span', { class: 'bar-value' }, o.count)))) : null, q.average !== undefined ? h('p', {}, 'Average ' + (q.average ?? '—')) : null, q.answers ? h('ul', { class: 'answers' }, ...q.answers.map(a => h('li', {}, a.text + (a.by ? ' — ' + a.by : '')))) : null))) : null;
      return section(p.title, h('p', {}, chip(p.open ? 'Open' : 'Closed', p.open ? 'good' : ''), p.responded ? chip('You responded', 'info') : null, ' ', p.responseCount + ' responses'), p.description ? h('p', {}, p.description) : null, form, results,
        p.canManage ? h('div', { class: 'row-actions' }, ...[['close', 'Close', p.open], ['reopen', 'Reopen', !p.open], ['delete', 'Delete', true]].filter(x => x[2]).map(([a, l]) => h('button', { class: 'link-button', type: 'button', onclick: async () => { if (a === 'delete' && !confirm('Delete this poll?')) return; try { await api(`/api/bridge/${m.key}/action/polls/${a}`, { body: { id: p.id } }); render(); } catch (e) { toast(e.message, 'bad'); } } }, l))) : null);
    });
  }
  function ideasView(m, data) {
    if (!data.ideas?.length) return [empty('No staff ideas yet. Share the first one.')];
    return data.ideas.slice().sort((a, b) => b.votes - a.votes).map(i => section(i.title, h('p', {}, chip(i.statusLabel, toneFor(i.status)), ' ', i.categoryLabel, ' · ', i.author ? i.author.displayName : 'Anonymous', ' · ', fmtDate(i.createdAt)), ...paragraphs(i.body), i.statusNote ? h('p', { class: 'notice' }, i.statusNote) : null,
      h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost small', type: 'button', 'aria-pressed': String(!!i.voted), onclick: async () => { try { await api(`/api/bridge/${m.key}/action/ideas/vote`, { body: { id: i.id } }); render(); } catch (e) { toast(e.message, 'bad'); } } }, (i.voted ? '★ ' : '☆ ') + i.votes + ' votes'),
        data.canManage ? h('button', { class: 'link-button', type: 'button', onclick: () => bridgeAction(m, mod(m.key).views.find(v => v.id === 'ideas'), mod(m.key).views.find(v => v.id === 'ideas').actions.find(a => a.id === 'status'), i) }, 'Set status') : null,
        h('button', { class: 'link-button', type: 'button', onclick: () => bridgeAction(m, mod(m.key).views.find(v => v.id === 'ideas'), mod(m.key).views.find(v => v.id === 'ideas').actions.find(a => a.id === 'comment'), i) }, 'Comment')),
      i.comments?.length ? h('ol', { class: 'thread' }, ...i.comments.map(c => h('li', { class: 'msg' }, h('p', { class: 'msg-meta' }, h('strong', {}, c.author?.displayName || 'Staff'), ' · ', fmtWhen(c.at)), ...paragraphs(c.text)))) : null));
  }
  function calendarView(m, data) {
    const items = data.items || [];
    if (!items.length) return [empty('Nothing in the staff calendar for this period.')];
    const groups = {};
    for (const i of items) (groups[i.startDate] ||= []).push(i);
    return Object.entries(groups).map(([date, list]) => section(fmtDate(date), h('ul', { class: 'files' }, ...list.map(i => h('li', {}, h('strong', {}, i.title), ' ', chip(i.kind === 'event' ? i.type : i.kind.replace('-', ' ')), i.startTime ? h('span', { class: 'small muted' }, ` ${i.startTime}${i.endTime ? '–' + i.endTime : ''}`) : null, i.location ? h('span', { class: 'small muted' }, ' · ' + i.location) : null,
      i.kind === 'event' && data.canManage ? h('button', { class: 'link-button', type: 'button', onclick: async () => { if (!confirm('Delete this calendar event?')) return; try { await api(`/api/bridge/${m.key}/action/calendar/delete`, { body: { id: i.id } }); render(); } catch (e) { toast(e.message, 'bad'); } } }, 'Delete') : null)))));
  }

  // ---------- brand kit & tools ----------
  function brandPage() {
    const k = site.brandkit;
    view(pageHead(site.brand, k.title, k.intro),
      section('Logos', h('div', { class: 'logo-grid' }, ...k.logos.map(l => h('figure', { class: 'logo-tile' + (l.dark ? ' dark' : '') }, h('img', { src: '/assets/brand/' + l.file, alt: l.label, loading: 'lazy' }), h('figcaption', {}, h('strong', {}, l.label), h('span', { class: 'small muted' }, l.company), h('a', { href: '/assets/brand/' + l.file, download: l.file }, 'Download SVG')))))),
      section('Colours', h('div', { class: 'swatches' }, ...k.colours.map(c => { const sw = h('span', { class: 'swatch-chip', dataset: { colour: c.hex } }); return h('div', { class: 'swatch' }, sw, h('strong', {}, c.name), h('code', {}, c.hex), copyButton(c.hex, 'Copy')); }))),
      section('Typography', h('p', { class: 'type-sample' }, 'Plus Jakarta Sans'), ...paragraphs(k.typography)),
      section('Using the logos', h('ul', { class: 'ticks' }, ...k.rules.map(r => h('li', {}, r)))));
    document.querySelectorAll('.swatch-chip').forEach(s => { s.style.background = s.dataset.colour; });
  }
  function toolsPage() {
    view(pageHead(site.brand, site.tools.title, site.tools.intro), h('div', { id: 'tools-root' }, h('p', {}, 'Loading tools…')));
    if (!window.HNTools) { const s = h('script', { src: '/tools.js' }); s.onload = () => window.HNTools.mount($('#tools-root'), { h, toast, copyButton, section }); document.head.append(s); }
    else window.HNTools.mount($('#tools-root'), { h, toast, copyButton, section });
  }

  // ---------- staff hub ----------
  async function staffHub() {
    if (!staff) return needStaff();
    let audit = null;
    if (staff.admin) { try { audit = (await api('/api/audit')).audit; } catch {} }
    const avatar = staff.avatar ? h('img', { class: 'avatar', src: '/api/avatar', alt: '' }) : h('span', { class: 'avatar initials', 'aria-hidden': 'true' }, staff.name.split(/\s+/).map(s => s[0]).slice(0, 2).join(''));
    view(pageHead('Staff', 'Hello, ' + staff.name.split(' ')[0], staff.admin ? 'You can manage this website (system owner or Super Admin).' : 'Signed in with HN Group Auth.'),
      section('Signed in', h('div', { class: 'profile' }, avatar, h('div', {}, h('strong', {}, staff.name), h('p', { class: 'small muted' }, [staff.jobTitle, staff.email].filter(Boolean).join(' · ')))),
        h('div', { class: 'row-actions' }, h('a', { class: 'btn ghost small', href: '/auth/login?switch=1' }, 'Switch account'), h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { await api('/auth/logout', { body: {} }).catch(() => {}); staff = null; header(); go('#/'); } }, 'Sign out'))),
      section('Areas', h('ul', { class: 'related' }, ...site.modules.filter(m => canSeeModule(m) || (m.type === 'items' && staff)).map(m => h('li', {}, h('a', { href: moduleHref(m) }, m.title), h('span', { class: 'muted small' }, m.manage === 'staff' || staff.admin ? ' — you can manage this' : ''))),
        site.accounts && staff.admin ? h('li', {}, h('a', { href: '#/accounts' }, (site.accounts.label || 'Account') + 's')) : null, h('li', {}, h('a', { href: '#/ref' }, 'Look up a private reference')))),
      Object.keys(site.providers).length ? providersPanel() : null,
      audit ? h('details', { class: 'panel reveal' }, h('summary', {}, 'Recent activity on this website'), h('ul', { class: 'history' }, ...audit.slice(0, 100).map(a => h('li', {}, fmtWhen(a.at) + ' · ' + a.actor + ' · ' + a.action + (a.detail ? ' · ' + a.detail : ''))))) : null,
      h('p', { class: 'small muted' }, 'Maintenance and power controls for this website are in ', link('https://admin.hngroup.org.uk', 'HN Group website control'), '.'));
  }
  function deniedPage() {
    const reason = new URLSearchParams(location.search).get('reason');
    view(pageHead(site.brand, reason === 'denied' ? 'Access not available' : reason === 'unavailable' ? 'Sign-in temporarily unavailable' : 'Sign-in expired',
      reason === 'denied' ? 'Your staff account cannot manage this website. Only the system owner and Super Admin members can.' : reason === 'unavailable' ? 'HN Group Auth could not be reached. Please try again shortly.' : 'Please start signing in again.'),
      h('p', {}, h('a', { class: 'btn', href: '/auth/login?switch=1' }, 'Try another account'), ' ', h('a', { class: 'btn ghost', href: '/' }, 'Back to home')));
  }

  // ---------- router ----------
  async function render() {
    main.setAttribute('aria-busy', 'true');
    menuClose();
    if (location.pathname === '/admin/denied') return deniedPage();
    const [path] = location.hash.replace(/^#\/?/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    try {
      if (!parts.length) return home();
      const [area, key, a, b] = parts;
      if (area === 'ref') return referencePage();
      if (area === 'account' && key === 'activate' && a) return activatePage(a);
      if (area === 'account') return site.accounts ? accountPage() : home();
      if (area === 'accounts') return accountsAdmin();
      if (area === 'staff') return staffHub();
      if (area === 'brand' && site.brandkit) return brandPage();
      if (area === 'tools' && site.tools) return toolsPage();
      if (area === 'sign' && key) return signerPage(key);
      const m = mod(key);
      if (!m) return failure(Object.assign(new Error('This page does not exist.'), { status: 404 }));
      if (area === 'm') { if (!a) return itemsList(m); if (a === 'new') return itemForm(m, null); if (b === 'edit') { const r = await api(`/api/m/${m.key}/${a}`); return itemForm(m, r.item); } return itemDetail(m, a); }
      if (area === 'b') { if (!a) return builderList(m); if (a === 'edit') return builderEdit(m, b || 'new'); if (b === 'results') return builderResults(m, a); return builderFill(m, a); }
      if (area === 'forum') { if (!a) return forumList(m); if (a === 'new') return forumNew(m); return forumThread(m, a); }
      if (area === 'status') return statusPage(m);
      if (area === 'health') return healthPage(m);
      if (area === 'signing') { if (!a) return signingAdmin(m); if (a === 'new') return signingNew(m); return signingDetail(m, a); }
      if (area === 'bridge') { if (a === 'form') return bridgeForm(m, b); return bridgePage(m); }
      failure(Object.assign(new Error('This page does not exist.'), { status: 404 }));
    } catch (e) { failure(e); }
  }
  function menuClose() { const t = document.querySelector('.menu-toggle'); if (t) { t.setAttribute('aria-expanded', 'false'); document.querySelector('.menu')?.classList.remove('open'); } }
  async function boot() {
    try { const r = await api('/api/site'); site = r.site; staff = r.staff; account = r.account; }
    catch (e) { main.replaceChildren(h('div', { class: 'wrap' }, h('h1', {}, 'Temporarily unavailable'), h('p', {}, e.message))); return; }
    if (location.pathname === '/admin' && staff && !location.hash) history.replaceState(null, '', '/#/staff');
    header(); footer();
    window.addEventListener('hashchange', () => { render(); main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); });
    render();
  }
  boot();
})();
