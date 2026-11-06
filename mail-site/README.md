# HN Mail (mail.hngroup.org.uk)

HN Group's own front end for Gmail (the user's request, 6 November 2026). People sign in with HN Group Auth (client
`mail`), and only accounts that already have a Google account linked on Auth get in. The first time, Google asks them
once to let HN Mail into their Gmail, and only the Google account linked to their Auth account is accepted. Gmail
stays the mailbox: HN Mail keeps no copies of mail.

- PM2 `hn-mail`, loopback port **5660**, data `/var/lib/hn-mail` (sessions, `grants.json` with each person's Gmail
  refresh token encrypted with AES-256-GCM, and the `key` file; all root only).
- Install/update: part of the root `install.sh`, or on its own `sudo bash mail-site/install.sh`.
- Test: `node --test mail-site/test.cjs` (real server, stand-ins for Auth, Google and Gmail).

## What it does

Inbox, Starred, Important, Sent, Drafts, All mail, Spam, Bin and your Gmail labels (with unread counts); search (Gmail's
own search words work, e.g. `from:jack has:attachment`); conversations with every message; reply, reply all and forward
(original attachments included); compose with formatting, Cc/Bcc, attachments up to 25 MB and your Gmail signature;
drafts saved automatically every few seconds and when you close the composer; archive, delete (to the Bin), restore,
spam / not spam, star, read/unread and labels, on one conversation or several at once, with Undo; downloads; new mail
appears every minute. Keyboard: `c` compose, `/` search, `j`/`k` next/previous, `e` archive, `#` delete, `r`/`a`/`f`
reply/all/forward, `s` star, `u` back to the list, Ctrl/Cmd+Enter to send, Esc to close.

Emails are shown inside sandboxed frames from `/api/messages/<id>/body`, each with its own strict Content Security
Policy: the email's own scripts can't run, it has no access to HN Mail or its cookies, links open in a new tab, and
pictures from the web stay hidden until you choose **Show images** (so tracking pixels don't report back). Inline
pictures are embedded. Attachments always download (never open on HN Mail's address).

Gmail's `gmail.modify` permission can't delete mail permanently: the Bin empties itself after 30 days, as in Gmail.

## Setting up Google (system owner, once)

HN Mail uses HN Group Auth's existing Google OAuth client (`/var/lib/hn-auth/google-oauth.json`). In the Google Cloud
console, in the project that has that client:

1. **APIs & Services → Library → Gmail API → Enable.**
2. **Google Auth Platform → Clients →** the web client Auth uses **→ Authorised redirect URIs → add**
   `https://mail.hngroup.org.uk/google/callback` and save.
3. **Google Auth Platform → Data Access → Add or remove scopes →** add
   `https://www.googleapis.com/auth/gmail.modify` and save.
4. **Google Auth Platform → Audience.** Gmail access is a *restricted* permission:
   - **Internal** (only accounts in HN Group's Google Workspace): works straight away, no Google review. Recommended
     if everyone uses Workspace addresses. Note this also limits Auth's Sign in with Google to Workspace accounts.
   - **External, Testing**: only the test users you list (up to 100) can connect, and Google ends access every 7 days,
     so people have to press Continue with Google again weekly.
   - **External, In production**: needs Google's verification and a security assessment for restricted permissions.

## DNS

`A mail → 217.154.34.205` (DNS only) in the hngroup.org.uk zone. If the zone already has a `mail` record (for example
an old Google Workspace `CNAME mail → ghs.googlehosted.com` shortcut to Gmail), replace it. This doesn't touch email
delivery, which uses the MX records.
