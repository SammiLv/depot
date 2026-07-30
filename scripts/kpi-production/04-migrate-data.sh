#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

load_production_config "${1:-}" "${2:-}"
require_run_directory
require_marker "02-service-stopped.ok"
require_marker "03-build.ok"

[[ -z "$(database_open_pids)" ]] || fail "Database is open; migration is blocked"

echo "Step 04: backup and migrate KPI data"
npm run kpi:migration:run -- \
  --database "$KPI_PROD_DB" \
  --backup "$KPI_MIGRATION_BACKUP" \
  --baseline-out "$KPI_BASELINE_REPORT" \
  --result-out "$KPI_MIGRATION_RESULT" \
  --execute \
  --confirm RESET_KPI_DATA

write_marker "04-migration.ok"
echo "Step 04 completed"
