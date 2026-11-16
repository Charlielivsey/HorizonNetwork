# HN Group Appeals

Public base site at https://appeals.hngroup.org.uk. Uses the approved HN Group public template, original wordmarks, local Plus Jakarta Sans, shared motion assets and shared theme (Midnight Lavender default; existing Light/Lavender Dusk preferences respected).

Appeals currently use the established appeals@hngroup.org.uk email address. Email links open the visitor's mail application; the site does not submit or store appeals and does not claim to have received one. No sign-in, separate data store, invented appeal policies or response-time promises.

Run: `node appeals-site/server.js` (loopback 5720; HOST/PORT overrides supported).
Install: `sudo bash appeals-site/install.sh [certificate-email]`. PM2 `hn-appeals`, `/opt/hn-appeals`, nginx host and dedicated Let's Encrypt certificate. DNS A `appeals` → `217.154.34.205` (DNS only). Installer retains central website control and branded offline handling.

Registered in website control's two catalogues, Sites, Status through the central catalogue, selective installer, shared asset manifests and Browser's named shortcuts/new-tab directory. Browser release version 1.3.8.
