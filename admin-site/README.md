# HN Group website control

`admin.hngroup.org.uk` · PM2 `hn-admin` · loopback port `4700`.

```sh
cd /root/HorizonNetwork && git pull origin claude/confident-volta-gxjboo && bash admin-site/install.sh
```

Add `A admin → 217.154.34.205` in the `hngroup.org.uk` zone, initially DNS only, if it does not resolve. The installer issues a dedicated Let's Encrypt certificate, enables renewal, and preserves state/audit history. It does not activate maintenance or request website shutdowns; migrating the old topology briefly restarts Auth and the private account backend. Existing local maintenance settings are imported on the first installation.

## Access

Sign-in is local to admin.hngroup.org.uk and validates existing staff passwords, masked six-digit PINs and setup rules directly against the private staff-account service. It never redirects to or depends on auth.hngroup.org.uk. `charlie.livsey@hngroup.org.uk` has access (case-insensitive), and the system owner and owner-level staff accounts (`admin@hngroup.org.uk`, `dogday@hngroup.org.uk`) automatically hold every permission. Super Admin membership alone does not grant access. Charlie has permanent access and cannot be removed or downgraded. Authorised access managers can grant/revoke staff emails and choose separate permissions:

- `maintenance`: per-site and global messages/modes.
- `power`: stop/start managed website processes.
- `audit`: read the panel's audit log.
- `access`: manage panel access and permissions.

A grant matches the email returned by the staff-account service; it does not create a staff account or bypass disabled-account, password or PIN checks. Permissions are checked fresh on every API request, including revocation. Panel sessions, sign-in challenges and remembered-account cookies are scoped to the admin host. Opening its sign-in page requires PIN again; account switching and Forget me are supported. Password/PIN setup finishes before panel access. Backend account revocation, expiry and panel restart invalidate panel access; Auth restart does not. Profile fields are fetched from staff accounts on every protected request. No passwords or PIN hashes are copied to admin.

## Maintenance

The fixed registry is `lib/catalog.js` (mirrored in `catalog.json` for the nginx integration tool). It includes HN Group, Network and both domain aliases, the public staff portal, Status, Links, Wiki, Advertising and the eight additional websites. HN Group Auth is also managed. The control panel and private hn-accounts service are excluded entirely. Discord bots, PM2 modules, nginx and other infrastructure are not website targets.

Modes are `off`, `admins` (system owner and Super Admin members can sign in to bypass) and `all` (no public-site bypass, including Charlie). Maintenance bypass uses the same independent local staff sign-in and enforces the owner/Super Admin role check without granting panel access. A short-lived, single-use handoff then sets a Secure, HttpOnly, host-only bypass cookie on the requesting site; it is bound to that site and hostname. Role checks refresh at most every ten seconds. Panel permission grants never grant maintenance bypass.

nginx `auth_request` enforces state before pages, assets or APIs reach the site. Blocked pages return 503 with the saved escaped message and Retry-After; APIs return a 503 JSON error without public content. Only certificate challenges and the control service's maintenance assets/sign-in handoff are exempt on a controlled host. The Auth virtual host receives its own gate include; admin never receives one. Secret edge headers are generated only in root-managed nginx snippets, and stripped from public requests to admin.

HN Group/Network/staff legacy maintenance controls link to this panel once installed. Their saved old settings remain on disk, but central state becomes authoritative. Wildcard includes in each site's nginx templates retain enforcement after normal deployments. A per-site reconciliation helper preserves its own saved stopped state without affecting other applications.

## Power controls

Global shutdown first persists the offline intent for all managed websites, closes their public connections with nginx 444 (no maintenance page), then calls PM2 `stop` separately for each allowlisted website name. Startup calls PM2 `start` by existing name, checks each loopback `/healthz`, and only opens that site's gate after it is healthy. Maintenance modes/messages are preserved during both actions. The PM2 process list is saved. There is no PM2 `all`, shell command, arbitrary process-name argument or infrastructure control exposed through HTTP.

The public staff portal is a stoppable proxy on port 3200. Its **single account backend** runs privately on port 3250 as protected PM2 process `hn-accounts`, independently of the Auth broker on port 3400. Stopping Auth, or all managed websites, leaves panel login and staff-backed account checks functional. Other applications that require Auth sign-in cannot complete that sign-in while the Auth portal is offline.

The installer stops the previous account writer before launching the private process, waits for port 3250 to close, preserves `/var/lib/hn-auth/accounts-env.json`, checks health, and records `/var/lib/hn-control/accounts-independent`. It never starts two account writers against the same data. Subsequent Auth/staff/bridge deployments recognise the marker and preserve the topology; Auth deployments preserve saved offline intent. The old supervisor remains compatible with the new marker for existing stopped PM2 definitions.

Power operations can act on every website at once or on one website from its card. They run serially, report progress, and log individual failures. Failed stops leave the public gate closed and are shown as partial failures; failed starts remain offline. Retry the relevant global action after fixing a missing process or failed health check. The dialog asks for a single confirmation click; the API still requires the matching action phrase, which the panel sends. No production shutdown is performed by installation or tests.

## Persistence and recovery

`/var/lib/hn-control/state.json` holds access grants and website settings; `audit.jsonl` is this panel's own append-only, fsynced SHA-256 hash-chain log; `edge-secret` authenticates local nginx subrequests. These files are private (directory 700, files 600) and must be backed up together. Audit entries record actors, requested/saved changes, access grants/revocations, bypass authorisations and power outcomes; passwords, PINs, codes and tokens are not recorded. Invalid persisted state or a broken audit chain prevents the controller starting. This detects corruption; a root user can rewrite a hash chain, so independent backups remain useful.

If the controller is down, controlled public requests fail closed; the independent staff account backend remains available. Restore it from the VPS using `pm2 restart hn-admin`, then inspect `pm2 logs hn-admin`. Reinstalling preserves controls and the audit log. Existing nginx backups are retained under `/var/lib/hn-control/nginx-backup-*`. The installer only edits known website hosts and never the catch-all or unrelated virtual hosts. After a controller restart during a power operation, inspect actual process statuses and audit outcomes, then retry startup/shutdown as appropriate; the persisted offline gate remains closed until a successful startup.

## Verification

```sh
node --test admin-site/test.cjs admin-site/accounts.test.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node admin-site/browser-smoke.cjs
```

Tests use temporary stores, a real isolated nginx instance and fake PM2 processes. They cover permission/Origin checks, permanent owner access, grants/revocation, audit integrity/persistence, both maintenance modes, private APIs, bypass handoff replay protection, shutdown's empty connection close, startup health/failure handling and exemption of admin/private accounts/bots. The account test uses temporary real staff/Auth services and proves fresh password/PIN sign-in, account setup, remembered PIN resume and revocation checks work after Auth and the public staff proxy stop. Browser checks cover 320–1440px, light/dark, reduced motion and the user flows. Production websites are never shut down by the tests.
