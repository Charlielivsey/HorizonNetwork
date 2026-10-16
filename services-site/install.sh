#!/usr/bin/env bash
# Installs or updates services.hngroup.org.uk only (PM2 hn-services, port 4870). Data in /var/lib/hn-services is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
