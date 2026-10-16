#!/usr/bin/env bash
# Installs or updates status.horizon-network.co.uk only (PM2 hn-netstatus, port 5110). Data in /var/lib/hn-netstatus is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
