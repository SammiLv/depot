#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${1:-}"
RUN_ID="${2:-}"

if [[ "${3:-}" != "--execute" || "${4:-}" != "--confirm" || "${5:-}" != "PRODUCTION_KPI_MIGRATION" ]]; then
  echo "Production KPI migration orchestrator"
  echo
  echo "This command performs preflight, service stop, build, backup, data migration,"
  echo "migration history alignment, verification, service start, and smoke testing."
  echo
  echo "Execute with:"
  echo "  bash scripts/kpi-production/09-run-all.sh \\"
  echo "    /absolute/path/kpi-production.env <run-id> \\"
  echo "    --execute --confirm PRODUCTION_KPI_MIGRATION"
  exit 0
fi

if [[ -z "$CONFIG_FILE" || -z "$RUN_ID" ]]; then
  echo "Config file and run ID are required" >&2
  exit 1
fi

on_error() {
  local exit_code=$?
  echo >&2
  echo "Production KPI migration stopped with exit code $exit_code." >&2
  if [[ -d "${KPI_RUN_DIR:-}" && -f "${KPI_RUN_DIR}/02-service-stopped.ok" ]]; then
    echo "The service was stopped. Review logs before taking action." >&2
    if [[ -f "${KPI_RUN_DIR}/04-migration.ok" ]]; then
      echo "Database migration started; use the reviewed rollback script if recovery is required:" >&2
      echo "  bash scripts/kpi-production/08-rollback.sh \\" >&2
      echo "    $CONFIG_FILE $RUN_ID \\" >&2
      echo "    --execute --confirm ROLLBACK_KPI_PRODUCTION" >&2
    else
      echo "Database migration has not started; the old service can be restarted with:" >&2
      echo "  pm2 restart <configured-service-name>" >&2
    fi
  fi
  exit "$exit_code"
}
trap on_error ERR

# Load once so the error handler knows the run directory.
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"
load_production_config "$CONFIG_FILE" "$RUN_ID"

bash "$SCRIPT_DIR/01-preflight.sh" "$CONFIG_FILE" "$RUN_ID"
bash "$SCRIPT_DIR/02-stop-service.sh" "$CONFIG_FILE" "$RUN_ID"
bash "$SCRIPT_DIR/03-build-release.sh" "$CONFIG_FILE" "$RUN_ID"
bash "$SCRIPT_DIR/04-migrate-data.sh" "$CONFIG_FILE" "$RUN_ID"
bash "$SCRIPT_DIR/05-align-and-deploy.sh" "$CONFIG_FILE" "$RUN_ID"
bash "$SCRIPT_DIR/06-verify.sh" "$CONFIG_FILE" "$RUN_ID"
bash "$SCRIPT_DIR/07-start-and-smoke.sh" "$CONFIG_FILE" "$RUN_ID"

trap - ERR
echo
echo "Production KPI migration completed successfully."
echo "Run directory: $KPI_RUN_DIR"
echo "Next manual actions:"
echo "1. Configure KPI permissions"
echo "2. Configure system and department approval policies"
echo "3. Configure KPI templates and assignment scopes"
echo "4. Reinitialize quarterly KPI"
