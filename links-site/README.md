# HN Group Links

Branded public directory at https://links.hngroup.org.uk. Uses the original approved company logos, locally hosted Plus Jakarta Sans, HN colours and multicolour stripe, responsive cards, light/dark themes and reduced-motion support. Search and category filters work locally; links remain usable without JavaScript. `/` focuses search and Escape clears it.

The directory links to existing public companies, staff services, service status, careers and contact. Advertising and Development are identified as part of Horizon Network and link to its services page. Horizon Media Group currently links via the group’s company directory. The staff portal destination starts its existing Auth sign-in; no credentials or staff data are handled here. Links are maintained in `public/index.html`.

- PM2: `hn-links`, loopback port 3700, automatically starts after reboot.
- Installed application: `/opt/hn-links`; no database or shared runtime files.
- Dedicated nginx host: `hn-links`; certificate: `links.hngroup.org.uk`.
- Requires A `links` → `217.154.34.205` in the hngroup.org.uk DNS zone (direct or Cloudflare).
- Installer checks public DNS when a local negative answer is stale, uses Certbot webroot, enables automatic renewal, and changes only its own hosting configuration. No other website installer is invoked.

```bash
cd /root/HorizonNetwork && git pull && sudo bash links-site/install.sh
```

Optional browser validation: `PLAYWRIGHT_MODULE=/path/to/playwright node links-site/browser-smoke.cjs`. Checks local responsive layouts, original logo loads, themes, search, filters, empty state, keyboard shortcuts and private-path rejection without visiting external destinations.
