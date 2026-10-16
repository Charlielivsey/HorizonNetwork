#!/usr/bin/env bash
# Installs or updates reports.hngroup.org.uk only (PM2 hn-reports, port 5030). Data in /var/lib/hn-reports is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
