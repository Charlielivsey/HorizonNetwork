#!/usr/bin/env bash
# Installs or updates partners.hngroup.org.uk only (PM2 hn-partners, port 4860). Data in /var/lib/hn-partners is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
