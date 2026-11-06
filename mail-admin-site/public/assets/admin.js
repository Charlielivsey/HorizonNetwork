'use strict';
// HN Group mail administration (admin.mail.hngroup.org.uk). Every change goes through the server, which checks the
// administrator's staff portal permissions, records it in the audit log and applies it to the mail server.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const v = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/auth/login'; throw new Error('Please sign in again.'); }
    if (!r.ok) throw new Error(v.error || 'Something went wrong.');
    return v;
  }
  const toast = (text) => { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500); };
  const showError = (e) => { const el = $('#error'); el.textContent = e ? (e.message || String(e)) : ''; el.hidden = !e; };
  const size = (kb) => kb == null ? '—' : kb >= 1048576 ? (kb / 1048576).toFixed(2) + ' GB' : kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB';
  const mb = (n) => n >= 1024 ? (n / 1024).toFixed(n % 1024 ? 2 : 0) + ' GB' : n + ' MB';
  const when = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  let state = null, current = 'overview';
  const can = (...ps) => state && (state.me.owner || ps.some((p) => state.me.permissions.includes(p)));

  const VIEWS = [
    ['overview', 'Overview', () => true, 'HN GROUP / MAIL', 'Mail.', 'Run by HN Group.', 'Mailboxes, storage and the mail server at a glance.'],
    ['mailboxes', 'Mailboxes', () => can('mail.view', 'mail.mailboxes', 'mail.shared'), 'MAILBOXES', 'People’s', 'mailboxes.', 'Every person’s mailbox: storage, aliases, forwarding and access. Made automatically from staff records.'],
    ['shared', 'Shared mailboxes', () => can('mail.view', 'mail.shared', 'mail.mailboxes'), 'SHARED MAILBOXES', 'One inbox,', 'many people.', 'Members open the shared mailbox in HN Mail with their own account. Send-as is checked by the mail server.'],
    ['groups', 'Distribution groups', () => can('mail.view', 'mail.groups'), 'DISTRIBUTION GROUPS', 'Mail to', 'everyone in it.', 'A copy goes to each member. Groups can contain other groups.'],
    ['aliases', 'Aliases & forwarding', () => can('mail.view', 'mail.mailboxes'), 'ALIASES', 'More addresses,', 'same mailbox.', 'Extra addresses that deliver to mailboxes, groups or outside addresses.'],
    ['provisioning', 'Staff provisioning', () => can('mail.view', 'mail.mailboxes'), 'PROVISIONING', 'From staff records', 'to mailboxes.', 'Each staff record with an HN Group address gets one mailbox, checked every minute.'],
    ['delivery', 'Delivery & queue', () => can('mail.view', 'mail.settings'), 'DELIVERY', 'Where mail', 'is going.', 'Messages waiting to be delivered and recent delivery failures.'],
    ['logs', 'Logs', () => can('mail.view'), 'LOGS', 'What the server', 'is doing.', 'Recent mail server log lines (addresses and results, never message contents).'],
    ['domains', 'Domains & DNS', () => can('mail.view'), 'DOMAINS', 'Email', 'authentication.', 'MX, SPF, DKIM and DMARC for each domain, and the server’s own checks.'],
    ['settings', 'Settings', () => can('mail.view', 'mail.settings'), 'SETTINGS', 'How the server', 'behaves.', 'Default storage, sending limits and spam handling.'],
    ['audit', 'Audit log', () => can('mail.view'), 'AUDIT LOG', 'Every change,', 'recorded.', 'Who changed what, and when.'],
  ];

  // ---------- dialog ----------
  function ask({ eyebrow = '', title, body, ok = 'Save', danger = false, onSubmit }) {
    const d = $('#dialog'); $('#dialog-eyebrow').textContent = eyebrow; $('#dialog-title').textContent = title;
    $('#dialog-body').replaceChildren(...[].concat(body || [])); $('#dialog-error').hidden = true;
    const okBtn = $('#dialog-ok'); okBtn.textContent = ok; okBtn.classList.toggle('btn-danger', danger);
    return new Promise((resolve) => {
      const submit = async (e) => {
        if (e.submitter && e.submitter.value === 'cancel') return;
        e.preventDefault(); okBtn.disabled = true;
        try { const r = onSubmit ? await onSubmit() : true; d.close(); resolve(r); cleanup(); }
        catch (err) { $('#dialog-error').textContent = err.message; $('#dialog-error').hidden = false; }
        finally { okBtn.disabled = false; }
      };
      const cleanup = () => { $('#dialog-form').removeEventListener('submit', submit); d.removeEventListener('close', closed); };
      const closed = () => { cleanup(); resolve(null); };
      $('#dialog-form').addEventListener('submit', submit); d.addEventListener('close', closed);
      d.showModal();
    });
  }
  const field = (label, input, help) => h('div', { class: 'field full' }, h('label', {}, label), input, help ? h('small', { class: 'muted', text: help }) : null);
  const input = (attrs) => h('input', { type: 'text', ...attrs });

  // ---------- views ----------
  function usageCell(m) {
    const pct = m.percent == null ? null : m.percent;
    return h('div', { class: 'usage' }, h('div', { class: 'usage-bar' + (pct >= 100 ? ' full' : pct >= 90 ? ' warn' : '') }, (() => { const bar = h('span'); bar.style.width = Math.min(100, pct || 0) + '%'; return bar; })()),
      h('small', { text: (m.usedKB == null ? 'Not used yet' : size(m.usedKB)) + ' of ' + mb(m.quotaMB) + (pct == null ? '' : ' · ' + pct + '%') }));
  }
  function statusChips(m) {
    return [m.disabled ? h('span', { class: 'chip bad', text: 'Disabled' }) : null, m.suspended ? h('span', { class: 'chip bad', text: 'Suspended: accounts disabled' }) : null,
      m.recordGone ? h('span', { class: 'chip warn', text: 'Staff record removed' }) : null, m.temporary ? h('span', { class: 'chip plain', text: 'Temporary' }) : null,
      m.kind === 'person' && m.recordId && !(m.accounts || []).length ? h('span', { class: 'chip warn', text: 'No sign-in account yet' }) : null,
      m.source === 'staff' ? h('span', { class: 'chip plain', text: 'From staff record' }) : null];
  }
  async function viewOverview(c) {
    const [health] = await Promise.all([can('mail.view') ? api('GET', '/api/health').catch(() => null) : null]);
    const n = state.counts;
    c.append(h('div', { class: 'metrics four' },
      h('div', { class: 'metric' }, h('small', { text: 'People’s mailboxes' }), h('strong', { text: n.people })),
      h('div', { class: 'metric' }, h('small', { text: 'Shared mailboxes' }), h('strong', { text: n.shared })),
      h('div', { class: 'metric' }, h('small', { text: 'Distribution groups' }), h('strong', { text: n.groups })),
      h('div', { class: 'metric' }, h('small', { text: 'Storage used' }), h('strong', { text: size(n.totalKB) }))));
    const notes = [];
    if (n.provisioningErrors) notes.push(['bad', n.provisioningErrors + ' staff record(s) couldn’t get a mailbox.', 'provisioning']);
    if (n.pendingGroups) notes.push(['warn', n.pendingGroups + ' distribution group(s) have no members yet: their membership hasn’t been imported from Google Workspace.', 'groups']);
    if (n.nearlyFull) notes.push(['warn', n.nearlyFull + ' mailbox(es) are 90% full or more.', 'mailboxes']);
    if (n.disabled) notes.push(['plain', n.disabled + ' mailbox(es) are disabled or suspended (their mail is kept).', 'mailboxes']);
    if (state.problems.length) notes.push(['bad', 'Directory problems: ' + state.problems.join('; '), 'groups']);
    if (state.apply && state.apply.error) notes.push(['bad', 'The last change couldn’t be fully applied to the mail server: ' + state.apply.error, 'logs']);
    if (state.sync && state.sync.error) notes.push(['bad', 'Staff records couldn’t be checked: ' + state.sync.error, 'provisioning']);
    c.append(h('div', { class: 'panel' }, h('h2', { text: 'Needs attention' }), notes.length ? notes.map(([tone, text, view]) => h('div', { class: 'list-item' }, h('p', {}, h('span', { class: 'chip ' + tone, text: tone === 'bad' ? 'Problem' : tone === 'warn' ? 'Check' : 'Note' }), ' ', text), h('button', { class: 'btn btn-small btn-ghost', onclick: () => go(view), text: 'Open' }))) : h('p', { class: 'muted', text: 'Nothing needs attention.' })));
    if (health) {
      const p = health.provider || {};
      c.append(h('div', { class: 'panel' }, h('h2', { text: 'Mail server' }), h('dl', { class: 'kv' },
        ...Object.entries(health.services || {}).map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', {}, h('span', { class: 'chip ' + (v === 'active' ? 'good' : 'bad'), text: v })))),
        h('div', {}, h('dt', { text: 'Ports' }), h('dd', { text: (health.ports || []).every((x) => x.listening) ? 'All listening' : 'Not listening: ' + (health.ports || []).filter((x) => !x.listening).map((x) => x.port).join(', ') })),
        h('div', {}, h('dt', { text: 'Queue' }), h('dd', { text: health.queue ? health.queue.total + ' waiting (' + health.queue.deferred + ' deferred)' : '—' })),
        h('div', {}, h('dt', { text: 'TLS certificate' }), h('dd', { text: health.certificate && !health.certificate.error ? (health.certificate.selfSigned ? 'Temporary self-signed · ' : 'Let’s Encrypt · ') + health.certificate.days + ' days left' : 'Unavailable' })),
        p.outbound25 ? h('div', {}, h('dt', { text: 'Outgoing port 25' }), h('dd', {}, h('span', { class: 'chip ' + (p.outbound25.open ? 'good' : 'bad'), text: p.outbound25.open ? 'Open' : 'Blocked by the provider' }))) : null,
        p.ptr ? h('div', {}, h('dt', { text: 'Reverse DNS' }), h('dd', {}, h('span', { class: 'chip ' + (p.ptr.ok ? 'good' : 'bad'), text: p.ptr.value || 'Not set' }))) : null)));
    }
  }

  function mailboxTable(list, kind) {
    const tbody = h('tbody');
    const draw = (q) => {
      tbody.replaceChildren(...list.filter((m) => !q || (m.address + ' ' + m.name + ' ' + (m.aliases || []).join(' ')).toLowerCase().includes(q)).map((m) => h('tr', {},
        h('td', {}, h('div', { class: 'addr', text: m.address }), h('small', { text: m.name }), (m.aliases || []).length ? h('small', { text: 'Also: ' + m.aliases.join(', ') }) : null, h('div', {}, statusChips(m)),
          kind === 'shared' ? h('small', { text: (m.members || []).length ? (m.members.length + ' member(s): ' + m.members.map((x) => x.address + (x.sendAs ? ' (send as)' : '') + (x.access === 'read' ? ' (read only)' : '')).join(', ')) : 'No members yet' }) : null,
          kind !== 'shared' && (m.forwardTo || []).length ? h('small', { text: 'Forwards to ' + m.forwardTo.join(', ') + (m.keepCopy ? ' (keeps a copy)' : '') }) : null),
        h('td', {}, usageCell(m)),
        h('td', {}, h('div', { class: 'row-actions' },
          kind === 'shared' && can('mail.shared') ? h('button', { class: 'btn btn-small btn-ghost', text: 'Members', onclick: () => editMembers(m) }) : null,
          can(kind === 'shared' ? 'mail.shared' : 'mail.mailboxes') ? h('button', { class: 'btn btn-small btn-ghost', text: 'Edit', onclick: () => editMailbox(m) }) : null)))));
      if (!tbody.children.length) tbody.append(h('tr', {}, h('td', { colspan: 3, class: 'empty', text: 'Nothing found.' })));
    };
    const search = h('input', { type: 'search', placeholder: 'Search addresses and names', oninput: (e) => draw(e.target.value.trim().toLowerCase()) });
    draw('');
    return [search, h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Mailbox' }), h('th', { text: 'Storage' }), h('th', {}))), tbody))];
  }
  async function viewMailboxes(c, kind) {
    const { mailboxes } = await api('GET', '/api/mailboxes');
    const list = mailboxes.filter((m) => m.kind === kind);
    const [search, table] = mailboxTable(list, kind);
    c.append(h('div', { class: 'panel' }, h('div', { class: 'toolbar' }, search,
      can(kind === 'shared' ? 'mail.shared' : 'mail.mailboxes') ? h('button', { class: 'btn btn-primary btn-small', text: kind === 'shared' ? 'New shared mailbox' : 'New mailbox', onclick: () => newMailbox(kind) }) : null,
      h('button', { class: 'btn btn-ghost btn-small', text: 'Refresh storage', onclick: async () => { await api('GET', '/api/mailboxes?fresh=1'); render(); } })), table,
      kind === 'person' ? h('p', { class: 'help', text: 'Mailboxes made from staff records follow their record: change the address on the staff portal. Disabling a mailbox stops anyone opening it; its mail is kept and new mail still arrives.' }) : h('p', { class: 'help', text: 'Members are people’s mailboxes. Full access: read, file, delete and reply. Read only: read and mark as read. Send as: may send from the shared address (checked by the mail server).' })));
  }
  async function newMailbox(kind) {
    const address = input({ required: true, placeholder: kind === 'shared' ? 'team@hngroup.org.uk' : 'firstname.lastname@hngroup.org.uk' }), name = input({ required: true }), quota = input({ type: 'number', min: 10, value: state.settings.defaultQuotaMB });
    const r = await ask({ eyebrow: kind === 'shared' ? 'SHARED MAILBOX' : 'MAILBOX', title: kind === 'shared' ? 'New shared mailbox' : 'New mailbox', ok: 'Create',
      body: [field('Address', address, 'Domains: ' + state.domains.join(', ')), field('Name', name), field('Storage limit (MB)', quota, '1024 MB = 1 GB')],
      onSubmit: () => api('POST', '/api/mailboxes', { kind, address: address.value, name: name.value, quotaMB: quota.value }) });
    if (r) { toast('Mailbox created.'); render(); }
  }
  async function editMailbox(m) {
    const name = input({ value: m.name }), address = input({ value: m.address, disabled: m.source === 'staff' && m.recordId ? true : null }), aliases = h('textarea', {}, (m.aliases || []).join('\n'));
    const quota = input({ type: 'number', min: 10, value: m.quotaMB }), disabled = h('input', { type: 'checkbox', checked: m.disabled || null });
    const fwd = h('textarea', {}, (m.forwardTo || []).join('\n')), keep = h('input', { type: 'checkbox', checked: m.keepCopy || null });
    const body = [field('Name', name), field('Address', address, m.source === 'staff' && m.recordId ? 'Follows the staff record (change it on the staff portal).' : null), field('Aliases (one per line)', aliases),
      field('Storage limit (MB)', quota, 'Currently using ' + size(m.usedKB) + '. Lowering the limit never deletes mail; a mailbox over its limit just can’t receive more until it’s under.'),
      h('label', { class: 'check-row' }, disabled, 'Disabled (nobody can open it; mail is kept and still delivered)')];
    if (m.kind === 'person') body.push(field('Forward to (one per line)', fwd), h('label', { class: 'check-row' }, keep, 'Keep a copy in this mailbox'));
    if (m.kind === 'person' && (m.appPasswords || []).length) body.push(h('h3', { text: 'Mail app passwords' }), ...m.appPasswords.map((p) => h('div', { class: 'list-item' }, h('div', {}, h('strong', { text: p.label }), h('small', { text: ' Created ' + when(p.createdAt) })),
      h('button', { type: 'button', class: 'btn btn-small btn-danger', text: 'Revoke', onclick: async (e) => { e.target.disabled = true; try { await api('DELETE', '/api/mailboxes/' + m.id + '/app-passwords/' + p.id); e.target.closest('.list-item').remove(); toast('App password revoked.'); } catch (err) { alert(err.message); } } }))));
    if (m.usedKB === 0 && !(m.source === 'staff' && m.recordId)) body.push(h('button', { type: 'button', class: 'btn btn-small btn-danger', text: 'Remove this empty mailbox', onclick: async () => { if (!confirm('Remove ' + m.address + '? It has no mail.')) return; try { await api('DELETE', '/api/mailboxes/' + m.id); $('#dialog').close(); toast('Mailbox removed.'); render(); } catch (e) { alert(e.message); } } }));
    const r = await ask({ eyebrow: m.kind === 'shared' ? 'SHARED MAILBOX' : 'MAILBOX', title: m.address, body,
      onSubmit: () => api('PATCH', '/api/mailboxes/' + m.id, { name: name.value, ...(address.disabled ? {} : { address: address.value }), aliases: aliases.value.split(/\s+/).filter(Boolean), quotaMB: quota.value, disabled: disabled.checked,
        ...(m.kind === 'person' ? { forwardTo: fwd.value.split(/\s+/).filter(Boolean), keepCopy: keep.checked } : {}) }) });
    if (r) { toast('Saved.'); render(); }
  }
  async function editMembers(m) {
    const { mailboxes } = await api('GET', '/api/mailboxes');
    const people = mailboxes.filter((x) => x.kind === 'person');
    let rows = (m.members || []).map((x) => ({ ...x }));
    const list = h('div');
    const draw = () => list.replaceChildren(...(rows.length ? rows.map((x, i) => {
      const p = people.find((y) => y.id === x.mailbox) || { address: x.address, name: '' };
      const access = h('select', { onchange: (e) => { x.access = e.target.value; } }, h('option', { value: 'full', text: 'Full access', selected: x.access === 'full' || null }), h('option', { value: 'read', text: 'Read only', selected: x.access === 'read' || null }));
      return h('div', { class: 'member-row' }, h('div', {}, h('div', { class: 'addr', text: p.address }), h('small', { class: 'muted', text: p.name })), access,
        h('label', {}, h('input', { type: 'checkbox', checked: x.sendAs || null, onchange: (e) => { x.sendAs = e.target.checked; } }), 'Send as'),
        h('button', { type: 'button', class: 'btn btn-small btn-ghost', text: 'Remove', onclick: () => { rows.splice(i, 1); draw(); } }));
    }) : [h('p', { class: 'empty', text: 'No members yet.' })]));
    const pick = h('select', {}, h('option', { value: '', text: 'Add a person…' }), ...people.filter((p) => !p.disabled).map((p) => h('option', { value: p.id, text: p.name + ' — ' + p.address })));
    pick.addEventListener('change', () => { if (pick.value && !rows.some((x) => x.mailbox === pick.value)) rows.push({ mailbox: pick.value, access: 'full', sendAs: false }); pick.value = ''; draw(); });
    draw();
    const r = await ask({ eyebrow: 'SHARED MAILBOX MEMBERS', title: m.address, body: [list, h('div', { class: 'field full' }, pick), h('p', { class: 'help', text: 'Members open it in HN Mail under their own account (and in mail apps with their own app password). Nobody shares a password.' })],
      onSubmit: () => api('PUT', '/api/mailboxes/' + m.id + '/members', { members: rows.map((x) => ({ mailbox: x.mailbox, access: x.access, sendAs: !!x.sendAs })) }) });
    if (r) { toast('Members saved.'); render(); }
  }

  async function viewGroups(c) {
    const { groups } = await api('GET', '/api/groups');
    c.append(h('div', { class: 'panel' }, h('div', { class: 'toolbar' }, h('span', { class: 'muted', text: groups.length + ' group(s)' }), can('mail.groups') ? h('button', { class: 'btn btn-primary btn-small', text: 'New group', onclick: () => editGroup(null) }) : null),
      ...groups.map((g) => h('div', { class: 'list-item' }, h('div', {}, h('h3', { text: g.name }), h('div', { class: 'addr', text: g.address }),
        g.pendingImport ? h('span', { class: 'chip warn', text: 'Membership not imported from Google Workspace yet: mail to it is refused until it has members' }) : null,
        h('p', { class: 'muted', text: g.members.length ? 'Members: ' + g.members.join(', ') : 'No members.' }),
        g.delivers.length ? h('small', { text: 'Delivers to ' + g.delivers.length + ' mailbox(es)/address(es): ' + g.delivers.join(', ') }) : null),
        can('mail.groups') ? h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-small btn-ghost', text: 'Edit', onclick: () => editGroup(g) }), h('button', { class: 'btn btn-small btn-danger', text: 'Delete', onclick: async () => { if (!confirm('Delete the group ' + g.address + '? Mail to it will be refused.')) return; try { await api('DELETE', '/api/groups/' + g.id); toast('Group deleted.'); render(); } catch (e) { showError(e); } } })) : null))));
  }
  async function editGroup(g) {
    const address = input({ value: g ? g.address : '', required: true }), name = input({ value: g ? g.name : '', required: true }), desc = input({ value: g ? g.description : '' });
    const members = h('textarea', { rows: 8, placeholder: 'One address per line: mailboxes, shared mailboxes, other groups or outside addresses' }, g ? g.members.join('\n') : '');
    const r = await ask({ eyebrow: 'DISTRIBUTION GROUP', title: g ? g.name : 'New group', body: [field('Address', address), field('Name', name), field('Description', desc), field('Members (one per line)', members, 'A group inside a group gets every member of it. Paste a member list exported from Google Workspace to import it.')],
      onSubmit: () => api(g ? 'PATCH' : 'POST', g ? '/api/groups/' + g.id : '/api/groups', { address: address.value, name: name.value, description: desc.value, members: members.value.split(/[\s,;]+/).filter(Boolean) }) });
    if (r) { toast('Group saved.'); render(); }
  }
  async function viewAliases(c) {
    const { aliases } = await api('GET', '/api/aliases');
    c.append(h('div', { class: 'panel' }, h('div', { class: 'toolbar' }, h('span', { class: 'muted', text: aliases.length + ' alias(es) and forwarder(s)' }), can('mail.mailboxes') ? h('button', { class: 'btn btn-primary btn-small', text: 'New alias or forwarder', onclick: () => editAlias(null) }) : null),
      ...aliases.map((a) => h('div', { class: 'list-item' }, h('div', {}, h('div', { class: 'addr', text: a.address }), h('p', { class: 'muted', text: '→ ' + a.targets.join(', ') }), a.note ? h('small', { text: a.note }) : null),
        can('mail.mailboxes') ? h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-small btn-ghost', text: 'Edit', onclick: () => editAlias(a) }), h('button', { class: 'btn btn-small btn-danger', text: 'Delete', onclick: async () => { if (!confirm('Delete ' + a.address + '?')) return; try { await api('DELETE', '/api/aliases/' + a.id); toast('Deleted.'); render(); } catch (e) { showError(e); } } })) : null)),
      h('p', { class: 'help', text: 'An alias delivers to mailboxes, shared mailboxes or groups here; a forwarder sends to outside addresses (rewritten so it still passes the receiver’s SPF checks). Extra addresses of one mailbox are set on the mailbox itself.' })));
  }
  async function editAlias(a) {
    const address = input({ value: a ? a.address : '', required: true }), targets = h('textarea', { rows: 4 }, a ? a.targets.join('\n') : ''), note = input({ value: a ? a.note : '' });
    const r = await ask({ eyebrow: 'ALIAS / FORWARDER', title: a ? a.address : 'New alias or forwarder', body: [field('Address', address), field('Deliver to (one per line)', targets), field('Note', note)],
      onSubmit: () => api(a ? 'PATCH' : 'POST', a ? '/api/aliases/' + a.id : '/api/aliases', { address: address.value, targets: targets.value.split(/[\s,;]+/).filter(Boolean), note: note.value }) });
    if (r) { toast('Saved.'); render(); }
  }
  async function viewProvisioning(c) {
    const v = await api('GET', '/api/provisioning');
    const tone = { ok: 'good', warning: 'warn', error: 'bad', skipped: 'plain' };
    c.append(h('div', { class: 'panel' }, h('div', { class: 'toolbar' }, h('span', { class: 'muted', text: v.sync.at ? 'Last checked ' + when(v.sync.at) + (v.sync.error ? ' — ' + v.sync.error : ' · ' + v.sync.records + ' staff record(s)') : 'Not checked yet' }),
      can('mail.mailboxes') ? h('button', { class: 'btn btn-primary btn-small', text: 'Check now', onclick: async (e) => { e.target.disabled = true; try { await api('POST', '/api/provisioning/run'); toast('Checked.'); render(); } catch (err) { showError(err); } } }) : null),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Staff record' }), h('th', { text: 'Result' }), h('th', {}))), h('tbody', {}, ...v.records.map((r) => h('tr', {},
        h('td', {}, h('strong', { text: r.name || r.recordId }), h('small', { text: r.recordId })), h('td', {}, h('span', { class: 'chip ' + (tone[r.status] || 'plain'), text: r.status }), h('small', { text: r.message || '' }), r.attempts > 1 ? h('small', { text: r.attempts + ' attempts' }) : null),
        h('td', {}, r.status === 'error' && can('mail.mailboxes') ? h('button', { class: 'btn btn-small btn-ghost', text: 'Retry', onclick: async (e) => { e.target.disabled = true; try { const x = await api('POST', '/api/provisioning/' + r.recordId + '/retry'); toast(x.record && x.record.status === 'ok' ? 'Mailbox ready.' : 'Still failing: ' + (x.record ? x.record.message : '')); render(); } catch (err) { showError(err); } } }) : null)))))),
      h('p', { class: 'help', text: 'One mailbox per staff record (never per profile or sign-in account). Its main HN Group address becomes the mailbox; other HN Group addresses become aliases. Contact emails are never used. A mailbox is opened through the HN Group Auth accounts linked to its record.' })));
  }
  async function viewDelivery(c) {
    const [q, f] = await Promise.all([api('GET', '/api/queue'), can('mail.view') ? api('GET', '/api/failures') : { lines: [] }]);
    const items = q.items || [];
    c.append(h('div', { class: 'panel' }, h('div', { class: 'toolbar' }, h('h2', { text: 'Queue (' + items.length + ')' }), can('mail.settings') && items.length ? h('button', { class: 'btn btn-small btn-ghost', text: 'Retry all now', onclick: async () => { await api('POST', '/api/queue/flush'); toast('Retrying.'); render(); } }) : null),
      items.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Message' }), h('th', { text: 'Waiting for' }), h('th', {}))), h('tbody', {}, ...items.map((x) => h('tr', {},
        h('td', {}, h('strong', { text: x.sender || '(bounce)' }), h('small', { text: x.id + ' · ' + x.queue + ' · ' + when(x.arrived) + ' · ' + size((x.size || 0) / 1024) })),
        h('td', {}, ...x.recipients.map((r) => h('div', {}, h('div', { class: 'addr', text: r.address }), r.reason ? h('small', { text: r.reason }) : null))),
        h('td', {}, can('mail.settings') ? h('div', { class: 'row-actions' }, ...[['retry', 'Retry'], [x.queue === 'hold' ? 'release' : 'hold', x.queue === 'hold' ? 'Release' : 'Hold'], ['delete', 'Delete']].map(([a, label]) => h('button', { class: 'btn btn-small ' + (a === 'delete' ? 'btn-danger' : 'btn-ghost'), text: label, onclick: async () => { if (a === 'delete' && !confirm('Delete this queued message? It will not be delivered and the sender is not told.')) return; try { await api('POST', '/api/queue/' + x.id + '/' + a); toast('Done.'); render(); } catch (e) { showError(e); } } }))) : null)))))) : h('p', { class: 'muted', text: 'Nothing is waiting: every message has been delivered.' })));
    if (can('mail.view')) c.append(h('div', { class: 'panel' }, h('h2', { text: 'Recent delivery failures and refusals' }), f.lines.length ? h('div', { class: 'logs', text: f.lines.join('\n') }) : h('p', { class: 'muted', text: 'None recently.' })));
  }
  async function viewLogs(c) {
    const q = h('input', { type: 'search', placeholder: 'Filter (address, queue id, status=…)' });
    const out = h('div', { class: 'logs', text: 'Loading…' });
    const load = async () => { const v = await api('GET', '/api/logs?q=' + encodeURIComponent(q.value)); out.textContent = v.lines.join('\n') || 'No matching lines.'; out.scrollTop = out.scrollHeight; };
    q.addEventListener('change', load);
    c.append(h('div', { class: 'panel' }, h('div', { class: 'toolbar' }, q, h('button', { class: 'btn btn-small btn-ghost', text: 'Search', onclick: load })), out));
    await load();
  }
  async function viewDomains(c) {
    const v = await api('GET', '/api/domains' + (render.fresh ? '?fresh=1' : ''));
    const chip = (x) => h('span', { class: 'chip ' + (x.ok ? 'good' : 'bad'), text: x.ok ? 'OK' : 'Not yet' });
    c.append(h('div', { class: 'panel' }, h('h2', { text: 'Server' }), h('dl', { class: 'kv' },
      h('div', {}, h('dt', { text: v.host.name }), h('dd', {}, chip(v.host), ' ', v.host.a.join(', ') || 'no address')),
      h('div', {}, h('dt', { text: 'Reverse DNS for ' + v.ptr.ip }), h('dd', {}, chip(v.ptr), ' ', v.ptr.value.join(', ') || 'not set (IONOS Cloud Panel → Network → Public IP)')))));
    for (const d of v.domains) c.append(h('div', { class: 'panel' }, h('h2', { text: d.domain }), h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, ...Object.entries(d.checks).map(([k, x]) => h('tr', {},
      h('td', {}, h('strong', { text: k.toUpperCase() })), h('td', {}, chip(x), h('small', { text: x.note })), h('td', {}, h('div', { class: 'dns-value', text: x.value }))))))),
      d.expected.dkim ? h('p', { class: 'help' }, 'This server’s DKIM record: ', h('span', { class: 'dns-value', text: d.expected.dkimName + ' TXT "' + d.expected.dkim + '"' })) : null));
    c.append(h('p', { class: 'help', text: 'Checked ' + when(v.checked) + ' against public DNS. DNS is changed in Cloudflare, not here.' }));
  }
  async function viewSettings(c) {
    const s = state.settings, edit = can('mail.settings');
    const f = { defaultQuotaMB: input({ type: 'number', value: s.defaultQuotaMB, min: 10, disabled: !edit || null }), sendPerHour: input({ type: 'number', value: s.sendPerHour, disabled: !edit || null }), sendBurst: input({ type: 'number', value: s.sendBurst, disabled: !edit || null }),
      spamJunk: input({ type: 'number', value: s.spamJunk, step: 1, disabled: !edit || null }), spamReject: input({ type: 'number', value: s.spamReject, step: 1, disabled: !edit || null }) };
    c.append(h('div', { class: 'panel' }, h('div', { class: 'form-grid' }, field('Default storage limit for new mailboxes (MB)', f.defaultQuotaMB, 'Each mailbox’s own limit is set on the mailbox.'), field('Messages each mailbox may send per hour', f.sendPerHour), field('Burst (messages at once)', f.sendBurst),
      field('Spam score that goes to Junk', f.spamJunk), field('Spam score refused outright (the sender is told)', f.spamReject)),
      edit ? h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', text: 'Save settings', onclick: async (e) => { e.target.disabled = true; try { const r = await api('PATCH', '/api/settings', Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]))); state.settings = r.settings; toast('Settings saved and applied.'); } catch (err) { showError(err); } finally { e.target.disabled = false; } } })) : h('p', { class: 'help', text: 'Only people with “Run the mail service” can change these.' })));
  }
  async function viewAudit(c) {
    const { entries } = await api('GET', '/api/audit');
    c.append(h('div', { class: 'panel' }, entries.length ? entries.map((e) => h('div', { class: 'list-item' }, h('div', {}, h('strong', { text: e.action }), ' ', h('span', { class: 'addr', text: e.target }), h('p', { class: 'muted', text: e.actor.name + (e.actor.username ? ' (' + e.actor.username + ')' : '') + ' · ' + when(e.at) }),
      Object.keys(e.details || {}).length ? h('small', { class: 'dns-value', text: JSON.stringify(e.details).slice(0, 600) }) : null))) : h('p', { class: 'muted', text: 'No changes yet.' })));
  }

  const DRAW = { overview: viewOverview, mailboxes: (c) => viewMailboxes(c, 'person'), shared: (c) => viewMailboxes(c, 'shared'), groups: viewGroups, aliases: viewAliases, provisioning: viewProvisioning, delivery: viewDelivery, logs: viewLogs, domains: viewDomains, settings: viewSettings, audit: viewAudit };
  function go(view) { current = view; history.replaceState(null, '', '#' + view); render(); }
  async function render() {
    const c = $('#content'); showError(null); c.setAttribute('aria-busy', 'true');
    try {
      state = await api('GET', '/api/state');
      $('#account-name').textContent = state.me.displayName || state.me.username;
      const views = VIEWS.filter((v) => v[2]());
      if (!views.some((v) => v[0] === current)) current = 'overview';
      $('#nav').replaceChildren(...views.map((v) => h('button', { 'data-view': v[0], class: v[0] === current ? 'selected' : null, text: v[1], onclick: () => go(v[0]) })));
      const v = views.find((x) => x[0] === current);
      $('#page-eyebrow').textContent = 'HN GROUP / ' + v[3]; $('#page-title').replaceChildren(v[4], h('br'), h('span', { text: v[5] })); $('#page-description').textContent = v[6];
      const box = h('div'); await DRAW[current](box); c.replaceChildren(box);
    } catch (e) { showError(e); }
    finally { c.removeAttribute('aria-busy'); render.fresh = false; }
  }
  async function health() {
    try { const v = await api('GET', '/api/health'); $('#health-text').textContent = v.ok ? 'Mail server running' : 'Mail server needs attention'; $('#health-dot').style.background = v.ok ? '' : 'var(--danger)'; }
    catch { $('#health-text').textContent = 'Mail server status unavailable'; }
  }
  $('#refresh').addEventListener('click', () => { render.fresh = true; render(); });
  current = (location.hash || '#overview').slice(1);
  render().then(health);
})();
