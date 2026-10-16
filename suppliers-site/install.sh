#!/usr/bin/env bash
# Installs or updates suppliers.hngroup.org.uk only (PM2 hn-suppliers, port 4960). Data in /var/lib/hn-suppliers is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
