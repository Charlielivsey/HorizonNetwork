#!/usr/bin/env bash
# Installs or updates labs.hngroup.org.uk only (PM2 hn-labs, port 5020). Data in /var/lib/hn-labs is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
