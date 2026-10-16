#!/usr/bin/env bash
# Installs or updates sign.hngroup.org.uk only (PM2 hn-sign, port 5040). Data in /var/lib/hn-sign is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
