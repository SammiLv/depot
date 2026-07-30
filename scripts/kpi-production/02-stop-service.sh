#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

load_production_config "${1:-}" "${2:-}"
require_run_directory
require_marker "01-preflight.ok"
assert_service_exists

echo "Step 02: stop production writes before modifying build artifacts or data"
pm2 stop "$KPI_PM2_SERVICE_NAME"
wait_for_database_release

write_marker "02-service-stopped.ok"
echo "Step 02 completed: service stopped and database handles released"
