# HN Group Mail Admin (admin.mail.hngroup.org.uk)

Administration for HN Group's own mail server (see `mail-server/README.md`). PM2 `hn-mail-admin`, loopback **5670**,
data `/var/lib/hn-mail-admin` (`directory.json` = the mail directory, `audit.log` = append-only, hash-chained audit,
`sessions/`). Website control id `mailadmin` (not `mail-admin`, so HN Mail's `mail-*.conf` gate include never matches it).

- **Sign-in:** HN Group Auth client `mail-admin`. Allowed: the system owner and owner-level accounts (everything), and
  accounts with staff portal permissions `mail.view`, `mail.mailboxes`, `mail.groups`, `mail.shared`, `mail.settings`
  (only what they're given; `mail.settings` can only be given by someone who has it). Rechecked every 30 seconds.
- **Mailboxes:** one per staff record (never per profile or sign-in account), made automatically from the record's HN
  Group addresses (main address = mailbox, others = aliases) every minute and when the staff portal saves a record.
  Records without a sign-in account still get one. Conflicts and failures are shown under Staff provisioning with
  Retry. When all of a record's sign-in accounts are disabled the mailbox is suspended (no access; mail kept and still
  delivered). Removed records keep their mailbox. 1 GB default quota, changeable per mailbox; lowering it never deletes mail.
- **Shared mailboxes:** real mailboxes nobody signs in to; members (people's mailboxes) get full or read-only access
  and optionally send-as. Enforced by Dovecot ACLs and Postfix/Rspamd sender checks. Sent mail from any app is filed
  in the shared Sent folder.
- **Distribution groups:** members are addresses (mailboxes, shared mailboxes, other groups, outside addresses);
  nested groups are flattened, loops refused; an empty group refuses mail.
- **Aliases / forwarders**, **queue** (retry/hold/release/delete), **delivery failures**, **logs** (no message
  contents), **domains** (MX/SPF/DKIM/DMARC/PTR checks), **settings** (default quota, sending limit, spam scores),
  **audit log**.
- **Service API for HN Mail** (loopback + service secret): `/api/service/access` (mailboxes an account's staff records
  may open), `/api/service/usage`, `/api/service/app-passwords`, `/api/service/import-memberships` (migration).

Install: `sudo bash mail-admin-site/install.sh` (run by the root installer). Test: `node --test mail-admin-site/test.cjs`
(add `HN_MAIL_LIVE=1` with the real mail server installed).
