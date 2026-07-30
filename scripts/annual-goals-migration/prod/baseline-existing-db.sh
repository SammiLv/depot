#!/usr/bin/env bash
# =============================================================================
# baseline-existing-db.sh — 为「有表无 _prisma_migrations」的生产库建立迁移基线
#
# 现象：npx prisma migrate deploy → P3005 The database schema is not empty
# 原因：历史库由 db push / 手工维护，从未跑过 migrate deploy
#
# 用法（Git Bash，项目根目录）:
#   bash scripts/annual-goals-migration/prod/baseline-existing-db.sh
#   bash scripts/annual-goals-migration/prod/baseline-existing-db.sh --yes
# =============================================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DB_FILE="$PROJECT_DIR/db/dev.db"

# 这些迁移尚未 apply，不要标记为已应用
PENDING_PREFIXES=(
  "20260728162000_annual_goal_model_additive"
  "20260728173000_annual_goal_active_unique_indexes"
  "20260729120000_annual_goal_legacy_cleanup"
)

SKIP_CONFIRM=0
[[ "${1:-}" == "--yes" ]] && SKIP_CONFIRM=1

if [ -t 1 ]; then
  C_GREEN=$'\033[0;32m'; C_RED=$'\033[0;31m'; C_YELLOW=$'\033[0;33m'; C_CYAN=$'\033[0;36m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_RED=""; C_YELLOW=""; C_CYAN=""; C_RESET=""
fi

log()  { printf "%s[%s]%s %s\n" "$C_CYAN" "$(date '+%H:%M:%S')" "$C_RESET" "$*"; }
ok()   { printf "%s[ ok ]%s %s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf "%s[warn]%s %s\n" "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf "%s[fail]%s %s\n" "$C_RED" "$C_RESET" "$*" >&2; }

ensure_node_path() {
  if command -v node >/dev/null 2>&1; then command -v node | xargs dirname; return 0; fi
  for d in "/c/Users/rj/.workbuddy/binaries/node/versions/22.22.2" "/c/Program Files/nodejs"; do
    [ -x "$d/node.exe" ] && echo "$d" && return 0
  done
  return 1
}

is_pending_migration() {
  local name="$1"
  local p
  for p in "${PENDING_PREFIXES[@]}"; do
    [[ "$name" == "$p" ]] && return 0
  done
  return 1
}

if [ ! -f "$DB_FILE" ]; then
  err "数据库不存在: $DB_FILE"
  exit 1
fi

node_dir=$(ensure_node_path) || { err "找不到 node.exe"; exit 1; }
export PATH="/c/Windows/System32:$node_dir:$PATH"

if [ "$SKIP_CONFIRM" != "1" ]; then
  warn "将为 db/dev.db 建立 Prisma 迁移基线（标记历史迁移为已应用，不执行 SQL）"
  warn "随后可正常跑 migrate deploy 应用年度指标 Phase1"
  printf "输入 yes 继续: "
  read -r answer
  [[ "$answer" == "yes" ]] || { err "已取消"; exit 1; }
fi

backup="$PROJECT_DIR/db/dev.db.bak-$(date +%Y%m%d-%H%M%S)-before-baseline"
cp "$DB_FILE" "$backup" || exit 1
ok "已备份: $backup"

log "检查 _prisma_migrations..."
has_table=$(node -e "
const Database=require('better-sqlite3');
const db=new Database(process.argv[1],{readonly:true});
const row=db.prepare(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'\").get();
console.log(row ? 'yes' : 'no');
" "$DB_FILE")

if [ "$has_table" = "yes" ]; then
  applied=$(node -e "
const Database=require('better-sqlite3');
const db=new Database(process.argv[1],{readonly:true});
console.log(db.prepare('SELECT COUNT(*) AS c FROM _prisma_migrations').get().c);
" "$DB_FILE")
  warn "_prisma_migrations 已存在（$applied 条记录），跳过 baseline"
  exit 0
fi

count=0
for dir in "$PROJECT_DIR/db/prisma/migrations"/*/; do
  name=$(basename "$dir")
  [[ "$name" == "migration_lock.toml" ]] && continue
  if is_pending_migration "$name"; then
    log "跳过待执行: $name"
    continue
  fi
  log "标记已应用: $name"
  if ! (cd "$PROJECT_DIR" && npx prisma migrate resolve --applied "$name" --config db/prisma.config.ts); then
    err "migrate resolve 失败: $name"
    err "可用备份回滚: cp $backup db/dev.db"
    exit 1
  fi
  count=$((count + 1))
done

ok "baseline 完成，共标记 $count 条历史迁移"
log "下一步: npx prisma migrate deploy --config db/prisma.config.ts"
log "或: bash scripts/annual-goals-migration/run.sh pre-migrate"
