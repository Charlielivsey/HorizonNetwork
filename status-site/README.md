# HN Group status — status.hngroup.org.uk

Independent status website with a dedicated PM2 process (`hn-status`), loopback port 3300, nginx virtual host and Let's Encrypt SSL. The installer never invokes the staff/public website installers or rewrites another site's nginx configuration. It applies only the three staff portal files required for status sign-in, restarting `hn-staff-portal` when those files change. It backs up and restores those files if the portal health check fails. nginx is validated and gracefully reloaded to enable the new host.

## Install / update

Add an **A** record named **status** pointing at your VPS (the existing repository documents `217.154.34.205`; use your actual current VPS IP). Remove conflicting status records, and only add an AAAA record if the VPS serves that IPv6 address. Leave other domains and email records alone. Allow inbound TCP 80 and 443. With Cloudflare, use DNS only during initial certificate issuance, then Full (strict) after the certificate succeeds. Never use Flexible because HTTP redirects to HTTPS.

```bash
cd /root/HorizonNetwork && git pull && sudo bash status-site/install.sh
```

If this server has no Let's Encrypt registration yet, append your email to the installer command. Existing registrations are reused. Trusted SSL requires working DNS and access to the HTTP challenge. If issuance fails, the installer clearly warns and keeps a temporary self-signed certificate (or the existing certificate); fix DNS/access and rerun before using admin. Renewal uses certbot's timer and a deploy hook that validates and reloads nginx. Check renewal with `sudo certbot renew --dry-run`.

## HN Group Auth sign-in

The Admin button sends visitors to **auth.hngroup.org.uk**, which checks the existing staff password and six-digit sign-in PIN (when configured). Auth displays the user's current name, email, job title, company and profile picture from the staff service. Continue returns to status administration. There is no separate status password and no password or PIN database in Auth.

Only the portal's system owner and members of its exact **Super Admin** role are admitted. The built-in Administrator account, other roles with broad system permissions, disabled accounts and impersonated sessions are denied. Permissions and staff session validity are checked on every protected status request. Portal maintenance admits only the owner. If authentication is unavailable, public status still works.

Auth accepts only registered applications with fixed callbacks. The initial registered client is `status`. A Secure, HttpOnly browser state cookie and a single-use code expiring after 60 seconds protect the return. Status and Auth have separate host-only cookies, with a maximum 12-hour lifetime bounded by the staff session. Passwords, PINs and staff browser cookies never reach status. Signing out of Auth revokes its connected status sessions; signing out of status clears only that site's session. Restarting either service requires a fresh sign-in. Refreshing or reopening Auth also signs that browser out, matching the staff portal’s document navigation behaviour.

The status installer also runs the isolated Auth installer (PM2 `hn-auth`, loopback port 3400, its own nginx host and Let's Encrypt certificate). It does not invoke the staff/public website installers. The narrow integration helper updates only the required staff bridge files, backs them up, restarts the portal only when necessary and restores them if startup fails. Staff records and other nginx hosts are preserved. Both `auth` and `status` DNS records must point to the VPS and have trusted HTTPS. The shared backend secret is root-only at `/var/lib/hn-status-sso/secret`.

## Branding

Matches the public website and staff portal: locally hosted Plus Jakarta Sans, HN purple, rounded cards, soft colour glows, the stepped stripe, and automatic light/dark palettes. Original HN Group wordmarks come from the user-supplied logo pack in `brand/logos/`; the browser tab uses the same HN favicon as the public website. The admin page shares this styling. See `brand/README.md` and the root `AGENTS.md` for future branding guidance. All assets are served locally and copied by the isolated status installer.

## Interface

The public page provides a current-health overview, real service/notice counts, keyboard-accessible daily availability tooltips, and filters for active or resolved incidents. Earlier incident updates expand on demand. Background refreshes preserve expanded history when its content is unchanged.

Admin has separate Overview, Services and Incident Updates views, service search, focused add/edit dialogs, a deletion confirmation and a live preview of incident updates. Refresh the workspace using the button beside the page heading. Saving and publishing show progress and success/error feedback. All existing staff access restrictions continue to apply.

Both pages support phone/tablet layouts, automatic dark mode and restrained entrance, hover and dialog animations. Reduced-motion preferences disable animations and smooth scrolling. No external UI scripts or fonts are loaded.

## Use

- The HN Group website and staff portal are initially added as monitors. Add, edit or remove services in admin. Check URLs stay private; use public HTTP(S) endpoints without credentials. The server checks each URL every 60 seconds with a 10-second timeout. HTTP 2xx after redirects counts as available; failures count as unavailable. This measures HTTP reachability, not every feature or login flow.
- Status can be automatic, operational, degraded, outage or maintenance. Non-HTTP services can be manually managed without a URL. Automatic requires a URL. Incidents and service overrides are separate: post updates, then set or clear overrides as needed. Scheduled notices are informational; they do not trigger changes on a timer.
- Publish incidents, affected services, updates and resolutions. Earlier updates remain visible. Nothing is invented before checks begin. Data older than three minutes is marked unknown in automatic mode. A manual override remains in effect until changed.
- Thirty UTC calendar days of check totals are retained. Uptime reflects successful HTTP checks during observed time, not manual overrides, incident notices or downtime while the monitor itself was stopped. Missing days are grey. Changing a check URL resets that service's history.
- Public data refreshes every 30 seconds. Failed refreshes display a warning. Admin changes and measurements survive updates in `/var/lib/hn-status`; back up that directory securely. Application files are in `/opt/hn-status`.
- This site shares the VPS: a VPS/network outage may also take the status site offline. For independent outage reporting, host the status site separately.

## Operations

```bash
pm2 status hn-status
pm2 logs hn-status
curl -fsS http://127.0.0.1:3300/healthz
```

PM2 startup and saved process state enable reboot recovery. The installer requires Node.js 18+ and an available port 3300. It refuses conflicting explicit nginx hosts instead of editing them. It does not change firewall rules; ensure 80/443 are already allowed.

Local verification: `node --test auth-site/test.cjs status-site/test.cjs status-site/portal-smoke.test.cjs`, `node --check status-site/public/app.js`, `bash -n status-site/install.sh`. Local development: `node status-site/server.js` (creates ignored `status-site/data/`). For a local sign-in integration, both processes accept `STATUS_SSO_SECRET_FILE`; status accepts `AUTH_BACKEND` (defaults to `http://127.0.0.1:3400`), and auth accepts `STAFF_PORTAL_BACKEND` (defaults to `http://127.0.0.1:3200`). Browser redirects intentionally remain fixed to the production HTTPS domains. Automated tests use a temporary local portal fixture and exercise the actual sign-in bridge.
