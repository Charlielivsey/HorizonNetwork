#!/usr/bin/env bash
# Installs or updates panel.horizon-network.co.uk only (PM2 hn-panel, port 5100). Data in /var/lib/hn-panel is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
