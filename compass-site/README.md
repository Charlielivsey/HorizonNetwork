# Compass website (`compass.hngroup.org.uk`)

Public product and download page for **Compass**, HN Group's desktop web browser.

- **Host:** `https://compass.hngroup.org.uk`
- **PM2 process:** `hn-compass`
- **Loopback port:** `127.0.0.1:5690`
- **Release metadata:** fetched server-side from `https://downloads.hngroup.org.uk/api/releases` (cached 5 minutes, fails gracefully to `downloads.hngroup.org.uk`). Installers stay hosted by `downloads-site/`.
- **Install / update on VPS:** `sudo bash compass-site/install.sh` (or via root `sudo bash install.sh`).
- **Tests:** `node --test compass-site/test.cjs`
