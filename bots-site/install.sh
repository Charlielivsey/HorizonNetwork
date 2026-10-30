#!/usr/bin/env bash
# Isolated HN Group Bots site (bots.hngroup.org.uk). Keeps its data (/var/lib/hn-bots) and every other service.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=bots.hngroup.org.uk
EMAIL="${1:-}"
SITE=/etc/nginx/sites-available/hn-bots
ENABLED=/etc/nginx/sites-enabled/hn-bots
CHALLENGE_DIR=/var/www/hn-bots-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 openssl; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
for file in server.js lib/auth.js lib/sessions.js public/assets/bots.js; do node --check "$SCRIPT_DIR/$file"; done
if python3 -c 'import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(("127.0.0.1",5600)))'; then
    if ! pm2 describe hn-bots >/dev/null 2>&1; then
        echo 'BOTS NOT INSTALLED: port 5600 is used by another program:'; ss -ltnp 'sport = :5600' 2>/dev/null || true
        echo 'Stop that program, then run: sudo bash bots-site/install.sh'; exit 1
    fi
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]bots\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then
        echo "Another host serves $DOMAIN: $config. No changes made."; exit 1
    fi
done
mkdir -p /var/lib/hn-bots /opt/hn-bots "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 700 /var/lib/hn-bots
rm -rf /opt/hn-bots/lib /opt/hn-bots/public
cp "$SCRIPT_DIR/server.js" /opt/hn-bots/server.js
cp -r "$SCRIPT_DIR/lib" "$SCRIPT_DIR/public" /opt/hn-bots/
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:5600/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
if [ "$healthy" != 1 ]; then
    echo 'BOTS NOT INSTALLED: the bots service did not start. Its last log lines:'
    pm2 logs hn-bots --lines 25 --nostream 2>/dev/null || true
    exit 1
fi
[ -f /var/lib/hn-status-sso/secret ] || echo "Note: HN Group Auth isn’t integrated on this server yet, so signing in to Bots won’t work until auth-site/install.sh has run."
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
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://bots.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
PYCONF
        cat "$SCRIPT_DIR/nginx-https.conf" >> "$SITE"
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'BOTS NOT INSTALLED: nginx refused the configuration (see above), so it was rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
# Checks the site through nginx, the way visitors reach it, and says plainly what's wrong if it doesn't answer.
verify_public() {
    local answer scheme=http
    if [ -f "$LE_DIR/fullchain.pem" ]; then scheme=https
        answer="$(curl -sk --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/healthz" || true)"
    else answer="$(curl -s --max-time 5 -H "Host: $DOMAIN" "http://127.0.0.1/healthz" || true)"; fi
    if printf '%s' "$answer" | grep -q '"service":"hn-bots"'; then
        if printf '%s' "$answer" | grep -q '"ok":true'; then echo "HN Group Bots is working: $scheme://$DOMAIN · PM2 hn-bots · port 5600."
        else echo "HN Group Bots answers at $scheme://$DOMAIN but is missing something: $answer"; fi
    else
        echo "BOTS NOT REACHABLE: nginx didn't hand $scheme://$DOMAIN to the bots service (it answered: ${answer:0:200})."
        echo 'Check: sudo nginx -T | grep -n bots ; ls -l /etc/nginx/sites-enabled/hn-bots'; exit 1
    fi
}
# Website control may not know this site until admin-site/install.sh runs (install.sh runs it last).
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs bots 2>/dev/null || echo "Note: website control will pick up the bots site when admin-site/install.sh runs."; fi
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
    echo 'Bots installed and running in PM2. Public DNS and SSL are pending.'
    echo 'Add A bots -> 217.154.34.205 (DNS only) in the hngroup.org.uk DNS zone.'
    echo 'Then rerun: sudo bash bots-site/install.sh'
    verify_public
    exit 0
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
if [ ! -f "$LE_DIR/fullchain.pem" ] || [ "${HN_RENEW_SSL:-0}" = 1 ]; then
certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx' || { echo 'SSL issuance failed. Check DNS and rerun: sudo bash bots-site/install.sh'; exit 1; }
fi
write_config
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer; fi
verify_public
