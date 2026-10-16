#!/usr/bin/env bash
# Installs or updates domains.horizon-network.co.uk only (PM2 hn-domains, port 5120). Data in /var/lib/hn-domains is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
