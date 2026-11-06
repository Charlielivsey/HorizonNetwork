# HN Group mail server

HN Group's own email (replacing Google Workspace email, the user's request of 6 November 2026) for
**hngroup.org.uk, horizon-network.co.uk, horizonadvertising.co.uk, media.hngroup.org.uk and network.hngroup.org.uk**,
on the existing VPS (217.154.34.205, host name **mx.hngroup.org.uk**).

| Part | What it does |
|---|---|
| Postfix 3.8 | Receives mail on port 25, sends mail out, mail apps on 465/587, HN Mail on 127.0.0.1:10587. Only hosted domains are accepted; never an open relay; outside servers can't use our addresses as senders; signed-in senders may only use addresses they own (`smtpd_sender_login_maps`). |
| Dovecot 2.3 | Mailboxes (Maildir in `/var/vmail/<mailbox id>`), IMAP on 993 (127.0.0.1:143 for HN Mail), LMTP delivery, per-mailbox quotas (1 GB default), shared mailboxes with per-member rights (ACL), Sieve. |
| Rspamd 3.8 | Spam checks (probable spam → Junk, obvious spam refused), DKIM signing per domain (selector `hn2026`), From-header check for signed-in senders, sending limit per mailbox (Redis). |
| postsrsd | Forwarded mail keeps passing SPF (SRS). |
| mail-admin-site | admin.mail.hngroup.org.uk: the mail directory (mailboxes, shared mailboxes, groups, aliases, quotas, permissions), which writes the files in `/etc/hn-mail/` that the servers read. |
| mail-site | HN Mail (mail.hngroup.org.uk), the web app. |

Mailbox ids never change, so renaming an address never moves mail. Nothing in this system deletes stored mail: disabling
a mailbox stops sign-in (mail is kept and still delivered); lowering a quota below what's used only stops new mail
arriving (senders' servers are told `452 mailbox full` and keep retrying for 5 days).

## Installing / updating

```bash
cd /root/HorizonNetwork && git pull && sudo bash install.sh
```
The root installer runs `mail-server/install.sh` when this folder changes (then `mail-admin-site`, then `mail-site`).
On its own: `sudo bash mail-server/install.sh`. It backs up `/etc/postfix`, `/etc/dovecot`, `/etc/rspamd` and
`/etc/hn-mail` to `/var/backups/hn-mail/config-<time>.tar.gz` first, installs Ubuntu's maintained packages, makes the
DKIM keys on the server (private keys never leave it), gets a Let's Encrypt certificate for mx.hngroup.org.uk, opens
25/465/587/993 in ufw, restarts **only** redis-server, rspamd, postsrsd, dovecot and postfix, and ends with checks and
the DNS records to publish. `hn-mail-check` (or `--json --provider`) shows the server's health at any time.

## Provider checks (Fasthosts, the VPS host) — must pass before the MX change

1. **Outgoing port 25.** Fasthosts blocks it on new servers until support unblocks it (ask Fasthosts support for
   217.154.34.205). The installer and `hn-mail-check --provider` test it. Without it no mail can be delivered to other providers.
2. **Reverse DNS (PTR)** for 217.154.34.205 must be `mx.hngroup.org.uk` (set by Fasthosts: their control panel's reverse DNS
   setting or a support request; it can take a few hours to show). Gmail and Microsoft reject or junk mail from addresses without matching reverse DNS.
3. **Any Fasthosts firewall** in front of the server must allow TCP 25, 465, 587 and 993 in.
4. **IP reputation**: check 217.154.34.205 on a blocklist checker (e.g. Spamhaus) before cutover; a listed address
   needs delisting first.

## Outgoing relay (while port 25 is blocked)

`sudo hn-mail-relay set` sends mail leaving HN Group through a relay on port 587 (chosen: Brevo, `smtp-relay.brevo.com`).
It asks for the relay's SMTP login and SMTP key (from Brevo → SMTP & API → SMTP; never the Brevo account password),
checks they work, and only then switches Postfix over. The key is kept only in `/etc/postfix/hn-relay-sasl` (root, 600),
the installer keeps the relay on reinstall, mail between HN Group mailboxes never uses it, and our DKIM signature stays.
Each sending domain must also be authenticated in Brevo (Senders, Domains & Dedicated IPs → Domains: its `brevo-code` TXT
and DKIM records go in Cloudflare). `hn-mail-relay status` / `off` (when Fasthosts unblocks port 25).

## DNS (Cloudflare, DNS only)

Backup of every record before any change: `dns-backup/2026-11-06-before-mail-server.json` (exact, from the Cloudflare
API). Already added (harmless): `mx.hngroup.org.uk` and `admin.mail.hngroup.org.uk` A → 217.154.34.205.

**Before the MX change (safe while Google still receives mail).** DKIM and SPF were published on 6 November 2026;
DMARC waits for cutover (its reports go to dmarc-reports@, which only exists on the new server):
- DKIM per domain: `hn2026._domainkey.<domain>` TXT = the value the installer prints (also in
  `/etc/hn-mail/dkim/public.json`, and on admin.mail.hngroup.org.uk → Domains). Keep `google._domainkey`: Google
  still signs Calendar/Drive mail it sends for the domain.
- SPF: add `ip4:217.154.34.205` to the one existing SPF record of each domain (and create one for
  network.hngroup.org.uk). Fix hngroup.org.uk's broken `include:_://google.com` (it makes the whole policy invalid
  today). Keep `include:_spf.google.com` while Google Workspace (Calendar, Drive, Google sign-in mail) is used. The other
  includes found (horizon-network.co.uk: Fasthosts `_spf.livemail.co.uk`, Microsoft 365; horizonadvertising.co.uk:
  IONOS, Microsoft 365) are kept until someone confirms they no longer send for the domain.
- DMARC (none exists today): `_dmarc.<domain>` TXT `v=DMARC1; p=none; rua=mailto:dmarc-reports@hngroup.org.uk; adkim=r; aspf=r`
  (horizonadvertising.co.uk's `_dmarc` CNAME to IONOS is replaced). Other domains reporting to hngroup.org.uk need
  `<domain>._report._dmarc.hngroup.org.uk` TXT `v=DMARC1`. Move to `p=quarantine` after 2–4 weeks of clean reports.

**At cutover:** replace each domain's Google MX records with `MX 10 mx.hngroup.org.uk` (media.hngroup.org.uk has
`smtp.google.com`; network.hngroup.org.uk has none today). horizonetwork.com isn't one of the five domains and keeps
its records.

## Migrating from Google Workspace

Needs a Google Cloud **service account with domain-wide delegation** (a Workspace super admin: Google Cloud console →
create service account → JSON key; admin.google.com → Security → API controls → Domain-wide delegation → add its client
ID with the scopes `admin.directory.user.readonly`, `admin.directory.group.readonly`,
`admin.directory.group.member.readonly`, `apps.groups.settings`, `gmail.readonly`; enable the Admin SDK, Groups
Settings and Gmail APIs). Put the key on the VPS only: `/root/hn-google-migration.json`, `chmod 600`.

```bash
node mail-server/migrate/google.cjs inventory --key /root/hn-google-migration.json --admin <super admin address>
```
```bash
node mail-server/migrate/google.cjs groups
```
```bash
node mail-server/migrate/google.cjs groups --apply
```
```bash
node mail-server/migrate/google.cjs mail --key /root/hn-google-migration.json
```
- `inventory` reads users, aliases, groups, members and group settings into `/var/lib/hn-mail-admin/migration/` (root
  only) and says which groups keep an archive (collaborative inboxes). Group history lives in Google Groups'
  archive, not in a mailbox: export it with Google Vault (or Takeout) as mbox and import it into the shared mailbox:
  `node mail-server/migrate/google.cjs mbox <file.mbox> billing@hngroup.org.uk "Google archive"`.
- `groups` shows, then `--apply` sets, the real memberships of the distribution groups and shared mailboxes (shared
  members get full access, send-as is decided per person on the admin site). Until then the four distribution groups
  have no members and mail to them is refused (never silently dropped).
- `mail` copies every Workspace mailbox into the HN Group mailbox with the same address (folders, read/starred/important,
  drafts, sent mail, attachments, dates). Run it again any time: only new messages are copied. Mailboxes must exist
  first (they're made from staff records; others can be made on the admin site). Quotas apply: raise a mailbox's limit
  first if its Gmail is bigger than 1 GB.

## Cutover (only after every check above passes)

1. Provider checks pass; DKIM, SPF (with our IP) and DMARC published; admin.mail.hngroup.org.uk → Domains is green except MX.
2. Tests with the system owner (no messages to anyone else): inbound to a test mailbox with
   `swaks --server mx.hngroup.org.uk --to <test address>` from outside; outbound to the owner's own outside address
   checking SPF/DKIM/DMARC pass in the received headers; group and shared mailbox delivery; send-as refusal.
3. `groups --apply`, then the first `mail` copy.
4. Switch MX for all five domains (Cloudflare TTL is automatic, ~5 minutes).
5. Final `mail` copy after an hour (mail Google received during propagation), and again the next day.
6. Keep Google Workspace (accounts, Calendar, Drive, Google sign-in) running. Don't delete Google accounts or cancel
   Workspace as part of this. After a settled period, delete HN Mail's old Gmail access keys (`/var/lib/hn-mail/grants.json`).

**Rollback:** put the Google MX records back exactly from `dns-backup/2026-11-06-before-mail-server.json` (and the
SPF/DMARC values there). Google starts receiving again within minutes; mail that reached the new server meanwhile stays
in its mailboxes (copy it back to Gmail with any IMAP tool if needed). Configuration rollback: restore
`/var/backups/hn-mail/config-<time>.tar.gz` (`tar -xzf … -C /`) and `systemctl restart postfix dovecot rspamd`.

## Backups and restoring

Nightly at 03:17 (`/etc/cron.d/hn-mail-backup`): `/var/backups/hn-mail/mail-<time>.tar.gz` (root only, 7 days) with
every mailbox, `/etc/hn-mail` (including HN Mail's master secret), the DKIM keys and the mail directory.
Copy them off the VPS regularly (they're the only copy if the VPS is lost).

Restoring from a backup (only the mail services and the two mail websites pause; nothing else is touched):
```bash
sudo pm2 stop hn-mail-admin hn-mail && sudo systemctl stop postfix dovecot
```
```bash
sudo tar -xzf /var/backups/hn-mail/mail-<time>.tar.gz -C /
```
```bash
sudo chown -R vmail:vmail /var/vmail && sudo chown -R _rspamd:_rspamd /var/lib/rspamd/dkim
```
```bash
sudo systemctl start dovecot postfix && sudo doveadm quota recalc -A && sudo pm2 start hn-mail-admin hn-mail
```

## Monitoring and limits

- admin.mail.hngroup.org.uk: services, ports, queue, certificate, outgoing port 25, reverse DNS, delivery failures,
  logs, storage per mailbox, domain checks.
- Each mailbox may send 200 messages an hour (burst 60; changeable under Settings); clients are rate limited per
  connection too. 35 MB per message.
- Mailboxes get a message at 90% and 100% full.

## Tests

In a throwaway Ubuntu 24.04 container: `HN_MAIL_TEST=1 bash mail-server/install.sh`, then
`HN_MAIL_LIVE=1 node --test --test-concurrency=1 mail-admin-site/test.cjs mail-site/test.cjs` (one at a time: both rewrite the live mail configuration) (real Postfix/Dovecot/Rspamd). Delivery to
outside providers, SPF/DKIM/DMARC results at Gmail/Outlook and reverse DNS can only be tested on the VPS.
