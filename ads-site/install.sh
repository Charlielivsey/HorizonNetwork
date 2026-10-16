#!/usr/bin/env bash
# Installs or updates ads.horizonetwork.com only (PM2 hn-ads, port 5150). Data in /var/lib/hn-ads is preserved.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../service-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
