#!/usr/bin/env bash
# Install only HN Group People at people.hngroup.org.uk (PM2 hn-people, loopback 5670, /opt/hn-people). It reads the
# public staff list from the staff portal with the service secret; other websites, Auth and staff services are untouched.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=people.hngroup.org.uk
EMAIL="${1:-}"
SITE=/etc/nginx/sites-available/hn-people
ENABLED=/etc/nginx/sites-enabled/hn-people
CHALLENGE_DIR=/var/www/hn-people-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 getent; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
node --check "$SCRIPT_DIR/server.js"
node --check "$SCRIPT_DIR/public/assets/people.js"
if python3 -c 'import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(("127.0.0.1",5670)))'; then
    pm2 describe hn-people >/dev/null 2>&1 || { echo 'Port 5670 belongs to another service. No changes made.'; exit 1; }
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]people\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then
        echo "Another host serves $DOMAIN: $config. No changes made."; exit 1
    fi
done
[ -f /var/lib/hn-status-sso/secret ] || echo 'Note: the staff portal integration secret is missing, so the staff list will show as unavailable until auth-site/install.sh has run.'
mkdir -p /opt/hn-people "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
rm -rf /opt/hn-people/public
cp "$SCRIPT_DIR/server.js" /opt/hn-people/
cp -r "$SCRIPT_DIR/public" /opt/hn-people/public
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:5670/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'HN Group People did not start. Nginx was left unchanged.'; exit 1; }
BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
[ ! -f "$SITE" ] || cp "$SITE" "$BACKUP/site"
WAS_ENABLED=0
[ ! -e "$ENABLED" ] || WAS_ENABLED=1
write_config() {
    cp "$SCRIPT_DIR/nginx-http.conf" "$SITE"
    if [ -f "$LE_DIR/fullchain.pem" ]; then
        python3 - "$SITE" <<'PYCONF'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://people.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
PYCONF
        cat "$SCRIPT_DIR/nginx-https.conf" >> "$SITE"
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'HN Group People nginx configuration rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs people; fi
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null
if [ ! -f "$LE_DIR/fullchain.pem" ]; then
    if ! getent ahosts "$DOMAIN" >/dev/null 2>&1; then
        echo 'HN Group People is installed and running in PM2. Public DNS and SSL for people.hngroup.org.uk are pending.'
        echo 'Add A people -> 217.154.34.205 (DNS only) in the hngroup.org.uk DNS zone, then rerun: sudo bash people-site/install.sh'
        exit 0
    fi
    CERT_ARGS=()
    if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
    certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
        --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
        --deploy-hook 'nginx -t && systemctl reload nginx' || { echo 'SSL issuance for people.hngroup.org.uk failed. Check DNS and rerun: sudo bash people-site/install.sh'; exit 1; }
    write_config
fi
echo 'HN Group People installed: https://people.hngroup.org.uk · PM2 hn-people · port 5670.'
