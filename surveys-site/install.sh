#!/usr/bin/env bash
# Installs or updates surveys.hngroup.org.uk only (PM2 hn-surveys, port 4950). Data in /var/lib/hn-surveys is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
