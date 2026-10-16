#!/usr/bin/env bash
# Installs or updates vault.hngroup.org.uk only (PM2 hn-vault, port 5050). Data in /var/lib/hn-vault is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
