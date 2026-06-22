#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
START_SCRIPT="${1:-start:office}"
PORT="${PORT:-${2:-80}}"
APP_URL="${APP_URL:-${3:-http://depot.rj-info.com}}"
DEV_ALLOWED_ORIGINS_VALUE="${DEV_ALLOWED_ORIGINS:-${4:-}}"
NODE_ENV="${NODE_ENV:-production}"
LOG_BASENAME="${START_SCRIPT//:/-}"
LOG_FILE="$ROOT_DIR/.refresh-${LOG_BASENAME}.log"

cd "$ROOT_DIR"

echo "==> Using start script: $START_SCRIPT"
echo "==> Target port: $PORT"
echo "==> App URL: $APP_URL"

if ! npm run | grep -q "  $START_SCRIPT"; then
  echo "Unknown npm script: $START_SCRIPT"
  exit 1
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
