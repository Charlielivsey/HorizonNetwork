# HN Group Investors — investors.hngroup.org.uk

Investor relations for HN Group. PM2 `hn-investors`, loopback port 5200, data in `/var/lib/hn-investors` (kept across updates).

## Who signs in

- **Investors** have their own accounts (not staff accounts). Staff add an investor and get a single-use invitation link (valid 7 days) to send them; the investor opens it, chooses a password (scrypt, at least 10 characters) and is signed in. No emails are sent. Sign-ins last 30 days from the last visit; five wrong passwords lock that address for 15 minutes. Staff can make a new link (also used as a password reset), disable or delete an account.
- **Staff** sign in through HN Group Auth as the registered `investors` application. Only staff with a role at HN Group (main or additional role) are admitted, plus owner-level accounts. Auth checks this and the site checks it again (`companies` in the Auth profile comes from the staff portal's `status-sso.js`).

## What investors see

- **Holdings** come from the [HN Group Company Register](https://companies.hngroup.org.uk). Each investor is linked to the names they're recorded under there (a person, a company, or several). Their holdings are every company where one of those names is a current person with significant control, with its share and nature of control. The site reads the register's public feed (`COMPANIES_FEED_URL`, default `http://127.0.0.1:4900/api/public/companies`) every 20 seconds and keeps a copy in `register.json`, so register changes appear automatically.
- **Value** = the holding's share × the company's latest valuation. The register has no valuations, so staff record them on the site (Companies → Record a valuation, with a date and an optional note investors can see). A holding with no exact share on the register, or a company with no valuation, isn't given a value. The overview shows the total, the change since the previous valuation and a chart of past valuations.
- **Held through your companies**: companies owned by their holdings in turn, with the effective share. Their value is already part of the owning company's, so it isn't added again.
- **Share classes and voting power** come from the register too: each holding's Class A/B/C split, the investor's share of the votes (Class A one vote, Class B half, Class C two, or 51% for the holder of more than 10% of the Class C shares) and whether it gives voting control. The overview has a "Your voting power" section with an explanation of the classes.
- **News**: investor news is written on [HN Group News](https://news.hngroup.org.uk/admin) by ticking **HN Group Investors** (tick only that to keep it private to investors). The site reads it every 20 seconds from News's private feed with the service secret and keeps a copy in `newsroom.json`. News written here before that is kept and can still be edited. Investors see published items with a "New" badge until they open News.

## Staff area (`/staff`)

Dashboard, Investors (add, edit, register names, invitation links, preview what an investor sees, disable/delete), Companies (owners from the register, valuations), News and an activity log.

## Install / update

`cd /root/HorizonNetwork && git pull && sudo bash install.sh` (runs `investors-site/install.sh` when this folder changes; Auth's installer registers the `investors` application). DNS: `investors` A record to 217.154.34.205 (DNS only).

## Tests

`node --test investors-site/test.cjs` — stand-ins for HN Group Auth and the register; covers staff access by HN Group role, valuations, investor invitations, holdings and values, indirect interests, news drafts/publishing, escaping, CSRF/origin checks, lockout and disabling.
