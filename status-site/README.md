# HN Group status — status.hngroup.org.uk

Independent status website with a dedicated PM2 process (`hn-status`), loopback port 3300, nginx virtual host and Let's Encrypt SSL. This installer never invokes the other installers, rewrites another site's configuration, or restarts another PM2 app. nginx is validated and gracefully reloaded to enable the new host.

## Install / update

Add an **A** record named **status** pointing at your VPS (the existing repository documents `217.154.34.205`; use your actual current VPS IP). Remove conflicting status records, and only add an AAAA record if the VPS serves that IPv6 address. Leave other domains and email records alone. Allow inbound TCP 80 and 443. With Cloudflare, use DNS only during initial certificate issuance, then Full (strict) after the certificate succeeds. Never use Flexible because HTTP redirects to HTTPS.

```bash
cd /root/HorizonNetwork && git pull && sudo bash status-site/install.sh
```

If this server has no Let's Encrypt registration yet, append your email to the installer command. Existing registrations are reused. Trusted SSL requires working DNS and access to the HTTP challenge. If issuance fails, the installer clearly warns and keeps a temporary self-signed certificate (or the existing certificate); fix DNS/access and rerun before using admin. Renewal uses certbot's timer and a deploy hook that validates and reloads nginx. Check renewal with `sudo certbot renew --dry-run`.

Open https://status.hngroup.org.uk. Admin is at `/admin`; retrieve its unique key on the VPS:

```bash
sudo cat /var/lib/hn-status/admin-token
```

There is no shared default password. The browser holds the key only in memory; refresh or lock to sign out. Never send it to anyone or enter it over untrusted HTTPS. To rotate it: replace `/var/lib/hn-status/admin-token` with a new random secret (`openssl rand -hex 32`), keep permissions at 600, and restart only `hn-status`.

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

Local verification: `node --test status-site/test.cjs`, `node --check status-site/public/app.js`, `bash -n status-site/install.sh`. Local development: `node status-site/server.js` (creates ignored `status-site/data/`).
