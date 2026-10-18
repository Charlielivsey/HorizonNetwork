'use strict';
// HN Group VPN website. Signing in goes through HN Group Auth (/auth/login); the site then keeps a
// browser-session cookie, so the API needs no token here.
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  let me = null;
  const views = ['view-sign-in', 'view-home', 'view-loading'];
  const show = (id) => { for (const v of views) $('#' + v).hidden = v !== id; $('#top-actions').hidden = id !== 'view-home'; };
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

  // ---------- Devices ----------
  const ago = (iso) => {
    if (!iso) return 'Never connected';
    const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
    if (s < 90) return 'Connected now';
    if (s < 3600) return 'Last connected ' + Math.round(s / 60) + ' min ago';
    if (s < 86400) return 'Last connected ' + Math.round(s / 3600) + ' h ago';
    return 'Last connected ' + new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const size = (n) => n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' kB';
  function list(devices, withOwner) {
    if (!devices.length) return '<p class="muted">' + (withOwner ? 'No devices are registered yet.' : 'You haven’t added any devices yet.') + '</p>';
    return '<ul class="devices">' + devices.map((d) => '<li class="device"><span class="dot ' + (d.connected ? 'on' : '') + '" aria-hidden="true"></span><div class="device-main"><strong>' + esc(d.name) + '</strong>' +
      (withOwner ? '<span class="muted small">' + esc(d.owner.displayName) + ' · ' + esc(d.owner.email) + '</span>' : '') +
      '<span class="muted small">' + esc(ago(d.lastHandshake)) + ' · ' + esc(d.address) + (d.received || d.sent ? ' · ↓ ' + size(d.received) + ' ↑ ' + size(d.sent) : '') + '</span></div>' +
      '<button class="btn btn-ghost btn-small" type="button" data-remove="' + esc(d.id) + '" data-name="' + esc(d.name) + '">Remove</button></li>').join('') + '</ul>';
  }
  async function load() {
    show('view-loading');
    try {
      me = await api('/api/me');
      $('#who').textContent = me.user.displayName;
      $('#devices').innerHTML = list(me.devices, false);
      $('#device-count').textContent = me.devices.length + ' of ' + me.limit;
      $('#mac-app-note').textContent = me.macApp ? 'Open the downloaded app, then sign in. The first time, macOS may ask you to confirm opening it.' : 'The Mac app hasn’t been published here yet. Ask an administrator.';
      $('#get-mac-app').disabled = !me.macApp;
      $('#admin').hidden = !me.user.admin;
      if (me.user.admin) $('#all-devices').innerHTML = list((await api('/api/admin/devices')).devices, true);
      show('view-home');
    } catch (err) { if (!err.signedOut) { show('view-home'); toast(err.message); } }
  }
  document.addEventListener('click', async (e) => {
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
