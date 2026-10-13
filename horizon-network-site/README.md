# Horizon Network website

The dedicated website for https://horizon-network.co.uk, with www redirected to the root domain. Uses the approved Horizon Network logos, locally hosted Plus Jakarta Sans and HN Group’s responsive light/dark design. Home, About us, Our services, Contact and Privacy are separate pages. Horizon Advertising and Horizon Development are part of Horizon Network. Careers link to HN Group’s shared recruitment page; contact submissions go to existing staff portal enquiries.

The About us page gets leadership live from the staff portal. A person qualifies only when the same company role has company `Horizon Network` and department `Network Leadership`. Main and additional company roles are supported; a department assigned to another company does not qualify. Public responses contain only display name, the Network role’s job title and an optional photo. No emails, telephone numbers, credentials or private personnel details are published. Photo requests recheck eligibility. Empty and unavailable states are explicit; no staff names are hardcoded.

The service uses the existing secret-protected staff bridge. `status-site/install-portal-sso.sh` installs only the necessary bridge files and restarts the portal when they change. No staff data is edited. Leadership changes appear on the next page load.

- PM2: `hn-network`, loopback port 3600.
- Application: `/opt/hn-network`; public files: `/var/www/hn-network`.
- Only its own nginx host `hn-network` and certificate are installed. No default/catch-all or existing domain host is replaced.
- Installer uses Certbot webroot for both horizon-network.co.uk and www.horizon-network.co.uk. Both DNS records must point to this VPS (directly or through Cloudflare). Certificate renewal is enabled. If Cloudflare prevents root-domain ACME validation, the installer can use Cloudflare’s trusted visitor certificate for the root and a separate Let’s Encrypt certificate for the directly routed www redirect. It verifies both public HTTPS addresses. In that mode the root origin uses the bootstrap self-signed certificate; Cloudflare Full (strict) needs a trusted origin certificate. After fixing Cloudflare’s root-domain ACME validation, rerun with `sudo NETWORK_REQUIRE_ORIGIN_CERT=1 bash horizon-network-site/install.sh` to obtain it.

Install/update only this website:

```bash
cd /root/HorizonNetwork && git pull && sudo bash horizon-network-site/install.sh
```

Apply the group’s page restructure, Auth entry fix and this new website together:

```bash
cd /root/HorizonNetwork && git pull && sudo bash install-public-sites.sh
```

Checks: `node --test horizon-network-site/test.cjs` exercises the real staff portal and company/department filtering, minimal public fields and protected photos. Optional `PLAYWRIGHT_MODULE=/path/to/playwright node horizon-network-site/browser-smoke.cjs` checks both public sites and forms with fixture responses, without production data or submissions.
