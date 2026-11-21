# Shared HN offline pages

Static branded outage pages for current HN sites, generated from the website-control catalogue plus the
Administration and isolated old Staff host. The old Staff host is not added to any catalogue.
Uses approved local company wordmarks, Plus Jakarta Sans, Midnight Lavender and it@hngroup.org.uk.
Status omits a link back to itself. Auth retains its dedicated sign-in wording and nginx fallback.

`bash offline-site/install.sh` installs generated pages/assets in `/var/www/hn-offline` and the shared
nginx snippet in `/etc/nginx/hn-offline/enabled`. It never starts/stops PM2 or reloads nginx. Current
site nginx templates include the snippet; standalone installers and the suite installer provision it.
Fallbacks return 503 with no-store and Retry-After 60, and bypass the app/control gate for static assets.
Central maintenance rendering has proxy interception disabled so its deliberate response is preserved;
website-control explicit shutdown semantics and retired/default-no-site hosts are unchanged.

Checks: `python3 offline-site/test.py`, `python3 auth-site/offline.test.py`, and
`node --test admin-site/test.cjs`. Outages are tested with isolated nginx, never by stopping live sites.
