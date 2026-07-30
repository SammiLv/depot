#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

load_production_config "${1:-}" "${2:-}"
require_command node
require_command npm

if [[ -e "$KPI_RUN_DIR" ]]; then
  fail "Run directory already exists; use a new run ID: $KPI_RUN_DIR"
fi
mkdir -p "$KPI_RUN_DIR"

print_run_summary
echo "Step 01: read-only production preflight"

npm run kpi:migration:preflight -- \
  --database "$KPI_PROD_DB" \
  --output "$KPI_PREFLIGHT_REPORT" | tee "$KPI_PREFLIGHT_LOG"

echo
echo "Step 01: migration dry-run"
npm run kpi:migration:run -- \
  --database "$KPI_PROD_DB" | tee -a "$KPI_PREFLIGHT_LOG"

write_marker "01-preflight.ok"
echo "Step 01 completed: $KPI_PREFLIGHT_REPORT"
