#!/usr/bin/env bash
# Update only HN Group's website service, its nginx snippet, and registered Auth client.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
[ -f /etc/nginx/sites-enabled/00-hngroup-website ] && [ -f /etc/nginx/snippets/hngroup-site.conf ] || { echo 'Install the main website first with hngroup-site/install.sh.'; exit 1; }
node --check "$SCRIPT_DIR/server.js"
node --check "$SCRIPT_DIR/auth.js"
node --check "$SCRIPT_DIR/control/app.js"
if python3 -c 'import socket;s=socket.socket();exit(s.connect_ex(("127.0.0.1",3500)))'; then
    pm2 describe hn-website >/dev/null 2>&1 || { echo 'Port 3500 belongs to another application. No changes made.'; exit 1; }
fi
bash "$SCRIPT_DIR/../auth-site/install.sh" "${1:-}"
mkdir -p /opt/hn-website/control /var/lib/hn-website /var/www/hngroup
chmod 700 /var/lib/hn-website
cp "$SCRIPT_DIR/server.js" "$SCRIPT_DIR/auth.js" /opt/hn-website/
cp -r "$SCRIPT_DIR/control/." /opt/hn-website/control/
cp -r "$SCRIPT_DIR/public/." /var/www/hngroup/
chown -R www-data:www-data /var/www/hngroup
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:3500/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'Website service did not start. The nginx configuration was left unchanged.'; exit 1; }
BACKUP="$(mktemp /etc/nginx/snippets/hngroup-site.conf.backup-XXXXXX)"
cp /etc/nginx/snippets/hngroup-site.conf "$BACKUP"
cp "$SCRIPT_DIR/nginx/hngroup-site.conf" /etc/nginx/snippets/hngroup-site.conf
if ! nginx -t; then
    cp "$BACKUP" /etc/nginx/snippets/hngroup-site.conf
    echo "nginx configuration restored from $BACKUP"; exit 1
fi
systemctl reload nginx
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null
echo 'Website configuration installed: https://hngroup.org.uk/admin'
echo 'Sign-in: HN Group Auth · system owner and Super Admin only.'
echo 'PM2: hn-website · port 3500 · existing website SSL preserved.'
echo 'The current maintenance setting was preserved. New installations default to off.'
