#!/usr/bin/env bash
# Installs or updates competitions.hngroup.org.uk only (PM2 hn-competitions, port 5070). Data in /var/lib/hn-competitions is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
