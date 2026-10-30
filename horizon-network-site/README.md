# Horizon Network website

The dedicated website for https://network.hngroup.org.uk (moved there on 30 October 2026 at the user's request; its former addresses horizon-network.co.uk, www.horizon-network.co.uk, horizonetwork.com and www.horizonetwork.com redirect every page to the same page there). Uses the approved Horizon Network logos, locally hosted Plus Jakarta Sans and HN Group’s responsive light/dark design. Home, About us, Our services, Contact and Privacy are separate pages. Horizon Advertising and Horizon Development are part of Horizon Network. Careers link to HN Group’s shared recruitment page; contact submissions go to existing staff portal enquiries.

The About us page gets leadership live from the staff portal. A person qualifies only when the same company role has company `Horizon Network` and department `Network Leadership`. Main and additional company roles are supported; a department assigned to another company does not qualify. Public responses contain display name, the Network role’s job title, photo, phone, location, time zone, skills, languages and the person’s **About me** from Settings → Profile (shown as plain text, and left out if they untick *Also show my About me on the Horizon Network website*). Emails, credentials and unrelated personnel details are not published. Photo requests recheck eligibility. Empty and unavailable states are explicit; no staff names are hardcoded.

The service uses the existing secret-protected staff bridge. `status-site/install-portal-sso.sh` installs only the necessary bridge files and restarts the portal when they change. No staff data is edited. Leadership changes appear on the next page load.

- PM2: `hn-network`, loopback port 3600.
- Application: `/opt/hn-network`; public files: `/var/www/hn-network`.
- Only its own nginx host `hn-network` and certificate are installed. No default/catch-all or existing domain host is replaced.
- The installer gets a Let’s Encrypt certificate for network.hngroup.org.uk (webroot) and writes one nginx host `hn-network`: the new address proxies to the service; the former addresses keep their existing certificates (`/etc/nginx/hn-network-ssl`, renewed by certbot.timer) and only redirect. Pages also link to `/support`, the shared support section (`hn-support.*`, requests go to the staff portal).

Install/update only this website:

```bash
cd /root/HorizonNetwork && git pull && sudo bash horizon-network-site/install.sh
```

Apply the group’s page restructure, Auth entry fix and this new website together:

```bash
cd /root/HorizonNetwork && git pull && sudo bash install-public-sites.sh
```

Checks: `node --test horizon-network-site/test.cjs` exercises the real staff portal and company/department filtering, minimal public fields and protected photos. Optional `PLAYWRIGHT_MODULE=/path/to/playwright node horizon-network-site/browser-smoke.cjs` checks both public sites and forms with fixture responses, without production data or submissions.


## Former address: horizonetwork.com

`install-alias.sh` (run by the main installer) keeps the `hn-network-com` host and its certificate so https://horizonetwork.com redirects to https://network.hngroup.org.uk.

The user also requested public leadership cards to include phone, location, time zone, skills and languages from staff profiles. Populated values appear automatically; phone numbers are call links and skills/languages are tags. Empty fields stay hidden. About me continues to respect its publication checkbox. Emails, credentials and unrelated personnel information remain excluded.

## Website administration

Public navigation and footer sign-in links open this website’s `/admin` panel through HN Group Auth. Only the system owner and Super Admin members can use it. Auth registers the `network` client with a fixed `https://network.hngroup.org.uk/auth/callback`; any request arriving with a former host name is sent to the same page on network.hngroup.org.uk. The configuration panel shows the authorised profile and controls availability for both Network domains. Maintenance is off on a new installation, hides public pages/leadership/contact endpoints when enabled, and persists in `/var/lib/hn-network/settings.json`. It does not affect the HN Group site’s separate setting.

Desktop leadership cards use the live team count to fit one row. Smaller screens retain readable two-column or single-column layouts. Both footer lines identify Horizon Network as “A subsidiary of HN Group Limited”.
