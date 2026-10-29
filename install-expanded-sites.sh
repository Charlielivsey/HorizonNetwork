#!/usr/bin/env bash
# New websites and their narrow Auth integration only; existing public sites stay running.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" = 0 ] || { echo 'Run with sudo.'; exit 1; }
bash "$ROOT/auth-site/install.sh" "${1:-}" || exit 1
failed=0
for site in media holding development support clients careers news; do
    bash "$ROOT/$site-site/install.sh" "${1:-}" || failed=1
done
bash "$ROOT/links-site/install.sh" "${1:-}" || failed=1
exit "$failed"
