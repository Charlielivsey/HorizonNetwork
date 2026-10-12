# HN Group website (hngroup.org.uk)

The public website for HN Group: who we are, the four Horizon companies, open jobs and a contact form.

- **Plain files.** It's HTML, CSS and a little JavaScript in `public/`, with no build step and nothing to install. nginx serves the files straight from `/var/www/hngroup`.
- **Light and dark.** It follows the visitor's light or dark setting and works on phones.
- **Brand.** It uses the brand font (Plus Jakarta Sans), the HN Group colours and the company logos from the staff portal.
- **No tracking.** There are no cookies, analytics or third-party scripts, and every file comes from our own server.

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
- **Cloudflare:** set both records to **DNS only** (grey cloud) for the first install, so the certificate can be issued.

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
| `nginx-hngroup.conf` | The nginx site, including security headers and the `/api/public/` pass-through. |
| `install.sh` | The installer described above. |
