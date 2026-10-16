#!/usr/bin/env bash
# Installs or updates developers.hngroup.org.uk only (PM2 hn-developers, port 5010). Data in /var/lib/hn-developers is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
