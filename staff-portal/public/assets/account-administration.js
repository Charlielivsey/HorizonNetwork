/* Account administration on IT. All authorization remains in the private backend. */
(function(){'use strict';if(document.documentElement.dataset.hnApp&&document.documentElement.dataset.hnApp!=='it')return;
 let context,me,staffList=null,loginData=null,accountFilter='all';
 const $=s=>document.querySelector(s.replace(/^#dialog/,'#it-admin-dialog').replace(/^#toast/,'#it-admin-toast'));
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
  const api=(path,body)=>context.api(path,body);
  let toastTimer;
  function toast(text, bad) { const t = $('#toast'); t.textContent = text; t.className = 'admin-toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200); }
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
      openDialog(d,'confirm');ok.focus({preventScroll:true});
    });
  }
  function showDialog(title, nodes) {
    const d = $('#dialog');
    $('#dialog-title').textContent = title; $('#dialog-body').replaceChildren(...nodes);
    $('#dialog-buttons').replaceChildren(h('button', { class: 'button', value: 'ok', text: 'Done' }));
    d.onclose = null; openDialog(d,'credentials');
  }

  async function staff() {
    if (!staffList) staffList = (await api('/api/employees')).employees;
    const search = h('input', { type: 'search', placeholder: 'Search by name, username or company', 'aria-label': 'Search staff accounts', class: 'search' });
    const body = h('tbody');
    const status = (e) => !e.account ? ['No login', ''] : e.account.locked ? ['Locked','warn'] : !e.account.enabled ? ['Disabled', 'warn'] : e.account.passwordTemporary ? ['Temporary password', ''] : !e.account.hasCode ? ['PIN not set', ''] : ['Active', 'ok'];
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
          h('td', {}, h('span', { class: 'pill ' + cls, 'data-state':label.toLowerCase().replaceAll(' ','-'),text: label })), h('td', { class: 'small', text: e.account ? when(e.account.lastLoginAt) : '—' }),
          h('td', {}, h('div', { class: 'actions' }, self ? h('span', { class: 'muted small', text: 'You' }) : [
            h('button', { class: 'button secondary small', type: 'button', onclick: () => act(e, 'account', e.account ? 'Reset ' + e.displayName + '’s password?' : 'Create a login for ' + e.displayName + '?', e.account ? 'They’ll be signed out everywhere and get a temporary password.' : 'They’ll get a username and temporary password.', e.account ? 'Reset password' : 'Create login') }, e.account ? 'Reset password' : 'Create login'),
            e.account && e.account.hasCode ? h('button', { class: 'button secondary small', type: 'button', onclick: () => act(e, 'code/reset', 'Reset ' + e.displayName + '’s PIN?', 'They’ll be signed out and asked to set a new PIN when they next sign in.', 'Reset PIN') }, 'Reset PIN') : null,
            e.account?.locked ? h('a',{class:'button secondary small',href:'/accounts?search='+encodeURIComponent(e.loginUsername||e.displayName),'data-link':true,text:'Manage lock'}) : e.account ? h('button', { class: 'button small ' + (e.account.enabled ? 'danger' : 'secondary'), type: 'button', onclick: () => act(e, e.account.enabled ? 'account/disable' : 'account/enable', (e.account.enabled ? 'Disable ' : 'Enable ') + e.displayName + '’s account?', e.account.enabled ? 'They’ll be signed out everywhere and can’t sign in to any HN Group website until it’s enabled again.' : 'They’ll be able to sign in again.', e.account.enabled ? 'Disable' : 'Enable', e.account.enabled) }, e.account.enabled ? 'Disable' : 'Enable') : null])));
      }));
      if(!body.children.length)body.append(h('tr',{},h('td',{colspan:5,class:'admin-empty'},symbol('search'),h('strong',{text:'No staff records match your search.'}))));
      paintStats({'Staff records':staffList.length,active:staffList.filter(e=>e.account?.enabled).length,'Awaiting a login':staffList.filter(e=>!e.account).length,locked:staffList.filter(e=>e.account?.locked).length});
    }
    search.addEventListener('input', draw); draw();
    // Opened from the staff portal straight after adding someone (#staff/create/<record id>): show them and offer to
    // create their sign-in account (the user's request, 6 November 2026).
    const wanted = /^#staff\/create\/([a-f0-9]{16})$/.exec(('#staff/create/'+(new URLSearchParams(location.search).get('create') || '')));
    if (wanted) {
      history.replaceState(null, '', '/staff-accounts');
      const e = staffList.find((x) => x.id === wanted[1]);
      if (e) setTimeout(() => {
        search.value = e.displayName; draw();
        if (!e.account) act(e, 'account', 'Create a login for ' + e.displayName + '?', 'They’ll get a username and temporary password, and choose their own password and PIN when they first sign in.', 'Create login');
      }, 50);
    }
    const counts={all:staffList.length,active:staffList.filter(e=>e.account?.enabled).length,missing:staffList.filter(e=>!e.account).length,locked:staffList.filter(e=>e.account?.locked).length};
    return [h('header',{class:'admin-page-heading'},h('div',{},h('p',{class:'admin-eyebrow',text:'STAFF ACCESS'}),h('h1',{text:'Staff records'}),h('p',{class:'lede',text:'Create staff logins and manage access for existing staff records.'})),h('a',{class:'button secondary',href:'/accounts','data-link':true},symbol('key'),'Sign-in accounts')),
      summaryStats([['Staff records',counts.all],['Active logins',counts.active,'active'],['Awaiting a login',counts.missing],['Locked accounts',counts.locked,'locked']]),
      h('section',{class:'card admin-directory'},h('div',{class:'admin-directory-heading'},h('div',{},h('h2',{text:'Staff login directory'}),h('p',{text:'Staff details are maintained in HR. Sign-in access is managed here.'}))),listToolbar(search),h('div',{class:'table-wrap'},h('table',{class:'staff-table staff-logins-table'},h('thead',{},h('tr',{},['Person','Position','Sign-in status','Last sign-in','Actions'].map(t=>h('th',{text:t})))),body))),
      h('p',{class:'admin-footnote'},symbol('users'),'Need to change someone’s role or staff details? ',h('a',{href:'https://hr.hngroup.org.uk/employees',text:'Open Employee Management in HR'}))];

  }

  // ---------- Sign-in accounts ----------
  // The user's request, 28 October 2026: sign-in accounts are separate from staff records. Each has its own
  // password, PIN and permissions, and can use any number of profiles (each company on a staff record is its own
  // profile) with one as its default, or none at all. People choose the profile when they sign in.

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
    // Guest accounts (the user's request, 6 November 2026): only the websites and apps ticked here; chosen when the
    // account is made, changeable later; Make permanent turns a guest into an ordinary account.
    const guestSites = new Set(account && account.guest ? account.guest.sites : []);
    const canGuest = creating || (account && account.guest);
    const guestBox = creating ? h('input', { type: 'checkbox', id: 'guest-toggle' }) : null;
    const siteBoxes = h('div', { class: 'role-pick guest-sites' }, (loginData.guestSites || []).map((x) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: guestSites.has(x.id), onchange: (e) => { if (e.target.checked) guestSites.add(x.id); else guestSites.delete(x.id); } }), h('span', {}, h('b', { text: x.name })))));
    const guestPart = canGuest ? h('div', { class: 'guest-part' },
      h('h3', { text: 'Guest account' }),
      creating ? h('label', { class: 'check' }, guestBox, h('span', {}, h('b', { text: 'This is a guest account' }), h('span', { class: 'muted small', text: ' It doesn’t need a permanent staff record, and can only use the websites and apps ticked below. Link it to a temporary staff record under Profiles if they have one.' })))
        : h('p', { class: 'muted small', text: 'This guest account can only use the websites and apps ticked below. Use “Make permanent” when they move to a permanent position.' }),
      siteBoxes) : null;
    if (guestBox) { const show = () => { siteBoxes.hidden = !guestBox.checked; }; guestBox.addEventListener('change', show); show(); }
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
        return h('div', { class: 'profile-row' + (chosen.has(p.key) ? ' on' : '') }, h('label', { class: 'check' }, box, avatar(p, 'sm'), h('span', {}, h('b', { text: p.displayName }), h('span', { class: 'muted small', text: p.company + (p.jobTitle ? ' · ' + p.jobTitle : '') + (p.temporary ? ' · temporary' : '') + (auto ? ' · their own record' : '') }))),
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
        if ((creating && guestBox.checked) || (account && account.guest)) {
          if (!guestSites.size) throw new Error('Tick at least one website or app the guest account can use.');
          body.guest = { sites: [...guestSites] };
        }
        const r = creating ? await api('/api/logins', body) : await api('/api/logins/' + account.id, body);
        d.close('ok');if(creating)loginData.accounts.push(r.account);else loginData.accounts=loginData.accounts.map(a=>a.id===r.account.id?r.account:a);done();
        if (r.temporaryPassword) credentialsDialog(r.account.displayName, r); else toast('Saved.');
      } catch (err) { status.textContent = err.message; status.className = 'form-status bad'; }
      finally { save.disabled = false; }
    });
    $('#dialog-title').textContent = creating ? 'New sign-in account' : 'Edit ' + account.displayName;
    const panel=(id,title,description,nodes)=>({id,title,description,el:h('section',{class:'admin-editor-panel',id:'editor-'+id,role:'tabpanel'},h('div',{class:'admin-panel-heading'},h('h3',{text:title}),h('p',{text:description})),...nodes.filter(Boolean))});
    const panels=[
      panel('details','Account details','The identity used to sign in across HN Group.',[h('div',{class:'admin-account-identity'},avatar(account?.profiles.find(p=>p.default)||account||{displayName:'New account'},'xl'),h('div',{},h('strong',{text:account?.displayName||'New sign-in account'}),h('span',{text:account?.username||'Set up an identity and choose its access.'}))),h('div',{class:'admin-fields'},name,user),own?h('p',{class:'admin-information',text:'The name and username for this account come from its staff record. Manage staff details in HR.'}):null,h('div',{class:'admin-information'},symbol('shield'),h('p',{text:'Two consecutive incorrect password or PIN attempts lock this account. IT can restore access after checking the request.'}))]),
      panel('profiles','Linked profiles','Choose the staff profiles this account can use, then mark one as the default.',[filter,list]),
      panel('permissions','Permissions','Access follows this account across its linked profiles.',[!loginData.canManageRoles?h('p',{class:'admin-information',text:'You need the Manage roles permission to change these settings.'}):null,roleBoxes,ownerPick])
    ];
    if(guestPart)panels.push(panel('guest','Guest access','Limit a guest account to the selected websites and apps.',[guestPart]));
    const tabs=h('div',{class:'admin-editor-tabs',role:'tablist','aria-label':'Account settings'});
    const selectTab=id=>{panels.forEach(panel=>{panel.el.hidden=panel.id!==id;const button=tabs.querySelector('[data-editor-tab="'+panel.id+'"]');button.setAttribute('aria-selected',String(panel.id===id));button.tabIndex=panel.id===id?0:-1;});};
    panels.forEach((panel,i)=>{const button=h('button',{type:'button',role:'tab',id:'editor-tab-'+panel.id,'data-editor-tab':panel.id,'aria-controls':'editor-'+panel.id,onclick:()=>selectTab(panel.id)},symbol({details:'key',profiles:'users',permissions:'shield',guest:'globe'}[panel.id]),panel.title);panel.el.setAttribute('aria-labelledby',button.id);tabs.append(button);});
    tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...tabs.querySelectorAll('button')],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:buttons.length-1))%buttons.length;buttons[next].click();buttons[next].focus();});
    const editor=h('div',{class:'account-editor'},tabs,...panels.map(p=>p.el));
    $('#dialog-body').replaceChildren(editor,status);selectTab('details');
    $('#dialog-buttons').replaceChildren(h('button', { class: 'button secondary', value: 'cancel', text: 'Cancel', formnovalidate: true }), save);
    d.onclose = null; d.classList.add('wide'); d.addEventListener('close', () => d.classList.remove('wide'), { once: true });
    openDialog(d,'editor');
  }
  // A small "More" menu of actions (the danger ones in red). The menu is attached to the page itself, not inside the
  // table: the table's rows animate with transforms, which would otherwise move or clip a fixed menu (the user's
  // report, 6 November 2026: "more just doesnt work").
  function closeMore() { for (const p of document.querySelectorAll('.more-pop')) { if (p._button) p._button.setAttribute('aria-expanded', 'false'); if(p._host)p._host.remove();else p.remove(); } }
  function moreMenu(items) {
    const button = h('button', { type: 'button', class: 'button secondary small more', 'aria-label':'More', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, '•••');
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = button.getAttribute('aria-expanded') === 'true';
      closeMore();
      if (wasOpen) return;
      const pop = h('div', { class: 'more-pop', role: 'menu' }, items.filter(Boolean).map(([label, run, danger]) => h('button', { type: 'button', role: 'menuitem', class: danger ? 'danger' : '', onclick: () => { closeMore(); run(); } }, label)));
      pop._button = button;
      pop.addEventListener('click', (ev) => ev.stopPropagation());
      pop.addEventListener('keydown', (ev) => {
        const list = [...pop.querySelectorAll('button')], at = list.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); closeMore(); button.focus(); }
        else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); list[(at + (ev.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus(); }
      });
      const host=h('div',{class:'it-account-admin it-admin-menu-host'},pop);pop._host=host;document.body.appendChild(host);
      button.setAttribute('aria-expanded', 'true');
      const r = button.getBoundingClientRect(), height = pop.offsetHeight, width = Math.max(pop.offsetWidth, 170), below = window.innerHeight - r.bottom > height + 12;
      pop.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)) + 'px';
      pop.style.top = Math.max(8, below ? r.bottom + 6 : r.top - height - 6) + 'px';
      const first = pop.querySelector('button'); if (first) first.focus({ preventScroll: true });
    });
    return button;
  }
  document.addEventListener('click', closeMore);
  window.addEventListener('scroll', closeMore, true);
  window.addEventListener('resize', closeMore);
  window.addEventListener('hashchange', closeMore);
  async function accounts() {
    if (!loginData) loginData = await api('/api/logins');
    const search = h('input', { type: 'search', placeholder: 'Search by name, username, profile or company', 'aria-label': 'Search sign-in accounts', class: 'search' });
    let selectedFilter=accountFilter;
    const filterTabs=h('div',{class:'admin-list-filters','aria-label':'Filter accounts'});
    const body = h('tbody');
    const roleName = (id) => (loginData.roles.find((r) => r.id === id) || {}).name;
    const status = (a) => !a.account ? ['No password', ''] : a.account.locked ? ['Locked','warn'] : !a.account.enabled ? ['Disabled', 'warn'] : a.account.passwordTemporary ? ['Temporary password', ''] : !a.account.hasCode ? ['PIN not set', ''] : ['Active', 'ok'];
    const reload = async () => { loginData = await api('/api/logins'); draw(); };
    // Make permanent: keep their temporary staff record (it becomes permanent) or move them onto an existing permanent one.
    function makePermanent(a) {
      const d = $('#dialog');
      const temps = a.profiles.filter((p) => p.temporary);
      const records = [...new Map(loginData.profiles.filter((p) => !p.temporary).map((p) => [p.personId, p])).values()].sort((x, y) => x.displayName.localeCompare(y.displayName));
      const choice = field('Where they go', 'target', temps.length ? '' : (records[0] || {}).personId || '', { options: [
        ...(temps.length ? [['', 'Keep their staff record (' + [...new Set(temps.map((p) => p.displayName))].join(', ') + ') and make it permanent']] : []),
        ...records.map((p) => [p.personId, 'Move to ' + p.displayName + ' (' + p.company + (p.jobTitle ? ', ' + p.jobTitle : '') + ')'])], hint: 'The account keeps its username, password and PIN, stops being a guest and can then use HN Group websites like any member of staff (with its own permissions).' });
      const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
      const go = h('button', { class: 'button', type: 'button', text: 'Make permanent' });
      go.addEventListener('click', async () => {
        if (go.disabled) return; go.disabled = true; status.textContent = '';
        try { const personId = choice.querySelector('select').value; await api('/api/logins/' + a.id + '/permanent', personId ? { personId } : {}); d.close('ok'); toast(a.displayName + ' is now a permanent account.'); await reload(); }
        catch (err) { status.textContent = err.message; status.className = 'form-status bad'; } finally { go.disabled = false; }
      });
      $('#dialog-title').textContent = 'Make ' + a.displayName + ' permanent';
      $('#dialog-body').replaceChildren(h('p', { text: 'Use this when a guest moves to a permanent position.' }), choice, status);
      $('#dialog-buttons').replaceChildren(h('button', { class: 'button secondary', value: 'cancel', text: 'Cancel', formnovalidate: true }), go);
      d.onclose = null; d.classList.add('wide'); d.addEventListener('close', () => d.classList.remove('wide'), { once: true }); openDialog(d,'permanent');
    }
    async function act(a, action, title, text, label, danger) {
      if (!(await confirmDialog(title, text, label, danger))) return;
      try {
        const r = await api('/api/logins/' + a.id + '/' + action, {});
        if (r.temporaryPassword) credentialsDialog(a.displayName, r); else toast(action === 'delete' ? 'Account deleted.' : 'Done.');
        await reload();
      } catch (err) { toast(err.message, true); }
    }
    function draw() {
      const predicates={all:()=>true,active:a=>a.account?.enabled,locked:a=>a.account?.locked,guest:a=>a.guest,disabled:a=>a.account&&!a.account.enabled&&!a.account.locked};
      filterTabs.replaceChildren(...[['all','All accounts'],['active','Active'],['locked','Locked'],['guest','Guests'],['disabled','Disabled']].map(([key,label])=>h('button',{type:'button','aria-pressed':String(selectedFilter===key),onclick:()=>{selectedFilter=key;accountFilter=key;draw();}},label,h('span',{text:loginData.accounts.filter(predicates[key]).length}))));
      const q = search.value.trim().toLowerCase();
      body.replaceChildren(...loginData.accounts.filter(predicates[selectedFilter]).filter((a) => !q || [a.displayName, a.username, status(a)[0], ...a.profiles.map((p) => p.displayName + ' ' + p.company)].join(' ').toLowerCase().includes(q)).map((a) => {
        const [label, cls] = status(a), self = a.id === me.accountId && !loginData.ownerLevel;
        return h('tr', {}, h('td', {}, h('span', { class: 'person' }, avatar(a.profiles.find((p) => p.default) || a, 'sm'), h('span', {}, h('b', { text: a.displayName }, a.guest ? h('span', { class: 'pill guest', text: 'Guest' }) : null), h('span', { class: 'muted small', text: a.username })))),
          h('td', {}, a.profiles.length ? h('div', { class: 'chips' }, a.profiles.map((p) => h('span', { class: 'chip' + (p.default ? ' default' : ''), title: p.default ? 'Default profile' : null, text: (a.profiles.some((x) => x.personId !== p.personId) ? p.displayName + ' · ' : '') + p.company + (p.default ? ' ★' : '') }))) : h('span', { class: 'muted small', text: 'No staff profile' })),
          h('td', {}, a.systemOwner ? h('span', { class: 'pill ok', text: 'System owner' }) : a.ownerAccess ? h('span', { class: 'pill ok', text: 'Owner-level' }) : a.roleIds.length ? h('span', { class: 'small', text: a.roleIds.map(roleName).filter(Boolean).join(', ') }) : h('span', { class: 'muted small', text: 'None' })),
          h('td', {}, h('span', { class: 'pill ' + cls, 'data-state':label.toLowerCase().replaceAll(' ','-'),text: label })), h('td', { class: 'small nowrap', text: a.account && a.account.lastLoginAt ? new Date(a.account.lastLoginAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never' }),
          h('td', {}, h('div', { class: 'actions' },
            h('button', { class: 'button secondary small', type: 'button', onclick: () => editAccount(a, draw) }, 'Edit'),
            self ? h('span', { class: 'muted small', text: 'You' }) : moreMenu([
              [a.account ? 'Reset password' : 'Set password', () => act(a, 'reset', 'Reset the password for ' + a.username + '?', 'They’ll be signed out everywhere and get a temporary password.', 'Reset password')],
              a.account && a.account.hasCode ? ['Reset PIN', () => act(a, 'code/reset', 'Reset the PIN for ' + a.username + '?', 'They’ll be signed out and asked to set a new PIN when they next sign in.', 'Reset PIN')] : null,
              a.account ? [a.account.locked ? 'Unlock account' : 'Lock account', () => act(a, a.account.locked ? 'unlock' : 'lock', (a.account.locked ? 'Unlock ' : 'Lock ') + a.username + '?', a.account.locked ? 'Sign-in access will be restored unless the account was disabled before it was locked.' : 'All active sessions will end. They will need IT to unlock their account before signing in again.', a.account.locked ? 'Unlock account' : 'Lock account', !a.account.locked), !a.account.locked] : null,
              a.account && !a.account.locked ? [a.account.enabled ? 'Disable' : 'Enable', () => act(a, a.account.enabled ? 'disable' : 'enable', (a.account.enabled ? 'Disable ' : 'Enable ') + a.username + '?', a.account.enabled ? 'It’ll be signed out everywhere and can’t sign in to any HN Group website until it’s enabled again.' : 'It’ll be able to sign in again.', a.account.enabled ? 'Disable' : 'Enable', a.account.enabled), a.account.enabled] : null,
              a.guest ? ['Make permanent…', () => makePermanent(a)] : null,
              a.ownLoginOf ? null : ['Delete', () => act(a, 'delete', 'Delete ' + a.username + '?', 'The account is removed and signed out everywhere. Staff records and their data aren’t affected.', 'Delete account', true), true]]))));
      }));
      if(!body.children.length)body.append(h('tr',{},h('td',{colspan:6,class:'admin-empty'},symbol('search'),h('strong',{text:'No accounts match these filters.'}))));
      paintStats({'Total accounts':loginData.accounts.length,active:loginData.accounts.filter(a=>a.account?.enabled).length,locked:loginData.accounts.filter(a=>a.account?.locked).length,guest:loginData.accounts.filter(a=>a.guest).length});
    }
    search.addEventListener('input', draw); draw();
    const counts={all:loginData.accounts.length,active:loginData.accounts.filter(a=>a.account?.enabled).length,locked:loginData.accounts.filter(a=>a.account?.locked).length,guests:loginData.accounts.filter(a=>a.guest).length};
    return [h('header',{class:'admin-page-heading'},h('div',{},h('p',{class:'admin-eyebrow',text:'IDENTITY & ACCESS'}),h('h1',{text:'Sign-in accounts'}),h('p',{class:'lede',text:'Manage the people, profiles and permissions connected to HN Group.'})),h('button',{class:'button',type:'button',onclick:()=>editAccount(null,()=>draw())},symbol('plus'),'New sign-in account')),
      summaryStats([['Total accounts',counts.all],['Active accounts',counts.active,'active'],['Locked accounts',counts.locked,'locked'],['Guest accounts',counts.guests,'guest']]),
      h('section',{class:'card admin-directory'},h('div',{class:'admin-directory-heading'},h('div',{},h('h2',{text:'Account directory'}),h('p',{text:'Search an identity or narrow the list by sign-in status.'})),h('span',{class:'admin-live-label'},'Live updates')),listToolbar(search,filterTabs),h('div',{class:'table-wrap'},h('table',{class:'staff-table accounts-table'},h('thead',{},h('tr',{},['Account','Linked profiles','Access','Status','Last sign-in','Actions'].map(t=>h('th',{text:t})))),body))),
      h('p',{class:'admin-footnote'},symbol('shield'),'Accounts lock automatically after two consecutive incorrect password or PIN attempts.')];

  }


 function symbol(name){const paths={search:'m21 21-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',shield:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7z',key:'M15 7a4 4 0 1 1-4 5H8v3H5v3H2v-5l9-9',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4',globe:'M3 12h18M12 3c5 4 5 14 0 18-5-4-5-14 0-18M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',plus:'M12 5v14M5 12h14',close:'m6 6 12 12M18 6 6 18'};const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[name]||paths.shield);svg.append(path);return svg;}
 function openDialog(d,kind){
  if(kind!=='editor')d.classList.remove('wide');
  d.dataset.kind=kind;d.returnValue='';d.setAttribute('aria-labelledby','it-admin-dialog-title');
  const previous=document.activeElement;d.addEventListener('close',()=>{d.classList.remove('wide');if(!d.open&&previous?.isConnected)previous.focus({preventScroll:true});},{once:true});
  d.showModal();$('#dialog-body').scrollTop=0;
  const input=d.querySelector('input:not([disabled]),select:not([disabled])');if(input)input.focus({preventScroll:true});
 }
 function paintStats(values){document.querySelectorAll('.it-account-admin [data-stat]').forEach(el=>{if(Object.hasOwn(values,el.dataset.stat))el.textContent=values[el.dataset.stat];});}
 function summaryStats(items){return h('div',{class:'admin-stat-grid'},items.map(([label,value,kind])=>h('div',{class:'admin-stat '+(kind||'')},h('span',{class:'admin-stat-symbol'},symbol(kind==='locked'?'shield':kind==='guest'?'globe':'users')),h('div',{},h('strong',{'data-stat':kind||label,text:value}),h('span',{text:label})))));}
 function listToolbar(search,options){return h('div',{class:'admin-list-toolbar'},h('label',{class:'admin-list-search'},symbol('search'),search),options);}
 async function mount(root,ctx){
  const previousQuery=root.querySelector('input[type=search]')?.value || new URLSearchParams(location.search).get('search') || '';
  context=ctx;me=ctx.me;staffList=null;loginData=null;
  if(!me.canManageAccounts){root.textContent='You do not have permission to manage accounts.';return;}
  const wrap=h('section',{class:'it-account-admin'}),content=h('div',{id:'it-admin-content'});
  document.querySelector('#it-admin-toast')?.remove();document.body.appendChild(h('div',{id:'it-admin-toast',class:'admin-toast',role:'status',hidden:true}));
  wrap.append(content,h('dialog',{id:'it-admin-dialog',class:'dialog'},h('form',{method:'dialog'},h('header',{class:'admin-dialog-heading'},h('div',{},h('span',{class:'admin-eyebrow',text:'STAFF PORTAL · ACCOUNT ADMINISTRATION'}),h('h2',{id:'it-admin-dialog-title'})),h('button',{class:'admin-dialog-close',type:'submit',value:'cancel','aria-label':'Close dialog',formnovalidate:true},symbol('close'))),h('div',{id:'it-admin-dialog-body'}),h('footer',{id:'it-admin-dialog-buttons',class:'buttons'}))));
  root.replaceChildren(wrap);
  content.replaceChildren(...await (ctx.view==='staff'?staff():accounts()));
  const search=content.querySelector('input[type=search]');if(search && previousQuery){search.value=previousQuery;search.dispatchEvent(new Event('input'));}
 }
 window.HNAccountAdministration={mount};
})();
