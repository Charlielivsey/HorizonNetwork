#!/usr/bin/env bash
# Installs or updates order.horizon-network.co.uk only (PM2 hn-order, port 5180). Data in /var/lib/hn-order is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
