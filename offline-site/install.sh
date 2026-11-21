#!/usr/bin/env bash
# Shared static outage pages only: no PM2 operations or nginx reload.
set -euo pipefail
HN_OFFLINE_ROOT="$(cd "$(dirname "$0")" && pwd)"
node "$HN_OFFLINE_ROOT/build.cjs" /var/www/hn-offline
install -d -m 755 /etc/nginx/hn-offline/enabled
install -m 644 "$HN_OFFLINE_ROOT/nginx.conf" /etc/nginx/hn-offline/enabled/fallback.conf
