#!/usr/bin/env bash
# Install Compass product website (compass.hngroup.org.uk). Public site; reads release metadata from downloads.hngroup.org.uk.
set -euo pipefail
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/offline-site/install.sh"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=compass.hngroup.org.uk
EMAIL="${1:-}"
SITE=/etc/nginx/sites-available/hn-compass
ENABLED=/etc/nginx/sites-enabled/hn-compass
CHALLENGE_DIR=/var/www/hn-compass-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 getent; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
node --check "$SCRIPT_DIR/server.js"
node --check "$SCRIPT_DIR/public/assets/compass-page.js"
if python3 -c 'import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(("127.0.0.1",5690)))'; then
    pm2 describe hn-compass >/dev/null 2>&1 || { echo 'Port 5690 belongs to another service. No changes made.'; exit 1; }
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]compass\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then
        echo "Another host serves $DOMAIN: $config. No changes made."; exit 1
    fi
done
mkdir -p /opt/hn-compass "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
rm -rf /opt/hn-compass/public
cp "$SCRIPT_DIR/server.js" /opt/hn-compass/
cp -r "$SCRIPT_DIR/public" /opt/hn-compass/public
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:5690/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'Compass website did not start. Nginx was left unchanged.'; exit 1; }
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
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://compass.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
PYCONF
        cat "$SCRIPT_DIR/nginx-https.conf" >> "$SITE"
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'Compass website nginx configuration rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs compass; fi
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null

# The server's own resolver can remember that the name didn't exist yet, so public resolvers are asked too.
has_web_dns() {
    if getent ahosts "$1" >/dev/null 2>&1; then return 0; fi
    if command -v dig >/dev/null 2>&1; then
        local resolver answers
        for resolver in 1.1.1.1 8.8.8.8; do
            answers="$(dig @"$resolver" +time=2 +tries=1 +short "$1" A 2>/dev/null || true)
$(dig @"$resolver" +time=2 +tries=1 +short "$1" AAAA 2>/dev/null || true)"
            if printf '%s\n' "$answers" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]*:[0-9a-fA-F:]+$'; then
                echo "Public DNS resolves $1; ignoring the stale local DNS result." >&2
                return 0
            fi
        done
    else
        if python3 - "$1" <<'PYDNS'
import json,sys,urllib.request,ipaddress
for domain_type in ('A','AAAA'):
    try:
        url='https://dns.google/resolve?name='+sys.argv[1]+'&type='+domain_type
        with urllib.request.urlopen(url,timeout=5) as response: value=json.load(response)
        for record in value.get('Answer',[]):
            if record.get('type') not in (1,28): continue
            ipaddress.ip_address(record['data'])
            sys.exit(0)
    except Exception:
        pass
sys.exit(1)
PYDNS
        then
            echo "Public DNS resolves $1; ignoring the stale local DNS result." >&2
            return 0
        fi
    fi
    return 1
}

if [ ! -f "$LE_DIR/fullchain.pem" ]; then
    if ! has_web_dns "$DOMAIN"; then
        echo 'Compass website is installed and running in PM2. Public DNS and SSL for compass.hngroup.org.uk are pending.'
        echo 'Add A compass -> 217.154.34.205 (DNS only) in the hngroup.org.uk DNS zone, then rerun: sudo bash compass-site/install.sh'
        exit 0
    fi
    CERT_ARGS=()
    if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
    certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
        --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
        --deploy-hook 'nginx -t && systemctl reload nginx' || { echo 'SSL issuance for compass.hngroup.org.uk failed. Check DNS and rerun: sudo bash compass-site/install.sh'; exit 1; }
    write_config
fi
echo 'Compass website installed: https://compass.hngroup.org.uk · PM2 hn-compass · port 5690.'
