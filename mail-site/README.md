# HN Mail (mail.hngroup.org.uk)

The web app for HN Group's own mail server (see `mail-server/README.md`). PM2 `hn-mail`, loopback **5660**, data
`/var/lib/hn-mail` (sign-in sessions only; `grants.json` there holds the old Gmail access keys from before the move and
is deleted once the move is settled).

- Sign in with HN Group Auth (client `mail`; no Google account needed). HN Mail asks the mail directory
  (admin.mail.hngroup.org.uk, `/api/service/access`) which mailboxes the account's staff records may open: their own
  mailbox and the shared mailboxes they're members of. It opens them over IMAP as the person's own mailbox (Dovecot
  master login, `/etc/hn-mail/hnmail-master.secret`), so Dovecot's shared-mailbox rights apply, and sends through
  Postfix (127.0.0.1:10587), which only accepts From addresses that mailbox may send as.
- `lib/imap.js` (IMAP client), `lib/rawmime.js` (reading messages), `lib/mime.js` (building them), `lib/smtp.js`,
  `lib/mailstore.js` (folders, conversations, flags, drafts, sending; Gmail-style ids the front end already used:
  INBOX, SENT, DRAFT, ARCHIVE, SPAM=Junk, TRASH, STARRED, IMPORTANT, ALL).
- Front end unchanged in look: folders, saved searches, Mailbox list (yours + shared, with unread counts and the
  current mailbox's storage), From picker, signatures (the HN Group signature), drafts, attachments, keyboard shortcuts,
  Light/Lavender Dusk. Settings → Mail apps: app passwords for Outlook/Apple Mail/phones (IMAP mx.hngroup.org.uk:993,
  SMTP :465 or :587), shown once, stored only as scrypt hashes, removable.
- Email bodies are their own sandboxed page with a strict CSP (unchanged); attachments always download.

Test: `node --test mail-site/test.cjs` (add `HN_MAIL_LIVE=1` with the real mail server installed).
