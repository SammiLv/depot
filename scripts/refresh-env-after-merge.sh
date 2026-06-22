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

mkdir -p "$LOG_DIR"

echo "==> Using start script: $START_SCRIPT"
echo "==> Using port: $PORT"
echo "==> Using APP_URL: $APP_URL"
if [[ -n "$DEV_ALLOWED_ORIGINS_VALUE" ]]; then
  echo "==> Using DEV_ALLOWED_ORIGINS: $DEV_ALLOWED_ORIGINS_VALUE"
fi

echo "==> Installing dependencies"
npm install

echo "==> Generating Prisma client"
npm run prisma:generate

echo "==> Syncing Prisma schema"
npx prisma db push --config db/prisma.config.ts --accept-data-loss

echo "==> Building app"
npm run build

echo "==> Stopping existing service on port $PORT"
EXISTING_PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN || true)"
if [[ -n "$EXISTING_PIDS" ]]; then
  echo "==> Killing existing PID(s): $EXISTING_PIDS"
  kill $EXISTING_PIDS
fi

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

echo "==> Waiting for service to accept connections"
for _ in {1..30}; do
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Service is listening on port $PORT"
    echo "Log file: $LOG_FILE"
    exit 0
  fi
  sleep 1
done

echo "Service failed to start within 30 seconds. Check $LOG_FILE"
exit 1
