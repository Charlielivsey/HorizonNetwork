#!/usr/bin/env bash
# Retire the private Evan page without letting its host fall through to another website.
set -euo pipefail
config=/etc/nginx/sites-available/hn-evan
if ! pm2 describe hn-evan >/dev/null 2>&1 && [ ! -d /opt/hn-evan ] && [ ! -e "$config" ]; then exit 0; fi
if [ -d /opt/hn-evan ]; then
    backup="/var/backups/hn-evan-retired-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$backup"
    for item in /opt/hn-evan /var/lib/hn-evan "$config"; do
        if [ -e "$item" ]; then cp -a --parents "$item" "$backup/"; fi
    done
    chmod -R go-rwx "$backup"
    echo "Evan site archived at $backup"
fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
cat > "$tmp" <<'NGINX'
# Retired 9 November 2026. Keep this host isolated from the default virtual host.
server {
    listen 80;
    listen [::]:80;
    server_name evan.hngroup.org.uk;
    location ^~ /.well-known/acme-challenge/ { root /var/www/hn-evan-acme; }
    location / { return 410; }
}
NGINX
if [ -f /etc/letsencrypt/live/evan.hngroup.org.uk/fullchain.pem ]; then
cat >> "$tmp" <<'NGINX'
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name evan.hngroup.org.uk;
    ssl_certificate /etc/letsencrypt/live/evan.hngroup.org.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/evan.hngroup.org.uk/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / { return 410; }
}
NGINX
fi
if ! cmp -s "$tmp" "$config"; then
    cp "$tmp" "$config"
    ln -sfn "$config" /etc/nginx/sites-enabled/hn-evan
    nginx -t
    systemctl reload nginx
fi
if pm2 describe hn-evan >/dev/null 2>&1; then pm2 delete hn-evan; pm2 save; fi
# The protected archive above retains the old page and its sessions for recovery only.
rm -rf /opt/hn-evan /var/lib/hn-evan
