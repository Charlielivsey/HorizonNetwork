'use strict';
// HN Mail's mailbox access on HN Group's own mail server (replacing the Gmail API, the user's request, 6 November
// 2026). It keeps the shape the HN Mail front end already uses (Gmail-style folder ids, conversations, add/remove
// changes), implemented over IMAP:
//   INBOX, SENT (Sent), DRAFT (Drafts), ARCHIVE (Archive), SPAM (Junk), TRASH (Trash): folders
//   STARRED (\Flagged), IMPORTANT ($Important), ALL (every folder except Junk and Bin): searches across folders
// Every call is for one mailbox the signed-in person may open (from the mail directory): their own, or a shared
// mailbox they're a member of. HN Mail always signs in to Dovecot as the person's own mailbox (master login), and
// shared mailboxes are reached through Dovecot's shared folders, so Dovecot itself checks the member's rights.
// Message ids are hex: folder code (8) + UIDVALIDITY (8) + UID (8).
const crypto = require('node:crypto');
const { connect } = require('./imap');
const raw = require('./rawmime');
const smtp = require('./smtp');

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const FOLDER = { INBOX: 'INBOX', SENT: 'Sent', DRAFT: 'Drafts', ARCHIVE: 'Archive', SPAM: 'Junk', TRASH: 'Trash' };
const VIRTUAL = { STARRED: ['FLAGGED'], IMPORTANT: ['KEYWORD', '$Important'], ALL: ['ALL'] };
const LABEL_OF = Object.fromEntries(Object.entries(FOLDER).map(([k, v]) => [v, k]));
const ID = /^[a-f0-9]{24}$/;
const PAGE = 25;
const HEADERS = 'BODY.PEEK[HEADER.FIELDS (FROM TO CC BCC REPLY-TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES CONTENT-TYPE)]';
const hex8 = (n) => (Number(n) >>> 0).toString(16).padStart(8, '0');
const code = (folder) => crypto.createHash('sha1').update(folder).digest('hex').slice(0, 8);

function createMailstore({ secret, access, host = '127.0.0.1', imapPort = 143, smtpPort = 10587 }) {
  // secret() -> HN Mail's master password; access(user) -> [{id, kind, address, name, login, folderPrefix, access, sendAs, quotaMB}]
  const recent = new Map(); // parsed messages, two minutes

  async function mailboxOf(user, mb) {
    const list = await access(user);
    if (!list.length) throw fail(403, 'You don’t have a mailbox on HN Group mail yet. Ask a mail administrator (your staff record needs an HN Group email address).', 'no-mailbox');
    const m = mb ? list.find((x) => x.id === mb) : list.find((x) => x.kind === 'person') || list[0];
    if (!m) throw fail(403, 'You can’t open that mailbox.', 'no-access');
    return m;
  }
  async function session(user, mb, fn) {
    const m = await mailboxOf(user, mb);
    const c = await connect({ host, port: imapPort, user: m.login + '*hnmail', pass: secret() });
    const folders = new Map(); // code -> full folder name
    const full = (name) => m.folderPrefix + name;
    const ctx = { c, m, full, folders,
      async allFolders() {
        const list = await c.list(m.folderPrefix + '*');
        const names = list.filter((f) => !f.flags.some((x) => /noselect|nonexistent/i.test(x))).map((f) => f.name).filter((n) => m.folderPrefix ? n.startsWith(m.folderPrefix) : !n.startsWith('Shared/'));
        for (const n of names) folders.set(code(n), n);
        return names;
      } };
    for (const n of Object.values(FOLDER)) folders.set(code(full(n)), full(n));
    try { return await fn(ctx); } finally { c.logout().catch(() => {}); }
  }
  // Live counts for one folder (opening it read-only; STATUS can lag behind mail another process just delivered).
  async function counts(ctx, folder) {
    const sel = await ctx.c.select(folder, true);
    if (!sel) return { messages: 0, unseen: 0 };
    return { messages: sel.exists, unseen: sel.exists ? (await ctx.c.search(['UNSEEN'])).length : 0 };
  }
  const idOf = (folder, uidvalidity, uid) => code(folder) + hex8(uidvalidity) + hex8(uid);
  async function locate(ctx, id) {
    if (!ID.test(id)) throw fail(400, 'Unknown message.');
    let folder = ctx.folders.get(id.slice(0, 8));
    if (!folder) { await ctx.allFolders(); folder = ctx.folders.get(id.slice(0, 8)); }
    if (!folder) throw fail(404, 'That message no longer exists.');
    const sel = await ctx.c.select(folder);
    if (!sel) throw fail(404, 'That folder no longer exists.');
    if (hex8(sel.uidvalidity) !== id.slice(8, 16)) throw fail(404, 'That message has moved. Refresh the list.');
    return { folder, uid: parseInt(id.slice(16), 16), uidvalidity: sel.uidvalidity };
  }
  const labelOfFolder = (ctx, folder) => LABEL_OF[folder.slice(ctx.m.folderPrefix.length)] || 'FOLDER';
  function labelsOf(ctx, folder, flags) {
    const out = [labelOfFolder(ctx, folder)];
    if (!flags.includes('\\Seen')) out.push('UNREAD');
    if (flags.includes('\\Flagged')) out.push('STARRED');
    if (flags.includes('$Important')) out.push('IMPORTANT');
    if (flags.includes('\\Draft') || out[0] === 'DRAFT') out.push('DRAFT');
    return out;
  }
  function headersOf(buf) { const p = raw.parse(Buffer.concat([buf || Buffer.alloc(0), Buffer.from('\r\n')])); return (n) => p.header(n); }
  function summaryFromRows(ctx, folder, uidvalidity, rows, snippetRow) {
    rows.sort((a, b) => a.internaldate - b.internaldate);
    const last = rows[rows.length - 1], first = rows[0];
    const people = [], senders = [];
    for (const r of rows) {
      const from = r.h('From'), name = (/^"?([^"<]+?)"?\s*</.exec(from) || [])[1] || from.replace(/<.*>/, '').trim() || from;
      const email = ((/<([^>]+)>/.exec(from) || [])[1] || from).trim().toLowerCase();
      if (name && !people.includes(name)) { people.push(name); senders.push({ name, email }); }
    }
    const labels = [...new Set(rows.flatMap((r) => labelsOf(ctx, folder, r.flags || [])))];
    return { id: idOf(folder, uidvalidity, last.uid), senders: senders.slice(-3), subject: first.h('Subject') || '(no subject)', snippet: snippetRow ? raw.snippet(snippetRow['BODY[]'] || Buffer.alloc(0), 200) : '', from: people.slice(-3),
      fromAddress: last.h('From'), to: last.h('To'), date: last.internaldate, count: rows.length, unread: labels.includes('UNREAD'), starred: labels.includes('STARRED'), important: labels.includes('IMPORTANT'),
      attachments: rows.some((r) => /multipart\/(mixed|related)/i.test(r.h('Content-Type'))), labels, draft: labels.includes('DRAFT') };
  }

  // ---- folder counts ----
  async function labels(user, mb) {
    return session(user, mb, async (ctx) => {
      const out = [];
      for (const [id, name] of Object.entries(FOLDER)) {
        const s = await counts(ctx, ctx.full(name));
        out.push({ id, name: { INBOX: 'Inbox', SENT: 'Sent', DRAFT: 'Drafts', ARCHIVE: 'Archive', SPAM: 'Junk', TRASH: 'Bin' }[id], system: true, unread: s ? s.unseen : 0, total: s ? s.messages : 0, drafts: id === 'DRAFT' ? (s ? s.messages : 0) : undefined });
      }
      return out;
    });
  }

  // ---- search words (a subset of Gmail's) -> IMAP SEARCH criteria ----
  function criteria(q) {
    const out = [], folders = [];
    const add = (...x) => out.push(...x);
    const lit = (v) => { const s = String(v); return /^[\x20-\x7e]*$/.test(s) ? '"' + s.replace(/(["\\])/g, '\\$1') + '"' : { literal: Buffer.from(s, 'utf8') }; };
    const date = (v) => { const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(v); if (!m) return null; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCDate() + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + '-' + d.getUTCFullYear(); };
    for (const t of String(q || '').match(/-?(?:\w+:)?(?:"[^"]*"|\S+)/g) || []) {
      const neg = t.startsWith('-'), body = neg ? t.slice(1) : t, m = /^(\w+):(.*)$/.exec(body), v = m ? m[2].replace(/^"|"$/g, '') : body.replace(/^"|"$/g, '');
      const crit = [];
      if (m && ['from', 'to', 'cc', 'bcc', 'subject'].includes(m[1].toLowerCase())) crit.push(m[1].toUpperCase(), lit(v));
      else if (m && m[1] === 'is') { const k = { unread: 'UNSEEN', read: 'SEEN', starred: 'FLAGGED', important: 'KEYWORD $Important' }[v.toLowerCase()]; if (k) crit.push(...k.split(' ')); }
      else if (m && m[1] === 'has' && /^attachments?$/i.test(v)) crit.push('OR', 'HEADER', 'Content-Type', '"multipart/mixed"', 'HEADER', 'Content-Type', '"multipart/related"');
      else if (m && (m[1] === 'before' || m[1] === 'after')) { const d = date(v); if (d) crit.push(m[1] === 'before' ? 'BEFORE' : 'SINCE', d); }
      else if (m && m[1] === 'in') { const f = { inbox: 'INBOX', sent: 'Sent', drafts: 'Drafts', archive: 'Archive', spam: 'Junk', junk: 'Junk', trash: 'Trash', bin: 'Trash' }[v.toLowerCase()]; if (f) folders.push(f); }
      else if (v) crit.push('TEXT', lit(v));
      if (!crit.length) continue;
      if (neg) add('NOT', ...(crit.length > 2 ? ['(', ...crit, ')'] : crit)); else add(...crit);
    }
    return { crit: out.length ? out : ['ALL'], folders };
  }

  // ---- conversation lists ----
  async function threads(user, mb, { label, q, pageToken }) {
    const page = Math.max(0, Number(pageToken) || 0);
    return session(user, mb, async (ctx) => {
      const search = criteria(q);
      const single = FOLDER[label] && !q ? ctx.full(FOLDER[label]) : null;
      if (single) {
        // One folder: conversations (RFC 5256 threading), newest first.
        const sel = await ctx.c.select(single, true);
        if (!sel) return { threads: [], next: null, estimate: 0 };
        const all = await ctx.c.threads(['ALL']);
        const slice = all.slice(page * PAGE, (page + 1) * PAGE);
        const uids = slice.flat();
        const rows = await ctx.c.fetch(uids, ['UID', 'FLAGS', 'INTERNALDATE', 'RFC822.SIZE', HEADERS]);
        for (const r of rows) r.h = headersOf(r[Object.keys(r).find((k) => k.startsWith('BODY[HEADER'))]);
        const byUid = new Map(rows.map((r) => [r.uid, r]));
        const lastUids = slice.map((t) => t.filter((u) => byUid.has(u)).sort((a, b) => byUid.get(a).internaldate - byUid.get(b).internaldate).pop()).filter(Boolean);
        const snips = new Map((await ctx.c.fetch(lastUids, ['UID', 'BODY.PEEK[]<0.16384>'])).map((r) => [r.uid, r]));
        const list = slice.map((t) => { const rs = t.map((u) => byUid.get(u)).filter(Boolean); if (!rs.length) return null; const s = summaryFromRows(ctx, single, sel.uidvalidity, rs, snips.get(rs.sort((a, b) => a.internaldate - b.internaldate)[rs.length - 1].uid)); return s; }).filter(Boolean);
        return { threads: list, next: all.length > (page + 1) * PAGE ? String(page + 1) : null, estimate: all.length };
      }
      // Across folders (Starred, Important, All mail, searches): single messages, newest first.
      const names = search.folders.length ? search.folders.map(ctx.full) : label && FOLDER[label] ? [ctx.full(FOLDER[label])] : (await ctx.allFolders()).filter((n) => !/(^|\/)(Junk|Trash)$/.test(n) || label === 'SPAM' || label === 'TRASH');
      const crit = [...(VIRTUAL[label] && label !== 'ALL' ? VIRTUAL[label] : []), ...search.crit];
      const want = (page + 1) * PAGE + 1, hits = [];
      for (const folder of names) {
        const sel = await ctx.c.select(folder, true); if (!sel || !sel.exists) continue;
        const uids = (await ctx.c.sort(crit)).slice(0, want);
        const rows = await ctx.c.fetch(uids, ['UID', 'INTERNALDATE']);
        for (const r of rows) hits.push({ folder, uidvalidity: sel.uidvalidity, uid: r.uid, date: r.internaldate });
      }
      hits.sort((a, b) => b.date - a.date);
      const pageHits = hits.slice(page * PAGE, (page + 1) * PAGE), out = [];
      const byFolder = new Map(); for (const hh of pageHits) { if (!byFolder.has(hh.folder)) byFolder.set(hh.folder, []); byFolder.get(hh.folder).push(hh); }
      for (const [folder, list] of byFolder) {
        await ctx.c.select(folder, true);
        const rows = await ctx.c.fetch(list.map((x) => x.uid), ['UID', 'FLAGS', 'INTERNALDATE', 'RFC822.SIZE', HEADERS, 'BODY.PEEK[]<0.16384>']);
        for (const r of rows) { r.h = headersOf(r[Object.keys(r).find((k) => k.startsWith('BODY[HEADER'))]); out.push(summaryFromRows(ctx, folder, list[0].uidvalidity, [r], r)); }
      }
      out.sort((a, b) => b.date - a.date);
      return { threads: out, next: hits.length > (page + 1) * PAGE ? String(page + 1) : null, estimate: hits.length };
    });
  }

  // ---- one conversation ----
  async function loadMessage(ctx, folder, uidvalidity, uid) {
    const key = ctx.m.id + ':' + folder + ':' + uidvalidity + ':' + uid, held = recent.get(key);
    if (held && held.at > Date.now() - 120000) return held.v;
    const [r] = await ctx.c.fetch([uid], ['UID', 'FLAGS', 'INTERNALDATE', 'BODY.PEEK[]']);
    if (!r) throw fail(404, 'That message no longer exists.');
    const parsed = raw.parse(r['BODY[]'] || Buffer.alloc(0));
    const v = { id: idOf(folder, uidvalidity, uid), folder, uid, uidvalidity, flags: r.flags || [], date: r.internaldate, parsed };
    recent.set(key, { at: Date.now(), v }); recent.set(ctx.m.id + ':' + v.id, { at: Date.now(), v });
    if (recent.size > 400) for (const [k, x] of recent) { if (x.at < Date.now() - 120000 || recent.size > 400) recent.delete(k); else break; }
    return v;
  }
  function view(ctx, msg) {
    const p = msg.parsed, h = (n) => p.header(n), labels = labelsOf(ctx, msg.folder, msg.flags);
    return { id: msg.id, threadId: msg.id, from: h('From'), to: h('To'), cc: h('Cc'), bcc: h('Bcc'), replyTo: h('Reply-To'), subject: h('Subject'), date: msg.date,
      messageId: h('Message-ID'), references: h('References'), snippet: (p.text || '').replace(/\s+/g, ' ').slice(0, 200), labels, hasHtml: !!p.html,
      remoteImages: /<img[^>]+src\s*=\s*["']?https?:/i.test(p.html) || /url\(\s*["']?https?:/i.test(p.html), text: (p.text || '').slice(0, 200000),
      attachments: p.attachments.map((a) => ({ partId: a.partId, filename: a.name, name: a.name, mimeType: a.type, size: a.size })), unread: labels.includes('UNREAD'), draft: labels.includes('DRAFT') };
  }
  async function threadMessages(ctx, id) {
    const at = await locate(ctx, id);
    const all = await ctx.c.threads(['ALL']);
    const uids = all.find((t) => t.includes(at.uid)) || [at.uid];
    const msgs = [];
    for (const uid of uids.slice(-30)) msgs.push(await loadMessage(ctx, at.folder, at.uidvalidity, uid));
    // Replies that were filed elsewhere (your own replies in Sent; archived ones) join the conversation.
    const ids = [...new Set(msgs.flatMap((x) => [x.parsed.header('Message-ID'), ...String(x.parsed.header('References')).split(/\s+/)]).filter((x) => /^<[^<>\s]+>$/.test(x)))].slice(-12);
    if (ids.length) for (const other of [ctx.full('Sent'), ctx.full('INBOX'), ctx.full('Archive')]) {
      if (other === at.folder) continue;
      const sel = await ctx.c.select(other, true); if (!sel || !sel.exists) continue;
      const crit = []; ids.forEach((mid, k) => { const one = ['OR', 'HEADER', 'In-Reply-To', '"' + mid + '"', 'HEADER', 'References', '"' + mid + '"']; crit.push(...(k < ids.length - 1 ? ['OR', '(', ...one, ')'] : ['(', ...one, ')'])); });
      for (const uid of (await ctx.c.search(crit)).slice(-20)) msgs.push(await loadMessage(ctx, other, sel.uidvalidity, uid));
    }
    const seen = new Set();
    return { at, msgs: msgs.filter((x) => { const k = x.parsed.header('Message-ID') || x.id; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.date - b.date) };
  }
  async function thread(user, mb, id) {
    return session(user, mb, async (ctx) => {
      const { msgs } = await threadMessages(ctx, id);
      const views = msgs.map((x) => view(ctx, x));
      return { id, labels: [...new Set(views.flatMap((v) => v.labels))], messages: views };
    });
  }
  async function message(user, mb, id) {
    return session(user, mb, async (ctx) => {
      const held = recent.get(ctx.m.id + ':' + id);
      if (held && held.at > Date.now() - 120000) return held.v;
      const at = await locate(ctx, id);
      return loadMessage(ctx, at.folder, at.uidvalidity, at.uid);
    });
  }
  async function part(user, mb, id, partId) {
    const msg = await message(user, mb, id), p = msg.parsed.part(partId);
    if (!p) throw fail(404, 'That attachment isn’t in this message.');
    return p;
  }

  // ---- changes (Gmail-style add/remove label ids) ----
  async function change(ctx, folder, uids, add = [], remove = []) {
    const flags = { UNREAD: '\\Seen', STARRED: '\\Flagged', IMPORTANT: '$Important' };
    if (ctx.m.access === 'read' && [...add, ...remove].some((x) => x !== 'UNREAD')) throw fail(403, 'You can only read this shared mailbox.');
    await ctx.c.select(folder);
    for (const l of add) if (flags[l]) await ctx.c.store(uids, l === 'UNREAD' ? '-' : '+', [flags[l]]);
    for (const l of remove) if (flags[l]) await ctx.c.store(uids, l === 'UNREAD' ? '+' : '-', [flags[l]]);
    const here = folder.slice(ctx.m.folderPrefix.length);
    let to = null;
    if (remove.includes('INBOX') && here === 'INBOX') to = 'Archive';
    if (add.includes('INBOX') && here !== 'INBOX') to = 'INBOX';
    if (add.includes('SPAM') && here !== 'Junk') to = 'Junk';
    if (remove.includes('SPAM') && here === 'Junk') to = 'INBOX';
    if (add.includes('TRASH') && here !== 'Trash') to = 'Trash';
    if (to) await ctx.c.move(uids, ctx.full(to));
  }
  const cleanLabels = (list) => (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && /^[A-Z_]{2,20}$/.test(x)).slice(0, 10);
  async function modify(user, mb, id, add, remove) {
    return session(user, mb, async (ctx) => {
      const { msgs } = await threadMessages(ctx, id);
      const byFolder = new Map(); for (const x of msgs) { if (!byFolder.has(x.folder)) byFolder.set(x.folder, []); byFolder.get(x.folder).push(x.uid); }
      // Moves (archive, junk) only apply to the conversation's own folder; flags apply everywhere.
      const at = msgs.find((x) => x.id === id) || msgs[msgs.length - 1];
      for (const [folder, uids] of byFolder) await change(ctx, folder, uids, cleanLabels(add).filter((l) => folder === at.folder || ['UNREAD', 'STARRED', 'IMPORTANT'].includes(l)), cleanLabels(remove).filter((l) => folder === at.folder || ['UNREAD', 'STARRED', 'IMPORTANT'].includes(l)));
      forget(ctx);
    });
  }
  async function modifyMessage(user, mb, id, add, remove) {
    return session(user, mb, async (ctx) => { const at = await locate(ctx, id); await change(ctx, at.folder, [at.uid], cleanLabels(add), cleanLabels(remove)); forget(ctx); });
  }
  async function trash(user, mb, id) { return modify(user, mb, id, ['TRASH'], []); }
  async function untrash(user, mb, id) { return modify(user, mb, id, ['INBOX'], []); }
  function forget(ctx) { for (const k of recent.keys()) if (k.startsWith(ctx.m.id + ':')) recent.delete(k); }

  // ---- sending and drafts ----
  async function senders(user, mb) { const m = await mailboxOf(user, mb); return m.sendAs.map((a) => ({ email: a, name: m.kind === 'shared' ? m.name : user.displayName })); }
  // raw: the built message; from: chosen sender (checked here and again by the mail server).
  async function send(user, mb, { raw: message, from, recipients, inReplyTo }) {
    const m = await mailboxOf(user, mb);
    if (!m.sendAs.includes(String(from).toLowerCase())) throw fail(403, 'You can’t send from ' + from + ' in this mailbox.');
    if (!recipients.length) throw fail(400, 'Add at least one recipient.');
    const result = await smtp.send({ host, port: smtpPort, user: m.login + '*hnmail', pass: secret(), from, recipients, raw: message });
    await session(user, mb, async (ctx) => {
      // People's mailboxes keep their own copy in Sent; shared mailboxes get theirs from the mail server (the same
      // copy whichever app sent it), so it isn't added twice.
      if (m.kind === 'person') await ctx.c.append(ctx.full('Sent'), message, ['\\Seen']);
      if (inReplyTo) { const sel = await ctx.c.select(ctx.full('INBOX')); if (sel && sel.exists) { const u = await ctx.c.search(['HEADER', 'Message-ID', '"' + String(inReplyTo).replace(/["\\\r\n]/g, '') + '"']); await ctx.c.store(u, '+', ['\\Answered']); } }
    }).catch(() => {});
    return { id: result.queued };
  }
  async function saveDraft(user, mb, draftId, message) {
    return session(user, mb, async (ctx) => {
      if (ctx.m.access === 'read') throw fail(403, 'You can only read this shared mailbox.');
      const folder = ctx.full('Drafts');
      const saved = await ctx.c.append(folder, message, ['\\Draft', '\\Seen']);
      if (draftId && ID.test(draftId)) { try { const at = await locate(ctx, draftId); await ctx.c.store([at.uid], '+', ['\\Deleted']); await ctx.c.expunge([at.uid]); } catch {} }
      forget(ctx);
      const sel = saved ? saved : null;
      const id = sel ? idOf(folder, sel.uidvalidity, sel.uid) : null;
      return { id, message: { id } };
    });
  }
  async function deleteDraft(user, mb, id) {
    return session(user, mb, async (ctx) => { const at = await locate(ctx, id); if (at.folder !== ctx.full('Drafts')) throw fail(400, 'That isn’t a draft.'); await ctx.c.store([at.uid], '+', ['\\Deleted']); await ctx.c.expunge([at.uid]); forget(ctx); });
  }

  // ---- new mail and storage ----
  async function pulse(user) {
    const list = await access(user), parts = [];
    let total = 0;
    for (const m of list.slice(0, 20)) {
      try { await session(user, m.id, async (ctx) => { const sel = await ctx.c.select(ctx.full('INBOX'), true); if (sel) { const unseen = sel.exists ? (await ctx.c.search(['UNSEEN'])).length : 0; parts.push(m.id + ':' + sel.uidnext + ':' + sel.exists + ':' + unseen); if (m.kind === 'person') total = sel.exists; } }); } catch {}
    }
    return { historyId: crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16), total };
  }
  async function mailboxes(user) {
    const list = await access(user), out = [];
    for (const m of list) {
      let unread = 0, usage = null;
      try { await session(user, m.id, async (ctx) => { unread = (await counts(ctx, ctx.full('INBOX'))).unseen; usage = await ctx.c.quota(ctx.full('INBOX')); }); } catch {}
      out.push({ id: m.id, kind: m.kind, name: m.name, email: m.address, access: m.access, sendAs: m.sendAs, unread, usedKB: usage ? usage.usedKB : m.usedKB ?? null, limitKB: usage ? usage.limitKB : m.quotaMB * 1024 });
    }
    return out;
  }
  return { mailboxOf, labels, threads, thread, message, part, modify, modifyMessage, trash, untrash, senders, send, saveDraft, deleteDraft, pulse, mailboxes, criteria, view };
}
module.exports = { createMailstore, FOLDER };
