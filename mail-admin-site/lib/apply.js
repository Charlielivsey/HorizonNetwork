'use strict';
// Applies the rendered mail directory to the mail server on this VPS (the admin site runs as root under PM2, like the
// other HN Group websites): writes /etc/hn-mail/* atomically with the right owners, reloads only what changed
// (Postfix maps; Dovecot re-reads its files by itself; Rspamd maps reload by themselves, its settings need a reload),
// creates new mailboxes' folders and keeps each shared mailbox's member rights exact (doveadm acl). Also reads mailbox
// usage, the mail queue and logs for the admin site. Nothing here deletes stored mail.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ETC = process.env.HN_MAIL_ETC || '/etc/hn-mail';
const FOLDERS = ['INBOX', 'Sent', 'Drafts', 'Archive', 'Junk', 'Trash'];
const GROUPS = { dovecot: 'dovecot', rspamd: '_rspamd' };

function run(cmd, args, { timeout = 20000, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => resolve({ ok: !error, code: error ? (error.code || 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
    if (input !== undefined) { child.stdin.end(input); }
  });
}
function gid(name) { try { const line = fs.readFileSync('/etc/group', 'utf8').split('\n').find((l) => l.startsWith(name + ':')); return line ? Number(line.split(':')[2]) : null; } catch { return null; } }

function createApplier({ etc = ETC, enabled = process.env.HN_MAIL_APPLY !== '0', log = console } = {}) {
  let running = null, queued = false, last = { at: null, ok: null, problems: [], error: null };

  async function writeFiles(files) {
    const changed = [];
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(etc, rel), dir = path.dirname(target);
      fs.mkdirSync(dir, { recursive: true });
      let old = null; try { old = fs.readFileSync(target, 'utf8'); } catch {}
      if (old === content) continue;
      const top = rel.split('/')[0], group = GROUPS[top] ? gid(GROUPS[top]) : null;
      const tmp = target + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, content, { mode: group !== null ? 0o640 : 0o644 });
      if (group !== null) { try { fs.chownSync(tmp, 0, group); } catch {} }
      fs.renameSync(tmp, target);
      changed.push(rel);
    }
    return changed;
  }
  async function doveadm(args, opts) { return run('doveadm', args, opts); }
  async function ensureFolders(address) {
    const r = await doveadm(['mailbox', 'create', '-u', address, '-s', ...FOLDERS.filter((f) => f !== 'INBOX')]);
    if (!r.ok && !/exists/i.test(r.stderr)) return r;
    return { ok: true };
  }
  async function folders(address) {
    const r = await doveadm(['mailbox', 'list', '-u', address]);
    return r.ok ? r.stdout.split('\n').map((x) => x.trim()).filter(Boolean).filter((f) => !f.startsWith('Shared/')) : [];
  }
  // Makes one shared mailbox's rights exactly what the directory says: on every folder it has.
  async function syncAcl(shared, wanted) {
    const errors = [];
    await ensureFolders(shared);
    for (const folder of await folders(shared)) {
      const current = await doveadm(['-f', 'tab', 'acl', 'get', '-u', shared, folder]);
      const have = new Map();
      if (current.ok) for (const line of current.stdout.split('\n').slice(1)) { const [ident, , rights] = line.split('\t'); if (ident && ident.startsWith('user=')) have.set(ident.slice(5), (rights || '').trim().split(/\s+/).sort().join(' ')); }
      for (const [member, rights] of Object.entries(wanted)) {
        if (have.get(member) === [...rights].sort().join(' ')) continue;
        const r = await doveadm(['acl', 'set', '-u', shared, folder, 'user=' + member, ...rights]);
        if (!r.ok) errors.push(shared + ' ' + folder + ': ' + r.stderr.trim().slice(0, 200));
      }
      for (const member of have.keys()) if (!wanted[member]) {
        const r = await doveadm(['acl', 'delete', '-u', shared, folder, 'user=' + member]);
        if (!r.ok) errors.push(shared + ' ' + folder + ': ' + r.stderr.trim().slice(0, 200));
      }
    }
    await doveadm(['acl', 'recalc', '-u', shared]);
    return errors;
  }

  async function applyOnce(rendered, mailboxes) {
    if (!enabled) { last = { at: new Date().toISOString(), ok: true, skipped: true, problems: rendered.problems, error: null }; return last; }
    const changed = await writeFiles(rendered.files);
    const errors = [];
    if (changed.some((f) => f.startsWith('postfix/'))) { const r = await run('postfix', ['reload']); if (!r.ok) errors.push('Postfix reload: ' + (r.stderr || r.stdout).trim().slice(0, 300)); }
    if (changed.some((f) => f === 'rspamd/ratelimit-user.inc' || f === 'rspamd/actions.inc')) {
      let r = await run('systemctl', ['reload', 'rspamd']);
      if (!r.ok) r = await run('pkill', ['-HUP', '-x', 'rspamd']);
      if (!r.ok) errors.push('Rspamd reload failed');
    }
    // New mailboxes get their folders now (so shared mailboxes' rights can be set before anyone opens them).
    for (const m of mailboxes) if (!m.foldersReady) { const r = await ensureFolders(m.address); if (r.ok) m.foldersReady = true; else errors.push('Folders for ' + m.address + ': ' + (r.stderr || '').trim().slice(0, 200)); }
    for (const [shared, wanted] of Object.entries(rendered.acl)) errors.push(...await syncAcl(shared, wanted));
    last = { at: new Date().toISOString(), ok: !errors.length, changed, problems: rendered.problems, error: errors.length ? errors.slice(0, 20).join('\n') : null };
    if (errors.length) log.error('hn-mail-admin apply: ' + errors.join(' | '));
    return last;
  }
  // One apply at a time; changes made meanwhile are applied straight after.
  async function apply(getRendered, getMailboxes) {
    if (running) { queued = true; return running; }
    running = (async () => {
      try {
        do { queued = false; await applyOnce(getRendered(), getMailboxes()); } while (queued);
      } catch (e) { last = { at: new Date().toISOString(), ok: false, problems: [], error: String(e.message || e).slice(0, 500) }; log.error(e); }
      finally { running = null; }
      return last;
    })();
    return running;
  }

  // Storage used by every mailbox, in KB: { address: { usedKB, limitKB, messages } }.
  async function usage() {
    if (!enabled) return {};
    const r = await doveadm(['-f', 'tab', 'quota', 'get', '-A'], { timeout: 60000 });
    const out = {};
    if (!r.ok) return out;
    const [head, ...rows] = r.stdout.trim().split('\n');
    const cols = (head || '').split('\t').map((c) => c.trim().toLowerCase());
    const at = (row, name) => row[cols.indexOf(name)];
    for (const line of rows) {
      const row = line.split('\t'), user = at(row, 'username'), type = at(row, 'type');
      if (!user) continue;
      out[user] = out[user] || { usedKB: 0, limitKB: null, messages: 0 };
      if (type === 'STORAGE') { out[user].usedKB = Number(at(row, 'value')) || 0; out[user].limitKB = Number(at(row, 'limit')) || null; }
      if (type === 'MESSAGE') out[user].messages = Number(at(row, 'value')) || 0;
    }
    return out;
  }
  async function usageOf(address) {
    if (!enabled) return { usedKB: 0, limitKB: null, messages: 0 };
    const r = await doveadm(['-f', 'tab', 'quota', 'get', '-u', address]);
    if (!r.ok) return null;
    const [head, ...rows] = r.stdout.trim().split('\n'); const cols = head.split('\t').map((c) => c.trim().toLowerCase());
    const o = { usedKB: 0, limitKB: null, messages: 0 };
    for (const line of rows) { const row = line.split('\t'), type = row[cols.indexOf('type')]; if (type === 'STORAGE') { o.usedKB = Number(row[cols.indexOf('value')]) || 0; o.limitKB = Number(row[cols.indexOf('limit')]) || null; } if (type === 'MESSAGE') o.messages = Number(row[cols.indexOf('value')]) || 0; }
    return o;
  }
  // The mail queue (addresses and reasons, never message contents).
  async function queue() {
    const r = await run('postqueue', ['-j'], { timeout: 30000 });
    if (!r.ok) return { error: 'The queue couldn’t be read.', items: [] };
    const items = r.stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).slice(0, 500)
      .map((q) => ({ id: q.queue_id, queue: q.queue_name, arrived: q.arrival_time ? new Date(q.arrival_time * 1000).toISOString() : null, size: q.message_size, sender: q.sender,
        recipients: (q.recipients || []).map((x) => ({ address: x.address, reason: String(x.delay_reason || '').slice(0, 300) })) }));
    return { items };
  }
  async function queueAction(action, queueId) {
    if (!/^[A-Za-z0-9]{6,20}$/.test(queueId || '') && action !== 'flush') throw Object.assign(new Error('Unknown queue id.'), { status: 400 });
    const r = action === 'flush' ? await run('postqueue', ['-f']) : action === 'retry' ? await run('postqueue', ['-i', queueId]) : action === 'hold' ? await run('postsuper', ['-h', queueId]) : action === 'release' ? await run('postsuper', ['-H', queueId]) : action === 'delete' ? await run('postsuper', ['-d', queueId]) : null;
    if (!r) throw Object.assign(new Error('Unknown action.'), { status: 400 });
    if (!r.ok) throw Object.assign(new Error((r.stderr || 'That didn’t work.').trim().slice(0, 300)), { status: 409 });
  }
  // Recent mail log lines (Postfix, Dovecot, Rspamd): delivery results and sign-ins, with no message contents.
  async function logs({ lines = 300, filter = '' } = {}) {
    let r = await run('journalctl', ['-q', '-o', 'short-iso', '--no-pager', '-n', String(Math.min(2000, lines * 4)), '-u', 'postfix@-', '-u', 'postfix', '-u', 'dovecot', '-u', 'rspamd', '-t', 'postfix/smtp', '-t', 'postfix/smtpd', '-t', 'postfix/submission', '-t', 'postfix/qmgr', '-t', 'postfix/lmtp', '-t', 'postfix/cleanup', '-t', 'postfix/bounce', '-t', 'dovecot'], { timeout: 20000 });
    let text = r.ok ? r.stdout : '';
    if (!text) { try { text = fs.readFileSync('/var/log/mail.log', 'utf8').split('\n').slice(-lines * 4).join('\n'); } catch {} }
    let list = text.split('\n').filter(Boolean);
    if (filter) { const f = filter.toLowerCase(); list = list.filter((l) => l.toLowerCase().includes(f)); }
    return list.slice(-lines).map((l) => l.replace(/(password|pass|pw)=\S+/gi, '$1=…').slice(0, 600));
  }
  // Delivery failures: bounced and deferred deliveries from the log.
  async function failures(limit = 100) {
    const all = await logs({ lines: 2000 });
    return all.filter((l) => /status=(bounced|deferred)|reject:|NOQUEUE/.test(l)).slice(-limit).reverse();
  }
  async function health() {
    const r = await run('/usr/local/lib/hn-mail/check', ['--json', '--provider'], { timeout: 40000 });
    try { return JSON.parse(r.stdout); } catch { return { ok: false, error: 'The mail server check couldn’t run.' }; }
  }
  return { apply, usage, usageOf, queue, queueAction, logs, failures, health, status: () => last, ensureFolders, syncAcl, run, enabled };
}
module.exports = { createApplier, FOLDERS };
