#!/usr/bin/env bash
# Installs or updates licenses.hngroup.org.uk only (PM2 hn-licenses, port 4990). Data in /var/lib/hn-licenses is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
