#!/usr/bin/env bash
# Roster only: public sources, own process, own host; no staff/company writes or broad service restarts.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
ROSTER_SOURCE="$(cd "$(dirname "$0")" && pwd)"
for task in server.js lib/data.js public/assets/roster.js; do node --check "$ROSTER_SOURCE/$task"; done
for tool in node pm2 nginx certbot curl; do command -v "$tool" >/dev/null; done
mkdir -p /opt/hn-roster /var/www/hn-roster-acme
cp "$ROSTER_SOURCE/server.js" "$ROSTER_SOURCE/ecosystem.config.cjs" /opt/hn-roster/
cp -a "$ROSTER_SOURCE/lib" "$ROSTER_SOURCE/public" /opt/hn-roster/
pm2 startOrRestart /opt/hn-roster/ecosystem.config.cjs --only hn-roster >/dev/null
for attempt in $(seq 1 20); do if curl -fsS http://127.0.0.1:5730/healthz >/dev/null 2>&1; then break; fi; sleep .5; done
curl -fsS http://127.0.0.1:5730/healthz >/dev/null
if [ -f /etc/letsencrypt/live/roster.hngroup.org.uk/fullchain.pem ]; then
    cp "$ROSTER_SOURCE/nginx-https.conf" /etc/nginx/sites-available/hn-roster
else
    cp "$ROSTER_SOURCE/nginx-http.conf" /etc/nginx/sites-available/hn-roster
fi
ln -sfn /etc/nginx/sites-available/hn-roster /etc/nginx/sites-enabled/hn-roster
nginx -t
systemctl reload nginx
if [ ! -f /etc/letsencrypt/live/roster.hngroup.org.uk/fullchain.pem ]; then
    certbot certonly --webroot -w /var/www/hn-roster-acme -d roster.hngroup.org.uk --cert-name roster.hngroup.org.uk --non-interactive --agree-tos --keep-until-expiring
    cp "$ROSTER_SOURCE/nginx-https.conf" /etc/nginx/sites-available/hn-roster
    nginx -t
    systemctl reload nginx
fi
pm2 save >/dev/null
echo 'Roster is live at https://roster.hngroup.org.uk'
