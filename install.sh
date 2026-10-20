#!/usr/bin/env bash
# Install or update every HN Group website on this VPS. The standard command after any change is:
#
#   cd /root/HorizonNetwork && git pull && sudo bash install.sh
#
# Only websites whose files changed since the last successful run are updated and restarted;
# add --all to update every website.
#
# Each site uses its own isolated installer, in dependency order; a failing step is reported and
# the rest continue. Safe to re-run: website data in /var/lib and certificates are kept.
# Output is also written to /var/log/hn-install.log. (A brand-new server needs
# install-fresh-vps.sh once first, which installs nginx, Node.js and PM2 and then runs this.)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
EMAIL=charlie.livsey@hngroup.org.uk
for arg in "$@"; do case "$arg" in --*) ;; *) EMAIL="$arg" ;; esac; done
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
# Only the sites whose files changed since the last successful install are updated (and so
# restarted). The installed version is remembered in $STATE_FILE. Run with --all (or on a server
# with no record yet) to update every site.
STATE_DIR=/var/lib/hn-install
STATE_FILE="$STATE_DIR/last-installed-commit"
HEAD_COMMIT="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
LAST_COMMIT="$(cat "$STATE_FILE" 2>/dev/null || true)"
FULL=0
case " $* " in *" --all "*) FULL=1 ;; esac
if [ "$FULL" = 0 ] && { [ -z "$LAST_COMMIT" ] || ! git -C "$ROOT" cat-file -e "$LAST_COMMIT^{commit}" 2>/dev/null; }; then FULL=1; fi
CHANGED=""
if [ "$FULL" = 1 ]; then
    echo "Updating every website."
else
    CHANGED="$(git -C "$ROOT" diff --name-only "$LAST_COMMIT" "$HEAD_COMMIT")"
    if [ -z "$CHANGED" ]; then echo "Nothing has changed since the last install ($(git -C "$ROOT" log -1 --format='%h %s' "$LAST_COMMIT")). No sites restarted."; exit 0; fi
    echo "Changed since the last install:"; printf '%s\n' "$CHANGED" | sed 's/^/  /' | head -40
fi
# changed PATH... — true when any changed file is inside one of the given folders (or on a full run).
changed() {
    [ "$FULL" = 1 ] && return 0
    local prefix
    for prefix in "$@"; do printf '%s\n' "$CHANGED" | grep -q "^$prefix" && return 0; done
    return 1
}
RAN=0
run() { RAN=$((RAN + 1)); step "$@"; }

# The staff portal comes first. A full run also installs hngroup.org.uk, its /admin panel and Auth.
if [ "$FULL" = 1 ]; then
    run 'Staff portal + hngroup.org.uk + Auth' bash "$ROOT/staff-portal/install.sh" staff.hngroup.org.uk "$EMAIL"
else
    changed staff-portal/ && run 'Staff portal' env SKIP_WEBSITE=1 bash "$ROOT/staff-portal/install.sh" staff.hngroup.org.uk "$EMAIL"
    changed hngroup-site/ && run 'hngroup.org.uk' bash "$ROOT/hngroup-site/install.sh" "$EMAIL"
    changed auth-site/ status-site/install-portal-sso.sh && run 'HN Group Auth' bash "$ROOT/auth-site/install.sh" "$EMAIL"
fi
changed status-site/ && run 'Status' bash "$ROOT/status-site/install.sh" "$EMAIL"
changed horizon-network-site/ && run 'Horizon Network (+ horizonetwork.com)' bash "$ROOT/horizon-network-site/install.sh" "$EMAIL"
changed wiki-site/ && run 'Wiki' bash "$ROOT/wiki-site/install.sh" "$EMAIL"
for site in media holding development support clients careers docs news; do
    changed "$site-site/" website-suite/ && run "$site" bash "$ROOT/$site-site/install.sh" "$EMAIL"
done
changed horizon-advertising/ && run 'Horizon Advertising' bash "$ROOT/horizon-advertising/install.sh" "$EMAIL"
changed links-site/ && run 'Links' bash "$ROOT/links-site/install.sh" "$EMAIL"
changed branding-site/ && run 'Brand centre (branding.hngroup.org.uk)' bash "$ROOT/branding-site/install.sh" "$EMAIL"
changed companies-site/ && run 'Company register (companies.hngroup.org.uk)' bash "$ROOT/companies-site/install.sh" "$EMAIL"
changed investors-site/ && run 'Investors (investors.hngroup.org.uk)' bash "$ROOT/investors-site/install.sh" "$EMAIL"
changed vpn-site/ && run 'VPN (vpn.hngroup.org.uk + WireGuard)' bash "$ROOT/vpn-site/install.sh" "$EMAIL"
changed downloads-site/ && run 'Downloads (downloads.hngroup.org.uk)' bash "$ROOT/downloads-site/install.sh" "$EMAIL"
# Central control goes last so it adds maintenance gates for every site installed above.
changed admin-site/ && run 'Website control (admin.hngroup.org.uk)' bash "$ROOT/admin-site/install.sh" "$EMAIL"
[ "$RAN" = 0 ] && echo "The changes don't affect any website (for example documentation only). No sites restarted."
pm2 save >/dev/null

echo; echo '=================== Summary ==================='
pm2 ls
if [ "${#FAILED[@]}" -eq 0 ]; then
    echo 'Every step completed.'
    # Remember what's installed, so the next run only updates what changes after this.
    mkdir -p "$STATE_DIR" && printf '%s\n' "$HEAD_COMMIT" > "$STATE_FILE"
else
    echo "Steps needing attention: ${FAILED[*]}"
    echo "Fix the cause shown above, then re-run: cd $ROOT && sudo bash install.sh (the same sites will be updated again)"
fi
echo
echo 'Staff portal: https://staff.hngroup.org.uk'
echo "Full log: $LOG"
