#!/usr/bin/env bash
# Installs or updates procurement.hngroup.org.uk only (PM2 hn-procurement, port 4970). Data in /var/lib/hn-procurement is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
