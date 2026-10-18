#!/usr/bin/env bash
# Install or update only the HN Group VPN: the WireGuard server (interface wg-hn, UDP 51820, all
# traffic routed through this server) and vpn.hngroup.org.uk, where staff sign in with their staff
# account to register devices (PM2 hn-vpn, port 5000, data /var/lib/hn-vpn). Other websites, Auth
# and staff services are untouched. Device registrations, the server key and the published Mac app
# are kept across updates.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=vpn.hngroup.org.uk
EMAIL="${1:-}"
SITE=/etc/nginx/sites-available/hn-vpn
ENABLED=/etc/nginx/sites-enabled/hn-vpn
CHALLENGE_DIR=/var/www/hn-vpn-acme
LE_DIR="/etc/letsencrypt/live/$DOMAIN"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot curl python3 openssl ip iptables; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool"; exit 1; }; done
for file in server.js lib/store.js lib/staff.js lib/wg.js lib/auth.js lib/macapp.js public/assets/vpn.js; do node --check "$SCRIPT_DIR/$file"; done
if python3 -c 'import socket;s=socket.socket();s.settimeout(2);exit(s.connect_ex(("127.0.0.1",5000)))'; then
    pm2 describe hn-vpn >/dev/null 2>&1 || { echo 'Port 5000 belongs to another service. No changes made.'; exit 1; }
fi
for config in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$config" ] || continue
    [ "$config" = "$ENABLED" ] && continue
    if grep -Eq 'server_name[^;]*[[:space:]]vpn\.hngroup\.org\.uk([[:space:];]|$)' "$config"; then
        echo "Another host serves $DOMAIN: $config. No changes made."; exit 1
    fi
done

# ---------- WireGuard ----------
if ! command -v wg >/dev/null || ! command -v wg-quick >/dev/null; then
    echo 'Installing WireGuard tools...'
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q wireguard-tools >/dev/null
fi
install -d -m 700 /etc/wireguard
if [ ! -s /etc/wireguard/hn-vpn.key ]; then (umask 077; wg genkey > /etc/wireguard/hn-vpn.key); fi
WAN="$(ip -4 route show default | awk '{for(i=1;i<NF;i++) if($i=="dev"){print $(i+1); exit}}')"
[ -n "$WAN" ] || { echo 'Could not find the server’s internet interface. No VPN changes made.'; exit 1; }
WG_CONF=/etc/wireguard/wg-hn.conf
NEW_CONF="$(mktemp)"
cat > "$NEW_CONF" <<WGCONF
# HN Group VPN (managed by vpn-site/install.sh). Peers are added by the hn-vpn service.
[Interface]
Address = 10.88.0.1/24, fd88:88::1/64
ListenPort = 51820
PostUp = wg set %i private-key /etc/wireguard/hn-vpn.key
PostUp = iptables -t nat -A POSTROUTING -s 10.88.0.0/24 -o $WAN -j MASQUERADE
PostUp = iptables -I FORWARD 1 -i %i -o $WAN -j ACCEPT
PostUp = iptables -I FORWARD 1 -i $WAN -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
PostUp = iptables -t mangle -A FORWARD -o %i -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PostDown = iptables -t nat -D POSTROUTING -s 10.88.0.0/24 -o $WAN -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -o $WAN -j ACCEPT
PostDown = iptables -D FORWARD -i $WAN -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
PostDown = iptables -t mangle -D FORWARD -o %i -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
WGCONF
WG_CHANGED=0
if ! cmp -s "$NEW_CONF" "$WG_CONF"; then install -m 600 "$NEW_CONF" "$WG_CONF"; WG_CHANGED=1; fi
rm -f "$NEW_CONF"
# Forward IPv4 for VPN devices. IPv6 isn't forwarded: devices send it into the tunnel, where it
# stops, so it can't leak around the VPN.
printf 'net.ipv4.ip_forward = 1\n' > /etc/sysctl.d/99-hn-vpn.conf
sysctl -q -p /etc/sysctl.d/99-hn-vpn.conf
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then ufw allow 51820/udp >/dev/null; fi
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then firewall-cmd -q --permanent --add-port=51820/udp && firewall-cmd -q --reload; fi
systemctl enable wg-quick@wg-hn >/dev/null 2>&1
if [ "$WG_CHANGED" = 1 ] && systemctl is-active --quiet wg-quick@wg-hn; then systemctl restart wg-quick@wg-hn; else systemctl start wg-quick@wg-hn; fi
systemctl is-active --quiet wg-quick@wg-hn || { echo 'The WireGuard interface did not start (see: journalctl -u wg-quick@wg-hn).'; exit 1; }

# ---------- vpn.hngroup.org.uk ----------
mkdir -p /opt/hn-vpn "$CHALLENGE_DIR" /etc/nginx/sites-available /etc/nginx/sites-enabled
install -d -m 700 /var/lib/hn-vpn
rm -rf /opt/hn-vpn/lib /opt/hn-vpn/public
cp "$SCRIPT_DIR/server.js" /opt/hn-vpn/server.js
cp -r "$SCRIPT_DIR/lib" "$SCRIPT_DIR/public" /opt/hn-vpn/
# The Mac app built by GitHub Actions (mac-vpn-app/) is published for staff to download.
if [ -f "$SCRIPT_DIR/mac-app/HN-Group-VPN-macOS.zip" ]; then install -m 600 "$SCRIPT_DIR/mac-app/HN-Group-VPN-macOS.zip" /var/lib/hn-vpn/HN-Group-VPN-macOS.zip; fi
# The service re-adds every registered device to the interface when it starts.
pm2 startOrRestart "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
healthy=0
for attempt in {1..15}; do
    if curl -fsS --max-time 2 http://127.0.0.1:5000/healthz >/dev/null; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" = 1 ] || { echo 'The VPN service did not start (see: pm2 logs hn-vpn). Nginx was left unchanged.'; exit 1; }
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
p=Path(sys.argv[1]);s=p.read_text();s=s[:s.index('    location / {')]+'    location / { return 301 https://vpn.hngroup.org.uk$request_uri; }\n}\n';p.write_text(s)
PYCONF
        cat "$SCRIPT_DIR/nginx-https.conf" >> "$SITE"
    fi
    if [ ! -s /proc/net/if_inet6 ]; then sed -i '/listen \[::\]/d' "$SITE"; fi
    ln -sfn "$SITE" "$ENABLED"
    if ! nginx -t; then
        if [ -f "$BACKUP/site" ]; then cp "$BACKUP/site" "$SITE"; else rm -f "$SITE"; fi
        [ "$WAS_ENABLED" = 1 ] || rm -f "$ENABLED"
        echo 'VPN nginx configuration rolled back.'; exit 1
    fi
    systemctl reload nginx
}
write_config
# Website control may not know this site until admin-site/install.sh runs (install.sh runs it last).
if [ -f /opt/hn-admin/reconcile-power.cjs ]; then node /opt/hn-admin/reconcile-power.cjs vpn 2>/dev/null || echo "Note: website control will pick up the VPN site when admin-site/install.sh runs."; fi
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
    echo 'VPN installed (WireGuard on UDP 51820, PM2 hn-vpn). Public DNS and SSL for the website are pending.'
    echo 'Add A vpn -> 217.154.34.205 (DNS only) in the hngroup.org.uk DNS zone.'
    echo 'Then rerun: sudo bash vpn-site/install.sh'
    exit 0
fi
CERT_ARGS=()
if [ -n "$EMAIL" ]; then CERT_ARGS+=(--email "$EMAIL"); fi
certbot certonly --webroot -w "$CHALLENGE_DIR" -d "$DOMAIN" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring "${CERT_ARGS[@]}" \
    --deploy-hook 'nginx -t && systemctl reload nginx' || { echo 'SSL issuance failed. Check DNS and rerun: sudo bash vpn-site/install.sh'; exit 1; }
write_config
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q certbot.timer; then systemctl enable --now certbot.timer; fi
echo 'HN Group VPN installed: https://vpn.hngroup.org.uk · PM2 hn-vpn · port 5000 · WireGuard wg-hn on UDP 51820.'
echo 'If your hosting provider has its own firewall (for example the IONOS Cloud Panel), allow incoming UDP port 51820 there too.'
