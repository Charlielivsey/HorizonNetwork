# Horizon Network website

The dedicated website for https://horizon-network.co.uk, with www redirected to the root domain. Uses the approved Horizon Network logos, locally hosted Plus Jakarta Sans and HN Group’s responsive light/dark design. Home, About us, Our services, Contact and Privacy are separate pages. Horizon Advertising and Horizon Development are part of Horizon Network. Careers link to HN Group’s shared recruitment page; contact submissions go to existing staff portal enquiries.

The About us page gets leadership live from the staff portal. A person qualifies only when the same company role has company `Horizon Network` and department `Network Leadership`. Main and additional company roles are supported; a department assigned to another company does not qualify. Public responses contain display name, the Network role’s job title, photo, phone, location, time zone, skills, languages and the person’s **About me** from Settings → Profile (shown as plain text, and left out if they untick *Also show my About me on the Horizon Network website*). Emails, credentials and unrelated personnel details are not published. Photo requests recheck eligibility. Empty and unavailable states are explicit; no staff names are hardcoded.

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


## Additional domain: horizonetwork.com

The same running site is also configured for `horizonetwork.com`, using its own nginx host `hn-network-com` and certificate. It shares the existing PM2 `hn-network` service and live leadership feed; canonical page URLs remain on horizon-network.co.uk. No primary host or other website configuration is replaced.

Create an A record for `@` pointing to `217.154.34.205`. Optionally add `www` pointing to the same address. At the time this host was prepared, neither name had a web DNS record. The alias installer prepares HTTP/ACME routing, then waits for DNS before requesting SSL. The installer checks independent public DNS when the VPS still caches an older missing-record response. Once DNS resolves to this VPS, rerun:

```bash
cd /root/HorizonNetwork && git pull && sudo bash horizon-network-site/install-alias.sh
```

The installer obtains a trusted Let's Encrypt certificate and enables HTTPS with automatic renewal. The optional www name is added to the certificate when it resolves. The regular Network installer also runs this alias setup, so future updates retain both domains. A message that DNS/SSL is pending does not mean the domain is live.

The user also requested public leadership cards to include phone, location, time zone, skills and languages from staff profiles. Populated values appear automatically; phone numbers are call links and skills/languages are tags. Empty fields stay hidden. About me continues to respect its publication checkbox. Emails, credentials and unrelated personnel information remain excluded.
