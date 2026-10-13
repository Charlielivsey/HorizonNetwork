# HN Group website (hngroup.org.uk)

The public website for HN Group: who we are, the four Horizon companies, open jobs and a contact form.

- **Website service.** Public HTML, CSS and JavaScript remain in `public/` with no build step. nginx passes requests to the dedicated PM2 service `hn-website` on loopback port 3500, which serves `/var/www/hngroup` and enforces maintenance mode.
- **Light and dark.** It follows the visitor's light or dark setting and works on phones.
- **Brand.** It uses the brand font (Plus Jakarta Sans), the HN Group colours and the company logos from the staff portal.
- **No tracking.** There are no analytics or third-party scripts. Public browsing sets no cookies; administrator sign-in uses Secure, HttpOnly host-only authentication cookies. Every asset is served locally.

## What's on it

| Section | Where the content comes from |
|---------|------------------------------|
| Hero, About, Our companies, How we work | Written in `public/index.html`. Edit the text there. |
| **Careers** | Live from the staff portal. When posting a vacancy under People → Jobs, tick **Advertise on the HN Group website**. The vacancy shows here while it's open and before its closing date. Anyone can apply with their CV. Applications go straight into the vacancy's applicants with the source *Company website*, and recruiters get a notification. |
| **Contact form** | Messages go into the staff portal under **Support → Website enquiries** for people with the *Website enquiries* permission. That permission is given to Super Admin, Leadership & HR and Communications to start with. They get a notification for each message, can assign it, add notes and reply from their own email. Nothing is emailed by the server. Spam caught by a hidden trap field is filed under *Spam*. |
| Privacy notice | `public/privacy.html`. Please have it checked before going live. It says enquiries are kept for a year after they're dealt with, and unsuccessful applications for 6 months. Those match the defaults in System Admin → Data retention, so change both if you change one. |

Only `/api/public/` on this domain reaches the staff portal: the list of open jobs, job applications and the contact form. All of it is limited to 5 submissions per IP address every 10 minutes. The rest of the portal is not reachable through hngroup.org.uk.

## Put it live on hngroup.org.uk

The website runs on the same VPS as the staff portal (`217.154.34.205`).

### 1. Point the domain at the VPS

Go to wherever `hngroup.org.uk`'s DNS is managed. That's the company you bought the domain from, or Cloudflare if you moved it there. Set these records:

| Type | Name / Host | Value |
|------|-------------|-------|
| A | `@` (the bare domain, sometimes shown as blank or `hngroup.org.uk`) | `217.154.34.205` |
| A | `www` | `217.154.34.205` |

Before you save:

- **Remove anything old for `@` and `www`.** Delete any other **A**, **AAAA** or **CNAME** records for `@` or `www`, such as a parking page or an old website builder. If an old AAAA (IPv6) record is left behind, the HTTPS certificate can fail.
- **Don't touch email records.** Leave the **MX** and **TXT** records (Google Workspace, SPF, DKIM, DMARC) and the `staff` record exactly as they are. Changing the A records doesn't affect email.
- **Cloudflare:** both proxied (orange cloud) and **DNS only** (grey cloud) work.
  - **SSL mode.** With the orange cloud, set SSL/TLS to **Full** in Cloudflare. Once the installer says the Let's Encrypt certificate is in place, you can switch to **Full (strict)**.
  - **Flexible mode** also works, but traffic between Cloudflare and the server isn't encrypted.
  - **Until Let's Encrypt is issued,** the server uses a temporary self-signed certificate, so Cloudflare still reaches the website and not the staff portal.
  - **Proxied checks.** With the orange cloud, DNS lookups return Cloudflare's addresses rather than the server's. The installer and `check.sh` recognise these as correct.

DNS changes usually take a few minutes, but can take a few hours. To check, run this on the VPS:

```bash
getent hosts hngroup.org.uk www.hngroup.org.uk
```

Both lines should show `217.154.34.205`.

### 2. Install it on the VPS

The staff portal's installer installs the website too, so it's the same single command you already use. As root on the VPS:

```bash
cd /root/HorizonNetwork && git pull && sudo bash staff-portal/install.sh
```

The command does all of this:

1. Updates the staff portal.
2. Copies the website to `/var/www/hngroup`.
3. Adds an nginx site for `hngroup.org.uk`, with `www.hngroup.org.uk` redirecting to it.
4. Gets free HTTPS certificates for the portal and the website. They renew automatically.
   - **No email needed.** It reuses the Let's Encrypt registration the staff portal already has.
   - **www later.** If the `www` record isn't pointing here yet, the main domain still gets its certificate. Run the command again once `www` is set up and it's added.
5. Adds a catch-all, so any web address this server doesn't host is refused. Before this, nginx showed the staff portal for any address it didn't recognise, which is why hngroup.org.uk was showing the portal.

On a brand-new server that has never had a certificate, add your email the first time:
`sudo bash staff-portal/install.sh staff.hngroup.org.uk you@hngroup.org.uk`.

To update the website on its own, run `sudo bash hngroup-site/install.sh`.

### 3. Check it

- Open https://hngroup.org.uk. It should load the website (not the staff portal) with a padlock, and http:// and www. should both redirect there.
- Open https://staff.hngroup.org.uk. The staff portal should still load as normal.
- **Careers:** post a test vacancy in the staff portal with **Advertise on the HN Group website** ticked. It should appear under Careers within about two minutes.
- **Contact form:** send a test message. It should appear in the staff portal under Support → Website enquiries.

## If hngroup.org.uk still shows the staff portal

The installer ends by checking what the domain really serves. To run the check on its own:

```bash
sudo bash /root/HorizonNetwork/hngroup-site/check.sh
```

It tells you which of these it is:

- **Another nginx config on the server claims hngroup.org.uk.** The installer fixes this itself. It switches the other config off, or takes the main domain out of it if it also serves something else, and keeps a backup in `/root/nginx-backup-<date>`.
- **The DNS record points somewhere else, or is missing.** Set `A @ 217.154.34.205` and `A www 217.154.34.205`, and delete any other A, AAAA or CNAME records for `@` and `www`.
- **Your domain provider is forwarding the domain.** Many providers have a "domain forwarding", "URL redirect" or "web forwarding" setting that sends visitors somewhere else before they ever reach the server. Turn it off for `hngroup.org.uk` and `www`, and keep the A records.
- **Everything passes but your browser still shows the portal.** The browser has remembered an old redirect. Try a private/incognito window, or clear its cache for hngroup.org.uk.

## Updating

The same single command updates the portal and the website:

```bash
cd /root/HorizonNetwork && git pull && sudo bash staff-portal/install.sh
```

## Files

| Path | What it is |
|------|------------|
| `public/index.html` | The home page, with every section. |
| `public/privacy.html`, `public/404.html` | Privacy notice and the "page not found" page. |
| `public/assets/site.css`, `site.js` | Styles, and the menu, Careers and contact form code. |
| `public/assets/brand/` | Logos, copied from the staff portal's brand library. |
| `public/assets/og-image.png` | The picture shown when someone shares the link. |
| `nginx/hngroup-website.conf` | The nginx servers for hngroup.org.uk and www (HTTP, HTTPS, redirects). |
| `nginx/hngroup-site.conf` | The site itself: files, security headers and the `/api/public/` pass-through. |
| `nginx/hngroup-cloudflare.conf` | Gets visitors' real IP addresses from Cloudflare (used for spam limits). |
| `check.sh` | Checks what the domain really serves and says what to fix. |
| `install.sh` | The installer described above. |

## Website configuration and maintenance

Use **Admin access** in the footer, or `https://hngroup.org.uk/admin`. Sign-in runs through HN Group Auth using the existing staff password/PIN and returns automatically. Only the system owner and exact Super Admin role members are authorised; permissions, account state and session validity are checked on every protected request. Other roles with broad system permissions are not sufficient.

The maintenance switch replaces every public page with a branded 503 maintenance page. Direct page URLs, original site assets, jobs, applications and enquiries are blocked too. Dedicated maintenance assets, Auth login/callback, the protected configuration panel and certificate challenges stay available. Administrators can sign in from the maintenance page to restore the website. The switch affects only hngroup.org.uk, and never the staff, Auth or Status sites. The initial setting is off. Settings are saved atomically in `/var/lib/hn-website/settings.json`, survive updates/restarts, and default to maintenance if an existing settings file is corrupt.

For this existing VPS, update with:

```bash
cd /root/HorizonNetwork && git pull && sudo bash hngroup-site/install-admin.sh
```

This isolated updater installs the website service and registered Auth client, copies public assets, and updates only `/etc/nginx/snippets/hngroup-site.conf`. It preserves the main site's existing SSL and host configuration and other sites' nginx configurations. The original full installer also invokes this helper after initial website/SSL setup. It never enables maintenance during installation or overwrites saved settings. PM2 startup/save provide reboot recovery.

Verification: `node --test hngroup-site/test.cjs auth-site/test.cjs auth-site/portal-auth.test.cjs status-site/test.cjs`. Coverage includes fixed callbacks, permission denial/removal, CSRF, persistent maintenance, content/API gating, admin access during maintenance and unchanged public CV metadata/body forwarding.

Optional browser regression: `node hngroup-site/browser-smoke.cjs` with Playwright/Chromium installed (or `PLAYWRIGHT_MODULE` pointing to an existing module). It uses temporary staff data and a local HTTPS proxy to check the real main-site → Auth/password/PIN → configuration flow, maintenance and restoration, maintenance login and mobile layouts. No production accounts or settings are changed.
