#!/usr/bin/env bash
# Installs or updates billing.hngroup.org.uk only (PM2 hn-billing, port 4800). Data in /var/lib/hn-billing is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
