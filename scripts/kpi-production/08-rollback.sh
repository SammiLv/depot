#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

load_production_config "${1:-}" "${2:-}"
require_run_directory
assert_service_exists

if [[ "${3:-}" != "--execute" || "${4:-}" != "--confirm" || "${5:-}" != "ROLLBACK_KPI_PRODUCTION" ]]; then
  echo "Rollback dry-run"
  echo "Database to restore: $KPI_MIGRATION_BACKUP"
  echo "Current database: $KPI_PROD_DB"
  echo "Failed database evidence path: $KPI_FAILED_DATABASE"
  echo
  echo "Execute with:"
  echo "  bash scripts/kpi-production/08-rollback.sh \\"
  echo "    <absolute-config-path> $KPI_RUN_ID \\"
  echo "    --execute --confirm ROLLBACK_KPI_PRODUCTION"
  exit 0
fi

[[ -f "$KPI_MIGRATION_BACKUP" ]] || fail "Migration backup not found: $KPI_MIGRATION_BACKUP"
[[ ! -e "$KPI_FAILED_DATABASE" ]] || fail "Failed database evidence already exists: $KPI_FAILED_DATABASE"
[[ -n "${KPI_ROLLBACK_CODE_COMMAND:-}" ]] \
  || fail "KPI_ROLLBACK_CODE_COMMAND must restore the previous application release"

echo "Step 08: stop the new service"
pm2 stop "$KPI_PM2_SERVICE_NAME"
wait_for_database_release

echo "Step 08: verify the rollback database backup"
npm run kpi:migration:preflight -- \
  --database "$KPI_MIGRATION_BACKUP" \
  --output "$KPI_RUN_DIR/08-backup-preflight.json"

echo "Step 08: preserve the failed database and restore the old database"
mv "$KPI_PROD_DB" "$KPI_FAILED_DATABASE"
cp -p "$KPI_MIGRATION_BACKUP" "$KPI_PROD_DB"

echo "Step 08: restore the previous application release"
bash -lc "$KPI_ROLLBACK_CODE_COMMAND"

echo "Step 08: verify the restored database"
npm run kpi:migration:preflight -- \
  --database "$KPI_PROD_DB" \
  --output "$KPI_RUN_DIR/08-restored-preflight.json"

echo "Step 08: start the previous application release"
pm2 restart "$KPI_PM2_SERVICE_NAME" --update-env

write_marker "08-rollback.ok"
echo "Step 08 completed: database and application rollback executed"
