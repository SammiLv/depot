#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

load_production_config "${1:-}" "${2:-}"
require_run_directory
require_marker "04-migration.ok"

echo "Step 05: align KPI migration history"
npm run kpi:migration:align -- \
  --database "$KPI_PROD_DB" \
  --baseline "$KPI_BASELINE_REPORT" \
  --execute \
  --confirm ALIGN_KPI_MIGRATION_HISTORY | tee "$KPI_ALIGN_LOG"

echo
echo "Step 05: apply and verify any remaining reviewed migrations"
DATABASE_URL="file:$KPI_PROD_DB" \
  npx prisma migrate deploy --config db/prisma.config.ts | tee -a "$KPI_ALIGN_LOG"
DATABASE_URL="file:$KPI_PROD_DB" \
  npx prisma migrate status --config db/prisma.config.ts | tee -a "$KPI_ALIGN_LOG"

write_marker "05-history-and-deploy.ok"
echo "Step 05 completed"
