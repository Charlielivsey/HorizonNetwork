#!/usr/bin/env bash
# Install or update every HN Group website on this VPS. The standard command after any change is:
#
#   cd /root/HorizonNetwork && git pull && sudo bash install.sh
#
# Each site uses its own isolated installer, in dependency order; a failing step is reported and
# the rest continue. Safe to re-run: website data in /var/lib and certificates are kept.
# Output is also written to /var/log/hn-install.log. (A brand-new server needs
# install-fresh-vps.sh once first, which installs nginx, Node.js and PM2 and then runs this.)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
EMAIL="${1:-charlie.livsey@hngroup.org.uk}"
LOG=/var/log/hn-install.log
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
for tool in node pm2 nginx certbot; do command -v "$tool" >/dev/null || { echo "$tool is missing. On a new server run: sudo bash install-fresh-vps.sh $EMAIL"; exit 1; }; done
exec > >(tee -a "$LOG") 2>&1
echo "=== HN Group install $(date -Is) ($(git -C "$ROOT" log -1 --format='%h %s' 2>/dev/null)) ==="

# Updates don't contact Let's Encrypt for certificates that already exist: certbot.timer renews them
# automatically. A small certbot wrapper reuses an existing certificate straight away and only asks
# Let's Encrypt for new ones. Set HN_RENEW_SSL=1 to make every installer check its certificate.
if [ "${HN_RENEW_SSL:-0}" != 1 ] && REAL_CERTBOT="$(command -v certbot)"; then
    SHIM_DIR="$(mktemp -d)"
    trap 'rm -rf "$SHIM_DIR"' EXIT
    cat > "$SHIM_DIR/certbot" <<SHIM
#!/usr/bin/env bash
name=""; nginx=0; prev=""
for arg in "\$@"; do
    case "\$prev" in --cert-name) name="\$arg" ;; -d) [ -n "\$name" ] || name="\$arg" ;; esac
    [ "\$arg" = --nginx ] && nginx=1
    prev="\$arg"
done
if [ "\${1:-}" != install ] && [ -n "\$name" ] && [ -f "/etc/letsencrypt/live/\$name/fullchain.pem" ]; then
    echo "SSL certificate for \$name is already in place (it renews automatically)."
    # The staff portal's nginx file is rewritten on install, so put its existing certificate back in.
    if [ "\$nginx" = 1 ]; then exec "$REAL_CERTBOT" install --nginx --cert-name "\$name" --redirect --non-interactive; fi
    exit 0
fi
exec "$REAL_CERTBOT" "\$@"
SHIM
    chmod +x "$SHIM_DIR/certbot"
    export PATH="$SHIM_DIR:$PATH"
fi

FAILED=()
step() {
    local name="$1"; shift
    echo; echo "=================== $name ==================="
    if "$@"; then echo "[OK] $name"; else echo "[FAILED] $name"; FAILED+=("$name"); fi
}
# The staff portal comes first: it also installs hngroup.org.uk, its /admin panel and HN Group Auth.
step 'Staff portal + hngroup.org.uk + Auth' bash "$ROOT/staff-portal/install.sh" staff.hngroup.org.uk "$EMAIL"
step 'Status' bash "$ROOT/status-site/install.sh" "$EMAIL"
step 'Horizon Network (+ horizonetwork.com)' bash "$ROOT/horizon-network-site/install.sh" "$EMAIL"
step 'Wiki' bash "$ROOT/wiki-site/install.sh" "$EMAIL"
for site in media holding development support clients careers docs news; do
    step "$site" bash "$ROOT/$site-site/install.sh" "$EMAIL"
done
step 'Horizon Advertising' bash "$ROOT/horizon-advertising/install.sh" "$EMAIL"
step 'Links' bash "$ROOT/links-site/install.sh" "$EMAIL"
step 'Brand centre (branding.hngroup.org.uk)' bash "$ROOT/branding-site/install.sh" "$EMAIL"
# Central control goes last so it adds maintenance gates for every site installed above.
step 'Website control (admin.hngroup.org.uk)' bash "$ROOT/admin-site/install.sh" "$EMAIL"
pm2 save

echo; echo '=================== Summary ==================='
pm2 ls
if [ "${#FAILED[@]}" -eq 0 ]; then
    echo 'Every step completed.'
else
    echo "Steps needing attention: ${FAILED[*]}"
    echo "Fix the cause shown above, then re-run: cd $ROOT && sudo bash install.sh"
fi
echo
echo 'Staff portal: https://staff.hngroup.org.uk'
echo "Full log: $LOG"
