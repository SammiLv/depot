#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
START_SCRIPT="${1:-}"
NODE_ENV="${NODE_ENV:-production}"

cd "$ROOT_DIR"

list_service_scripts() {
  node -e '
    const scripts = require("./package.json").scripts || {};
    for (const name of Object.keys(scripts)) {
      if (/^(dev|start):/.test(name)) console.log(name);
    }
  '
}

print_usage() {
  echo "Usage: $0 <npm-start-script>"
  echo
  echo "Supported scripts:"
  list_service_scripts | sed 's/^/  - /'
}

if [[ -z "$START_SCRIPT" ]]; then
  print_usage
  exit 1
fi

if [[ ! "$START_SCRIPT" =~ ^(dev|start): ]]; then
  echo "Unsupported npm script: $START_SCRIPT"
  echo "Only dev:* and start:* scripts are allowed."
  echo
  print_usage
  exit 1
fi

SCRIPT_ENVS="$(node - "$START_SCRIPT" <<'NODE'
const scriptName = process.argv[2];
const scripts = require('./package.json').scripts || {};
const command = scripts[scriptName];
if (!command) {
  process.exit(1);
}
const keys = ['PORT', 'APP_URL', 'DEV_ALLOWED_ORIGINS'];
for (const key of keys) {
  const match = command.match(new RegExp(`${key}=([^\\s]+)`));
  if (match) {
    console.log(`${key}=${match[1]}`);
  }
}
NODE
2>/dev/null)"

if [[ -z "$SCRIPT_ENVS" ]]; then
  echo "Unknown npm script: $START_SCRIPT"
  echo
  print_usage
  exit 1
fi

DERIVED_PORT=""
DERIVED_APP_URL=""
DERIVED_DEV_ALLOWED_ORIGINS=""
while IFS='=' read -r key value; do
  case "$key" in
    PORT) DERIVED_PORT="$value" ;;
    APP_URL) DERIVED_APP_URL="$value" ;;
    DEV_ALLOWED_ORIGINS) DERIVED_DEV_ALLOWED_ORIGINS="$value" ;;
  esac
done <<< "$SCRIPT_ENVS"

if [[ -z "$DERIVED_PORT" ]]; then
  echo "Unable to derive PORT from package.json script: $START_SCRIPT"
  exit 1
fi

if [[ -z "$DERIVED_APP_URL" ]]; then
  echo "Unable to derive APP_URL from package.json script: $START_SCRIPT"
  exit 1
fi

PORT="$DERIVED_PORT"
APP_URL="$DERIVED_APP_URL"
DEV_ALLOWED_ORIGINS_VALUE="$DERIVED_DEV_ALLOWED_ORIGINS"
LOG_BASENAME="${START_SCRIPT//:/-}"
LOG_DIR="$ROOT_DIR/scripts/log"
LOG_FILE="$LOG_DIR/refresh-${LOG_BASENAME}.log"
PID_FILE="$LOG_DIR/refresh-${LOG_BASENAME}.pid"

mkdir -p "$LOG_DIR"

port_listening_pids() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
}

stop_process_tree() {
  local pid="$1"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  local children
  children="$(pgrep -P "$pid" || true)"
  if [[ -n "$children" ]]; then
    for child in $children; do
      stop_process_tree "$child"
    done
  fi

  kill "$pid" >/dev/null 2>&1 || true
}

wait_for_port_release() {
  for _ in {1..30}; do
    if [[ -z "$(port_listening_pids)" ]]; then
      return 0
    fi
    sleep 1
  done

  return 1
}

stop_managed_service() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(tr -d '[:space:]' < "$PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      echo "==> Stopping managed PID tree: $pid"
      stop_process_tree "$pid"
    fi
    rm -f "$PID_FILE"
  fi

  local port_pids
  port_pids="$(port_listening_pids)"
  if [[ -n "$port_pids" ]]; then
    echo "==> Stopping existing listeners on port $PORT: $port_pids"
    for pid in $port_pids; do
      stop_process_tree "$pid"
    done
  fi

  if ! wait_for_port_release; then
    echo "Port $PORT is still in use after stop attempt"
    return 1
  fi

  return 0
}

echo "==> Using start script: $START_SCRIPT"
echo "==> Using port: $PORT"
echo "==> Using APP_URL: $APP_URL"
if [[ -n "$DEV_ALLOWED_ORIGINS_VALUE" ]]; then
  echo "==> Using DEV_ALLOWED_ORIGINS: $DEV_ALLOWED_ORIGINS_VALUE"
fi

echo "==> Installing dependencies"
npm install

echo "==> Stopping existing managed service (if any)"
stop_managed_service

echo "==> Generating Prisma client"
npm run prisma:generate

echo "==> Syncing Prisma schema"
npx prisma db push --config db/prisma.config.ts --accept-data-loss

echo "==> Building app"
npm run build

echo "==> Starting service with $START_SCRIPT"
if [[ -n "$DEV_ALLOWED_ORIGINS_VALUE" ]]; then
  nohup env \
    NODE_ENV="$NODE_ENV" \
    PORT="$PORT" \
    APP_URL="$APP_URL" \
    DEV_ALLOWED_ORIGINS="$DEV_ALLOWED_ORIGINS_VALUE" \
    npm run "$START_SCRIPT" >"$LOG_FILE" 2>&1 &
else
  nohup env \
    NODE_ENV="$NODE_ENV" \
    PORT="$PORT" \
    APP_URL="$APP_URL" \
    npm run "$START_SCRIPT" >"$LOG_FILE" 2>&1 &
fi
SERVICE_PID=$!
printf '%s\n' "$SERVICE_PID" > "$PID_FILE"

echo "==> Waiting for service to accept connections"
for _ in {1..30}; do
  if ! kill -0 "$SERVICE_PID" >/dev/null 2>&1; then
    echo "Managed service PID $SERVICE_PID exited unexpectedly. Check $LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
  fi
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Service is listening on port $PORT"
    echo "Managed PID: $SERVICE_PID"
    echo "PID file: $PID_FILE"
    echo "Log file: $LOG_FILE"
    exit 0
  fi
  sleep 1
done

echo "Service failed to start within 30 seconds. Check $LOG_FILE"
rm -f "$PID_FILE"
exit 1
