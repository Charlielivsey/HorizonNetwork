# HN Group Sites (sites.hngroup.org.uk)

Every HN Group website in one searchable directory. Until 5 November 2026 this was HN Group Links at
links.hngroup.org.uk; that address now redirects here (the user's request: "improve the links website please, and change
the domain to sites"). Internal names are unchanged: folder `links-site`, PM2 `hn-links`, loopback port 3700,
`/opt/hn-links`, website control id `links`.

- **The list** lives in `sites.json` (group companies / staff / services, access public / staff / restricted, a company
  logo from `public/assets/brand` or a line icon). `server.js` draws every card into the page from it, so the directory
  works without JavaScript and search engines see it. Private pages that aren't meant to be found (the old staff portal,
  evan.hngroup.org.uk) are never listed. Every website in website control's catalogue must be in it (the test checks).
- **Theme:** the unchanged HN Group stylesheet (`public/assets/site.css`, copied from hngroup-site) and the shared
  motion kit (`hn-motion.*`, listed in `brand/web/copies.json`), plus `assets/sites.css`.
- **On the page** (`public/app.js`): search across names, descriptions and keywords (press `/`, Enter opens the first
  match, Esc clears), section filters with counts, pinned sites kept in this browser (localStorage), and live status
  dots and a header summary from `GET /api/status`, which passes on only each listed site's status from the Status
  site (`STATUS_BACKEND`, default http://127.0.0.1:3300, cached a minute).
- **Addresses:** nginx serves sites.hngroup.org.uk and links.hngroup.org.uk (website control gates both). The installer
  gets a certificate for sites.hngroup.org.uk; links.hngroup.org.uk keeps its existing certificate and redirects to
  sites only once sites has its certificate, so nothing breaks while DNS is being set up.
- **DNS:** A `sites` → 217.154.34.205 (DNS only). Keep the `links` record so old links keep redirecting.

```bash
cd /root/HorizonNetwork && git pull && sudo bash install.sh
```

Test (local servers only, needs Playwright's Chromium): `node --test links-site/test.cjs`.
