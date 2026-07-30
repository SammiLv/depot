#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d /tmp/depot-kpi-production-orchestration.XXXXXX)"
database_path="$test_dir/prod-copy.db"
backup_root="$test_dir/backups"
config_path="$test_dir/kpi-production.env"
run_id="automated-rehearsal"
fixture_bin="$project_dir/scripts/kpi-production/test-fixtures"

mkdir -p "$backup_root"
sqlite3 "$project_dir/db/dev.db" ".backup '$database_path'"

{
  printf 'KPI_PROD_DB="%s"\n' "$database_path"
  printf 'KPI_BACKUP_ROOT="%s"\n' "$backup_root"
  printf 'KPI_PM2_SERVICE_NAME="mock-department-management"\n'
  printf 'KPI_APP_URL="http://mock-production.local"\n'
  printf 'KPI_INSTALL_COMMAND=""\n'
  printf 'KPI_ROLLBACK_CODE_COMMAND="true"\n'
} > "$config_path"

cd "$project_dir"
PATH="$fixture_bin:$PATH" bash scripts/kpi-production/09-run-all.sh \
  "$config_path" \
  "$run_id" \
  --execute \
  --confirm PRODUCTION_KPI_MIGRATION

run_dir="$backup_root/kpi-migration-$run_id"
test -f "$run_dir/07-service-and-smoke.ok"
test "$(sqlite3 "$database_path" "SELECT COUNT(*) FROM OrgPermissionGrant WHERE moduleKey='KPI';")" = "0"
test "$(sqlite3 "$database_path" "SELECT COUNT(*) FROM PersonalKpi;")" = "0"

PATH="$fixture_bin:$PATH" bash scripts/kpi-production/08-rollback.sh \
  "$config_path" \
  "$run_id" \
  --execute \
  --confirm ROLLBACK_KPI_PRODUCTION

test -f "$run_dir/08-rollback.ok"
test "$(sqlite3 "$database_path" "SELECT COUNT(*) FROM OrgPermissionGrant WHERE moduleKey='KPI';")" -gt "0"
test "$(sqlite3 "$database_path" "SELECT COUNT(*) FROM PersonalKpi;")" -gt "0"
test "$(sqlite3 "$database_path" "PRAGMA integrity_check;")" = "ok"
