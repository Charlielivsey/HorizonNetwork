# HN Group Staff Portal

Internal staff portal for the whole of HN Group, served at **https://staff.hngroup.org.uk**.

So far it has:
- **Login page.** Passwords are hashed with scrypt, sessions last 8 hours, and an IP is locked out for 15 minutes after 10 failed attempts.
- **Landing page.** It has a greeting, quick-access tiles for upcoming modules, links to the group companies, a news panel and a password-change dialog.

There are no npm dependencies. It only needs Node.js.

**Default login:** `admin` / `admin`. The portal shows a banner until you change it.

## Install on the VPS

### 1. Point the domain at the VPS (one-off)

Wherever `hngroup.org.uk`'s DNS is managed (your domain registrar or Cloudflare), add this record:

| Type | Name / Host | Value             | TTL  |
|------|-------------|-------------------|------|
| A    | `staff`     | `217.154.34.205`  | Auto |

If you use Cloudflare, set the record to **DNS only** (grey cloud) for the first install so the HTTPS certificate can be issued. You can turn the proxy back on afterwards and set SSL mode to *Full (strict)*.

Check that it has propagated (usually a few minutes):

```bash
getent hosts staff.hngroup.org.uk     # should print 217.154.34.205
```

### 2. Run the installer

SSH into the VPS as root, then:

```bash
cd /path/to/HorizonNetwork        # wherever this repo is cloned on the VPS
git pull
sudo bash staff-portal/install.sh staff.hngroup.org.uk you@hngroup.org.uk
```

The email is only used by Let's Encrypt for certificate expiry notices.

The installer:
1. Installs nginx, certbot, Node.js and PM2 if they are missing.
2. Copies the app to `/opt/hn-staff-portal`. User accounts are stored separately in `/var/lib/hn-staff-portal/users.json`, so updates never wipe them.
3. Starts it under PM2 as `hn-staff-portal`, listening on `127.0.0.1:3200` only.
4. Adds an nginx site for `staff.hngroup.org.uk`. This sits alongside the existing Horizon Network site and does not change it.
5. Opens ports 80 and 443 if `ufw` is active.
6. Gets a free HTTPS certificate, redirects HTTP to HTTPS, and sets the certificate to auto-renew.

### 3. Log in

Go to **https://staff.hngroup.org.uk**, sign in with `admin` / `admin`, and click **Change password** straight away.

## Updating

```bash
cd /path/to/HorizonNetwork && git pull
sudo bash staff-portal/install.sh
```

Re-running the installer is safe. It keeps user accounts and re-applies the existing HTTPS certificate.

## Useful commands

```bash
pm2 logs hn-staff-portal          # logs, including sign-ins and failed attempts
pm2 restart hn-staff-portal
sudo certbot renew --dry-run      # test certificate renewal
```

**Forgot the admin password?** Delete the user file and restart. This recreates `admin` / `admin`.

```bash
sudo rm /var/lib/hn-staff-portal/users.json && pm2 restart hn-staff-portal
```

## Troubleshooting

- **The installer says DNS doesn't point at this server.** Wait for the A record to propagate, then re-run the installer.
- **The site shows the main Horizon Network page.** Check that `/etc/nginx/sites-enabled/hn-staff-portal` exists, then run `sudo nginx -t && sudo systemctl reload nginx`.
- **502 Bad Gateway.** The app isn't running. Check `pm2 status` and `pm2 logs hn-staff-portal`.
