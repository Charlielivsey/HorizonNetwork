'use strict';
// Staff records → mailboxes (the user's request, 6 November 2026: "Automatically provision a mailbox when a new staff
// record is created, using its defined email address … Provision existing eligible staff too, without creating
// duplicate mailboxes"). The staff backend's /api/auth/mail-directory lists each staff record once (never per profile
// or sign-in account), so a record has at most one mailbox here, found by its record id. Its main HN Group address is
// the mailbox address and its other HN Group addresses are aliases; contact emails (outside addresses) are never
// provisioned. A record without a sign-in account still gets its mailbox (it's opened once an account is linked).
// When every sign-in account of a record is disabled, its mailbox is suspended: nobody can open it (HN Mail or mail
// apps) but its mail is kept and new mail still arrives. Nothing is ever deleted. Each record's result (ok, warning,
// error with the reason) is kept and shown on the admin site, where a failed one can be retried.
const fs = require('node:fs');

function createSync({ directory, fetcher = fetch, staffBackend = process.env.STAFF_BACKEND || 'http://127.0.0.1:3250', secretFile = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret', onChange = () => {}, log = console }) {
  let running = null, last = { at: null, ok: null, error: null, records: 0 };
  const secret = () => { try { const s = fs.readFileSync(secretFile, 'utf8').trim(); return /^[a-f0-9]{64}$/.test(s) ? s : ''; } catch { return ''; } };

  async function records() {
    const key = secret();
    if (!key) throw new Error('The staff portal connection isn’t set up on this server (HN Group Auth integration missing).');
    let r;
    try { r = await fetcher(staffBackend + '/api/auth/mail-directory', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000), redirect: 'error' }); }
    catch { throw new Error('The staff portal couldn’t be reached.'); }
    const v = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(v.records)) throw new Error(v.error || 'The staff portal didn’t send the staff list (it may need updating).');
    return v.records;
  }

  function provision(rec, d, actor) {
    const domains = d.domains;
    const hosted = (rec.emails || []).filter((e) => domains.includes(String(e.address).split('@')[1]));
    const p = d.provisioning[rec.id] || {};
    const result = (status, message, mailboxId) => {
      const changed = p.status !== status || p.message !== message;
      d.provisioning[rec.id] = { status, message, mailboxId: mailboxId || null, name: rec.displayName, at: new Date().toISOString(), attempts: status === 'error' ? (p.attempts || 0) + 1 : 0 };
      if (changed && status === 'error') directory.audit(actor, 'provisioning.error', rec.displayName + ' (' + rec.id + ')', { message });
    };
    if (!hosted.length) { result('skipped', 'No HN Group email address on this staff record.'); return; }
    const primary = (hosted.find((e) => e.primary) || hosted[0]).address;
    const aliases = hosted.map((e) => e.address).filter((a) => a !== primary);
    let m = directory.byRecord(rec.id);
    const warnings = [];
    try {
      if (!m) {
        const owner = directory.owner(primary);
        if (owner && owner.type === 'mailbox' && owner.item.kind === 'person' && !owner.item.recordId) {
          // A mailbox made by hand (or migrated) for this address: it becomes this record's, never a second one.
          m = owner.item; m.recordId = rec.id; m.source = 'staff';
          directory.audit(actor, 'provisioning.link', primary, { record: rec.id });
        } else if (owner) {
          throw new Error(primary + ' is already used by ' + (owner.type === 'group' ? 'the group ' + owner.item.name : owner.type === 'alias' ? 'an alias' : owner.type === 'mailbox-alias' ? 'an alias of ' + owner.item.address : 'the ' + (owner.item.kind === 'shared' ? 'shared mailbox ' : 'mailbox of ') + owner.item.name) + '. Change one of them, then retry.');
        } else {
          m = directory.newMailbox({ kind: 'person', address: primary, name: rec.displayName || primary, recordId: rec.id, source: 'staff' });
          d.mailboxes[m.id] = m;
          directory.audit(actor, 'provisioning.create', primary, { record: rec.id, quotaMB: m.quotaMB });
        }
      }
      const okAliases = [];
      for (const a of aliases) { const o = directory.owner(a, m.id); if (o) warnings.push(a + ' is used elsewhere, so it isn’t an alias of this mailbox.'); else okAliases.push(a); }
      const keepAdmin = (m.aliases || []).filter((a) => !hosted.some((e) => e.address === a) && !(m.staffAliases || []).includes(a)); // aliases added on the admin site stay
      directory.updateMailbox(actor, m.id, { address: primary, aliases: [...new Set([...okAliases, ...keepAdmin])], name: rec.displayName || m.name, fromStaff: true });
      m.staffAliases = okAliases;
      const accounts = (rec.accounts || []).map((a) => ({ id: a.id, username: a.username, enabled: !!a.enabled }));
      const suspended = accounts.length > 0 && accounts.every((a) => !a.enabled);
      if (suspended !== !!m.suspended) directory.audit(actor, suspended ? 'mailbox.suspend' : 'mailbox.unsuspend', m.address, { reason: suspended ? 'Every sign-in account of this staff record is disabled' : 'A sign-in account was enabled' });
      m.suspended = suspended; m.accounts = accounts; m.recordGone = false; m.temporary = !!rec.temporary;
      result(warnings.length ? 'warning' : 'ok', warnings.join(' ') || (accounts.length ? 'Up to date.' : 'Up to date. Nobody can open it until a sign-in account is linked to this staff record.'), m.id);
    } catch (e) { result('error', String(e.message || e).slice(0, 400), m && m.id); }
  }

  async function runOnce(actor, onlyRecord) {
    const list = await records();
    const d = directory.data(), seen = new Set();
    for (const rec of list) { if (!rec || !/^[a-f0-9]{8,32}$/i.test(String(rec.id))) continue; seen.add(rec.id); if (!onlyRecord || onlyRecord === rec.id) provision(rec, d, actor); }
    if (!onlyRecord) for (const m of Object.values(d.mailboxes)) if (m.kind === 'person' && m.recordId && !seen.has(m.recordId) && !m.recordGone) {
      // The staff record was deleted: the mailbox and its mail stay (an administrator decides what happens to them).
      m.recordGone = true; directory.audit(actor, 'provisioning.record-gone', m.address, { record: m.recordId });
    }
    directory.save();
    last = { at: new Date().toISOString(), ok: true, error: null, records: list.length };
    // The mail server is brought in line before this returns (so a retry shows its real result).
    await onChange();
    return last;
  }
  async function run(actor = null, onlyRecord = null) {
    if (running) { await running.catch(() => {}); }
    running = runOnce(actor, onlyRecord).catch((e) => { last = { at: new Date().toISOString(), ok: false, error: String(e.message || e) }; log.error('hn-mail-admin sync: ' + last.error); return last; });
    try { return await running; } finally { running = null; }
  }
  return { run, status: () => last };
}
module.exports = { createSync };
