# HN Group service websites

Forty HN Group and Horizon Network websites built on one shared engine (`service-suite/`). Each website is installed **independently**: its own copy of the runtime in `/opt/hn-<id>`, its own `config.json`, persistent data in `/var/lib/hn-<id>` (directory 700, files 600), its own loopback port, PM2 process `hn-<id>`, nginx host `hn-<id>`, Let's Encrypt certificate and installer `<id>-site/install.sh`. Stopping or updating one never affects another.

```sh
cd /root/HorizonNetwork && git pull && sudo bash install-service-sites.sh
```

The coordinated installer checks memory/disk first, applies HN Group Auth (registered callbacks + staff-portal bridge), installs each website (continuing past individual failures), updates central website control (`admin-site/install.sh`) and HN Group Links, then removes any Links card whose website is not yet running with a trusted certificate. It never runs the deferred standalone Advertising installer and never uses PM2 `all`. Rerun it after fixing anything it reports; existing data is preserved. For one website only: `sudo bash <id>-site/install.sh`.

## Websites

| # | Website | Primary URL | Alias (redirects) | PM2 | Port | Staff sign-in |
|---|---|---|---|---|---|---|
| 1 | HN Group Billing | https://billing.hngroup.org.uk | — | hn-billing | 4800 | Any staff · portal sync |
| 2 | HN Group Projects | https://projects.hngroup.org.uk | — | hn-projects | 4810 | Any staff |
| 3 | HN Group Brand | https://brand.hngroup.org.uk | — | hn-brand | 4820 | Owner/Super Admin |
| 4 | HN Group Downloads | https://downloads.hngroup.org.uk | — | hn-downloads | 4830 | Owner/Super Admin |
| 5 | HN Group Feedback | https://feedback.hngroup.org.uk | — | hn-feedback | 4840 | Any staff · portal sync |
| 6 | HN Group Events | https://events.hngroup.org.uk | — | hn-events | 4850 | Any staff · portal sync |
| 7 | HN Group Partners | https://partners.hngroup.org.uk | — | hn-partners | 4860 | Owner/Super Admin |
| 8 | HN Group Services | https://services.hngroup.org.uk | — | hn-services | 4870 | Owner/Super Admin |
| 9 | HN Group Trust Centre | https://trust.hngroup.org.uk | — | hn-trust | 4880 | Owner/Super Admin |
| 10 | HN Group Learn | https://learn.hngroup.org.uk | — | hn-learn | 4890 | Any staff · portal sync |
| 11 | HN Group Assets | https://assets.hngroup.org.uk | — | hn-assets | 4900 | Any staff |
| 12 | HN Group Email | https://email.hngroup.org.uk | — | hn-email | 4910 | Any staff |
| 13 | HN Group Community | https://community.hngroup.org.uk | — | hn-community | 4920 | Owner/Super Admin |
| 14 | HN Group Bookings | https://bookings.hngroup.org.uk | — | hn-bookings | 4930 | Owner/Super Admin |
| 15 | HN Group Forms | https://forms.hngroup.org.uk | — | hn-forms | 4940 | Any staff |
| 16 | HN Group Surveys | https://surveys.hngroup.org.uk | — | hn-surveys | 4950 | Any staff · portal sync |
| 17 | HN Group Suppliers | https://suppliers.hngroup.org.uk | — | hn-suppliers | 4960 | Any staff · portal sync |
| 18 | HN Group Procurement | https://procurement.hngroup.org.uk | — | hn-procurement | 4970 | Any staff · portal sync |
| 19 | HN Group Expenses | https://expenses.hngroup.org.uk | — | hn-expenses | 4980 | Any staff · portal sync |
| 20 | HN Group Licences | https://licenses.hngroup.org.uk | — | hn-licenses | 4990 | Any staff |
| 21 | HN Group Developers | https://developers.hngroup.org.uk | — | hn-developers | 5010 | Owner/Super Admin |
| 22 | HN Group Labs | https://labs.hngroup.org.uk | — | hn-labs | 5020 | Any staff |
| 23 | HN Group Reports | https://reports.hngroup.org.uk | — | hn-reports | 5030 | Any staff · portal sync |
| 24 | HN Group Sign | https://sign.hngroup.org.uk | — | hn-sign | 5040 | Any staff |
| 25 | HN Group Vault | https://vault.hngroup.org.uk | — | hn-vault | 5050 | Any staff · portal sync |
| 26 | HN Group Security | https://security.hngroup.org.uk | — | hn-security | 5060 | Owner/Super Admin |
| 27 | HN Group Competitions | https://competitions.hngroup.org.uk | — | hn-competitions | 5070 | Owner/Super Admin |
| 28 | HN Group Members | https://members.hngroup.org.uk | — | hn-members | 5080 | Owner/Super Admin |
| 29 | Horizon Hosting | https://hosting.horizon-network.co.uk | https://hosting.horizonetwork.com | hn-hosting | 5090 | Owner/Super Admin |
| 30 | Horizon Network Panel | https://panel.horizon-network.co.uk | https://panel.horizonetwork.com | hn-panel | 5100 | Any staff |
| 31 | Horizon Network Status | https://status.horizon-network.co.uk | https://status.horizonetwork.com | hn-netstatus | 5110 | Owner/Super Admin |
| 32 | Horizon Network Domains | https://domains.horizon-network.co.uk | https://domains.horizonetwork.com | hn-domains | 5120 | Owner/Super Admin |
| 33 | Horizon Network Developers | https://developers.horizonetwork.com | https://developers.horizon-network.co.uk | hn-netdevelopers | 5130 | Owner/Super Admin |
| 34 | Horizon Network Showcase | https://showcase.horizonetwork.com | https://showcase.horizon-network.co.uk | hn-showcase | 5140 | Owner/Super Admin |
| 35 | Horizon Advertising Services | https://ads.horizonetwork.com | https://ads.horizon-network.co.uk | hn-ads | 5150 | Owner/Super Admin |
| 36 | Horizon Network Tools | https://tools.horizonetwork.com | https://tools.horizon-network.co.uk | hn-tools | 5160 | Owner/Super Admin |
| 37 | Horizon Network Sandbox | https://sandbox.horizonetwork.com | https://sandbox.horizon-network.co.uk | hn-sandbox | 5170 | Any staff |
| 38 | Horizon Network Order | https://order.horizon-network.co.uk | https://order.horizonetwork.com | hn-order | 5180 | Owner/Super Admin |
| 39 | My Horizon Network | https://my.horizonetwork.com | https://my.horizon-network.co.uk | hn-my | 5190 | Owner/Super Admin |
| 40 | Horizon Network Community | https://community.horizonetwork.com | https://community.horizon-network.co.uk | hn-netcommunity | 5200 | Owner/Super Admin |

Every hostname above (primaries and aliases) has a DNS-only Cloudflare A record to `217.154.34.205`, except `status.horizonetwork.com`, which is an existing proxied Cloudflare Tunnel CNAME left unchanged pending confirmation. Until that is resolved the Network status certificate covers `status.horizon-network.co.uk` only; the installer adds the alias automatically on a later run once it resolves to the VPS.

Horizon Network aliases redirect over HTTPS (301) to the primary hostname. Each certificate covers its primary and (when it resolves) its alias. Renewal uses the certbot timer with webroot challenges at `/var/www/hn-<id>-acme`.

## What the engine provides

- **Records** (`lib/items.js`): catalogues published by managers (draft/published, public/members/staff visibility), intake forms for visitors with a **private 64-character reference** (stored hashed) to check progress and reply, internal records with statuses, enforced transitions, approvals (no self-approval), comments/internal notes, files (10 MB, type-checked, private storage) and CSV export (formula-injection safe).
- **Accounts** (`lib/accounts.js`): customer, member and community accounts per website — never staff identities. scrypt passwords (12–128 characters), sessions in memory, invite links single-use and expiring after 7 days, disabling revokes sessions. No email is sent by any website.
- **Forms & surveys**, **forums** (reporting, hide/lock/pin, staff posts labelled), **bookings** (UK time incl. BST/GMT, no double booking), **document signing** (private links, typed-name confirmation, SHA-256 fingerprint, signing record — explicitly *not* a qualified/advanced electronic signature and no identity verification), **Network status** (real HTTP checks every minute, incidents), **website health** (loopback `/healthz` of every website process, staff only), **tools** (run in the browser only), **brand kit** (the 26 approved original logos).
- **Staff permissions** come from HN Group Auth on every request (re-checked at least every 15 s). “Manage” is owner/Super Admin unless a module is for all staff. Customer/community/member accounts cannot reach staff pages.

## Staff-portal synchronisation

Where the staff portal already holds the data, it remains the **single source of truth**; the new websites read and write those same records, so they are always in sync (no copies to drift):

| Website | Staff-portal records |
| --- | --- |
| expenses | Expense & mileage claims, approvals, payments, receipts |
| billing | Customer invoices (payroll & finance permission) |
| learn | Training records & required courses (course completion creates a training record) |
| reports | Monthly staff report |
| vault | HR documents shared with you (personal vault files stay private on the website) |
| surveys | Staff polls & surveys |
| feedback | Staff ideas box |
| events | Staff calendar |
| procurement / suppliers | Supplier bills (approved purchases can be recorded as bills) |

Requests run **as the signed-in person**: site → Auth `/api/sso/staff` (registered `bridge` clients only, application session bound to that website) → portal `/api/auth/bridge`, which applies its own per-website route allowlist and then the portal's normal API handler, so every existing permission rule (supervisor approvals, `payroll.manage`, `staff.manage`, etc.) applies unchanged. Websites can only use the fixed routes in their config, with validated record ids.

## Awaiting external configuration

Shown on the sites as “Awaiting configuration”; no success is ever displayed without a real provider:

- **Online payments** (billing, order): no provider connected — orders take no payment; invoices are marked paid manually when funds arrive.
- **Domain registrar** (domains): requests only; nothing is registered or transferred automatically.
- **Hosting provisioning** (hosting, panel): status records only; nothing is created, started or stopped.
- **Email delivery**: none of these websites send email; people use private references and invitation links shared by staff.

## Regenerating and testing

Edit `service-suite/sites.cjs`, then `node service-suite/generate.cjs` (rewrites the site folders, Auth client entries, website-control catalog and Links cards between marked blocks).

```sh
node --test service-suite/test.cjs              # all 40 sites + workflows (stand-in Auth)
node --test service-suite/integration.test.cjs  # real staff portal + Auth: synchronised records, allowlists
node --test service-suite/nginx.test.cjs        # real nginx: all hosts valid; HTTP→HTTPS, alias, proxy
PLAYWRIGHT_MODULE=/path/to/playwright node service-suite/browser-smoke.cjs
```

All tests use temporary data and fixture accounts only. No production service is stopped and no global maintenance is activated.
