#!/usr/bin/env bash

set -euo pipefail

KPI_PRODUCTION_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KPI_PROJECT_DIR="$(cd "$KPI_PRODUCTION_SCRIPT_DIR/../.." && pwd)"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

require_absolute_path() {
  local value="$1"
  local label="$2"
  [[ "$value" == /* ]] || fail "$label must be an absolute path: $value"
}

load_production_config() {
  local config_file="${1:-}"
  local run_id="${2:-}"

  [[ -n "$config_file" ]] || fail "Missing config file argument"
  require_absolute_path "$config_file" "Config file"
  [[ -f "$config_file" ]] || fail "Config file not found: $config_file"

  set -a
  # The config file is trusted operator-owned shell configuration.
  # shellcheck disable=SC1090
  source "$config_file"
  set +a

  : "${KPI_PROD_DB:?KPI_PROD_DB is required}"
  : "${KPI_BACKUP_ROOT:?KPI_BACKUP_ROOT is required}"
  : "${KPI_PM2_SERVICE_NAME:?KPI_PM2_SERVICE_NAME is required}"
  : "${KPI_APP_URL:?KPI_APP_URL is required}"

  require_absolute_path "$KPI_PROD_DB" "KPI_PROD_DB"
  require_absolute_path "$KPI_BACKUP_ROOT" "KPI_BACKUP_ROOT"
  [[ -f "$KPI_PROD_DB" ]] || fail "Production database not found: $KPI_PROD_DB"
  [[ -d "$KPI_BACKUP_ROOT" ]] || fail "Backup root does not exist: $KPI_BACKUP_ROOT"
  [[ -w "$KPI_BACKUP_ROOT" ]] || fail "Backup root is not writable: $KPI_BACKUP_ROOT"
  [[ "$KPI_APP_URL" =~ ^https?://[^[:space:]]+$ ]] || fail "KPI_APP_URL must be an HTTP(S) URL"
  [[ "$KPI_APP_URL" != */ ]] || fail "KPI_APP_URL must not end with a slash"
  [[ "$KPI_PM2_SERVICE_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "Invalid PM2 service name"

  [[ -n "$run_id" ]] || fail "Missing migration run ID"
  [[ "$run_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Invalid migration run ID: $run_id"

  KPI_RUN_ID="$run_id"
  KPI_RUN_DIR="$KPI_BACKUP_ROOT/kpi-migration-$KPI_RUN_ID"
  KPI_PREFLIGHT_REPORT="$KPI_RUN_DIR/01-preflight.json"
  KPI_PREFLIGHT_LOG="$KPI_RUN_DIR/01-preflight.log"
  KPI_BUILD_LOG="$KPI_RUN_DIR/02-build.log"
  KPI_MIGRATION_BACKUP="$KPI_RUN_DIR/04-prod-before-kpi.db"
  KPI_BASELINE_REPORT="$KPI_RUN_DIR/04-preservation-baseline.json"
  KPI_MIGRATION_RESULT="$KPI_RUN_DIR/04-migration-result.json"
  KPI_ALIGN_LOG="$KPI_RUN_DIR/05-align.log"
  KPI_VERIFY_REPORT="$KPI_RUN_DIR/06-verification.json"
  KPI_VERIFY_LOG="$KPI_RUN_DIR/06-verification.log"
  KPI_SMOKE_REPORT="$KPI_RUN_DIR/07-smoke.txt"
  KPI_FAILED_DATABASE="$KPI_RUN_DIR/08-failed-after-migration.db"
  DATABASE_URL="file:$KPI_PROD_DB"

  export KPI_PROJECT_DIR KPI_RUN_ID KPI_RUN_DIR
  export KPI_PREFLIGHT_REPORT KPI_PREFLIGHT_LOG KPI_BUILD_LOG
  export KPI_MIGRATION_BACKUP KPI_BASELINE_REPORT KPI_MIGRATION_RESULT
  export KPI_ALIGN_LOG KPI_VERIFY_REPORT KPI_VERIFY_LOG KPI_SMOKE_REPORT
  export KPI_FAILED_DATABASE
  export DATABASE_URL

  cd "$KPI_PROJECT_DIR"
}

require_run_directory() {
  [[ -d "$KPI_RUN_DIR" ]] || fail "Run directory does not exist. Execute 01-preflight.sh first: $KPI_RUN_DIR"
}

require_marker() {
  local marker_name="$1"
  [[ -f "$KPI_RUN_DIR/$marker_name" ]] || fail "Required previous step is incomplete: $marker_name"
}

write_marker() {
  local marker_name="$1"
  printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$KPI_RUN_DIR/$marker_name"
}

assert_service_exists() {
  require_command pm2
  pm2 describe "$KPI_PM2_SERVICE_NAME" >/dev/null 2>&1 \
    || fail "PM2 service not found: $KPI_PM2_SERVICE_NAME"
}

database_open_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -t "$KPI_PROD_DB" 2>/dev/null || true
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser "$KPI_PROD_DB" 2>/dev/null || true
    return
  fi
  fail "Neither lsof nor fuser is available to verify database handles"
}

wait_for_database_release() {
  local attempt
  for attempt in {1..30}; do
    if [[ -z "$(database_open_pids)" ]]; then
      return 0
    fi
    sleep 1
  done
  fail "Database is still open after service stop: $KPI_PROD_DB"
}

run_optional_install_command() {
  if [[ -n "${KPI_INSTALL_COMMAND:-}" ]]; then
    echo "Running configured install command"
    bash -lc "$KPI_INSTALL_COMMAND"
  fi
}

print_run_summary() {
  echo "Project: $KPI_PROJECT_DIR"
  echo "Database: $KPI_PROD_DB"
  echo "Backup directory: $KPI_RUN_DIR"
  echo "PM2 service: $KPI_PM2_SERVICE_NAME"
  echo "Application URL: $KPI_APP_URL"
}
