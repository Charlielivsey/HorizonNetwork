'use strict';
// HN Account: the signed-in pages. Everything is built with DOM methods (never HTML strings), and every
// change goes to this site's /api, which passes it to the staff account service.
(function () {
  const $ = (s) => document.querySelector(s);
  let session = null, me = null, staffList = null;

  // ---------- Small helpers ----------
  function h(tag, attrs) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].slice.call(arguments, 2).flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  async function api(path, body) {
    const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify(body) };
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/auth/login?return=' + encodeURIComponent('/' + location.hash); throw new Error('Please sign in again.'); }
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  let toastTimer;
  function toast(text, bad) { const t = $('#toast'); t.textContent = text; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200); }
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  function avatar(person, size) {
    const box = h('span', { class: 'avatar' + (size ? ' ' + size : ''), 'aria-hidden': 'true' });
    if (person && person.avatarUrl) box.append(h('img', { src: person.avatarUrl, alt: '' })); else box.append(initials(person && person.displayName));
    return box;
  }
  const when = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
  function device(ua) {
    ua = String(ua || '');
    const browser = /HNBrowser|HN Browser|Electron/i.test(ua) ? 'HN Browser' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /HN Account|HN Group/.test(ua) ? 'HN Group service' : 'Browser';
    const os = /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    return browser + (os ? ' on ' + os : '');
  }
  // A form with a status line; run() gets the form's values and shows any error under the form.
  function form(fields, label, run, extra) {
    const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
    const button = h('button', { class: 'button', type: 'submit', text: label });
    const f = h('form', { class: 'form', novalidate: true }, fields, h('div', { class: 'buttons' }, button, extra || null), status);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.dataset.busy) return;
      f.dataset.busy = '1'; button.disabled = true; status.textContent = ''; status.className = 'form-status';
      try { await run(Object.fromEntries(new FormData(f))); }
      catch (err) { status.textContent = err.message; status.className = 'form-status bad'; }
      finally { delete f.dataset.busy; button.disabled = false; }
    });
    return f;
  }
  function field(label, name, value, opts) {
    const o = opts || {}, id = 'f-' + name;
    const input = o.textarea ? h('textarea', { id, name, rows: o.rows || 4, maxlength: o.max || null }, value || '')
      : o.options ? h('select', { id, name }, o.options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t)))
      : h('input', { id, name, type: o.type || 'text', value: value == null ? '' : value, maxlength: o.max || null, autocomplete: o.auto || null, inputmode: o.inputmode || null, pattern: o.pattern || null, required: !!o.required });
    return h('div', { class: 'field' + (o.wide ? ' wide' : '') }, h('label', { for: id, text: label }), input, o.hint ? h('p', { class: 'hint', text: o.hint }) : null);
  }
  function confirmDialog(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      const d = $('#dialog');
      $('#dialog-title').textContent = title; $('#dialog-body').replaceChildren(h('p', { text }));
      const ok = h('button', { class: 'button' + (danger ? ' danger' : ''), value: 'ok', text: okLabel });
      $('#dialog-buttons').replaceChildren(h('button', { class: 'button secondary', value: 'cancel', text: 'Cancel' }), ok);
      d.onclose = () => resolve(d.returnValue === 'ok');
      d.showModal(); ok.focus();
    });
  }
  function showDialog(title, nodes) {
    const d = $('#dialog');
    $('#dialog-title').textContent = title; $('#dialog-body').replaceChildren(...nodes);
    $('#dialog-buttons').replaceChildren(h('button', { class: 'button', value: 'ok', text: 'Done' }));
    d.onclose = null; d.showModal();
  }

  // ---------- Pages ----------
  const PAGES = [
    ['overview', 'Overview', 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    ['profile', 'Profile', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'],
    ['security', 'Password & PIN', 'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3'],
    ['devices', 'Devices', 'M3 4h18v12H3zM8 20h8M12 16v4'],
    ['websites', 'Websites', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18'],
    ['accounts', 'Sign-in accounts', 'M15 7a4 4 0 1 1-3.9 5H9v2H7v2H4v-3l6.1-6.1A4 4 0 0 1 15 7zM16 9.5h.01', true],
    ['staff', 'Staff records', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c1-3.5 3.5-5 7-5s6 1.5 7 5M17 11a3 3 0 1 0 0-6M22 20c-.6-2.6-2-4.1-4-4.7', true],
  ];
  const icon = (d) => { const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); svg.append(p); return svg; };
  function nav(active) {
    $('#nav').replaceChildren(...PAGES.filter((p) => !p[3] || session.admin).map(([id, label, d]) => h('a', { href: '#' + id, class: id === active ? 'active' : '', 'aria-current': id === active ? 'page' : null }, icon(d), h('span', { text: label }))));
  }
  function header() {
    const signOut = h('form', { method: 'post', action: '/auth/logout' }, h('input', { type: 'hidden', name: 'csrf', value: session.csrf }), h('button', { class: 'link', type: 'submit', text: 'Sign out' }));
    $('#user').replaceChildren(avatar(me, 'sm'), h('span', { class: 'who', text: me.displayName }), signOut);
  }
  const section = (title, intro, ...body) => h('section', { class: 'card' }, h('h2', { text: title }), intro ? h('p', { class: 'muted', text: intro }) : null, ...body);

  function overview() {
    const roles = (me.roles || []).map((r) => h('li', {}, h('b', { text: r.jobTitle || 'Role' }), ' · ' + r.company + (r.department ? ' · ' + r.department : '')));
    const checks = [
      [!me.passwordTemporary && !me.passwordExpired, 'Password', me.passwordTemporary ? 'You’re using a temporary password.' : me.passwordExpired ? 'Your password has expired.' : 'Your password is set.', 'security'],
      [!me.codeSetupRequired, 'Sign-in PIN', me.codeSetupRequired ? 'You haven’t set a sign-in PIN yet.' : 'Your six-digit PIN is set.', 'security'],
      [!!me.avatarUrl, 'Profile photo', me.avatarUrl ? 'Your photo is shown across HN Group.' : 'Add a photo so colleagues recognise you.', 'profile'],
    ];
    return [
      h('section', { class: 'hello' }, avatar(me, 'xl'), h('div', {}, h('p', { class: 'eyebrow', text: 'Your HN account' }), h('h1', { text: 'Hello, ' + (me.displayName || '').split(' ')[0] + '.' }),
        h('p', { class: 'muted' }, me.username + (me.jobTitle ? ' · ' + me.jobTitle : '') + (me.company ? ' at ' + me.company : '')))),
      h('div', { class: 'grid2' },
        section('Account health', null, h('ul', { class: 'checks' }, checks.map(([ok, t, d, page]) => h('li', { class: ok ? 'ok' : 'warn' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', {}, h('b', { text: t }), h('span', { class: 'muted', text: ' ' + d })), ok ? null : h('a', { href: '#' + page, text: 'Fix' }))))),
        section('Your roles', 'From your staff record. Your manager or HR can change these.', roles.length ? h('ul', { class: 'plain' }, roles) : h('p', { class: 'muted', text: 'No roles recorded.' }),
          (me.roleNames || []).length ? h('p', { class: 'muted small', text: 'Permissions: ' + me.roleNames.join(', ') }) : null)),
      h('div', { class: 'quick' }, PAGES.slice(1).filter((p) => !p[3] || session.admin).map(([id, label, d]) => h('a', { class: 'quick-card', href: '#' + id }, icon(d), h('span', { text: label })))),
    ];
  }

  function profile() {
    const zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['Europe/London']).concat(['UTC']).map((z) => [z, z.replace(/_/g, ' ')]);
    const months = [['', 'Not set']].concat(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => [i + 1, m]));
    const b = me.myBirthday || {};
    const photoInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', id: 'photo-file', class: 'sr-only' });
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0]; if (!file) return;
      try { const data = await shrink(file); me = (await api('/api/me/avatar', { image: data })).user; render('profile'); toast('Photo updated.'); }
      catch (err) { toast(err.message, true); }
    });
    const photo = section('Photo', 'Shown on your staff profile, in HN Browser and on HN Group websites you sign in to.',
      h('div', { class: 'photo-row' }, avatar(me, 'xl'), h('div', { class: 'buttons' },
        h('label', { class: 'button secondary', for: 'photo-file', text: me.avatarUrl ? 'Change photo' : 'Add photo' }), photoInput,
        me.avatarUrl ? h('button', { class: 'button secondary', type: 'button', onclick: async () => { if (!(await confirmDialog('Remove your photo?', 'Your initials will be shown instead.', 'Remove', true))) return; me = (await api('/api/me/avatar/remove', {})).user; render('profile'); toast('Photo removed.'); } }, 'Remove') : null)));
    const details = section('Details', 'Your job title, company and email addresses come from your staff record.', form([
      h('div', { class: 'grid-form' },
        field('Display name', 'displayName', me.displayName, { max: 80, required: true, hint: 'Shown everywhere in HN Group.' }),
        field('Phone', 'phone', me.phone, { max: 40, auto: 'tel', type: 'tel' }),
        field('Location', 'location', me.location, { max: 80 }),
        field('Time zone', 'timezone', me.timezone || 'Europe/London', { options: zones }),
        field('Skills', 'skills', (me.skills || []).join(', '), { max: 400, hint: 'Separate with commas.', wide: true }),
        field('Languages', 'languages', (me.languages || []).join(', '), { max: 200, hint: 'Separate with commas.', wide: true }),
        field('About me', 'bio', me.bio, { textarea: true, max: 600, wide: true }),
        me.onNetworkSite ? h('label', { class: 'check wide' }, h('input', { type: 'checkbox', name: 'bioPublic', checked: me.bioPublic !== false }), ' Show my About me on the Horizon Network website') : null,
        field('Birthday month', 'birthdayMonth', b.month || '', { options: months }),
        field('Birthday day', 'birthdayDay', b.day || '', { type: 'number', inputmode: 'numeric' }),
        h('label', { class: 'check wide' }, h('input', { type: 'checkbox', name: 'showBirthday', checked: !!b.show }), ' Show my birthday to colleagues (day and month only)')),
    ], 'Save profile', async (v) => {
      const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
      me = (await api('/api/me/profile', { displayName: v.displayName, phone: v.phone, location: v.location, timezone: v.timezone, skills: list(v.skills), languages: list(v.languages), bio: v.bio, bioPublic: v.bioPublic === 'on', birthdayMonth: v.birthdayMonth, birthdayDay: v.birthdayDay, showBirthday: v.showBirthday === 'on' })).user;
      header(); toast('Profile saved.');
    }));
    return [h('h1', { text: 'Profile' }), photo, details];
  }
  // Photos are resized in the browser to at most 600 pixels before they're sent.
  function shrink(file) {
    return new Promise((resolve, reject) => {
      if (file.size > 20 * 1024 * 1024) return reject(new Error('That photo is too large.'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a photo we can use.')); };
      img.src = url;
    });
  }

  function security() {
    const min = me.passwordMinLength || 10;
    const pw = section('Password', 'Changing your password signs you out everywhere else, including remembered browsers.', form([
      h('input', { type: 'text', name: 'username', value: me.username, autocomplete: 'username', hidden: true }),
      me.passwordTemporary || me.passwordExpired ? null : field('Current password', 'currentPassword', '', { type: 'password', auto: 'current-password', required: true }),
      field('New password', 'newPassword', '', { type: 'password', auto: 'new-password', required: true, hint: 'At least ' + min + ' characters.' }),
      field('Confirm new password', 'confirm', '', { type: 'password', auto: 'new-password', required: true }),
    ], 'Change password', async (v) => {
      if (v.newPassword !== v.confirm) throw new Error('The new passwords don’t match.');
      const r = await api('/api/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      if (r.user) me = r.user; else me = (await api('/api/me')).user;
      render('security'); toast('Password changed.');
    }));
    const pin = section('Sign-in PIN', 'Your six-digit PIN unlocks your account in HN Group Auth, HN Browser and remembered browsers.', form([
      me.codeSetupRequired ? null : field('Current password', 'currentPassword', '', { type: 'password', auto: 'current-password', required: true, hint: 'Needed to change an existing PIN.' }),
      field('New PIN', 'code', '', { type: 'password', inputmode: 'numeric', pattern: '[0-9]{6}', auto: 'off', required: true, hint: 'Six digits.' }),
      field('Confirm new PIN', 'confirm', '', { type: 'password', inputmode: 'numeric', pattern: '[0-9]{6}', auto: 'off', required: true }),
    ], me.codeSetupRequired ? 'Set PIN' : 'Change PIN', async (v) => {
      if (!/^\d{6}$/.test(v.code || '')) throw new Error('Your PIN must be six digits.');
      if (v.code !== v.confirm) throw new Error('The PINs don’t match.');
      await api('/api/me/code', { code: v.code, currentPassword: v.currentPassword });
      me = (await api('/api/me')).user; render('security'); toast('PIN saved.');
    }));
    return [h('h1', { text: 'Password & PIN' }), pw, pin];
  }

  async function devices() {
    const list = (await api('/api/me/sessions')).sessions;
    const rows = list.map((s) => h('li', { class: 'device' + (s.current ? ' current' : '') },
      h('span', { class: 'device-icon', 'aria-hidden': 'true' }, icon(/iPhone|Android/.test(s.userAgent) ? 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 19h2' : 'M3 4h18v12H3zM8 20h8M12 16v4')),
      h('div', { class: 'device-text' }, h('b', { text: device(s.userAgent) }), s.current ? h('span', { class: 'pill ok', text: 'This session' }) : null, s.impersonated ? h('span', { class: 'pill', text: 'Signed in as you by an administrator' }) : null,
        h('span', { class: 'muted small', text: (s.ip || 'Unknown address') + ' · Last active ' + when(s.lastSeen) + ' · Signed in ' + when(s.createdAt) })),
      s.current ? null : h('button', { class: 'button secondary small', type: 'button', onclick: async () => { await api('/api/me/sessions/' + s.id + '/end', {}); toast('Signed out of that device.'); render('devices'); } }, 'Sign out')));
    const others = list.filter((s) => !s.current).length;
    return [h('h1', { text: 'Devices' }), section('Where you’re signed in', 'Sessions on the staff portal and HN Group services that use your staff account. HN Group Auth and HN Browser sign-ins are listed while they’re active.',
      h('ul', { class: 'devices' }, rows),
      others ? h('div', { class: 'buttons' }, h('button', { class: 'button danger', type: 'button', onclick: async () => { if (!(await confirmDialog('Sign out everywhere else?', 'Every other session (' + others + ') will be signed out. This one stays signed in.', 'Sign out others', true))) return; const r = await api('/api/me/sessions/end-others', {}); toast('Signed out of ' + r.count + ' other session' + (r.count === 1 ? '' : 's') + '.'); render('devices'); } }, 'Sign out everywhere else')) : h('p', { class: 'muted', text: 'You’re not signed in anywhere else.' }))];
  }

  function websites() {
    const u = session.user || {}, admin = !!u.statusAdminAllowed, owner = !!u.ownerAccess, hnGroup = owner || (u.companies || [u.company]).includes('HN Group');
    const SITES = [
      ['Everyday', [['Staff portal', 'https://staff.hngroup.org.uk/', true, 'Your work, pay, leave and colleagues.'], ['HN Group Auth', 'https://auth.hngroup.org.uk/', true, 'Sign in to HN Group websites.'], ['HN Group Wiki', 'https://wiki.hngroup.org.uk/', true, 'Read and edit the group encyclopedia.'], ['Brand centre', 'https://branding.hngroup.org.uk/', true, 'Logos, colours and type.'], ['HN Group VPN', 'https://vpn.hngroup.org.uk/', true, 'Connect your devices privately.'], ['Downloads', 'https://downloads.hngroup.org.uk/', true, 'HN Browser and HN Secure Network.'], ['HN Group Docs', 'https://docs.hngroup.org.uk/', true, 'Write company documents and keep your private storage.'], ['HN Group Contracts', 'https://contract.hngroup.org.uk/', true, (admin || owner) ? 'Sign contracts, and send them for signing.' : 'Sign the contracts sent to you.'], ['HN Group Devices', 'https://devices.hngroup.org.uk/', true, (admin || owner) ? 'Add your computers, and approve everyone’s.' : 'Add your computers so the HN apps work on them.']]],
      ['Investors', [['HN Group Investors', 'https://investors.hngroup.org.uk/staff', hnGroup, hnGroup ? 'Manage investors, valuations and news.' : 'For staff with a role at HN Group.']]],
      ['Website administration', [['hngroup.org.uk', 'https://hngroup.org.uk/admin', admin], ['Horizon Network', 'https://horizon-network.co.uk/admin', admin], ['Service status', 'https://status.hngroup.org.uk/admin', admin], ['Horizon Media Group', 'https://media.hngroup.org.uk/admin', admin], ['HN Group Management', 'https://holding.hngroup.org.uk/admin', admin], ['Horizon Development', 'https://development.hngroup.org.uk/admin', admin], ['Support', 'https://support.hngroup.org.uk/admin', admin], ['Client portal', 'https://clients.hngroup.org.uk/admin', admin], ['Careers', 'https://careers.hngroup.org.uk/admin', admin], ['News', 'https://news.hngroup.org.uk/admin', admin]].map((x) => x.concat(admin ? 'You can manage this website.' : 'System owner and Super Admin members only.'))],
      ['Website control', [['Website control', 'https://admin.hngroup.org.uk/', owner, owner ? 'Every permission (owner-level account).' : 'Needs access granted in website control itself.']]],
    ];
    return [h('h1', { text: 'Websites' }), h('p', { class: 'lede', text: 'Every HN Group website that uses your staff account, and whether your account can use it.' }),
      ...SITES.map(([group, list]) => section(group, null, h('div', { class: 'site-grid' }, list.map(([name, url, ok, note]) => h('a', { class: 'site' + (ok ? '' : ' locked'), href: url, rel: 'noopener' }, h('span', { class: 'site-name', text: name }), h('span', { class: 'pill ' + (ok ? 'ok' : ''), text: ok ? 'You can use this' : 'No access' }), h('span', { class: 'muted small', text: note || '' })))))) ];
  }

  async function staff() {
    if (!staffList) staffList = (await api('/api/employees')).employees;
    const search = h('input', { type: 'search', placeholder: 'Search by name, username or company', 'aria-label': 'Search staff accounts', class: 'search' });
    const body = h('tbody');
    const status = (e) => !e.account ? ['No login', ''] : !e.account.enabled ? ['Disabled', 'warn'] : e.account.passwordTemporary ? ['Temporary password', ''] : !e.account.hasCode ? ['PIN not set', ''] : ['Active', 'ok'];
    async function act(e, action, title, text, label, danger) {
      if (!(await confirmDialog(title, text, label, danger))) return;
      try {
        const r = await api('/api/employees/' + e.id + '/' + action, {});
        staffList = staffList.map((x) => (x.id === e.id ? r.employee : x));
        if (r.temporaryPassword) showDialog('Temporary password for ' + e.displayName, [h('p', { text: 'Give them these details. They’ll choose a new password and PIN when they next sign in. This won’t be shown again.' }), h('dl', { class: 'creds' }, h('dt', { text: 'Username' }), h('dd', {}, h('code', { text: r.username })), h('dt', { text: 'Temporary password' }), h('dd', {}, h('code', { text: r.temporaryPassword })))]);
        else toast('Done.');
        draw();
      } catch (err) { toast(err.message, true); }
    }
    function draw() {
      const q = search.value.trim().toLowerCase();
      body.replaceChildren(...staffList.filter((e) => !q || [e.displayName, e.loginUsername, e.company, e.jobTitle].join(' ').toLowerCase().includes(q)).sort((a, b) => a.displayName.localeCompare(b.displayName)).map((e) => {
        const [label, cls] = status(e), self = e.id === me.id;
        return h('tr', {}, h('td', {}, h('span', { class: 'person' }, avatar(e, 'sm'), h('span', {}, h('b', { text: e.displayName }), h('span', { class: 'muted small', text: e.loginUsername || 'No login' })))),
          h('td', {}, h('span', { text: e.jobTitle || '' }), h('span', { class: 'muted small', text: e.company || '' })),
          h('td', {}, h('span', { class: 'pill ' + cls, text: label })), h('td', { class: 'small', text: e.account ? when(e.account.lastLoginAt) : '—' }),
          h('td', {}, h('div', { class: 'actions' }, self ? h('span', { class: 'muted small', text: 'You' }) : [
            h('button', { class: 'button secondary small', type: 'button', onclick: () => act(e, 'account', e.account ? 'Reset ' + e.displayName + '’s password?' : 'Create a login for ' + e.displayName + '?', e.account ? 'They’ll be signed out everywhere and get a temporary password.' : 'They’ll get a username and temporary password.', e.account ? 'Reset password' : 'Create login') }, e.account ? 'Reset password' : 'Create login'),
            e.account && e.account.hasCode ? h('button', { class: 'button secondary small', type: 'button', onclick: () => act(e, 'code/reset', 'Reset ' + e.displayName + '’s PIN?', 'They’ll be signed out and asked to set a new PIN when they next sign in.', 'Reset PIN') }, 'Reset PIN') : null,
            e.account ? h('button', { class: 'button small ' + (e.account.enabled ? 'danger' : 'secondary'), type: 'button', onclick: () => act(e, e.account.enabled ? 'account/disable' : 'account/enable', (e.account.enabled ? 'Disable ' : 'Enable ') + e.displayName + '’s account?', e.account.enabled ? 'They’ll be signed out everywhere and can’t sign in to any HN Group website until it’s enabled again.' : 'They’ll be able to sign in again.', e.account.enabled ? 'Disable' : 'Enable', e.account.enabled) }, e.account.enabled ? 'Disable' : 'Enable') : null])));
      }));
    }
    search.addEventListener('input', draw); draw();
    const counts = { all: staffList.length, active: staffList.filter((e) => e.account && e.account.enabled).length, disabled: staffList.filter((e) => e.account && !e.account.enabled).length };
    return [h('h1', { text: 'Staff records' }), h('p', { class: 'lede', text: 'Every staff record and its own sign-in account. To give someone more accounts, accounts at other profiles, or an account with no staff record, use Sign-in accounts.' }),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', { text: counts.all }), ' people'), h('div', { class: 'stat' }, h('b', { text: counts.active }), ' active'), h('div', { class: 'stat' }, h('b', { text: counts.disabled }), ' disabled')),
      h('section', { class: 'card' }, search, h('div', { class: 'table-wrap' }, h('table', { class: 'staff-table' },h('thead', {}, h('tr', {}, ['Person', 'Role', 'Account', 'Last sign-in', ''].map((t) => h('th', { text: t })))), body))),
      h('p', { class: 'muted small' }, 'To add staff, change roles or edit staff records, use the ', h('a', { href: 'https://staff.hngroup.org.uk/', text: 'staff portal' }), '.')];
  }

  // ---------- Sign-in accounts ----------
  // The user's request, 28 October 2026: sign-in accounts are separate from staff records. Each has its own
  // password, PIN and permissions, and can use any number of profiles (each company on a staff record is its own
  // profile) with one as its default, or none at all. People choose the profile when they sign in.
  let loginData = null;
  function credentialsDialog(name, r) {
    showDialog('Sign-in details for ' + name, [h('p', { text: 'Give them these details. They’ll choose a new password and PIN when they first sign in. This won’t be shown again.' }), h('dl', { class: 'creds' }, h('dt', { text: 'Username' }), h('dd', {}, h('code', { text: r.username })), h('dt', { text: 'Temporary password' }), h('dd', {}, h('code', { text: r.temporaryPassword })))]);
  }
  // Create or edit an account: its name and username (new accounts), profiles, default profile and permissions.
  function editAccount(account, done) {
    const d = $('#dialog'), creating = !account, own = account && account.ownLoginOf;
    const chosen = new Map((account ? account.profiles : []).map((p) => [p.key, p]));
    let def = account ? (account.profiles.find((p) => p.default) || {}).key || null : null;
    const roles = new Set(account ? account.roleIds : []);
    const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
    const name = creating || !own ? field('Name', 'displayName', account ? account.displayName : '', { max: 80, required: true, hint: 'How this account is shown when it isn’t using a staff profile.' }) : null;
    const user = creating ? field('Username or email address', 'username', '', { max: 120, required: true, auto: 'off', hint: 'What they type to sign in. It can be any email address, including a personal one.' }) : null;
    const filter = h('input', { type: 'search', class: 'search', placeholder: 'Find a profile by name or company', 'aria-label': 'Find a profile' });
    const list = h('div', { class: 'profile-pick' });
    function drawProfiles() {
      const q = filter.value.trim().toLowerCase();
      const all = loginData.profiles.filter((p) => chosen.has(p.key) || !q || (p.displayName + ' ' + p.company + ' ' + p.jobTitle).toLowerCase().includes(q));
      if (def && !chosen.has(def)) def = null;
      if (!def && chosen.size) def = [...chosen.keys()][0];
      list.replaceChildren(...(all.length ? all.map((p) => {
        const auto = own && account.profiles.some((x) => x.key === p.key && x.automatic);
        const box = h('input', { type: 'checkbox', checked: chosen.has(p.key), disabled: auto, onchange: () => { if (box.checked) chosen.set(p.key, p); else chosen.delete(p.key); drawProfiles(); } });
        const star = h('input', { type: 'radio', name: 'default-profile', checked: def === p.key, disabled: !chosen.has(p.key), 'aria-label': 'Default profile', onchange: () => { def = p.key; } });
        return h('div', { class: 'profile-row' + (chosen.has(p.key) ? ' on' : '') }, h('label', { class: 'check' }, box, avatar(p, 'sm'), h('span', {}, h('b', { text: p.displayName }), h('span', { class: 'muted small', text: p.company + (p.jobTitle ? ' · ' + p.jobTitle : '') + (auto ? ' · their own record' : '') }))),
          h('label', { class: 'default-pick small' }, star, 'Default'));
      }) : [h('p', { class: 'muted small', text: 'No profiles match.' })]));
    }
    filter.addEventListener('input', drawProfiles); drawProfiles();
    const roleBoxes = h('div', { class: 'role-pick' }, loginData.roles.map((r) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: roles.has(r.id), disabled: !loginData.canManageRoles || (!loginData.ownerLevel && account && account.id === (me.accountId || '')), onchange: (e) => { if (e.target.checked) roles.add(r.id); else roles.delete(r.id); } }), h('span', {}, h('b', { text: r.name }), h('span', { class: 'muted small', text: r.permissions.length + (r.permissions.length === 1 ? ' permission' : ' permissions') })))));
    // Only the system owner can make an account owner-level (every permission everywhere) or another system owner.
    const ownerPick = loginData.systemOwner && !creating ? field('Owner access', 'owner', account.owner || '', { options: [['', 'None (just the permissions below)'], ['level', 'Owner-level: every permission on every website'], ['system', 'System owner']], hint: account.systemOwner && !account.owner ? 'This account is the system owner already.' : null }) : null;
    const save = h('button', { class: 'button', type: 'button', text: creating ? 'Create account' : 'Save changes' });
    save.addEventListener('click', async () => {
      if (save.disabled) return;
      save.disabled = true; status.textContent = ''; status.className = 'form-status';
      try {
        const body = { profiles: [...chosen.values()].filter((p) => !(own && account.profiles.some((x) => x.key === p.key && x.automatic))).map((p) => ({ personId: p.personId, company: p.company })), defaultProfile: def, ...(loginData.canManageRoles ? { roleIds: [...roles] } : {}) };
        if (name) body.displayName = name.querySelector('input').value;
        if (ownerPick) body.owner = ownerPick.querySelector('select').value || false;
        if (creating) body.username = user.querySelector('input').value;
        const r = creating ? await api('/api/logins', body) : await api('/api/logins/' + account.id, body);
        d.close('ok'); loginData = null; done();
        if (r.temporaryPassword) credentialsDialog(r.account.displayName, r); else toast('Saved.');
      } catch (err) { status.textContent = err.message; status.className = 'form-status bad'; }
      finally { save.disabled = false; }
    });
    $('#dialog-title').textContent = creating ? 'New sign-in account' : 'Edit ' + account.displayName;
    $('#dialog-body').replaceChildren(h('div', { class: 'account-editor' },
      name, user,
      h('h3', { text: 'Profiles' }), h('p', { class: 'muted small', text: 'Each company someone works at is its own profile. Tick the profiles this account can use and choose its default; they’ll pick one each time they sign in. With none, the account works on HN Group websites but not as a member of staff.' }),
      filter, list,
      h('h3', { text: 'Permissions' }), h('p', { class: 'muted small', text: loginData.canManageRoles ? 'This account’s own permissions, whichever profile it uses.' : 'You need the “Manage roles” permission to change these.' }), roleBoxes, ownerPick, status));
    $('#dialog-buttons').replaceChildren(h('button', { class: 'button secondary', value: 'cancel', text: 'Cancel', formnovalidate: true }), save);
    d.onclose = null; d.classList.add('wide'); d.addEventListener('close', () => d.classList.remove('wide'), { once: true });
    d.showModal();
  }
  // A small "More" menu of actions (the danger ones in red).
  function moreMenu(items) {
    const pop = h('div', { class: 'more-pop', role: 'menu' }, items.filter(Boolean).map(([label, run, danger]) => h('button', { type: 'button', role: 'menuitem', class: danger ? 'danger' : '', onclick: () => { menu.open = false; run(); } }, label)));
    const summary = h('summary', { class: 'button secondary small' }, 'More');
    const menu = h('details', { class: 'more' }, summary, pop);
    // Drawn above the page (fixed), so the table's scrolling area never cuts it off; opens upwards near the bottom.
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      const r = summary.getBoundingClientRect(), height = pop.offsetHeight || 160, below = window.innerHeight - r.bottom > height + 12;
      pop.style.left = Math.max(8, r.right - Math.max(pop.offsetWidth, 170)) + 'px';
      pop.style.top = (below ? r.bottom + 6 : r.top - height - 6) + 'px';
    });
    return menu;
  }
  document.addEventListener('click', (e) => { for (const m of document.querySelectorAll('details.more[open]')) if (!m.contains(e.target)) m.open = false; });
  window.addEventListener('scroll', () => { for (const m of document.querySelectorAll('details.more[open]')) m.open = false; }, true);
  async function accounts() {
    if (!loginData) loginData = await api('/api/logins');
    const search = h('input', { type: 'search', placeholder: 'Search by name, username, profile or company', 'aria-label': 'Search sign-in accounts', class: 'search' });
    const body = h('tbody');
    const roleName = (id) => (loginData.roles.find((r) => r.id === id) || {}).name;
    const status = (a) => !a.account ? ['No password', ''] : !a.account.enabled ? ['Disabled', 'warn'] : a.account.passwordTemporary ? ['Temporary password', ''] : !a.account.hasCode ? ['PIN not set', ''] : ['Active', 'ok'];
    const reload = async () => { loginData = await api('/api/logins'); draw(); };
    async function act(a, action, title, text, label, danger) {
      if (!(await confirmDialog(title, text, label, danger))) return;
      try {
        const r = await api('/api/logins/' + a.id + '/' + action, {});
        if (r.temporaryPassword) credentialsDialog(a.displayName, r); else toast(action === 'delete' ? 'Account deleted.' : 'Done.');
        await reload();
      } catch (err) { toast(err.message, true); }
    }
    function draw() {
      const q = search.value.trim().toLowerCase();
      body.replaceChildren(...loginData.accounts.filter((a) => !q || [a.displayName, a.username, ...a.profiles.map((p) => p.displayName + ' ' + p.company)].join(' ').toLowerCase().includes(q)).map((a) => {
        const [label, cls] = status(a), self = a.id === me.accountId && !loginData.ownerLevel;
        return h('tr', {}, h('td', {}, h('span', { class: 'person' }, avatar(a.profiles.find((p) => p.default) || a, 'sm'), h('span', {}, h('b', { text: a.displayName }), h('span', { class: 'muted small', text: a.username })))),
          h('td', {}, a.profiles.length ? h('div', { class: 'chips' }, a.profiles.map((p) => h('span', { class: 'chip' + (p.default ? ' default' : ''), title: p.default ? 'Default profile' : null, text: (a.profiles.some((x) => x.personId !== p.personId) ? p.displayName + ' · ' : '') + p.company + (p.default ? ' ★' : '') }))) : h('span', { class: 'muted small', text: 'No staff profile' })),
          h('td', {}, a.systemOwner ? h('span', { class: 'pill ok', text: 'System owner' }) : a.ownerAccess ? h('span', { class: 'pill ok', text: 'Owner-level' }) : a.roleIds.length ? h('span', { class: 'small', text: a.roleIds.map(roleName).filter(Boolean).join(', ') }) : h('span', { class: 'muted small', text: 'None' })),
          h('td', {}, h('span', { class: 'pill ' + cls, text: label })), h('td', { class: 'small nowrap', text: a.account && a.account.lastLoginAt ? new Date(a.account.lastLoginAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never' }),
          h('td', {}, h('div', { class: 'actions' },
            h('button', { class: 'button secondary small', type: 'button', onclick: () => editAccount(a, draw) }, 'Edit'),
            self ? h('span', { class: 'muted small', text: 'You' }) : moreMenu([
              [a.account ? 'Reset password' : 'Set password', () => act(a, 'reset', 'Reset the password for ' + a.username + '?', 'They’ll be signed out everywhere and get a temporary password.', 'Reset password')],
              a.account && a.account.hasCode ? ['Reset PIN', () => act(a, 'code/reset', 'Reset the PIN for ' + a.username + '?', 'They’ll be signed out and asked to set a new PIN when they next sign in.', 'Reset PIN')] : null,
              a.account ? [a.account.enabled ? 'Disable' : 'Enable', () => act(a, a.account.enabled ? 'disable' : 'enable', (a.account.enabled ? 'Disable ' : 'Enable ') + a.username + '?', a.account.enabled ? 'It’ll be signed out everywhere and can’t sign in to any HN Group website until it’s enabled again.' : 'It’ll be able to sign in again.', a.account.enabled ? 'Disable' : 'Enable', a.account.enabled), a.account.enabled] : null,
              a.ownLoginOf ? null : ['Delete', () => act(a, 'delete', 'Delete ' + a.username + '?', 'The account is removed and signed out everywhere. Staff records and their data aren’t affected.', 'Delete account', true), true]]))));
      }));
    }
    search.addEventListener('input', draw); draw();
    const list = loginData.accounts, counts = { all: list.length, linked: list.filter((a) => a.profiles.length).length, none: list.filter((a) => !a.profiles.length).length };
    return [h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: 'Sign-in accounts' }), h('p', { class: 'lede', text: 'Every account people sign in with. Each has its own password, PIN and permissions, and the profiles it can use. Accounts are only created here.' })),
      h('button', { class: 'button', type: 'button', onclick: () => editAccount(null, async () => { await reload(); }) }, 'New sign-in account')),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', { text: counts.all }), ' accounts'), h('div', { class: 'stat' }, h('b', { text: counts.linked }), ' with staff profiles'), h('div', { class: 'stat' }, h('b', { text: counts.none }), ' without')),
      h('section', { class: 'card' }, search, h('div', { class: 'table-wrap' }, h('table', { class: 'staff-table accounts-table' }, h('thead', {}, h('tr', {}, ['Account', 'Profiles', 'Permissions', 'Status', 'Last sign-in', ''].map((t) => h('th', { text: t })))), body)))];
  }

  const VIEWS = { overview, profile, security, devices, websites, accounts, staff };
  let seq = 0;
  async function render(name) {
    if (!VIEWS[name] || ((name === 'staff' || name === 'accounts') && !session.admin)) name = 'overview';
    const mine = ++seq, main = $('#content');
    nav(name); main.classList.add('leaving');
    try {
      const nodes = await VIEWS[name]();
      if (mine !== seq) return;
      main.replaceChildren(...nodes); main.classList.remove('leaving'); main.classList.add('entering');
      requestAnimationFrame(() => requestAnimationFrame(() => main.classList.remove('entering')));
      document.title = (PAGES.find((p) => p[0] === name) || PAGES[0])[1] + ' · HN Account';
    } catch (err) { if (mine === seq) { main.replaceChildren(h('section', { class: 'card' }, h('h1', { text: 'Couldn’t load this page' }), h('p', { text: err.message }))); main.classList.remove('leaving'); } }
  }
  window.addEventListener('hashchange', () => { render(location.hash.slice(1)); $('#content').focus({ preventScroll: true }); });
  (async function start() {
    try { session = await (await fetch('/api/session')).json(); if (!session.csrf) throw 0; me = (await api('/api/me')).user; }
    catch { location.href = '/auth/login'; return; }
    header(); render(location.hash.slice(1) || 'overview');
  })();
})();
