#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d /tmp/depot-permission-sync.XXXXXX)"
database_path="$test_dir/test.db"

sqlite3 "$database_path" "VACUUM;"
cd "$project_dir"
DATABASE_URL="file:$database_path" npx prisma migrate deploy --config db/prisma.config.ts
DATABASE_URL="file:$database_path" NODE_ENV=test node --import tsx --test \
  src/server/organization/permission-matrix-sync.integration.test.ts
