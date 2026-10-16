#!/usr/bin/env bash
# Installs or updates expenses.hngroup.org.uk only (PM2 hn-expenses, port 4980). Data in /var/lib/hn-expenses is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
