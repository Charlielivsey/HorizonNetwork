'use strict';
// HN Group Devices: add your computers with the code an HN app shows; owner-level and Super Admin accounts
// approve, revoke, rename and remove every computer.
const $ = (id) => document.getElementById(id);
let me = null, everyone = null, filter = 'pending', toastTimer = null;
const PLATFORM = { darwin: 'Mac', win32: 'Windows PC', linux: 'Linux' };
const ACTIONS = { 'device.registered': 'first seen', 'device.linked': 'added, waiting for approval', 'device.linked-authorised': 'added and approved', 'device.approved': 'approved', 'device.revoked': 'revoked', 'device.renamed': 'renamed', 'device.removed': 'removed', 'device.mismatch': 'used from different hardware' };
const STATUS = { pending: ['Waiting for approval', 'pending'], authorised: ['Approved', 'good'], revoked: ['Revoked', 'bad'], unlinked: ['Not added', ''] };

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else node.setAttribute(k, v === true ? '' : v); }
  for (const c of children.flat(5)) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
function when(at) {
  if (!at) return 'never'; const d = new Date(at), s = (Date.now() - d) / 1000;
  if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function toast(text, bad = false) { const t = $('toast'); t.textContent = text; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 5000); }
async function api(path, options = {}) {
  const r = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }, credentials: 'same-origin' });
  const value = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(value.error || 'Something went wrong.'), { status: r.status });
  return value;
}
// Questions in the HN design: resolves with true, or the typed name for renaming.
function ask({ title, text, confirm, danger = false, input = null }) {
  return new Promise((resolve) => {
    const layer = $('layer'), field = $('dialog-input');
    $('dialog-title').textContent = title; $('dialog-text').textContent = text || '';
    $('dialog-ok').textContent = confirm; $('dialog-ok').className = 'btn ' + (danger ? 'danger' : 'primary');
    field.hidden = input === null; if (input !== null) field.value = input;
    layer.hidden = false; requestAnimationFrame(() => layer.classList.add('open'));
    (input !== null ? field : $('dialog-cancel')).focus();
    const done = (value) => { layer.classList.remove('open'); setTimeout(() => { layer.hidden = true; }, 160); $('dialog-ok').onclick = $('dialog-cancel').onclick = layer.querySelector('.scrim').onclick = null; document.removeEventListener('keydown', key); resolve(value); };
    const key = (e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter' && input !== null) done(field.value.trim() || false); };
    document.addEventListener('keydown', key);
    $('dialog-ok').onclick = () => done(input !== null ? field.value.trim() || false : true);
    $('dialog-cancel').onclick = layer.querySelector('.scrim').onclick = () => done(false);
  });
}

function deviceCard(d, { admin = false } = {}) {
  const [label, tone] = STATUS[d.status] || [d.status, ''];
  const apps = d.apps.length ? d.apps.map((a) => a.name + (a.version ? ' ' + a.version : '')).join(' · ') : 'No HN apps yet';
  const actions = el('div', { class: 'actions' });
  if (admin && d.status !== 'authorised') actions.append(el('button', { class: 'btn small primary', onclick: () => act(d, 'approve') }, d.status === 'revoked' ? 'Approve again' : 'Approve'));
  if (admin && d.status === 'authorised') actions.append(el('button', { class: 'btn small', onclick: () => act(d, 'revoke') }, 'Revoke'));
  if (admin || d.owner?.id === me.user.id) {
    actions.append(el('button', { class: 'btn small ghost', onclick: () => act(d, 'rename') }, 'Rename'));
    actions.append(el('button', { class: 'btn small ghost danger-text', onclick: () => act(d, 'remove') }, 'Remove'));
  }
  return el('article', { class: 'device', 'data-id': d.id },
    el('span', { class: 'device-icon ' + d.platform, 'aria-hidden': 'true' }),
    el('div', { class: 'device-main' },
      el('div', { class: 'device-head' }, el('h3', {}, d.name), el('span', { class: 'pill ' + tone }, label)),
      el('p', { class: 'muted small' }, (PLATFORM[d.platform] || 'Computer') + (d.os ? ' · ' + d.os : '') + (admin && d.owner ? ' · ' + d.owner.displayName : '') + ' · last used ' + when(d.lastSeen)),
      el('p', { class: 'small apps' }, apps),
      d.mismatchAt ? el('p', { class: 'small warn' }, 'Its identity was used from different hardware on ' + new Date(d.mismatchAt).toLocaleDateString('en-GB') + '. Approving it again trusts the new hardware.') : null),
    actions);
}
async function act(d, action) {
  try {
    if (action === 'approve' && !(await ask({ title: 'Approve ' + d.name + '?', text: (d.owner ? d.owner.displayName + '’s ' : '') + 'computer can then install, update and use HN Group’s apps.', confirm: 'Approve' }))) return;
    if (action === 'revoke' && !(await ask({ title: 'Revoke ' + d.name + '?', text: 'HN Group’s apps stop working on it the next time they check, and App Manager won’t install or update anything there.', confirm: 'Revoke', danger: true }))) return;
    if (action === 'remove' && !(await ask({ title: 'Remove ' + d.name + '?', text: 'It’s forgotten completely. If it’s used again, it has to be added and approved again.', confirm: 'Remove', danger: true }))) return;
    if (action === 'rename') {
      const name = await ask({ title: 'Rename this computer', text: 'Choose a name you’ll recognise.', confirm: 'Save', input: d.name });
      if (!name) return; await api('/api/devices/' + d.id + '/rename', { method: 'POST', body: JSON.stringify({ name }) });
    } else if (action === 'remove') await api('/api/devices/' + d.id, { method: 'DELETE' });
    else await api('/api/devices/' + d.id + '/' + action, { method: 'POST', body: '{}' });
    toast({ approve: 'Approved.', revoke: 'Revoked.', remove: 'Removed.', rename: 'Renamed.' }[action]);
    await load();
  } catch (e) { toast(e.message, true); }
}

function render() {
  $('signed-out').hidden = !!me; $('signed-in').hidden = !me; $('who').hidden = !me;
  if (!me) return;
  $('who-name').textContent = me.user.displayName; $('who-role').textContent = me.user.admin ? 'Can approve computers' : me.user.email;
  $('who-avatar').textContent = me.user.displayName.split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  $('greeting').textContent = 'Hello, ' + me.user.displayName.split(/\s+/)[0];
  $('mine').replaceChildren(...(me.devices.length ? me.devices.map((d) => deviceCard(d, { admin: me.user.admin })) : [el('div', { class: 'empty' }, el('strong', {}, 'No computers yet'), el('p', { class: 'muted small' }, 'Add one with the code from an HN app.'))]));
  $('admin').hidden = !me.user.admin;
  if (me.user.admin && everyone) {
    for (const k of ['pending', 'authorised', 'revoked']) $('count-' + k).textContent = me.counts?.[k] ?? 0;
    const q = $('search').value.trim().toLowerCase();
    const list = everyone.devices.filter((d) => (filter === 'all' || d.status === filter) && (!q || [d.name, d.owner?.displayName, d.owner?.email, d.os].join(' ').toLowerCase().includes(q)));
    $('everyone').replaceChildren(...(list.length ? list.map((d) => deviceCard(d, { admin: true })) : [el('div', { class: 'empty' }, el('p', { class: 'muted small' }, filter === 'pending' ? 'Nothing is waiting for approval.' : 'No computers here.'))]));
    $('audit').replaceChildren(...everyone.audit.slice(0, 30).map((a) => el('div', { class: 'audit-row' }, el('span', {}, a.detail ? a.detail + ' — ' : '', ACTIONS[a.action] || a.action.replace('device.', '')), el('small', { class: 'muted' }, a.actor + ' · ' + when(a.at)))));
  }
}
async function load() {
  try { me = await api('/api/me'); if (me.user.admin) everyone = await api('/api/devices'); }
  catch (e) { me = null; if (e.status !== 401) toast(e.message, true); }
  render();
}

// The app's link (…/link?code=ABCD-2345) fills in the code, signing in first if needed.
const code = new URLSearchParams(location.search).get('code');
if (code && /^[A-Za-z0-9-]{8,9}$/.test(code)) { $('code').value = code.toUpperCase(); $('sign-in').href = '/auth/login?next=' + encodeURIComponent('/link?code=' + code); }
$('code').addEventListener('input', () => { const c = $('code').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); $('code').value = c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; });
$('link-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const b = $('link-button'), m = $('link-message'); b.disabled = true; m.textContent = ''; m.className = 'form-message';
  try {
    const { device } = await api('/api/link', { method: 'POST', body: JSON.stringify({ code: $('code').value }) });
    m.textContent = device.status === 'authorised' ? device.name + ' is added and approved. The apps work on it straight away.' : device.name + ' is added. It works as soon as an administrator approves it.';
    m.classList.add('good'); $('code').value = ''; if (location.search) history.replaceState(null, '', '/'); await load();
  } catch (err) { m.textContent = err.message; m.classList.add('bad'); }
  finally { b.disabled = false; }
});
for (const b of document.querySelectorAll('#filter button')) b.addEventListener('click', () => { filter = b.dataset.filter; for (const x of document.querySelectorAll('#filter button')) x.setAttribute('aria-pressed', String(x === b)); render(); });
$('search').addEventListener('input', render);
load();
setInterval(() => { if (me && document.visibilityState === 'visible') load(); }, 30000);
