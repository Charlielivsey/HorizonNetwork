#!/usr/bin/env bash
# Installs or updates brand.hngroup.org.uk only (PM2 hn-brand, port 4820). Data in /var/lib/hn-brand is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
