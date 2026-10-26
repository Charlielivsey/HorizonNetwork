'use strict';
// HN Group App Manager's window. The page is built once (index.html) and updated in place from the state the main
// process sends, so nothing flickers. Every request goes through window.manager.call, which the main process checks.
const api = window.manager;
const $ = (id) => document.getElementById(id), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let state = null, page = 'apps', appId = null, filter = 'all', toastTimer = null, lastAccount = null, pinBusy = false;
const forms = {};

// ---------- Small helpers ----------
const ICONS = {
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  shield: '<path d="M12 3 20 6v6c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  play: '<path d="M7 4v16l13-8z"/>', more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>', back: '<path d="M15 6l-6 6 6 6"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>', trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/>', sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
};
const svg = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
const paintIcons = (root = document) => { for (const i of $$('i[data-icon]', root)) if (!i.firstChild) i.innerHTML = svg(i.dataset.icon); };
function el(tag, attrs, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (k === 'html') n.innerHTML = v; else n.setAttribute(k, v === true ? '' : v); }
  for (const c of children.flat(9)) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
const icon = (name) => el('i', { 'data-icon': name, html: svg(name) });
const text = (id, v) => { const n = typeof id === 'string' ? $(id) : id; v = String(v ?? ''); if (n && n.textContent !== v) n.textContent = v; };
const showIf = (id, on) => { const n = typeof id === 'string' ? $(id) : id; if (n && n.hidden === !!on) n.hidden = !on; };
const short = (v) => String(v || '').split('-')[0];
const mb = (b) => (b / 1048576).toFixed(b >= 104857600 ? 0 : 1) + ' MB';
const day = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };
const ago = (at) => { const d = new Date(at); if (isNaN(d)) return ''; const s = (Date.now() - d) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; return (new Date().toDateString() === d.toDateString() ? 'today' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) + ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
const mac = () => state && state.platform === 'darwin';
function toast(message, bad = false) { const t = $('toast'); t.textContent = message; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000); }
async function call(method, ...args) { const r = await api.call(method, ...args); if (!r || !r.ok) throw Error((r && r.error) || 'Something went wrong.'); return r.value; }
async function act(method, ...args) { try { return { value: await call(method, ...args) }; } catch (e) { toast(e.message, true); return null; } }
async function busy(button, fn) { if (!button || button.disabled) return; button.disabled = true; button.classList.add('working'); try { return await fn(); } finally { button.classList.remove('working'); button.disabled = false; render(); } }

// ---------- Questions, as cards in the HN design ----------
const questions = []; let asking = null;
function ask(spec) { return new Promise((resolve) => { questions.push({ ...spec, resolve }); if (!asking) nextQuestion(); }); }
function nextQuestion() {
  asking = questions.shift() || null;
  const layer = $('layer');
  if (!asking) { layer.classList.remove('open'); setTimeout(() => { if (!asking) layer.hidden = true; }, 180); return; }
  $('sheet').dataset.tone = asking.tone || 'accent';
  $('sheet-icon').innerHTML = svg(asking.icon || 'alert');
  text('sheet-title', asking.title); text('sheet-text', asking.text || ''); text('sheet-note', asking.note || ''); showIf('sheet-note', !!asking.note);
  $('sheet-buttons').replaceChildren(...asking.buttons.map((b) => el('button', { class: 'btn ' + (b.tone === 'danger' ? 'danger-fill' : b.tone === 'primary' ? 'primary' : ''), 'data-choice': b.id, onclick: () => answer(b.id) }, b.label)));
  layer.hidden = false; layer.classList.remove('open'); void layer.offsetWidth; layer.classList.add('open');
  const safe = $('sheet-buttons').querySelector('[data-choice=cancel]'); if (safe) { safe.focus(); requestAnimationFrame(() => safe.focus()); }
}
function answer(choice) { const q = asking; if (!q) return; nextQuestion(); q.resolve(choice); }
const confirmed = async (spec) => (await ask({ ...spec, buttons: [{ id: 'cancel', label: spec.cancel || 'Cancel' }, { id: 'ok', label: spec.confirm, tone: spec.tone === 'danger' ? 'danger' : 'primary' }] })) === 'ok';
api.onDialog((spec) => ask({ ...spec, fromMain: spec.id }).then((c) => api.call('dialog-answer', spec.id, c)), (id) => { if (asking && asking.fromMain === id) answer('cancel'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (asking) { e.preventDefault(); answer('cancel'); } else closeMenu(); } });
$('layer').querySelector('.scrim').addEventListener('click', () => answer('cancel'));

// ---------- The "…" menu ----------
let menuFor = null;
function openMenu(button, items) {
  const m = $('menu'); menuFor = button;
  m.replaceChildren(...items.map((i) => el('button', { role: 'menuitem', class: i.tone === 'danger' ? 'danger' : '', onclick: () => { closeMenu(); i.run(); } }, icon(i.icon), el('span', {}, i.label))));
  m.hidden = false;
  const r = button.getBoundingClientRect();
  m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 10) + 'px'; m.style.left = Math.max(10, r.right - m.offsetWidth) + 'px';
  m.classList.remove('open'); void m.offsetWidth; m.classList.add('open'); const first = m.querySelector('button'); if (first) first.focus();
}
function closeMenu() { const m = $('menu'); if (m.hidden) return; m.hidden = true; if (menuFor && document.contains(menuFor)) menuFor.focus(); menuFor = null; }
document.addEventListener('click', (e) => { if (!$('menu').hidden && !$('menu').contains(e.target) && !(menuFor && menuFor.contains(e.target))) closeMenu(); });

// ---------- What an app can do now ----------
const appOf = (id) => state && state.manager.apps.find((a) => a.id === id);
const jobFor = (id) => (state.manager.job && state.manager.job.id === id ? state.manager.job : null);
const queued = (id) => state.manager.queue.some((j) => j.id === id);
function status(a) {
  const j = jobFor(a.id);
  if (j) return { text: { preparing: 'Getting ready', waiting: 'Waiting for you to quit it', downloading: 'Downloading', installing: 'Installing', removing: 'Removing' }[j.phase] || 'Working', tone: 'busy' };
  if (queued(a.id)) return { text: 'Queued', tone: 'busy' };
  if (!a.available) return { text: 'Not for this computer', tone: '' };
  if (a.error) return { text: 'Couldn’t check', tone: 'bad' };
  if (!a.installed) return { text: 'Not installed', tone: '' };
  if (a.update) return { text: 'Update available', tone: 'accent' };
  return { text: a.running ? 'Up to date · open' : 'Up to date', tone: 'good' };
}
function primary(a) {
  if (jobFor(a.id) || queued(a.id)) return { kind: 'cancel', label: jobFor(a.id) ? 'Cancel' : 'Remove from queue', icon: 'x', disabled: !!jobFor(a.id) && !jobFor(a.id).cancellable };
  if (!a.available) return null;
  if (!a.installed) return { kind: 'install', label: 'Install', icon: 'download', disabled: !a.latest };
  if (a.update) return { kind: 'update', label: 'Update to ' + short(a.latest.version), icon: 'download' };
  return { kind: 'open', label: 'Open', icon: 'play' };
}
function moreItems(a) {
  if (!a.installed || jobFor(a.id) || queued(a.id)) return [];
  const items = [];
  if (a.update) items.push({ label: 'Open', icon: 'play', run: () => perform(a.id, 'open') });
  items.push({ label: mac() ? 'Show in Finder' : 'Show in folder', icon: 'folder', run: () => act('reveal', a.id) });
  if (a.latest) items.push({ label: 'Reinstall', icon: 'wrench', run: () => perform(a.id, 'reinstall') });
  items.push({ label: 'Settings', icon: 'sliders', run: () => go('app', a.id) });
  items.push({ label: 'Remove…', icon: 'trash', tone: 'danger', run: () => perform(a.id, 'remove') });
  return items;
}
async function perform(id, kind, button) {
  const a = appOf(id); if (!a) return;
  const queueIt = async () => { const r = await act('enqueue', id, kind); return !!r; };
  if (kind === 'open') return act('open', id);
  if (kind === 'cancel') return act('cancel', id);
  if (kind === 'install') { if (await confirmed({ title: 'Install ' + a.name + ' ' + short(a.latest.version) + '?', text: mac() ? 'It goes in your Applications folder once its download is checked. macOS may ask for your password.' : 'Its installer runs quietly once the download is checked.', icon: 'download', confirm: 'Install' })) await queueIt(); return; }
  if (kind === 'reinstall') { if (await confirmed({ title: 'Reinstall ' + a.name + '?', text: 'A fresh, checked copy of version ' + short(a.latest.version) + ' replaces the one on this ' + (mac() ? 'Mac' : 'PC') + '. Your account, settings and data are kept.', icon: 'wrench', confirm: 'Reinstall' })) await queueIt(); return; }
  if (kind === 'update') { if (await queueIt() && a.running) toast(a.name + ' updates as soon as you quit it.'); return; }
  if (kind === 'remove') {
    if (!await confirmed({ title: 'Remove ' + a.name + '?', text: (mac() ? 'It moves to the Bin.' : 'Its uninstaller runs.') + ' Your account, settings and data stay on this computer, so reinstalling picks up where you left off.', note: a.id === 'network' ? 'Disconnect the VPN first. WireGuard and this computer’s VPN set-up are kept.' : '', icon: 'trash', tone: 'danger', confirm: 'Remove' })) return;
    if (await queueIt() && a.running) toast(a.name + ' is removed as soon as you quit it.');
  }
}
function actionButtons(a, large) {
  const p = primary(a), out = [];
  if (p) out.push(el('button', { class: 'btn ' + (p.kind === 'cancel' ? '' : 'primary') + (large ? ' big' : ''), 'data-action': p.kind, disabled: p.disabled || null, onclick: (e) => busy(e.currentTarget, () => perform(a.id, p.kind, e.currentTarget)) }, icon(p.icon), el('span', {}, p.label)));
  if (moreItems(a).length) out.push(el('button', { class: 'btn icon-only' + (large ? ' big' : ''), 'aria-label': 'More for ' + a.name, 'aria-haspopup': 'menu', 'data-action': 'more', onclick: (e) => openMenu(e.currentTarget, moreItems(a)) }, icon('more')));
  if (!a.available) out.push(el('span', { class: 'small muted' }, a.id === 'browser' && mac() ? 'HN Browser needs a Mac with Apple silicon.' : 'Not available for this computer.'));
  else if (!a.installed && !a.latest && !jobFor(a.id)) out.push(el('span', { class: 'small muted' }, state.manager.checkedAt ? 'There’s no download for this computer yet.' : 'Check for updates to install it.'));
  return out;
}
function progress(j) {
  const bar = el('div', { class: 'bar' + (j.phase === 'downloading' ? '' : ' moving') }, el('i'));
  if (j.phase === 'downloading' && j.total) bar.firstChild.style.transform = 'scaleX(' + j.received / j.total + ')';
  return bar;
}
function phaseText(a, j) {
  return j.phase === 'waiting' ? 'Waiting for you to quit ' + a.name + (mac() ? ', including its menu bar icon.' : ', including its tray icon.')
    : j.phase === 'downloading' ? 'Downloading ' + short(j.version) + ' · ' + mb(j.received) + ' of ' + mb(j.total)
      : j.phase === 'installing' ? 'Installing ' + short(j.version) + '…' : j.phase === 'removing' ? 'Removing…' : 'Getting ready…';
}

// ---------- Apps ----------
const rows = {};
function renderApps() {
  const m = state.manager, apps = m.apps, updates = apps.filter((a) => a.update), installed = apps.filter((a) => a.installed);
  text('apps-title', m.job ? 'Working on it…' : updates.length ? (updates.length === 1 ? updates[0].name + ' has an update' : updates.length + ' updates are ready') : installed.length ? 'Everything’s up to date' : 'Let’s get you set up');
  text('apps-sub', m.checking ? 'Checking downloads.hngroup.org.uk…' : m.checkedAt ? 'Last checked ' + ago(m.checkedAt) + '.' : 'Not checked yet.');
  const c = $('check'); c.disabled = m.checking; c.classList.toggle('working', m.checking);
  showIf('update-all', updates.length > 1 || (updates.length === 1 && !m.job)); text($('update-all').querySelector('span'), updates.length > 1 ? 'Update all (' + updates.length + ')' : 'Update');
  showIf('apps-error', !!m.error); text('apps-error', m.error || '');
  showIf('move-banner', state.updater.location === 'temporary');
  for (const a of apps) {
    let r = rows[a.id];
    if (!r) {
      r = rows[a.id] = { node: el('article', { class: 'app-row', 'data-app': a.id }), pill: el('span', { class: 'pill' }), line: el('p', { class: 'small muted line-text' }), actions: el('div', { class: 'row end' }), prog: el('div', { class: 'row-progress' }), key: '' };
      r.node.append(el('img', { class: 'app-icon', src: 'assets/' + a.icon, alt: '' }), el('div', { class: 'grow' }, el('div', { class: 'title-line' }, el('button', { class: 'app-name', onclick: () => go('app', a.id) }, a.name), r.pill), el('p', { class: 'muted' }, a.tagline), r.line, r.prog), r.actions);
      $('app-list').append(r.node);
    }
    const s = status(a), j = jobFor(a.id);
    r.pill.className = 'pill ' + s.tone; text(r.pill, s.text);
    text(r.line, j ? phaseText(a, j) : a.installed ? 'Version ' + a.installed.version + (a.installed.build ? ' (build ' + a.installed.build + ')' : '') + (a.update ? ' → ' + short(a.latest.version) : '') : a.latest ? 'Latest version ' + short(a.latest.version) + ' · ' + mb(a.latest.size) : a.error || '');
    r.prog.replaceChildren(...(j ? [progress(j)] : []));
    const key = JSON.stringify([primary(a), moreItems(a).map((i) => i.label), a.available, !!a.latest, !!m.checkedAt]);
    if (key !== r.key) { r.key = key; r.actions.replaceChildren(...actionButtons(a)); }
  }
}

// ---------- One app ----------
let shownApp = null, appKey = '';
function renderApp() {
  const a = appOf(appId); if (!a) { page = 'apps'; return renderApps(); }
  if (shownApp !== a.id) { shownApp = a.id; appKey = ''; $('app-icon').src = 'assets/' + a.icon; text('app-name', a.name); text('app-kind', a.kind); text('app-tagline', a.tagline); }
  const s = status(a); $('app-pill').className = 'pill ' + s.tone; text('app-pill', s.text);
  const key = JSON.stringify([primary(a), moreItems(a).map((i) => i.label), !!a.latest]);
  if (key !== appKey) { appKey = key; $('app-actions').replaceChildren(...actionButtons(a, true)); }
  const j = jobFor(a.id); showIf('app-progress', !!j);
  if (j) $('app-progress').replaceChildren(el('b', {}, j.phase === 'waiting' ? 'Waiting for you to quit ' + a.name : { downloading: 'Downloading ', installing: 'Installing ', removing: 'Removing ' }[j.phase] ? { downloading: 'Downloading ', installing: 'Installing ', removing: 'Removing ' }[j.phase] + a.name : 'Getting ready'), el('span', { class: 'small muted' }, phaseText(a, j)), progress(j));
  const facts = [['Installed', a.installed ? a.installed.version : 'Not installed', a.installed && a.installed.build ? 'Build ' + a.installed.build : ''],
    ['Latest', a.latest ? short(a.latest.version) : '—', a.latest ? (a.latest.publishedAt ? 'Released ' + day(a.latest.publishedAt) + ' · ' : '') + mb(a.latest.size) : ''],
    ['Status', a.running ? 'Open' : a.installed ? 'Closed' : '—', a.running ? 'Quit it to update, remove or change its settings.' : ''],
    ['Location', a.installed ? a.installed.path : '—', '']];
  const fk = JSON.stringify(facts);
  if ($('app-facts').dataset.key !== fk) { $('app-facts').dataset.key = fk; $('app-facts').replaceChildren(...facts.map(([k, v, n]) => el('div', {}, el('dt', {}, k), el('dd', { class: k === 'Location' ? 'path' : '' }, v), n ? el('small', { class: 'muted' }, n) : null))); }
  showIf('app-danger', !!a.installed);
  text('remove-text', mac() ? 'Moves ' + a.name + ' to the Bin. Your account, settings and data are kept.' : 'Runs ' + a.name + '’s uninstaller. Your account, settings and data are kept.');
  renderSettings(a);
}
async function loadSettings(id, force) {
  const f = forms[id] || (forms[id] = {}); if (f.loading || (f.data && !force)) return;
  f.loading = true; f.error = '';
  try { f.data = await call('settings', id); f.draft = { ...f.data.values }; f.key = ''; } catch (e) { f.error = e.message; } finally { f.loading = false; render(); }
}
function renderSettings(a) {
  const f = forms[a.id] || {}, body = $('settings-body'), locked = a.running || !!jobFor(a.id) || queued(a.id);
  text('settings-note', !a.installed ? 'Install ' + a.name + ' to change its settings here.' : locked ? 'Quit ' + a.name + ' to change its settings here, or change them in the app itself.' : 'Saved to ' + a.name + ' while it’s closed. They apply the next time it opens.');
  const dirty = !!(f.data && f.draft) && Object.keys(f.draft).some((k) => f.draft[k] !== f.data.values[k]); showIf('save-bar', dirty && !locked);
  const key = JSON.stringify([a.id, !!a.installed, locked, f.loading, f.error, f.data && f.data.values]);
  if (key === f.key && body.dataset.app === a.id) { for (const c of $$('[data-setting]', body)) sync(c, f); return; }
  f.key = key; body.dataset.app = a.id;
  if (!a.installed) return body.replaceChildren();
  if (f.loading || !f.data) return body.replaceChildren(el('p', { class: 'muted small' }, f.error || 'Loading settings…'));
  const groups = {}; for (const field of f.data.fields) (groups[field.group] = groups[field.group] || []).push(field);
  body.replaceChildren(...Object.entries(groups).map(([g, fields]) => el('div', { class: 'group' }, el('h3', {}, g), ...fields.map((field) => settingRow(a, field, f, locked)))));
}
function settingRow(a, field, f, locked) {
  const id = 'setting-' + field.key, k = field.key; let control;
  if (field.type === 'boolean') control = el('button', { class: 'switch', role: 'switch', id, 'data-setting': k, 'aria-label': field.label, 'aria-checked': String(!!f.draft[k]), disabled: locked || null, onclick: () => { f.draft[k] = !f.draft[k]; renderSettings(a); } });
  else if (field.type === 'choice' && field.options.length <= 3) control = el('div', { class: 'segmented small', id, 'data-setting': k, role: 'group', 'aria-label': field.label }, ...field.options.map((o) => el('button', { 'data-value': String(o.value), 'aria-pressed': String(f.draft[k] === o.value), disabled: locked || null, onclick: () => { f.draft[k] = o.value; renderSettings(a); } }, o.label)));
  else if (field.type === 'choice') { control = el('select', { id, 'data-setting': k, disabled: locked || null, onchange: (e) => { f.draft[k] = field.options.find((o) => String(o.value) === e.target.value).value; renderSettings(a); } }, ...field.options.map((o) => el('option', { value: String(o.value) }, o.label))); control.value = String(f.draft[k]); }
  else control = el('input', { id, 'data-setting': k, value: f.draft[k], spellcheck: 'false', autocomplete: 'off', disabled: locked || null, oninput: (e) => { f.draft[k] = e.target.value; renderSettings(a); } });
  return el('div', { class: 'setting' }, el('label', { for: id }, el('b', {}, field.label), field.hint ? el('small', {}, field.hint) : null), control);
}
function sync(c, f) {
  const v = f.draft[c.dataset.setting];
  if (c.classList.contains('switch')) c.setAttribute('aria-checked', String(!!v));
  else if (c.classList.contains('segmented')) { for (const b of c.children) b.setAttribute('aria-pressed', String(b.dataset.value === String(v))); }
  else if (c.tagName === 'SELECT') { if (c.value !== String(v)) c.value = String(v); }
  else if (document.activeElement !== c && c.value !== v) c.value = v;
}
$('settings-discard').addEventListener('click', () => { const f = forms[appId]; if (f && f.data) { f.draft = { ...f.data.values }; renderSettings(appOf(appId)); } });
$('settings-save').addEventListener('click', (e) => {
  const id = appId, f = forms[id], patch = {};
  for (const k of Object.keys(f.draft)) if (f.draft[k] !== f.data.values[k]) patch[k] = f.draft[k];
  busy(e.currentTarget, async () => { try { await call('save-settings', id, patch); f.data.values = { ...f.draft }; f.key = ''; toast('Saved. ' + appOf(id).name + ' uses them when it next opens.'); } catch (err) { toast(err.message, true); } });
});
$('remove').addEventListener('click', (e) => busy(e.currentTarget, () => perform(appId, 'remove')));

// ---------- Updates ----------
function renderUpdates() {
  const u = state.updater, latest = u.latest ? short(u.latest.version) : '';
  text('self-version', 'Version ' + state.version + (state.build ? ' (build ' + state.build + ')' : '') + ' for ' + (mac() ? 'macOS' : 'Windows'));
  const msg = { idle: 'Not checked yet.', checking: 'Checking for updates…', 'up-to-date': 'App Manager is up to date' + (u.checkedAt ? ' (checked ' + ago(u.checkedAt) + ').' : '.'), available: 'Version ' + latest + ' is available.', downloading: 'Downloading version ' + latest + '… ' + u.progress + '%', ready: 'Version ' + latest + ' is ready to install.' + (state.preferences.autoUpdateSelf ? ' It installs when App Manager next restarts, or now.' : ''), installing: 'Installing. App Manager reopens by itself.', error: u.error || 'The update didn’t work.', unsupported: 'This copy of App Manager can’t update itself (it isn’t an installed copy).' }[u.status] || '';
  text('self-status', msg); $('self-status').className = u.status === 'error' ? 'bad' : u.status === 'ready' ? 'good' : '';
  showIf('self-bar', u.status === 'downloading'); $('self-bar').firstElementChild.style.transform = 'scaleX(' + (u.progress || 0) / 100 + ')';
  const key = [u.status, u.location, !!u.latest].join();
  if ($('self-actions').dataset.key !== key) {
    $('self-actions').dataset.key = key;
    const b = [];
    if (u.location === 'temporary') b.push(el('button', { class: 'btn primary', 'data-action': 'move', onclick: (e) => moveToApplications(e.currentTarget) }, icon('folder'), el('span', {}, 'Move to Applications')));
    if (u.status === 'available' || (u.status === 'error' && u.latest)) b.push(el('button', { class: 'btn primary', id: 'self-download', onclick: (e) => busy(e.currentTarget, () => act('self-download')) }, icon('download'), el('span', {}, u.status === 'error' ? 'Try again' : 'Download update')));
    if (u.status === 'ready') b.push(el('button', { class: 'btn primary', id: 'self-install', onclick: (e) => restart(e.currentTarget) }, icon('refresh'), el('span', {}, 'Restart to update')));
    if (!['downloading', 'installing', 'checking'].includes(u.status)) b.push(el('button', { class: 'btn', id: 'self-check', onclick: (e) => busy(e.currentTarget, async () => { const r = await act('self-check'); if (r && r.value.status === 'up-to-date') toast('App Manager is up to date.'); }) }, icon('refresh'), el('span', {}, 'Check now')));
    $('self-actions').replaceChildren(...b);
  }
  const list = state.manager.apps.filter((a) => a.installed);
  const lk = JSON.stringify(list.map((a) => [a.id, a.update, a.installed.version, !!jobFor(a.id), queued(a.id)]));
  if ($('updates-list').dataset.key !== lk) {
    $('updates-list').dataset.key = lk;
    $('updates-list').replaceChildren(...(list.length ? list.map((a) => el('div', { class: 'line' }, el('img', { class: 'app-icon s', src: 'assets/' + a.icon, alt: '' }), el('div', { class: 'grow' }, el('b', {}, a.name), el('p', { class: 'small muted' }, a.update ? a.installed.version + ' → ' + short(a.latest.version) : 'Up to date · ' + a.installed.version)),
      ...(jobFor(a.id) || queued(a.id) ? [el('span', { class: 'pill busy' }, status(a).text)] : a.update ? [el('button', { class: 'btn small primary', onclick: (e) => busy(e.currentTarget, () => perform(a.id, 'update')) }, 'Update')] : []))) : [el('p', { class: 'muted small' }, 'No HN Group apps are installed yet.')]));
  }
}
async function restart(button) { if (await confirmed({ title: 'Restart to update App Manager?', text: 'App Manager closes, installs version ' + short(state.updater.latest.version) + ' and opens again. Your apps aren’t touched.' + (mac() ? ' macOS may ask for your password.' : ''), icon: 'refresh', confirm: 'Restart and update' })) busy(button, () => act('self-install')); }
async function moveToApplications(button) { if (await confirmed({ title: 'Move App Manager to Applications?', text: 'It copies itself to your Applications folder and reopens from there, so it can keep itself up to date. macOS may ask for your password.', icon: 'folder', confirm: 'Move and reopen' })) busy(button, () => act('move-to-applications')); }
for (const b of $$('#move-banner [data-action=move]')) b.addEventListener('click', (e) => moveToApplications(e.currentTarget));

// ---------- Activity ----------
const KIND_ICON = { install: 'download', update: 'refresh', reinstall: 'wrench', remove: 'trash', settings: 'sliders', check: 'check', manager: 'grid', account: 'key', error: 'alert' };
const FILTERS = { all: () => true, changes: (a) => ['install', 'update', 'reinstall', 'remove', 'manager'].includes(a.kind), problems: (a) => a.kind === 'error' };
let activityKey = '';
function renderActivity() {
  const items = state.activity.filter(FILTERS[filter]), key = filter + JSON.stringify(items.map((a) => a.at + a.message)) + Math.floor(Date.now() / 60000);
  if (key === activityKey) return; activityKey = key;
  $('clear-activity').disabled = !state.activity.length;
  $('activity').replaceChildren(...(items.length ? items.map((a) => el('div', { class: 'event ' + a.kind }, el('span', { class: 'event-icon', html: svg(KIND_ICON[a.kind] || 'grid') }), el('div', { class: 'grow' }, el('p', {}, a.message), el('small', { class: 'muted' }, ago(a.at))))) : [el('p', { class: 'empty muted' }, filter === 'all' ? 'Nothing yet. Installs, updates and changes show up here.' : 'Nothing to show here.')]));
}
for (const b of $$('#activity-filter button')) b.addEventListener('click', () => { filter = b.dataset.filter; for (const x of $$('#activity-filter button')) x.setAttribute('aria-pressed', String(x === b)); renderActivity(); });
$('clear-activity').addEventListener('click', async () => { if (await confirmed({ title: 'Clear the activity history?', text: 'This only clears the list. Nothing is installed or removed.', icon: 'history', confirm: 'Clear history' })) act('clear-activity'); });

// ---------- Settings and diagnostics ----------
function renderSettingsPage() {
  const p = state.preferences;
  for (const b of $$('#theme button')) b.setAttribute('aria-pressed', String(p.theme === b.dataset.theme));
  text('background-label', mac() ? 'Keep running in the menu bar' : 'Keep running in the system tray');
  const d = state.device;
  text('device-name', d && d.name ? d.name : 'This computer');
  text('device-text', d ? (d.allowed ? 'Approved on devices.hngroup.org.uk' + (d.owner ? ' for ' + d.owner.displayName : '') + '.' : 'Not approved on devices.hngroup.org.uk.') + (d.offline ? ' Couldn’t check just now.' : '') : '');
}
for (const sw of $$('[data-pref]')) sw.addEventListener('click', () => act('preference', sw.dataset.pref, !state.preferences[sw.dataset.pref]));
for (const b of $$('#theme button')) b.addEventListener('click', () => act('theme', b.dataset.theme));
for (const b of $$('[data-site]')) b.addEventListener('click', () => act('website', b.dataset.site));
$('run-check').addEventListener('click', (e) => busy(e.currentTarget, async () => {
  const r = await act('diagnostics', true); if (!r) return;
  const { check, text: all } = r.value;
  $('checks').replaceChildren(...check.steps.map((s) => el('li', { class: s.ok ? 'ok' : 'bad' }, el('span', { html: svg(s.ok ? 'check' : 'x') }), el('div', {}, el('b', {}, s.name), el('small', { class: 'muted' }, s.detail)))));
  $('log-tail').textContent = (all.split('— Recent log —')[1] || '').trim().split('\n').slice(-40).join('\n'); showIf('log-tail', true);
  toast(check.ok ? 'Everything checked out.' : 'Something needs attention. Copy the diagnostics and send them to HN Group.', !check.ok);
}));
$('copy-diagnostics').addEventListener('click', async () => { if (await act('copy-diagnostics')) toast('Diagnostics copied. Paste them into a message to HN Group.'); });
$('open-logs').addEventListener('click', () => act('open-logs'));

// ---------- Your account ----------
const initials = (n) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
function avatar(node, acc) { const k = (acc.avatar || '') + '|' + (acc.user ? acc.user.displayName : ''); if (node.dataset.key === k) return; node.dataset.key = k; node.replaceChildren(acc.avatar ? el('img', { src: acc.avatar, alt: '' }) : document.createTextNode(initials(acc.user && acc.user.displayName))); }
const pinInput = $('pin-input'), PIN_HINT = 'It unlocks as soon as you type the sixth digit.';
function paintPin() { const v = pinInput.value; $$('#pin span').forEach((s, i) => { s.classList.toggle('filled', i < v.length); s.classList.toggle('next', i === Math.min(v.length, 5)); }); }
function renderAccount() {
  const acc = state.account, open = acc.status === 'unlocked';
  showIf('gate', !open); showIf('shell', open);
  for (const s of $$('.step')) showIf(s, s.dataset.step === acc.status);
  showIf('gate-error', !!state.accountError && !open); text('gate-error', state.accountError || '');
  text('gate-version', 'App Manager ' + state.version);
  if (acc.user) {
    for (const [id, v] of [['lock-name', acc.user.displayName], ['lock-email', acc.user.email], ['me-name', acc.user.displayName], ['me-sub', acc.user.jobTitle || acc.user.email], ['set-name', acc.user.displayName], ['set-email', acc.user.email]]) text(id, v);
    for (const id of ['lock-avatar', 'me-avatar', 'set-avatar']) avatar($(id), acc);
  }
  if (acc.status === 'locked' && lastAccount !== 'locked') { pinInput.value = ''; paintPin(); text('pin-status', PIN_HINT); $('pin-status').classList.remove('bad'); requestAnimationFrame(() => pinInput.focus()); }
  lastAccount = acc.status;
}
pinInput.addEventListener('input', async () => {
  pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6); paintPin();
  const box = $('pin'); box.classList.remove('wrong');
  if (pinInput.value.length < 6 || pinBusy) return;
  pinBusy = true; box.classList.add('checking'); text('pin-status', 'Checking your PIN…'); $('pin-status').classList.remove('bad');
  try { await call('unlock', pinInput.value); text('pin-status', PIN_HINT); }
  catch (e) { void box.offsetWidth; box.classList.add('wrong'); text('pin-status', e.message); $('pin-status').classList.add('bad'); }
  finally { pinInput.value = ''; pinBusy = false; box.classList.remove('checking'); paintPin(); if (state && state.account.status === 'locked') pinInput.focus(); }
});
pinInput.addEventListener('focus', () => $('pin').classList.add('focus'));
pinInput.addEventListener('blur', () => $('pin').classList.remove('focus'));
$('pin').addEventListener('click', () => pinInput.focus());
$('sign-in').addEventListener('click', (e) => busy(e.currentTarget, () => act('sign-in')));
$('sign-in-again').addEventListener('click', () => act('sign-in'));
$('sign-in-cancel').addEventListener('click', () => act('sign-in-cancel'));
$('switch-account').addEventListener('click', async () => { if (await confirmed({ title: 'Use another account?', text: 'App Manager forgets ' + ((state.account.user || {}).displayName || 'this account') + ' on this computer. Installed apps aren’t touched.', icon: 'key', confirm: 'Use another account' })) act('sign-out'); });
for (const id of ['lock', 'set-lock']) $(id).addEventListener('click', () => act('lock'));
$('sign-out').addEventListener('click', async () => { if (await confirmed({ title: 'Sign out of App Manager?', text: 'Your account is forgotten on this computer and you’ll need to sign in again. Installed apps aren’t touched.', icon: 'key', tone: 'danger', confirm: 'Sign out' })) act('sign-out'); });

// ---------- The dock: what's happening now ----------
function renderDock() {
  const j = state.manager.job; showIf('dock', !!j && state.account.status === 'unlocked'); if (!j) return;
  const a = appOf(j.id);
  $('dock-icon').src = 'assets/' + a.icon;
  text('dock-title', j.phase === 'waiting' ? 'Waiting for you to quit ' + a.name : (j.kind === 'remove' ? 'Removing ' : j.kind === 'install' ? 'Installing ' : j.kind === 'reinstall' ? 'Reinstalling ' : 'Updating ') + a.name);
  text('dock-text', phaseText(a, j));
  const bar = $('dock-bar'); bar.classList.toggle('moving', j.phase !== 'downloading'); bar.firstElementChild.style.transform = j.phase === 'downloading' && j.total ? 'scaleX(' + j.received / j.total + ')' : '';
  text('dock-next', state.manager.queue.length ? 'Then: ' + state.manager.queue.map((q) => appOf(q.id).name).join(', ') : '');
  showIf('dock-cancel', !!j.cancellable);
}
$('dock-cancel').addEventListener('click', () => state.manager.job && act('cancel', state.manager.job.id));

// ---------- Pages ----------
function go(p, id) {
  if (!['apps', 'app', 'updates', 'activity', 'settings'].includes(p)) p = 'apps';
  if (p === 'app' && id) { if (appId !== id) shownApp = null; appId = id; }
  if (p === 'app' && !appId) p = 'apps';
  closeMenu();
  if (page !== p) { page = p; $('main').scrollTo(0, 0); }
  if (p === 'app') loadSettings(appId);
  render();
}
for (const b of $$('[data-go]')) b.addEventListener('click', () => go(b.dataset.go));
api.onGo((p) => (['browser', 'network'].includes(p) ? go('app', p) : go(p)));
$('check').addEventListener('click', () => act('check'));
$('update-all').addEventListener('click', (e) => busy(e.currentTarget, () => act('update-all')));

function render() {
  if (!state) return;
  document.body.dataset.platform = state.platform;
  renderAccount();
  for (const sw of $$('[data-pref]')) sw.setAttribute('aria-checked', String(!!state.preferences[sw.dataset.pref]));
  for (const s of $$('[data-page]')) showIf(s, s.dataset.page === page);
  for (const b of $$('.nav')) b.toggleAttribute('aria-current', b.dataset.go === page || (page === 'app' && b.dataset.go === 'apps'));
  const updates = state.manager.apps.filter((a) => a.update).length, self = ['available', 'ready'].includes(state.updater.status);
  showIf('count-apps', updates > 0); text('count-apps', updates);
  showIf('count-updates', updates + (self ? 1 : 0) > 0); text('count-updates', updates + (self ? 1 : 0));
  showIf('self-note', self); text('self-note-title', state.updater.status === 'ready' ? 'Restart to update' : 'App Manager update');
  text('self-note-text', state.updater.latest ? 'Version ' + short(state.updater.latest.version) + (state.updater.status === 'ready' ? ' is ready' : ' is available') : '');
  const busyText = state.manager.job ? 'Working…' : state.manager.checking ? 'Checking for updates…' : state.updater.status === 'downloading' ? 'Downloading App Manager…' : '';
  showIf('busy-pill', !!busyText); text($('busy-pill').querySelector('b'), busyText);
  text('side-version', 'App Manager ' + state.version);
  if (page === 'apps') renderApps(); else if (page === 'app') renderApp(); else if (page === 'updates') renderUpdates(); else if (page === 'activity') renderActivity(); else renderSettingsPage();
  renderDock();
  paintIcons();
}
function receive(next) {
  const before = state; state = next;
  // Read an app's settings again once it closes, installs or updates.
  for (const a of state.manager.apps) {
    const was = before && before.manager.apps.find((x) => x.id === a.id);
    if (forms[a.id] && was && (was.running !== a.running || (was.installed && was.installed.version) !== (a.installed && a.installed.version))) { forms[a.id].data = null; if (page === 'app' && appId === a.id) loadSettings(a.id, true); }
  }
  render();
}
setInterval(() => { if (state && (page === 'apps' || page === 'activity' || page === 'updates')) render(); }, 30000);
paintIcons();
api.onState(receive);
call('state').then((s) => { if (!state) receive(s); }).catch((e) => toast(e.message, true));
