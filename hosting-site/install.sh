#!/usr/bin/env bash
# Installs or updates hosting.horizon-network.co.uk only (PM2 hn-hosting, port 5090). Data in /var/lib/hn-hosting is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
