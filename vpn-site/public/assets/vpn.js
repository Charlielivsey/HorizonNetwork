'use strict';
// HN Group VPN website. Signing in goes through HN Group Auth (/auth/login); the site then keeps a
// browser-session cookie, so the API needs no token here.
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  let me = null;
  const views = ['view-sign-in', 'view-home', 'view-profile', 'view-loading'];
  const show = (id) => {
    for (const v of views) $('#' + v).hidden = v !== id;
    $('#top-actions').hidden = id !== 'view-home' && id !== 'view-profile';
    if (id === 'view-profile') $('#me-link').setAttribute('aria-current', 'page'); else $('#me-link').removeAttribute('aria-current');
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (text) => { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500); };
  const error = (id, text) => { const e = $(id); e.textContent = text || ''; e.hidden = !text; };

  async function api(path, options) {
    const o = options || {};
    const headers = { Accept: 'application/json' };
    if (o.json !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, { method: o.method || (o.json !== undefined || o.body ? 'POST' : 'GET'), headers, body: o.json !== undefined ? JSON.stringify(o.json) : o.body, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { show('view-sign-in'); throw Object.assign(new Error(data.error || 'Sign in again.'), { signedOut: true }); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  $('#sign-out').addEventListener('click', async () => { try { await api('/api/sign-out', { json: {} }); } catch { /* signed out anyway */ } me = null; show('view-sign-in'); });

  // The staff profile picture (from HN Group Auth), or initials when there isn't one.
  const initials = (name) => String(name || '').split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  function paintAvatar(el, user) {
    el.textContent = initials(user.displayName);
    if (!user.avatar) return;
    const img = new Image();
    img.alt = '';
    img.onload = () => { el.textContent = ''; el.appendChild(img); };
    img.src = '/api/avatar?v=' + encodeURIComponent(user.avatar);
  }

  // ---------- Devices ----------
  const ago = (iso) => {
    if (!iso) return 'Never connected';
    const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
    if (s < 180) return 'Connected';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const size = (n) => n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' kB';
  function list(devices, withOwner) {
    if (!devices.length) return '<div class="empty"><strong>' + (withOwner ? 'No devices are registered yet.' : 'No devices yet') + '</strong>' + (withOwner ? '' : '<span>Download the Mac app or add a phone or PC above.</span>') + '</div>';
    return '<ul class="devices">' + devices.map((d) => '<li class="device' + (d.connected ? ' is-on' : '') + '">' +
      '<span class="device-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + (/mac|book|laptop|imac/i.test(d.name) ? '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M1 20h22"/>' : '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>') + '</svg></span>' +
      '<div class="device-main"><strong>' + esc(d.name) + '</strong>' +
      (withOwner ? '<span class="muted small">' + esc(d.owner.displayName) + ' · ' + esc(d.owner.email) + '</span>' : '') +
      '<span class="muted small">' + esc(d.address) + (d.received || d.sent ? ' · ↓ ' + size(d.received) + ' · ↑ ' + size(d.sent) : '') + '</span></div>' +
      '<span class="status' + (d.connected ? ' on' : '') + '">' + esc(ago(d.lastHandshake)) + '</span>' +
      '<button class="btn btn-ghost btn-small" type="button" data-remove="' + esc(d.id) + '" data-name="' + esc(d.name) + '">Remove</button></li>').join('') + '</ul>';
  }
  async function load() {
    show('view-loading');
    try {
      me = await api('/api/me');
      $('#who').textContent = me.user.displayName;
      paintAvatar($('#avatar'), me.user);
      $('#greeting').textContent = 'Hi, ' + me.user.displayName.split(/\s+/)[0];
      $('#stat-devices').textContent = me.devices.length;
      $('#stat-online').textContent = me.devices.filter((d) => d.connected).length;
      $('#devices').innerHTML = list(me.devices, false);
      $('#device-count').textContent = me.devices.length + ' of ' + me.limit;
      $('#mac-app-note').textContent = me.macApp ? 'Open the downloaded app, then sign in. The first time, macOS may ask you to confirm opening it.' : 'The Mac app hasn’t been published here yet. Ask an administrator.';
      $('#get-mac-app').disabled = !me.macApp;
      const v = me.macApp;
      $('#mac-app-version').hidden = !v;
      if (v) $('#mac-app-version').innerHTML = (v.version ? '<strong>Version ' + esc(v.version) + '</strong>' + (v.build ? ' · build ' + esc(v.build) : '') + ' · ' : '') + esc(size(v.size)) + ' · ' + esc(new Date(v.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
      $('#admin').hidden = !me.user.admin;
      if (me.user.admin) $('#all-devices').innerHTML = list((await api('/api/admin/devices')).devices, true);
      if (location.hash === '#profile') await profile(); else show('view-home');
    } catch (err) { if (!err.signedOut) { show('view-home'); toast(err.message); } }
  }

  // ---------- Profile ----------
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const ACTIONS = { 'sign-in.web': 'Signed in on the website', 'sign-in.app': 'Signed in to the Mac app', 'sign-out.other': 'Signed out another sign-in',
    'device.add': 'Added a device', 'device.remove': 'Removed a device', 'mac-app.publish': 'Published a Mac app build' };
  const ICONS = { app: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M1 20h22"/>', web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>' };
  async function profile() {
    const p = await api('/api/profile');
    me = { ...(me || {}), user: p.user };
    paintAvatar($('#profile-avatar'), p.user);
    $('#profile-name').textContent = p.user.displayName;
    $('#profile-email').textContent = p.user.email;
    const online = p.devices.filter((d) => d.connected).length;
    $('#profile-pills').innerHTML = '<span class="pill pill-accent">' + (p.user.admin ? 'VPN administrator' : 'HN Group staff') + '</span>' +
      '<span class="pill">' + p.devices.length + ' of ' + p.limit + ' devices</span>' + (online ? '<span class="pill pill-success">' + online + ' connected now</span>' : '');
    $('#profile-sessions').innerHTML = '<ul class="rows">' + p.sessions.map((x) => '<li class="row"><span class="device-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + ICONS[x.kind === 'app' ? 'app' : 'web'] + '</svg></span>' +
      '<div class="row-main"><strong>' + (x.kind === 'app' ? 'Mac app' + (x.appVersion ? ' ' + esc(x.appVersion) : '') : 'Website') + (x.current ? ' · this one' : '') + '</strong>' +
      '<span class="muted small">Signed in ' + esc(when(x.createdAt)) + ' · last used ' + esc(when(x.lastUsedAt)) + '</span></div>' +
      (x.current ? '<span class="pill pill-success">Current</span>' : '<button class="btn btn-ghost btn-small" type="button" data-end-session="' + esc(x.id) + '">Sign out</button>') + '</li>').join('') + '</ul>';
    $('#profile-device-count').textContent = p.devices.length + ' of ' + p.limit;
    $('#profile-devices').innerHTML = p.devices.length ? '<ul class="rows">' + p.devices.map((d) => '<li class="row"><span class="device-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + (/mac|book|laptop|imac/i.test(d.name) ? ICONS.app : '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>') + '</svg></span>' +
      '<div class="row-main"><strong>' + esc(d.name) + '</strong><span class="muted small">' + esc(d.address) + '</span></div><span class="status' + (d.connected ? ' on' : '') + '">' + esc(ago(d.lastHandshake)) + '</span></li>').join('') + '</ul>'
      : '<div class="empty"><strong>No devices yet</strong><span>Add one from your VPN page.</span></div>';
    $('#profile-activity').innerHTML = p.activity.length ? '<ul class="timeline">' + p.activity.map((a) => '<li><span>' + esc(ACTIONS[a.action] || a.action) + (a.action.startsWith('device.') && a.detail ? ' <span class="muted">· ' + esc(a.detail.replace(/^\S+@\S+\s/, '')) + '</span>' : '') + '</span><time>' + esc(when(a.at)) + '</time></li>').join('') + '</ul>'
      : '<div class="empty"><strong>Nothing yet</strong></div>';
    show('view-profile');
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => {
    if (!me) return;
    if (location.hash === '#profile') profile().catch((err) => { if (!err.signedOut) toast(err.message); });
    else { show('view-home'); load(); }
  });
  document.addEventListener('click', async (e) => {
    const end = e.target.closest('[data-end-session]');
    if (end) {
      if (!window.confirm('Sign out of this VPN sign-in? Its devices stay registered.')) return;
      try { await api('/api/sessions/' + end.dataset.endSession, { method: 'DELETE' }); toast('Signed out.'); await profile(); } catch (err) { toast(err.message); }
      return;
    }
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    if (!window.confirm('Remove “' + b.dataset.name + '”? It will stop connecting to the VPN.')) return;
    try { await api('/api/devices/' + b.dataset.remove, { method: 'DELETE' }); toast('Device removed.'); load(); } catch (err) { toast(err.message); }
  });
  $('#add-form').addEventListener('submit', async (e) => {
    e.preventDefault(); error('#add-error');
    const button = $('button[type=submit]', e.target);
    if (button.disabled) return;
    button.disabled = true;
    try {
      const r = await api('/api/devices', { json: { name: $('#device-name').value } });
      $('#device-name').value = '';
      $('#config-text').textContent = r.connection.config;
      const url = URL.createObjectURL(new Blob([r.connection.config], { type: 'text/plain' }));
      $('#config-download').href = url;
      $('#config-download').download = 'HN-Group-VPN-' + r.device.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.conf';
      $('#new-config').hidden = false;
      $('#new-config').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      load();
    } catch (err) { error('#add-error', err.message); }
    finally { button.disabled = false; }
  });
  $('#config-hide').addEventListener('click', () => { $('#new-config').hidden = true; $('#config-text').textContent = ''; URL.revokeObjectURL($('#config-download').href); });
  $('#get-mac-app').addEventListener('click', () => { window.location.href = '/api/mac-app'; });
  $('#app-form').addEventListener('submit', async (e) => {
    e.preventDefault(); error('#app-error');
    const file = $('#app-file').files[0];
    if (!file) return;
    try { await api('/api/admin/mac-app', { method: 'POST', body: file }); toast('Mac app published.'); $('#app-file').value = ''; load(); } catch (err) { error('#app-error', err.message); }
  });

  load();
})();
