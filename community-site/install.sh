#!/usr/bin/env bash
# Installs or updates community.hngroup.org.uk only (PM2 hn-community, port 4920). Data in /var/lib/hn-community is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
