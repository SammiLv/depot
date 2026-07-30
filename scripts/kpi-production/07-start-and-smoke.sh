#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

load_production_config "${1:-}" "${2:-}"
require_run_directory
require_marker "06-verification.ok"
assert_service_exists
require_command curl

echo "Step 07: start the new production service"
pm2 restart "$KPI_PM2_SERVICE_NAME" --update-env

login_status=""
attempt=""
for attempt in {1..30}; do
  login_status="$(curl -sS -o /dev/null -w '%{http_code}' "$KPI_APP_URL/login" || true)"
  if [[ "$login_status" == "200" ]]; then
    break
  fi
  sleep 1
done
[[ "$login_status" == "200" ]] || fail "Login page did not become healthy: HTTP $login_status"

kpi_status="$(curl -sS -o /dev/null -w '%{http_code}' "$KPI_APP_URL/kpi" || true)"
organization_status="$(curl -sS -o /dev/null -w '%{http_code}' "$KPI_APP_URL/organization" || true)"
if [[ "$kpi_status" != "302" && "$kpi_status" != "307" ]]; then
  fail "Protected KPI route returned unexpected HTTP status: $kpi_status"
fi
if [[ "$organization_status" != "302" && "$organization_status" != "307" ]]; then
  fail "Protected organization route returned unexpected HTTP status: $organization_status"
fi

{
  echo "login=$login_status"
  echo "kpi=$kpi_status"
  echo "organization=$organization_status"
  echo "checkedAt=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} > "$KPI_SMOKE_REPORT"

write_marker "07-service-and-smoke.ok"
echo "Step 07 completed: application smoke test passed"
