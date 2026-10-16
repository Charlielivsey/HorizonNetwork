#!/usr/bin/env bash
# Installs or updates learn.hngroup.org.uk only (PM2 hn-learn, port 4890). Data in /var/lib/hn-learn is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
