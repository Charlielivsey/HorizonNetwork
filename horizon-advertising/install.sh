#!/usr/bin/env bash
# Install only horizonadvertising.co.uk. Existing websites, Auth and staff services are untouched.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=horizonadvertising.co.uk
EMAIL="${1:-}"
SITE=/etc/nginx/sites-available/ha-website
ENABLED=/etc/nginx/sites-enabled/ha-website
CHALLENGE_DIR=/var/www/ha-website-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
SSL_DIR=/etc/nginx/ha-website-ssl
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 openssl; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
node --check "$SCRIPT_DIR/server.js"

if python3 -c 'import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(("127.0.0.1",3100)))'; then
    pm2 describe ha-website >/dev/null 2>&1 || { echo 'Port 3100 belongs to another service. No changes made.'; exit 1; }
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]horizonadvertising\.co\.uk([[:space:];]|$)' "$config"; then
        echo "Another host serves $DOMAIN: $config. No changes made."; exit 1
    fi
done
mkdir -p /opt/ha-website/public "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
cp "$SCRIPT_DIR/server.js" /opt/ha-website/server.js
cp -r "$SCRIPT_DIR/public/." /opt/ha-website/public/
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:3100/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'Horizon Advertising service did not start. Nginx was left unchanged.'; exit 1; }
mkdir -p "$SSL_DIR"
if [ -f "$LE_DIR/fullchain.pem" ]; then
    ln -sfn "$LE_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
    ln -sfn "$LE_DIR/privkey.pem" "$SSL_DIR/privkey.pem"
else
    if [ ! -f "$SSL_DIR/origin.crt" ]; then
        openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=$DOMAIN" \
            -addext "subjectAltName=DNS:$DOMAIN" -keyout "$SSL_DIR/origin.key" -out "$SSL_DIR/origin.crt" >/dev/null 2>&1
        chmod 600 "$SSL_DIR/origin.key"
    fi
    ln -sfn "$SSL_DIR/origin.crt" "$SSL_DIR/fullchain.pem"
    ln -sfn "$SSL_DIR/origin.key" "$SSL_DIR/privkey.pem"
fi
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
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://horizonadvertising.co.uk$request_uri; }\n}\n';p.write_text(s)
PYCONF
    fi
    cat "$SCRIPT_DIR/nginx-https.conf" >> "$SITE"
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'Horizon Advertising nginx configuration rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs advertising; fi
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null
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
        # Standard-library fallback for hosts without the optional dig command.
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

if ! has_web_dns "$DOMAIN"; then
    echo 'Horizon Advertising installed and running in PM2. Public DNS and SSL are pending.'
    echo 'Ensure A @ points to 217.154.34.205 in the horizonadvertising.co.uk DNS zone.'
    echo 'Then rerun: sudo bash horizon-advertising/install.sh'
    exit 0
fi
# Avoid repeated ACME failures when a proxy is serving a different origin or swallowing challenges.
PROBE="hn-probe-$(openssl rand -hex 12)"
mkdir -p "$CHALLENGE_DIR/.well-known/acme-challenge"
printf '%s' "$PROBE" > "$CHALLENGE_DIR/.well-known/acme-challenge/$PROBE"
PROBE_REPLY="$(curl -fsS --max-time 15 "http://$DOMAIN/.well-known/acme-challenge/$PROBE" 2>/dev/null || true)"
rm -f "$CHALLENGE_DIR/.well-known/acme-challenge/$PROBE"
if [ "$PROBE_REPLY" != "$PROBE" ]; then
    echo 'Advertising is running, but public certificate challenges do not reach this VPS.'
    echo 'Set A @ -> 217.154.34.205 in horizonadvertising.co.uk to DNS only, then rerun this installer.'
    exit 1
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx' || { echo 'Origin TLS is prepared, but a trusted certificate is still pending. Temporarily set the Advertising A record to DNS only and rerun this installer.'; exit 1; }
ln -sfn "$LE_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
ln -sfn "$LE_DIR/privkey.pem" "$SSL_DIR/privkey.pem"
write_config
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer; fi
echo 'Horizon Advertising installed with HTTPS: https://horizonadvertising.co.uk · PM2 ha-website · port 3100.'
