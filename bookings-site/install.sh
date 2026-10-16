#!/usr/bin/env bash
# Installs or updates bookings.hngroup.org.uk only (PM2 hn-bookings, port 4930). Data in /var/lib/hn-bookings is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
