#!/usr/bin/env bash
# Install only oldstaffportal.hngroup.org.uk: the staff portal as it was just before its sign-in moved to HN Group Auth
# (13 October 2026, commit 68caec7), exactly as it was, beside everything else (the user's request, 3 November 2026). It shares nothing with the real staff portal (own folder, port 5640, PM2
# hn-old-staff-portal, data in /var/lib/hn-old-staff-portal) and is deliberately not on website control, Links, Status,
# the browser or anywhere else (the user's request, 3 November 2026). Other websites are untouched.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=oldstaffportal.hngroup.org.uk
EMAIL="${1:-}"
APP=/opt/hn-old-staff-portal
DATA=/var/lib/hn-old-staff-portal
PORT=5640
NAME=hn-old-staff-portal
SITE=/etc/nginx/sites-available/hn-old-staff-portal
ENABLED=/etc/nginx/sites-enabled/hn-old-staff-portal
CHALLENGE_DIR=/var/www/hn-old-staff-portal-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 openssl; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
for f in "$SCRIPT_DIR/app/server.js" "$SCRIPT_DIR"/app/lib/*.js; do node --check "$f"; done
if python3 -c "import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(('127.0.0.1',$PORT)))"; then
    pm2 describe "$NAME" >/dev/null 2>&1 || { echo "Port $PORT belongs to another service. No changes made."; exit 1; }
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]oldstaffportal\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then
        echo "Another host serves $DOMAIN: $config. No changes made."; exit 1
    fi
done

mkdir -p "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
install -d -m 700 "$DATA"
# The app folder is replaced as a whole, so nothing from an earlier old-portal version is left behind.
rm -rf "$APP.new" && mkdir -p "$APP.new"
cp -r "$SCRIPT_DIR/app/." "$APP.new/"
rm -rf "$APP.old" && { [ ! -d "$APP" ] || mv "$APP" "$APP.old"; } && mv "$APP.new" "$APP" && rm -rf "$APP.old"

# This version makes admin@hngroup.org.uk / admin the first time it starts. On a public address that would let anyone
# in, so the account is made here first (with the portal's own code) with a random password, shown once below.
NEW_PASSWORD=""
if [ ! -f "$DATA/people.json" ]; then
    pm2 stop "$NAME" >/dev/null 2>&1 || true
    NEW_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
    (cd "$APP" && HN_PASSWORD="$NEW_PASSWORD" DATA_DIR="$DATA" node -e '
const store=require("./lib/store");store.init(process.env.DATA_DIR);
const admin=store.findSystemAccount(store.ADMIN_USERNAME);if(!admin){console.error("No admin account was made.");process.exit(1);}
store.setPassword(admin,process.env.HN_PASSWORD);admin.account.enabled=true;admin.account.mustChangePassword=true;delete admin.account.code;store.savePeople();process.exit(0);')
fi

pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'The old staff portal did not start. Nginx was left unchanged.'; exit 1; }

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
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://oldstaffportal.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
PYCONF
        cat "$SCRIPT_DIR/nginx-https.conf" >> "$SITE"
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'Old staff portal nginx configuration rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
pm2 save
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root; fi
systemctl enable pm2-root >/dev/null

show_password() {
    if [ -n "$NEW_PASSWORD" ]; then
        echo
        echo '  Old staff portal sign-in (shown once; you will be asked to change it):'
        echo '    Email: admin@hngroup.org.uk'
        echo "    Password: $NEW_PASSWORD"
        echo
    fi
}

if [ ! -f "$LE_DIR/fullchain.pem" ]; then
    CERT_ARGS=()
    if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
    if ! certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
        --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
        --deploy-hook 'nginx -t && systemctl reload nginx'; then
        echo "Old staff portal is running on http://$DOMAIN, but HTTPS couldn't be set up yet."
        echo "Check the DNS record (A oldstaffportal -> 217.154.34.205, DNS only) and rerun: sudo bash old-staff-portal-site/install.sh"
        show_password
        exit 0
    fi
    write_config
fi
echo "Old staff portal installed: https://$DOMAIN · PM2 $NAME · port $PORT."
show_password
