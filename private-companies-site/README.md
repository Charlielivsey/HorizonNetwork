# HN Group Private Company Register

**private.companies.hngroup.org.uk** — a second, completely separate Company Register (the user's request, 30 October
2026). It runs the same code as the public register (`companies-site/`) in private mode (`COMPANIES_PRIVATE=1`,
`companies-site/lib/private.js`) with its own data, process and port, so it looks and works the same but shares nothing.

| | |
| --- | --- |
| PM2 process | `hn-private-companies` |
| Port | 5610 (loopback) |
| Data | `/var/lib/hn-private-companies` (kept on updates) |
| Code | `/opt/hn-private-companies`, copied from `companies-site/` |
| HN Group Auth client | `private-companies` |

- **Signing in:** every page needs an HN Group Auth sign-in. Any enabled HN Group account can read the register and use
  the customer side (request documents, report mistakes, file changes for companies it manages); its register customer
  account is made and linked the first time it signs in.
- **Staff area:** the system owner, owner-level accounts and Super Admin members are administrators automatically
  (never while logged in as someone else). The register's own passwords, customer sign-up, staff sign-in and the
  default `admin@hngroup.org.uk` account are switched off.
- **Separate:** it starts empty (`COMPANIES_SEED=off`, `COMPANIES_GROUP_UPDATES=off`): nothing from the public register
  is copied in. Its company feed (`/api/public/companies`) answers only over loopback, for the private wiki; through
  nginx it is a 404.
- Sign-ins are saved (hashed) with the register's data, last 30 days from the last visit and are rechecked with Auth
  every minute.

Install or update: `sudo bash private-companies-site/install.sh` (the root `install.sh` runs it when `companies-site/`
or this folder changes). Test: `node --test companies-site/private.test.cjs`.
