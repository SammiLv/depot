#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

load_production_config "${1:-}" "${2:-}"
require_run_directory
require_marker "05-history-and-deploy.ok"

echo "Step 06: verify preserved data, cleared KPI data, schema, and migration history"
npm run kpi:migration:verify -- \
  --database "$KPI_PROD_DB" \
  --baseline "$KPI_BASELINE_REPORT" \
  --output "$KPI_VERIFY_REPORT" | tee "$KPI_VERIFY_LOG"

write_marker "06-verification.ok"
echo "Step 06 completed: PASS"
