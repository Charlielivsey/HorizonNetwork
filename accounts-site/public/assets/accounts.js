'use strict';
// HN Account: the signed-in pages. Everything is built with DOM methods (never HTML strings), and every
// change goes to this site's /api, which passes it to the staff account service.
(function () {
  const base=document.documentElement.dataset.accountBase||'';
  const accountPath=p=>base&&String(p).startsWith('/')&&!String(p).startsWith('//')&&!String(p).startsWith(base+'/')?base+p:p;
  const $ = (s) => document.querySelector(s);
  let session = null, me = null, staffList = null;

  // ---------- Small helpers ----------
  function h(tag, attrs) {
    const el = document.createElement(tag);
    for (let [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if(['src','href','action'].includes(k))v=accountPath(v);
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].slice.call(arguments, 2).flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  async function api(path, body) {
    const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify(body) };
    const r = await fetch(accountPath(path), opts);
    const data = await r.json().catch(() => ({}));
    for(const user of [data.user,...(data.people||[])].filter(Boolean))if(user.avatarUrl)user.avatarUrl=accountPath(user.avatarUrl);
    if (r.status === 401) { location.href = accountPath('/auth/login')+'?return='+encodeURIComponent('/'+location.hash); throw new Error('Please sign in again.'); }
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
    ['signature', 'Email signature', 'M3 5h18v14H3zM3 5l9 7 9-7'],
    ['security', 'Password & PIN', 'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3'],
    ['devices', 'Devices', 'M3 4h18v12H3zM8 20h8M12 16v4'],
    ['websites', 'Websites', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18'],
  ];
  const icon = (d) => { const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); svg.append(p); return svg; };
  function nav(active) {
    $('#nav').replaceChildren(...PAGES.filter((p) => !p[3] || session.admin).map(([id, label, d]) => h('a', { href: '#' + id, class: id === active ? 'active' : '', 'aria-current': id === active ? 'page' : null }, icon(d), h('span', { text: label }))));
  }
  function header() {
    const signOut = h('form', { method: 'post', action: '/auth/logout' }, h('input', { type: 'hidden', name: 'csrf', value: session.csrf }), h('button', { class: 'link', type: 'submit', text: 'Sign out' }));
    const trigger = h('summary', { class: 'account-trigger', 'aria-label': 'Your account: ' + me.displayName },
      avatar(me, 'sm'), h('span', { class: 'account-trigger-copy' }, h('strong', { text: me.displayName }), h('small', { text: 'Your account' })),
      icon('m6 9 6 6 6-6'));
    const menu = h('details', { class: 'account-control' }, trigger,
      h('div', { class: 'account-popover' }, h('div', { class: 'account-popover-heading' }, h('strong', { text: me.displayName }), h('span', { text: me.username })),
        h('a', { class: 'account-profile-link', href: '#profile', text: 'Manage your profile', onclick: () => { menu.open = false; } }), signOut));
    menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { menu.open = false; trigger.focus(); event.stopPropagation(); } });
    $('#user').replaceChildren(menu);
  }
  document.addEventListener('click', (event) => { const menu = $('#user .account-control'); if (menu && !menu.contains(event.target)) menu.open = false; });
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
        me.avatarUrl ? h('button', { class: 'button secondary', type: 'button', onclick: async () => { if (!(await confirmDialog('Remove your photo?', 'Your initials will be shown instead.', 'Remove', true))) return; me = (await api('/api/me/avatar/remove', {})).user; render('profile'); toast('Photo removed.'); } }, 'Remove') : null)),
      // Follow my Discord picture (the user's request, 5 November 2026): on by default; the bot copies the picture onto the
      // staff profile whenever it changes on Discord. A photo uploaded here stays until the Discord picture next changes.
      me.system ? null : h('label', { class: 'check discord-photo' }, h('input', { type: 'checkbox', checked: me.discordPhotoSync !== false, disabled: !(me.discord && me.discord.id), onchange: async (e) => {
        const on = e.target.checked; e.target.disabled = true;
        try { me = (await api('/api/me/discord-photo', { on })).user; render('profile'); toast(on ? 'Your photo now follows your Discord picture.' : 'Your photo will stay as it is.'); }
        catch (err) { e.target.checked = !on; e.target.disabled = false; toast(err.message, true); }
      } }), h('span', {}, h('b', { text: 'Use my Discord profile picture' }), h('span', { class: 'muted small', text: me.discord && me.discord.id ? 'Your photo changes whenever you change your picture on Discord' + (me.discord.username ? ' (@' + me.discord.username + ')' : '') + '. Turn this off to keep a photo you upload.' : 'Your staff profile isn’t linked to a Discord account yet. Ask someone who manages staff to add your Discord user ID.' }))));
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
      ['Everyday', [['Staff portal', 'https://staff.hngroup.org.uk/', true, 'Your workplace, HR, Finance and IT.'], ['HN Group Auth', 'https://auth.hngroup.org.uk/', true, 'Sign in to HN Group websites.'], ['HN Mail', 'https://mail.hngroup.org.uk/', !!(u.google && u.google.email), u.google && u.google.email ? 'Your Gmail (' + u.google.email + ') in HN Group’s mail app.' : 'Contact IT for linked mailbox access.'], ['HN Group Wiki', 'https://wiki.hngroup.org.uk/', true, 'Read and edit the group encyclopedia.'], ['Brand centre', 'https://branding.hngroup.org.uk/', true, 'Logos, colours and type.'], ['HN Secure Access Terminal', 'https://sat.hngroup.org.uk/', true, 'Connect your devices privately.'], ['Downloads', 'https://downloads.hngroup.org.uk/', true, 'HN Browser and HN Secure Access Terminal.'], ['HN Group Docs', 'https://docs.hngroup.org.uk/', true, 'Write company documents and keep your private storage.'], ['Echo', 'https://echo.hngroup.org.uk/', ['catnap@hngroup.org.uk', 'charlie.livsey@hngroup.org.uk'].includes(String(u.username || '').trim().toLowerCase()) && !u.impersonated, 'A private character and artwork library.'], ['HN Group Bots', 'https://bots.hngroup.org.uk/', admin || owner, 'Manage the Discord Auth bot.'], ['Private Company Register', 'https://private.companies.hngroup.org.uk/', true, (admin || owner) ? 'Read the private register and run its staff area.' : 'Read the private register and file changes.'], ['HN Group Private Wiki', 'https://private.wiki.hngroup.org.uk/', true, (admin || owner) ? 'Read and edit the private wiki.' : 'Read the private wiki.'], ['HN Group Contracts', 'https://contract.hngroup.org.uk/', true, (admin || owner) ? 'Sign contracts, and send them for signing.' : 'Sign the contracts sent to you.'], ['HN Group Devices', 'https://devices.hngroup.org.uk/', true, (admin || owner) ? 'Add your computers, and approve everyone’s.' : 'Add your computers so the HN apps work on them.']]],
      ['Investors', [['HN Group Investors', 'https://investors.hngroup.org.uk/staff', hnGroup, hnGroup ? 'Manage investors, valuations and news.' : 'For staff with a role at HN Group.']]],
      ['Website administration', [['hngroup.org.uk', 'https://hngroup.org.uk/admin', admin], ['Horizon Network', 'https://network.hngroup.org.uk/admin', admin], ['Service status', 'https://status.hngroup.org.uk/admin', admin], ['Horizon Media Group', 'https://media.hngroup.org.uk/admin', admin], ['Horizon Development', 'https://development.hngroup.org.uk/admin', admin], ['Careers', 'https://careers.hngroup.org.uk/admin', admin], ['News', 'https://news.hngroup.org.uk/admin', admin]].map((x) => x.concat(admin ? 'You can manage this website.' : 'System owner and Super Admin members only.'))],
      ['Website control', [['Website control', 'https://admin.hngroup.org.uk/', owner, owner ? 'Every permission (owner-level account).' : 'Needs access granted in website control itself.']]],
    ];
    return [h('h1', { text: 'Websites' }), h('p', { class: 'lede', text: 'Every HN Group website that uses your staff account, and whether your account can use it.' }),
      ...SITES.map(([group, list]) => section(group, null, h('div', { class: 'site-grid' }, list.map(([name, url, ok, note]) => h('a', { class: 'site' + (ok ? '' : ' locked'), href: url, rel: 'noopener' }, h('span', { class: 'site-name', text: name }), h('span', { class: 'pill ' + (ok ? 'ok' : ''), text: ok ? 'You can use this' : 'No access' }), h('span', { class: 'muted small', text: note || '' })))))) ];
  }

  const signature = async () => { me = (await api('/api/me')).user; return window.HNSignature({ me, api, toast }); };
  const VIEWS = { overview, profile, signature, security, devices, websites };
  let seq = 0;
  async function render(name) {
    const old=String(name || '');
    if(/^(accounts|staff)(\/|$)/.test(old)){const m=/^staff\/create\/([a-f0-9]{16})$/.exec(old);location.replace('https://staff.hngroup.org.uk/'+(old.startsWith('staff')?'staff-accounts':'accounts')+(m?'?create='+m[1]:''));return;}
    name = old.split('/')[0];
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
    try { session = await (await fetch(accountPath('/api/session'))).json(); if (!session.csrf) throw 0; me = (await api('/api/me')).user; }
    catch { location.href = accountPath('/auth/login')+'?return='+encodeURIComponent('/'+location.hash); return; }
    header(); if(window.HNStaffBrand)window.HNStaffBrand.apply(me); render(location.hash.slice(1) || 'overview');
  })();
})();
