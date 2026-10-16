#!/usr/bin/env bash
# Installs or updates projects.hngroup.org.uk only (PM2 hn-projects, port 4810). Data in /var/lib/hn-projects is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
