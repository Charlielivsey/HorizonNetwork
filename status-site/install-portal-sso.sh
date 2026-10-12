#!/usr/bin/env bash
# Apply only the staff portal files needed for status sign-in. Never run the staff/public installers.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/../staff-portal"
PORTAL=/opt/hn-staff-portal
SECRET_DIR=/var/lib/hn-status-sso
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
if [ ! -f "$PORTAL/server.js" ] || [ ! -f "$PORTAL/public/assets/login.js" ] || ! pm2 describe hn-staff-portal >/dev/null 2>&1; then
    echo 'The existing staff portal must be installed and managed by PM2 as hn-staff-portal before connecting status sign-in.'
    exit 1
fi
node --check "$SOURCE/server.js"
node --check "$SOURCE/lib/status-sso.js"
node --check "$SOURCE/public/assets/login.js"
mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"
if [ ! -f "$SECRET_DIR/secret" ]; then
    (umask 077; openssl rand -hex 32 > "$SECRET_DIR/secret")
fi
chmod 600 "$SECRET_DIR/secret"
# Skip restarting the portal on future status-only updates if these integration files match.
if cmp -s "$SOURCE/server.js" "$PORTAL/server.js" && \
   cmp -s "$SOURCE/lib/status-sso.js" "$PORTAL/lib/status-sso.js" && \
   cmp -s "$SOURCE/public/assets/login.js" "$PORTAL/public/assets/login.js"; then
    echo 'Staff portal status sign-in is already up to date.'
    exit 0
fi
BACKUP="$(mktemp -d /var/lib/hn-status-sso/portal-backup-XXXXXX)"
cp "$PORTAL/server.js" "$BACKUP/server.js"
cp "$PORTAL/public/assets/login.js" "$BACKUP/login.js"
[ ! -f "$PORTAL/lib/status-sso.js" ] || cp "$PORTAL/lib/status-sso.js" "$BACKUP/status-sso.js"
cp "$SOURCE/lib/status-sso.js" "$PORTAL/lib/status-sso.js"
cp "$SOURCE/server.js" "$PORTAL/server.js"
cp "$SOURCE/public/assets/login.js" "$PORTAL/public/assets/login.js"
healthy=0
if pm2 restart hn-staff-portal; then
    for attempt in {1..15}; do
        if curl -fsS --max-time 2 http://127.0.0.1:3200/healthz >/dev/null; then healthy=1; break; fi
        sleep 1
    done
fi
if [ "$healthy" != 1 ]; then
    cp "$BACKUP/server.js" "$PORTAL/server.js"
    cp "$BACKUP/login.js" "$PORTAL/public/assets/login.js"
    if [ -f "$BACKUP/status-sso.js" ]; then cp "$BACKUP/status-sso.js" "$PORTAL/lib/status-sso.js"; else rm -f "$PORTAL/lib/status-sso.js"; fi
    pm2 restart hn-staff-portal || true
    echo "Staff sign-in integration failed; previous portal files restored. Backup: $BACKUP"
    exit 1
fi
echo "Staff portal sign-in connected. Integration backup: $BACKUP"
