# evan.hngroup.org.uk

A single private page (the user's request, 4 November 2026). Only the HN Group Auth sign-in accounts
catnap@hngroup.org.uk and charlie.livsey@hngroup.org.uk can open it, through Auth's `evan` client; the site checks the
sign-in account again on every visit and refuses impersonated sessions. Everyone else gets "This page is private." with
nothing else shown. Search engines are told to stay out (`X-Robots-Tag`, robots.txt).

- PM2 `hn-evan`, loopback port 5650, sign-in sessions in `/var/lib/hn-evan` (hashed), files in `/opt/hn-evan`.
- Deliberately not on website control, Links, Status, HN Account or HN Browser (so its address isn't listed anywhere).
  Only the root `install.sh` runs `evan-site/install.sh`, and HN Group Auth knows its client.
- DNS: A `evan` → 217.154.34.205 (DNS only).
- Theme: unchanged `site.css`, approved wordmarks, Plus Jakarta Sans, the shared motion kit, plus `evan.css`.

Test: `node --test evan-site/test.cjs`.
