'use strict';
// The Gmail API calls HN Mail makes for the signed-in person (users/me), with their short-lived access token.
const mime = require('./mime');

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const UPLOAD = 'https://gmail.googleapis.com/upload/gmail/v1/users/me';
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const LABEL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ID = /^[a-f0-9]{8,32}$/i;

// Runs fn over items with at most n at a time (Gmail allows about 250 quota units a second per person).
async function limited(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

function createGmail({ token, fetcher = fetch }) {
  // token(force) -> access token. A 401 from Gmail gets one retry with a freshly refreshed token.
  async function call(user, method, route, { query, body, raw } = {}) {
    let attempt = 0;
    for (;;) {
      const t = await token(user, attempt > 0);
      let response;
      try {
        response = await fetcher(API + route + (query ? '?' + new URLSearchParams(query) : ''), { method, headers: { Authorization: 'Bearer ' + t, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000), redirect: 'error' });
      } catch { throw fail(503, 'Gmail couldn’t be reached. Please try again.'); }
      if (response.status === 401 && attempt++ === 0) continue;
      if (raw) { if (!response.ok) throw fail(response.status === 404 ? 404 : 502, 'Gmail didn’t send that file.'); return response; }
      if (response.status === 204) return {};
      const value = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (value.error && value.error.message) || 'Gmail answered with an error.';
        if (response.status === 403 && /has not been used|disabled/i.test(message)) throw fail(503, 'The Gmail API isn’t switched on for HN Group’s Google Cloud project yet. Ask the system owner (see mail-site/README.md).');
        if (response.status === 403 && /insufficient/i.test(message)) throw fail(409, 'HN Mail doesn’t have permission for your Gmail any more. Connect Gmail again.', 'connect');
        if (response.status === 429) throw fail(429, 'Gmail asked HN Mail to slow down. Please wait a moment and try again.');
        throw fail(response.status === 404 ? 404 : response.status === 400 ? 400 : 502, response.status === 404 ? 'That message no longer exists.' : message);
      }
      return value;
    }
  }

  const SYSTEM = { INBOX: 'Inbox', STARRED: 'Starred', IMPORTANT: 'Important', SENT: 'Sent', DRAFT: 'Drafts', SPAM: 'Spam', TRASH: 'Bin', UNREAD: 'Unread',
    CATEGORY_PERSONAL: 'Primary', CATEGORY_SOCIAL: 'Social', CATEGORY_PROMOTIONS: 'Promotions', CATEGORY_UPDATES: 'Updates', CATEGORY_FORUMS: 'Forums' };
  async function labels(user) {
    const list = (await call(user, 'GET', '/labels')).labels || [];
    const wanted = list.filter((l) => ['INBOX', 'DRAFT', 'SPAM', 'STARRED', 'SENT', 'TRASH', 'IMPORTANT', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'].includes(l.id)).slice(0, 80);
    const detailed = await limited(wanted, 8, (l) => call(user, 'GET', '/labels/' + encodeURIComponent(l.id)).catch(() => l));
    return detailed.map((l) => ({ id: l.id, name: SYSTEM[l.id] || l.name, system: l.type === 'system', unread: l.threadsUnread || 0, total: l.threadsTotal || 0, drafts: l.id === 'DRAFT' ? (l.messagesTotal || 0) : undefined,
      color: l.color ? { text: l.color.textColor, background: l.color.backgroundColor } : null }));
  }
  function summary(thread) {
    const messages = thread.messages || [], last = messages[messages.length - 1] || {}, first = messages[0] || {};
    const people = [];
    for (const m of messages) { const from = mime.header(m.payload, 'From'), name = (/^"?([^"<]+?)"?\s*</.exec(from) || [])[1] || from.replace(/<.*>/, '').trim() || from; if (name && !people.includes(name)) people.push(name); }
    const labelIds = [...new Set(messages.flatMap((m) => m.labelIds || []))];
    return { id: thread.id, subject: mime.header(first.payload, 'Subject') || '(no subject)', snippet: decodeEntities(last.snippet || ''), from: people.slice(-3), fromAddress: mime.header(last.payload, 'From'),
      to: mime.header(last.payload, 'To'), date: Number(last.internalDate) || 0, count: messages.length, unread: labelIds.includes('UNREAD'), starred: labelIds.includes('STARRED'), important: labelIds.includes('IMPORTANT'),
      attachments: messages.some((m) => /multipart\/mixed/i.test(mime.header(m.payload, 'Content-Type'))), labels: labelIds, draft: labelIds.includes('DRAFT') };
  }
  async function threads(user, { label, q, pageToken }) {
    const query = { maxResults: '25' };
    // Archive: conversations that have left the inbox (not sent mail, drafts, spam or the bin).
    if (label === 'ARCHIVE') q = ['-in:inbox -in:sent -in:drafts -in:spam -in:trash', q].filter(Boolean).join(' ');
    else if (label && label !== 'ALL' && LABEL_ID.test(label)) query.labelIds = label;
    if (q) query.q = String(q).slice(0, 500);
    if (pageToken && /^[\w-]{1,200}$/.test(pageToken)) query.pageToken = pageToken;
    if (label === 'TRASH' || label === 'SPAM') query.includeSpamTrash = 'true';
    const list = await call(user, 'GET', '/threads', { query });
    const items = await limited(list.threads || [], 8, (t) => call(user, 'GET', '/threads/' + t.id, { query: new URLSearchParams([['format', 'metadata'], ['metadataHeaders', 'From'], ['metadataHeaders', 'To'], ['metadataHeaders', 'Subject'], ['metadataHeaders', 'Date'], ['metadataHeaders', 'Content-Type']]) }).catch(() => null));
    return { threads: items.filter(Boolean).map(summary), next: list.nextPageToken || null, estimate: list.resultSizeEstimate || 0 };
  }
  // A whole conversation, ready to show: headers, which body to show, attachments.
  async function thread(user, id) {
    if (!ID.test(id)) throw fail(400, 'Unknown conversation.');
    const t = await call(user, 'GET', '/threads/' + id, { query: { format: 'full' } });
    for (const m of t.messages || []) remember(user, m);
    return { id: t.id, labels: [...new Set((t.messages || []).flatMap((m) => m.labelIds || []))], messages: (t.messages || []).map(view) };
  }
  function view(m) {
    const p = mime.parse(m.payload), h = (n) => mime.header(m.payload, n);
    return { id: m.id, threadId: m.threadId, from: h('From'), to: h('To'), cc: h('Cc'), bcc: h('Bcc'), replyTo: h('Reply-To'), subject: h('Subject'), date: Number(m.internalDate) || 0,
      messageId: h('Message-ID') || h('Message-Id'), references: h('References'), snippet: decodeEntities(m.snippet || ''), labels: m.labelIds || [], hasHtml: !!p.html, remoteImages: /<img[^>]+src\s*=\s*["']?https?:/i.test(p.html) || /url\(\s*["']?https?:/i.test(p.html),
      text: p.text.slice(0, 200000), attachments: p.attachments, unread: (m.labelIds || []).includes('UNREAD'), draft: (m.labelIds || []).includes('DRAFT') };
  }
  // Messages just fetched are kept for two minutes, so each email's body page and attachments don't fetch the same
  // message from Gmail again (a long conversation used to fetch every message twice).
  const recent = new Map();
  function remember(user, m) {
    recent.set(user.accountId + ':' + m.id, { at: Date.now(), m });
    if (recent.size > 300) for (const [k, v] of recent) { if (v.at < Date.now() - 120000 || recent.size > 300) recent.delete(k); else break; }
  }
  async function message(user, id, fresh = false) {
    if (!ID.test(id)) throw fail(400, 'Unknown message.');
    const held = recent.get(user.accountId + ':' + id);
    if (!fresh && held && held.at > Date.now() - 120000) return held.m;
    const m = await call(user, 'GET', '/messages/' + id, { query: { format: 'full' } });
    remember(user, m);
    return m;
  }
  // The decoded bytes of one part (an attachment or inline image), found by its stable part id.
  async function part(user, messageId, partId, msg) {
    const m = msg || await message(user, messageId), p = mime.findPart(m.payload, partId);
    if (!p || !p.body) throw fail(404, 'That attachment isn’t in this message.');
    let data = p.body.data;
    if (!data && p.body.attachmentId) data = (await call(user, 'GET', '/messages/' + messageId + '/attachments/' + encodeURIComponent(p.body.attachmentId))).data;
    return { name: p.filename || 'attachment', type: String(p.mimeType || 'application/octet-stream').toLowerCase(), bytes: Buffer.from(String(data || ''), 'base64url') };
  }
  function cleanLabels(list) { return (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && LABEL_ID.test(x)).slice(0, 20); }
  const modify = (user, id, add, remove) => { if (!ID.test(id)) throw fail(400, 'Unknown conversation.'); return call(user, 'POST', '/threads/' + id + '/modify', { body: { addLabelIds: cleanLabels(add), removeLabelIds: cleanLabels(remove) } }); };
  const modifyMessage = (user, id, add, remove) => { if (!ID.test(id)) throw fail(400, 'Unknown message.'); return call(user, 'POST', '/messages/' + id + '/modify', { body: { addLabelIds: cleanLabels(add), removeLabelIds: cleanLabels(remove) } }); };
  const trash = (user, id) => { if (!ID.test(id)) throw fail(400, 'Unknown conversation.'); return call(user, 'POST', '/threads/' + id + '/trash'); };
  const untrash = (user, id) => { if (!ID.test(id)) throw fail(400, 'Unknown conversation.'); return call(user, 'POST', '/threads/' + id + '/untrash'); };
  // The address mail is sent from, with the Gmail display name and signature people set up in Gmail.
  async function sender(user) {
    const list = ((await call(user, 'GET', '/settings/sendAs').catch(() => ({}))).sendAs || []);
    const primary = list.find((s) => s.isDefault) || list.find((s) => s.isPrimary) || {};
    return { email: (primary.sendAsEmail || (user.google && user.google.email) || '').toLowerCase(), name: primary.displayName || user.displayName || '', signature: primary.signature || '' };
  }
  // Sending and drafts go through Gmail's upload address (a multipart/related body: the JSON details, then the email
  // itself), which takes messages up to 35 MB; the plain JSON address only takes small ones.
  async function upload(user, method, route, metadata, raw) {
    const boundary = 'hnmail' + require('node:crypto').randomBytes(12).toString('hex');
    const body = Buffer.concat([Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: message/rfc822\r\n\r\n'), raw, Buffer.from('\r\n--' + boundary + '--')]);
    let attempt = 0;
    for (;;) {
      const t = await token(user, attempt > 0);
      let response;
      try {
        response = await fetcher(UPLOAD + route + '?uploadType=multipart', { method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + boundary, Accept: 'application/json' }, body, signal: AbortSignal.timeout(120000), redirect: 'error' });
      } catch { throw fail(503, 'Gmail couldn’t be reached. Your message wasn’t sent.'); }
      if (response.status === 401 && attempt++ === 0) continue;
      const value = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (value.error && value.error.message) || 'Gmail refused the message.';
        if (response.status === 403 && /insufficient/i.test(message)) throw fail(409, 'HN Mail doesn’t have permission for your Gmail any more. Connect Gmail again.', 'connect');
        if (response.status === 413 || /too large/i.test(message)) throw fail(413, 'That message is too big for Gmail (25 MB of attachments at most).');
        throw fail(response.status === 400 ? 400 : 502, message);
      }
      return value;
    }
  }
  const thread_ = (threadId) => (threadId && ID.test(threadId) ? { threadId } : {});
  async function send(user, raw, threadId) { return upload(user, 'POST', '/messages/send', thread_(threadId), raw); }
  async function saveDraft(user, draftId, raw, threadId) {
    if (draftId) { if (!/^[\w-]{1,64}$/.test(draftId)) throw fail(400, 'Unknown draft.'); return upload(user, 'PUT', '/drafts/' + draftId, { id: draftId, message: thread_(threadId) }, raw); }
    return upload(user, 'POST', '/drafts', { message: thread_(threadId) }, raw);
  }
  async function draftFor(user, messageId) {
    let pageToken;
    for (let i = 0; i < 10; i++) {
      const list = await call(user, 'GET', '/drafts', { query: { maxResults: '500', ...(pageToken ? { pageToken } : {}) } });
      const hit = (list.drafts || []).find((d) => d.message && d.message.id === messageId);
      if (hit) return hit.id;
      if (!(pageToken = list.nextPageToken)) break;
    }
    throw fail(404, 'That draft no longer exists.');
  }
  async function unreadCounts(user, boxes) {
    return limited(boxes, 4, async (b) => {
      const r = await call(user, 'GET', '/threads', { query: { maxResults: '1', q: b.q + ' is:unread' } }).catch(() => ({}));
      return { name: b.name, email: b.email, unread: (r.threads || []).length ? Math.max(1, r.resultSizeEstimate || 1) : 0 };
    });
  }
  async function pulse(user) { const p = await call(user, 'GET', '/profile'); return { historyId: String(p.historyId || ''), total: p.messagesTotal || 0 }; }
  const deleteDraft = (user, id) => { if (!/^[\w-]{1,64}$/.test(id)) throw fail(400, 'Unknown draft.'); return call(user, 'DELETE', '/drafts/' + id); };
  return { labels, threads, thread, message, part, unreadCounts, pulse, modify, modifyMessage, trash, untrash, sender, send, saveDraft, draftFor, deleteDraft, view };
}
function decodeEntities(s) { return String(s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
module.exports = { createGmail };
