#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d /tmp/depot-kpi-production-migration.XXXXXX)"
base_database="$test_dir/base.db"

sqlite3 "$base_database" "VACUUM;"
cd "$project_dir"
DATABASE_URL="file:$base_database" npx prisma migrate deploy --config db/prisma.config.ts
cp "$base_database" "$test_dir/target.db"
cp "$base_database" "$test_dir/legacy.db"
cp "$base_database" "$test_dir/mixed.db"
cp "$base_database" "$test_dir/cli.db"

KPI_MIGRATION_TEST_DIR="$test_dir" node --import tsx --test \
  scripts/kpi-production-migration.test.ts

sqlite3 "$test_dir/cli.db" "
  DELETE FROM _prisma_migrations
  WHERE migration_name IN (
    '20260717160000_add_org_permission_grant',
    '20260717170000_org_permission_subject_type',
    '20260720000100_add_kpi_approval_policy',
    '20260720000200_add_kpi_approval_policy_step',
    '20260727000100_extend_personal_kpi_approval_snapshot',
    '20260727000200_add_personal_kpi_item_step_score'
  );
  INSERT INTO OrgPermissionGrant (
    id, moduleKey, abilityKey, scopeType, subjectType, roleType,
    userId, orgNodeId, isActive, createdAt, updatedAt
  ) VALUES
    (
      'cli-preserved', 'ANNUAL_GOAL', 'VIEW_KPI', 'ALL', 'ROLE', 'ADMIN',
      NULL, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ),
    (
      'cli-kpi-reset', 'KPI', 'VIEW_KPI', 'ALL', 'ROLE', 'ADMIN',
      NULL, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
"

node --import tsx scripts/migrate-kpi-production.ts \
  --database "$test_dir/cli.db" \
  --backup "$test_dir/cli-before.db" \
  --baseline-out "$test_dir/cli-baseline.json" \
  --result-out "$test_dir/cli-result.json" \
  --execute \
  --confirm RESET_KPI_DATA

node --import tsx scripts/align-kpi-migration-history.ts \
  --database "$test_dir/cli.db" \
  --baseline "$test_dir/cli-baseline.json" \
  --execute \
  --confirm ALIGN_KPI_MIGRATION_HISTORY

node --import tsx scripts/verify-kpi-production.ts \
  --database "$test_dir/cli.db" \
  --baseline "$test_dir/cli-baseline.json"
