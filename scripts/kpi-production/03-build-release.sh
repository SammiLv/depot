#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

load_production_config "${1:-}" "${2:-}"
require_run_directory
require_marker "02-service-stopped.ok"
require_command npm

echo "Step 03: prepare and build the new release"
run_optional_install_command

{
  npm run prisma:generate
  npm run build
} 2>&1 | tee "$KPI_BUILD_LOG"

write_marker "03-build.ok"
echo "Step 03 completed"
