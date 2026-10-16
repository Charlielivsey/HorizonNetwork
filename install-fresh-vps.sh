#!/usr/bin/env bash
# Rebuild every original HN Group website on a freshly installed Ubuntu VPS.
#
#   sudo bash install-fresh-vps.sh you@hngroup.org.uk
#
# The email registers this server with Let's Encrypt for SSL certificates. Each site is installed
# with its own isolated installer, in dependency order; a failing step is reported and the rest
# continue. Safe to re-run: existing data and certificates are kept. Output is also written to
# /var/log/hn-fresh-install.log. After this first run, updates use: git pull && sudo bash install.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
EMAIL="${1:-}"
LOG=/var/log/hn-fresh-install.log
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
[ -n "$EMAIL" ] || { echo 'Usage: sudo bash install-fresh-vps.sh you@hngroup.org.uk'; exit 1; }
exec > >(tee -a "$LOG") 2>&1
echo "=== HN Group fresh install $(date -Is) ==="

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg nginx certbot python3-certbot-nginx openssl python3 dnsutils
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
command -v pm2 >/dev/null || npm install -g pm2
[ -f /etc/systemd/system/pm2-root.service ] || pm2 startup systemd -u root --hp /root
systemctl enable --now nginx
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
# Small VPS plans can run out of memory while starting every site; add swap only if there is none.
if [ -z "$(swapon --noheadings 2>/dev/null)" ] && [ ! -e /swapfile ]; then
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile \
        && echo '/swapfile none swap sw 0 0' >> /etc/fstab && echo 'Added a 2 GB swap file.'
fi
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
    ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null
fi

# Install every website.
bash "$ROOT/install.sh" "$EMAIL"
echo 'Default staff login on a new server: admin@hngroup.org.uk / admin (change it straight away in Settings → Security)'
