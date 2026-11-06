#!/usr/bin/env node
'use strict';
// Moving HN Group's email from Google Workspace to HN Group's own mail server (the user's request, 6 November 2026).
// Run on the VPS as root, from the repository checkout. Needs a Google Cloud service account with domain-wide
// delegation (set up by a Google Workspace super admin, see mail-server/README.md "Migrating from Google Workspace"):
// its JSON key file stays on the VPS (/root/hn-google-migration.json, chmod 600), never in Git.
//
//   node mail-server/migrate/google.cjs inventory --key /root/hn-google-migration.json --admin you@hngroup.org.uk
//       Reads every Workspace user, alias, group, group member and group setting (archive, collaborative inbox) into
//       /var/lib/hn-mail-admin/migration/inventory.json (root only). Changes nothing anywhere.
//   node mail-server/migrate/google.cjs groups [--apply]
//       Shows (or with --apply, makes) the memberships of the distribution groups and the shared mailboxes from that
//       inventory, through the mail administration site (audited). Shared mailbox members get full access but not
//       send-as (decide that per person on admin.mail.hngroup.org.uk). Nothing is invented: only Google's own members.
//   node mail-server/migrate/google.cjs mail --key … [--only someone@hngroup.org.uk] [--dry-run]
//       Copies each Workspace mailbox into the HN Group mailbox with the same address: folders from Gmail labels
//       (Inbox, Sent, Drafts, Junk, Bin, Archive, and a folder per user label), read/unread, starred, important, drafts,
//       attachments and original dates. Repeatable: messages already copied are skipped (the final sync before the MX
//       change just copies what's new). Google keeps every message; nothing is deleted there.
//   node mail-server/migrate/google.cjs mbox <file.mbox> <mailbox address> [folder]
//       Imports an mbox file (e.g. a Google Vault export of a group's archive) into a mailbox folder.
// Message contents never go to the screen or a log; only counts and errors.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { connect } = require('../../mail-site/lib/imap');

const OUT = process.env.HN_MIGRATION_DIR || '/var/lib/hn-mail-admin/migration';
const MASTER = process.env.HN_MAIL_MASTER_SECRET_FILE || '/etc/hn-mail/hnmail-master.secret';
const ADMIN = process.env.MAIL_ADMIN_BACKEND || 'http://127.0.0.1:5670';
const SSO_SECRET = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const DOMAINS = ['hngroup.org.uk', 'horizon-network.co.uk', 'horizonadvertising.co.uk', 'media.hngroup.org.uk', 'network.hngroup.org.uk'];
const SCOPES = {
  directory: ['https://www.googleapis.com/auth/admin.directory.user.readonly', 'https://www.googleapis.com/auth/admin.directory.group.readonly', 'https://www.googleapis.com/auth/admin.directory.group.member.readonly', 'https://www.googleapis.com/auth/apps.groups.settings'],
  gmail: ['https://www.googleapis.com/auth/gmail.readonly'],
};
const args = process.argv.slice(2), cmd = args[0];
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const die = (m) => { console.error(m); process.exit(1); };
fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });

// ---- Google service account (JWT bearer, RFC 7523) ----
const tokens = new Map();
async function token(keyFile, scopes, subject) {
  const id = scopes.join(' ') + '|' + subject, held = tokens.get(id);
  if (held && held.until > Date.now() + 60000) return held.token;
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: key.client_email, sub: subject, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const jwt = unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Google refused the service account for ' + subject + ': ' + (v.error_description || v.error || r.status) + ' (check domain-wide delegation and its scopes)');
  tokens.set(id, { token: v.access_token, until: Date.now() + (v.expires_in || 3600) * 1000 });
  return v.access_token;
}
async function google(keyFile, scopes, subject, url, { raw = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await token(keyFile, scopes, subject) } });
    if ((r.status === 429 || r.status >= 500) && attempt < 6) { await new Promise((ok) => setTimeout(ok, 1000 * 2 ** attempt)); continue; }
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((v.error && v.error.message) || 'Google answered ' + r.status), { status: r.status });
    return v;
  }
}
async function pages(fetchPage) { const out = []; let pageToken = ''; do { const v = await fetchPage(pageToken); out.push(v); pageToken = v.nextPageToken || ''; } while (pageToken); return out; }

// ---- inventory ----
async function inventory() {
  const key = opt('key'), admin = opt('admin');
  if (!key || !admin) die('Usage: inventory --key <service account JSON> --admin <a Workspace super admin address>');
  const g = (url) => google(key, SCOPES.directory, admin, url);
  const users = (await pages((p) => g('https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=500&projection=basic' + (p ? '&pageToken=' + p : '')))).flatMap((v) => v.users || [])
    .map((u) => ({ email: u.primaryEmail.toLowerCase(), name: u.name && u.name.fullName, aliases: [...(u.aliases || []), ...(u.nonEditableAliases || [])].map((x) => x.toLowerCase()), suspended: !!u.suspended, archived: !!u.archived, isAdmin: !!u.isAdmin, lastLogin: u.lastLoginTime }));
  const groups = [];
  for (const gr of (await pages((p) => g('https://admin.googleapis.com/admin/directory/v1/groups?customer=my_customer&maxResults=200' + (p ? '&pageToken=' + p : '')))).flatMap((v) => v.groups || [])) {
    const members = (await pages((p) => g('https://admin.googleapis.com/admin/directory/v1/groups/' + encodeURIComponent(gr.email) + '/members?maxResults=200' + (p ? '&pageToken=' + p : '')))).flatMap((v) => v.members || [])
      .map((m) => ({ email: String(m.email || '').toLowerCase(), role: m.role, type: m.type, status: m.status }));
    let settings = null;
    try { settings = await g('https://www.googleapis.com/groups/v1/groups/' + encodeURIComponent(gr.email) + '?alt=json'); } catch (e) { settings = { error: e.message }; }
    groups.push({ email: gr.email.toLowerCase(), name: gr.name, aliases: (gr.aliases || []).map((x) => x.toLowerCase()), members,
      settings: settings && !settings.error ? { isArchived: settings.isArchived, enableCollaborativeInbox: settings.enableCollaborativeInbox, whoCanPostMessage: settings.whoCanPostMessage, archiveOnly: settings.archiveOnly } : settings });
  }
  const file = path.join(OUT, 'inventory.json');
  fs.writeFileSync(file, JSON.stringify({ taken: new Date().toISOString(), users, groups }, null, 1), { mode: 0o600 });
  console.log(users.length + ' users, ' + groups.length + ' groups → ' + file);
  for (const gr of groups) console.log('  group ' + gr.email + ': ' + gr.members.length + ' member(s)' + (gr.settings && gr.settings.isArchived ? ', ARCHIVED (its history is in Google Groups: export it with Google Vault, then use the mbox command)' : '') + (gr.settings && gr.settings.enableCollaborativeInbox ? ', collaborative inbox' : ''));
  const aliases = users.flatMap((u) => u.aliases.map((a) => a + ' → ' + u.email));
  if (aliases.length) console.log('User aliases (add them on the staff record or as mailbox aliases):\n  ' + aliases.join('\n  '));
}

// ---- group and shared mailbox memberships ----
async function groups() {
  const inv = JSON.parse(fs.readFileSync(path.join(OUT, 'inventory.json'), 'utf8'));
  const body = { groups: inv.groups.map((g) => ({ address: g.email, members: g.members.filter((m) => m.status !== 'SUSPENDED').map((m) => m.email) })), apply: opt('apply') === true };
  const r = await fetch(ADMIN + '/api/service/import-memberships', { method: 'POST', headers: { Authorization: 'Bearer ' + fs.readFileSync(SSO_SECRET, 'utf8').trim(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) die(v.error || 'The mail administration site refused the import.');
  for (const x of v.results) console.log((body.apply ? 'set   ' : 'would ') + x.kind + ' ' + x.address + ': ' + x.members.join(', ') + (x.unknown.length ? '  (not found here, left out: ' + x.unknown.join(', ') + ')' : ''));
  for (const a of v.notHere) console.log('not on HN Group mail: ' + a + ' (create it on admin.mail.hngroup.org.uk if it should exist)');
  if (!body.apply) console.log('\nNothing changed. Run again with --apply to set these memberships.');
}

// ---- mailboxes ----
const SYSTEM = { INBOX: 'INBOX', SENT: 'Sent', DRAFT: 'Drafts', SPAM: 'Junk', TRASH: 'Trash' };
async function mail() {
  const key = opt('key'); if (!key) die('Usage: mail --key <service account JSON> [--only address] [--dry-run]');
  const inv = JSON.parse(fs.readFileSync(path.join(OUT, 'inventory.json'), 'utf8'));
  const secret = fs.readFileSync(MASTER, 'utf8').trim(), dry = opt('dry-run') === true, only = opt('only');
  const stateFile = path.join(OUT, 'mail-state.json');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const saveState = () => fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state), { mode: 0o600 }) || fs.renameSync(stateFile + '.tmp', stateFile);
  for (const u of inv.users.filter((x) => !only || x.email === String(only).toLowerCase())) {
    if (!DOMAINS.includes(u.email.split('@')[1])) continue;
    const g = (url) => google(key, SCOPES.gmail, u.email, url);
    let c;
    try { c = await connect({ user: u.email + '*hnmail', pass: secret }); }
    catch { console.log(u.email + ': no HN Group mailbox with this address yet, skipped (provision it first).'); continue; }
    const labels = Object.fromEntries(((await g('https://gmail.googleapis.com/gmail/v1/users/me/labels')).labels || []).map((l) => [l.id, l]));
    const done = new Set(state[u.email] || []);
    const ids = (await pages((p) => g('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&includeSpamTrash=true' + (p ? '&pageToken=' + p : '')))).flatMap((v) => v.messages || []).map((m) => m.id).filter((id) => !done.has(id));
    console.log(u.email + ': ' + ids.length + ' new message(s) to copy' + (dry ? ' (dry run)' : ''));
    let copied = 0, failed = 0;
    const folders = new Set();
    for (const id of ids) {
      try {
        const m = await g('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=raw');
        const L = m.labelIds || [];
        const system = ['TRASH', 'SPAM', 'DRAFT', 'INBOX', 'SENT'].find((x) => L.includes(x));
        const userLabel = L.map((x) => labels[x]).find((l) => l && l.type === 'user');
        const folder = system ? SYSTEM[system] : userLabel ? userLabel.name.replace(/[\\*%]/g, '-').replace(/\//g, ' - ').slice(0, 100) : 'Archive';
        const flags = [...(L.includes('UNREAD') ? [] : ['\\Seen']), ...(L.includes('STARRED') ? ['\\Flagged'] : []), ...(L.includes('IMPORTANT') ? ['$Important'] : []), ...(L.includes('DRAFT') ? ['\\Draft'] : [])];
        if (!dry) {
          if (!folders.has(folder)) { await c.create(folder); folders.add(folder); }
          await c.append(folder, Buffer.from(m.raw, 'base64url'), flags, Number(m.internalDate) || Date.now());
          done.add(id); copied++;
          if (copied % 200 === 0) { state[u.email] = [...done]; saveState(); console.log('  ' + copied + ' copied…'); }
        } else copied++;
      } catch (e) {
        failed++;
        if (/OVERQUOTA|quota/i.test(e.message)) { console.log('  ' + u.email + ' is full at its storage limit: raise its limit on admin.mail.hngroup.org.uk and run again. Stopped this mailbox.'); break; }
        if (failed <= 5) console.log('  message ' + id + ' not copied: ' + e.message);
      }
    }
    state[u.email] = [...done]; if (!dry) saveState();
    await c.logout();
    console.log('  ' + copied + ' copied, ' + failed + ' failed.');
  }
}

// ---- mbox (doveadm import keeps each message's original date and works for shared mailboxes too) ----
async function mbox() {
  const [file, address, folder = 'Imported'] = args.slice(1);
  if (!file || !address) die('Usage: mbox <file.mbox> <mailbox address> [folder]');
  const { execFileSync } = require('node:child_process');
  const tmp = fs.mkdtempSync('/var/vmail/.import-');
  try {
    fs.copyFileSync(file, path.join(tmp, 'import.mbox'));
    execFileSync('chown', ['-R', 'vmail:vmail', tmp]); fs.chmodSync(tmp, 0o700);
    execFileSync('doveadm', ['import', '-u', address.toLowerCase(), '-s', 'mbox:' + tmp + ':INBOX=' + path.join(tmp, 'import.mbox'), folder, 'all'], { stdio: 'inherit' });
    console.log('Imported ' + file + ' into ' + address + ' / ' + folder + '/');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

({ inventory, groups, mail, mbox }[cmd] || (() => die('Commands: inventory, groups, mail, mbox. See the top of this file.')))().catch((e) => die(e.message));
