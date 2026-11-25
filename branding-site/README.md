# HN Group brand centre — branding.hngroup.org.uk

A public site with the approved logos, colours, multicolour stripe, typography and logo rules for HN Group and its companies.

- **Public access.** The catalogue and approved brand downloads do not require an account or an Auth service connection. HN Group Management is excluded; its old download URLs return 404.
- **Logos** are the original files from `brand/logos/` (SVG) and the staff portal's PNG exports, copied into `public/assets/brand/`. Downloads are served publicly; catalogue HTML is not cached.
- **Email signatures** link to HN Account’s signature maker.
- **No account data or sign-in sessions are stored.**

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

The public Brand Library uses the fixed HN charcoal/lavender interface. Search filters company/product identities by name, section links show the current section, and colour swatches include the interface palette. Approved original artwork and download routes remain intact; light/dark artwork preview backgrounds deliberately preserve contrast. Signature maker links point to the merged Auth Account Centre.
