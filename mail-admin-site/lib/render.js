'use strict';
// Turns the mail directory into the files the mail server reads (all plain text, rewritten whole and atomically):
//   /etc/hn-mail/postfix/domains      hosted domains                         (virtual_mailbox_domains)
//   /etc/hn-mail/postfix/mailboxes    every mailbox address                  (virtual_mailbox_maps)
//   /etc/hn-mail/postfix/aliases      aliases, forwarders, groups (flattened) (virtual_alias_maps)
//   /etc/hn-mail/postfix/senders      who may send as each address           (smtpd_sender_login_maps)
//   /etc/hn-mail/postfix/sender-bcc   shared mailboxes' shared Sent copies   (sender_bcc_maps)
//   /etc/hn-mail/dovecot/users        mailbox → storage folder + quota       (Dovecot userdb)
//   /etc/hn-mail/dovecot/master-target  people's mailboxes HN Mail may open  (Dovecot passdb, unusable password)
//   /etc/hn-mail/dovecot/denied       mailboxes nobody may sign in to        (Dovecot deny passdb)
//   /etc/hn-mail/dovecot/app-passwords.json  scrypt hashes of mail app passwords
//   /etc/hn-mail/rspamd/senders.map   the From addresses each mailbox may use
//   /etc/hn-mail/rspamd/ratelimit-user.inc  sending limit per mailbox
// plus the rights each member has on each shared mailbox (applied with doveadm, see lib/apply.js).
const MASTER = 'hnmail';

function render(d) {
  const mailboxes = Object.values(d.mailboxes).sort((a, b) => a.address.localeCompare(b.address));
  const byAddr = new Map(), groupsByAddr = new Map(Object.values(d.groups).map((g) => [g.address, g])), aliasByAddr = new Map(Object.values(d.aliases).map((a) => [a.address, a]));
  for (const m of mailboxes) { byAddr.set(m.address, m); for (const a of m.aliases || []) byAddr.set(a, m); }
  const active = (m) => !m.disabled && !m.suspended;
  const problems = [];

  // Final recipients for an address: mailbox addresses and outside addresses, following groups and aliases.
  function expand(address, trail = new Set()) {
    if (trail.has(address)) { problems.push('Loop through ' + address); return []; }
    const next = new Set([...trail, address]);
    const m = byAddr.get(address); if (m) return [m.address];
    const g = groupsByAddr.get(address); if (g) return g.members.flatMap((a) => expand(a, next));
    const al = aliasByAddr.get(address); if (al) return al.targets.flatMap((a) => expand(a, next));
    if (d.domains.includes(address.split('@')[1])) { problems.push(address + ' no longer exists'); return []; }
    return [address];
  }
  const uniq = (list) => [...new Set(list)];

  const lines = (rows) => rows.map((r) => r.join(' ')).join('\n') + (rows.length ? '\n' : '');
  const domains = lines(d.domains.map((x) => [x, 'OK']));
  const mailboxMap = lines(mailboxes.map((m) => [m.address, 'OK']));

  const aliasRows = [];
  for (const m of mailboxes) {
    for (const a of m.aliases || []) aliasRows.push([a, m.address]);
    if (m.kind === 'person' && (m.forwardTo || []).length) aliasRows.push([m.address, uniq([...(m.keepCopy !== false ? [m.address] : []), ...m.forwardTo]).join(',')]);
  }
  for (const a of Object.values(d.aliases)) { const t = uniq(a.targets.flatMap((x) => expand(x, new Set([a.address])))); if (t.length) aliasRows.push([a.address, t.join(',')]); }
  // A group with nobody in it has no entry, so mail to it is refused (never silently dropped).
  for (const g of Object.values(d.groups)) { const t = uniq(g.members.flatMap((x) => expand(x, new Set([g.address])))); if (t.length) aliasRows.push([g.address, t.join(',')]); }
  aliasRows.sort((a, b) => a[0].localeCompare(b[0]));

  // Sending: each person's mailbox may send as its own address and aliases; members allowed to send as a shared
  // mailbox may use its address and aliases. Logins are the mailbox address (and HN Mail's master form of it).
  const allowed = new Map(); // login -> Set(addresses)
  const owners = new Map(); // address -> Set(logins)
  const grant = (login, addresses) => { for (const a of addresses) { if (!owners.has(a)) owners.set(a, new Set()); owners.get(a).add(login); owners.get(a).add(login + '*' + MASTER); if (!allowed.has(login)) allowed.set(login, new Set()); allowed.get(login).add(a); } };
  for (const m of mailboxes) {
    if (m.kind === 'person' && active(m)) grant(m.address, [m.address, ...(m.aliases || [])]);
    if (m.kind === 'shared' && !m.disabled) for (const x of m.members || []) { const p = d.mailboxes[x.mailbox]; if (p && x.sendAs && active(p)) grant(p.address, [m.address, ...(m.aliases || [])]); }
  }
  // Every hosted address appears in the senders map, so nobody can use one without being allowed to.
  const hosted = new Set([...byAddr.keys(), ...groupsByAddr.keys(), ...aliasByAddr.keys()]);
  const senderRows = [...hosted].sort().map((a) => [a, owners.has(a) ? [...owners.get(a)].sort().join(',') : 'nobody@invalid']);
  const bccRows = [];
  for (const m of mailboxes) if (m.kind === 'shared') { const [l, dom] = m.address.split('@'); for (const a of [m.address, ...(m.aliases || [])]) bccRows.push([a, l + '+hn-sent@' + dom]); }

  const users = mailboxes.map((m) => m.address + ':::::/var/vmail/' + m.id + '::quota_rule=*:storage=' + Math.max(10, Math.round(m.quotaMB)) + 'M').join('\n') + (mailboxes.length ? '\n' : '');
  const masterTarget = mailboxes.filter((m) => m.kind === 'person' && active(m)).map((m) => m.address + ':{CRYPT}*').join('\n') + '\n';
  const denied = mailboxes.filter((m) => m.kind === 'shared' || !active(m)).map((m) => m.address).join('\n') + '\n';
  const appPasswords = JSON.stringify({ version: 1, mailboxes: Object.fromEntries(mailboxes.filter((m) => m.kind === 'person' && active(m) && (m.appPasswords || []).length)
    .map((m) => [m.address, m.appPasswords.map((p) => ({ id: p.id, salt: p.salt, hash: p.hash }))])) });
  const rspamdSenders = [...allowed.entries()].sort().map(([login, set]) => login + ' ' + [...set].sort().join(',')).join('\n') + '\n';
  const ratelimit = 'user = { bucket = { burst = ' + Math.round(d.settings.sendBurst) + '; rate = "' + Math.round(d.settings.sendPerHour) + ' / 1h"; } }\n';
  const actions = 'reject = ' + Number(d.settings.spamReject) + ';\nadd_header = ' + Number(d.settings.spamJunk) + ';\ngreylist = null;\n';

  // Shared mailbox rights: address -> { member address -> rights }.
  const acl = {};
  for (const m of mailboxes) if (m.kind === 'shared') {
    acl[m.address] = {};
    for (const x of m.members || []) {
      const p = d.mailboxes[x.mailbox];
      if (!p || !active(p) || m.disabled) continue;
      acl[m.address][p.address] = x.access === 'read' ? ['lookup', 'read', 'write-seen'] : ['lookup', 'read', 'write', 'write-seen', 'write-deleted', 'insert', 'post', 'expunge', 'create', 'delete'];
    }
  }
  return {
    files: {
      'postfix/domains': domains, 'postfix/mailboxes': mailboxMap, 'postfix/aliases': lines(aliasRows), 'postfix/senders': lines(senderRows), 'postfix/sender-bcc': lines(bccRows),
      'dovecot/users': users, 'dovecot/master-target': masterTarget, 'dovecot/denied': denied, 'dovecot/app-passwords.json': appPasswords,
      'rspamd/senders.map': rspamdSenders, 'rspamd/ratelimit-user.inc': ratelimit, 'rspamd/actions.inc': actions,
    },
    acl, problems: uniq(problems),
    // Who may send as what (used by HN Mail and shown on the admin site).
    sendAs: Object.fromEntries([...allowed.entries()].map(([k, v]) => [k, [...v].sort()])),
  };
}
module.exports = { render, MASTER };
