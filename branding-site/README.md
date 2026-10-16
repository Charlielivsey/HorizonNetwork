# HN Group brand centre — branding.hngroup.org.uk

A staff-only site with the approved logos, colours, multicolour stripe, typography and logo rules for HN Group and its companies.

- **Staff only.** Every page and brand file needs a sign-in through HN Group Auth, as the registered `branding` application. Any enabled staff account can use it. Only the stylesheet, script, font, tab icon and the HN Group header wordmark are public.
- **Logos** are the original files from `brand/logos/` (SVG) and the staff portal's PNG exports, copied into `public/assets/brand/`. Downloads are served with `private, no-store`.
- **Email signatures** link to the staff portal's signature maker.
- **No data is stored.** Sign-in sessions are kept in memory, so restarting the service signs everyone out.

## Install or update

Run on the VPS:

```
cd /root/HorizonNetwork && git pull origin claude/confident-volta-gxjboo && bash auth-site/install.sh && bash branding-site/install.sh && bash admin-site/install.sh
```

The Auth installer registers the `branding` application. The brand centre installer sets up PM2 (`hn-branding`, port 4800), nginx and the Let's Encrypt certificate. The website control installer adds it to admin.hngroup.org.uk's maintenance and power controls. DNS needs `A branding → 217.154.34.205` (DNS only) in the hngroup.org.uk zone.

## Tests

```
node --test branding-site/test.cjs
```
