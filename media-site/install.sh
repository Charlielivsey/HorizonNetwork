#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../website-suite/install.sh" "$SCRIPT_DIR" "${1:-}"
