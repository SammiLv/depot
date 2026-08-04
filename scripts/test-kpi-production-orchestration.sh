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
sqlite3 "$database_path" "VACUUM;"
DATABASE_URL="file:$database_path" npx prisma migrate deploy --config db/prisma.config.ts
sqlite3 "$database_path" <<'SQL'
DELETE FROM "_prisma_migrations"
WHERE "migration_name" IN (
  '20260717160000_add_org_permission_grant',
  '20260717170000_org_permission_subject_type',
  '20260720000100_add_kpi_approval_policy',
  '20260720000200_add_kpi_approval_policy_step',
  '20260727000100_extend_personal_kpi_approval_snapshot',
  '20260727000200_add_personal_kpi_item_step_score',
  '20260803000100_add_kpi_approval_node_selection',
  '20260803000200_add_scoped_dual_mode_kpi_approval'
);

INSERT INTO "OrgNode" (
  "id", "name", "nodeType", "parentId", "createdAt", "updatedAt"
) VALUES (
  'org-preserved', '必须保留的组织', 'DEPARTMENT', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "User" (
  "id", "name", "orgNodeId", "roleType", "isActive", "createdAt", "updatedAt"
) VALUES (
  'user-preserved', '必须保留的用户', 'org-preserved', 'MEMBER', true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "OrgPermissionGrant" (
  "id", "moduleKey", "abilityKey", "scopeType", "subjectType",
  "roleType", "userId", "orgNodeId", "isActive", "createdAt", "updatedAt"
) VALUES (
  'grant-kpi-reset', 'KPI', 'VIEW_KPI', 'SELF', 'ROLE',
  'MEMBER', NULL, 'org-preserved', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "KpiTemplate" (
  "id", "templateKey", "departmentOrgNodeId", "name", "status",
  "version", "isLatest", "isActive", "createdById", "createdAt", "updatedAt"
) VALUES (
  'template-reset', 'template-reset', 'org-preserved', '待清理模板', 'APPROVED',
  1, true, true, 'user-preserved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "KpiTemplateItem" (
  "id", "templateId", "name", "score", "weight", "createdAt", "updatedAt"
) VALUES (
  'template-item-reset', 'template-reset', '待清理模板项', 100, 100,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "PersonalKpi" (
  "id", "year", "quarter", "userId", "orgNodeId", "templateId",
  "status", "createdAt", "updatedAt"
) VALUES (
  'personal-kpi-reset', 2026, 3, 'user-preserved', 'org-preserved',
  'template-reset', 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "PersonalKpiItem" (
  "id", "personalKpiId", "name", "score", "weight", "createdAt", "updatedAt"
) VALUES (
  'personal-kpi-item-reset', 'personal-kpi-reset', '待清理个人指标', 100, 100,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
SQL

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
