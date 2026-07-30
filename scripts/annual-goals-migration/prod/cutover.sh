#!/usr/bin/env bash
# =============================================================================
# cutover.sh — 年度指标模型重构 · 生产环境分步迁移（一次性脚本）
#
# 入口：bash scripts/annual-goals-migration/run.sh <command>
#
# 背景：depot-prod.sh pull 会一次性 apply 全部 pending 迁移，无法在中间插入
#       数据回填脚本。本脚本按 Phase 1 → 数据脚本 → Phase 2 → Phase 3 顺序执行。
#
# 用法:
#   bash scripts/annual-goals-migration/run.sh help
#   bash scripts/annual-goals-migration/run.sh status
#   bash scripts/annual-goals-migration/run.sh pre-migrate
#   bash scripts/annual-goals-migration/run.sh dry-run
#   bash scripts/annual-goals-migration/run.sh cutover
#   bash scripts/annual-goals-migration/run.sh cutover --yes
#   bash scripts/annual-goals-migration/run.sh cutover --skip-start
#   bash scripts/annual-goals-migration/run.sh restore-hold
#   bash scripts/annual-goals-migration/run.sh rollback --backup=PATH
#
# 典型流程:
#   T-5: git pull && bash scripts/annual-goals-migration/run.sh pre-migrate
#   T-0: bash scripts/annual-goals-migration/run.sh cutover
# =============================================================================

set -u

MIGRATION_ADDITIVE="20260728162000_annual_goal_model_additive"
MIGRATION_INDEXES="20260728173000_annual_goal_active_unique_indexes"
MIGRATION_CLEANUP="20260729120000_annual_goal_legacy_cleanup"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$MIGRATION_ROOT/../.." && pwd)"
DEPOT_PROD="$PROJECT_DIR/scripts/depot-prod.sh"
PHASE2_SCRIPT="scripts/annual-goals-migration/data/phase2-migrate-assignments.ts"
PHASE3_SCRIPT="scripts/annual-goals-migration/data/phase3-migrate-quarter-targets.ts"
MIGRATIONS_DIR="$PROJECT_DIR/db/prisma/migrations"
HOLD_DIR="$PROJECT_DIR/.annual-goal-migrate-hold"
DB_FILE="$PROJECT_DIR/db/dev.db"
REPORT_DIR="$PROJECT_DIR/requirements/handoff/prod-env"

SKIP_CONFIRM=0
SKIP_BACKUP=0
SKIP_BUILD=0
SKIP_START=0
ROLLBACK_BACKUP=""

if [ -t 1 ]; then
  C_GREEN=$'\033[0;32m'
  C_RED=$'\033[0;31m'
  C_YELLOW=$'\033[0;33m'
  C_CYAN=$'\033[0;36m'
  C_RESET=$'\033[0m'
else
  C_GREEN=""; C_RED=""; C_YELLOW=""; C_CYAN=""; C_RESET=""
fi

log()  { printf "%s[%s]%s %s\n" "$C_CYAN" "$(date '+%H:%M:%S')" "$C_RESET" "$*"; }
ok()   { printf "%s[ ok ]%s %s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf "%s[warn]%s %s\n" "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf "%s[fail]%s %s\n" "$C_RED" "$C_RESET" "$*" >&2; }

ensure_system32() {
  local sys32="/c/Windows/System32"
  if [ -d "$sys32" ] && [[ ":$PATH:" != *":$sys32:"* ]]; then
    export PATH="$sys32:$PATH"
  fi
}
ensure_system32

ensure_node_path() {
  if command -v node >/dev/null 2>&1; then
    command -v node | xargs dirname
    return 0
  fi
  local candidates=(
    "/c/Users/rj/.workbuddy/binaries/node/versions/22.22.2"
    "/c/Program Files/nodejs"
    "/c/Program Files (x86)/nodejs"
  )
  local d
  for d in "${candidates[@]}"; do
    if [ -x "$d/node.exe" ] || [ -x "$d/node" ]; then
      echo "$d"
      return 0
    fi
  done
  if [ -d "/c/nvm/versions/node" ]; then
    local nvm_node
    nvm_node=$(ls -1d /c/nvm/versions/node/v* 2>/dev/null | tail -1)
    if [ -n "$nvm_node" ] && { [ -x "$nvm_node/node.exe" ] || [ -x "$nvm_node/node" ]; }; then
      echo "$nvm_node"
      return 0
    fi
  fi
  return 1
}

prepare_toolchain() {
  local node_dir
  node_dir=$(ensure_node_path) || {
    err "找不到 node.exe（Git Bash 默认 PATH 不含 npm）"
    err "请确认 Node 已安装，或手动执行："
    err '  export PATH="/c/Program Files/nodejs:$PATH"'
    err '  export PATH="/c/Users/rj/.workbuddy/binaries/node/versions/22.22.2:$PATH"'
    return 1
  }
  export PATH="/c/Windows/System32:$node_dir:$PATH"
  log "node 路径: $node_dir/node (已加入 PATH)"
}

migration_present() {
  local name="$1"
  [ -d "$MIGRATIONS_DIR/$name" ]
}

migration_held() {
  local name="$1"
  [ -d "$HOLD_DIR/$name" ]
}

hold_later_migrations() {
  mkdir -p "$HOLD_DIR"
  local name moved=0 failed=0
  for name in "$MIGRATION_INDEXES" "$MIGRATION_CLEANUP"; do
    if migration_present "$name"; then
      if migration_held "$name"; then
        log "暂存区已有 $name，删除 migrations/ 内副本"
        rm -rf "$MIGRATIONS_DIR/$name" || {
          err "无法删除 migrations/ 内 $name"
          failed=1
          continue
        }
      else
        log "暂存迁移目录: $name → $HOLD_DIR/"
        if ! mv "$MIGRATIONS_DIR/$name" "$HOLD_DIR/"; then
          err "暂存失败: $name"
          failed=1
          continue
        fi
      fi
      moved=1
    elif migration_held "$name"; then
      log "已在暂存区: $name"
    else
      warn "找不到迁移目录: $name"
    fi
  done
  if [ "$failed" = "1" ]; then
    err "Phase 2/3 未完全移出 migrations/，已中止（避免误 apply）"
    return 1
  fi
  if migration_present "$MIGRATION_INDEXES" || migration_present "$MIGRATION_CLEANUP"; then
    err "Phase 2/3 仍在 migrations/ 内，已中止"
    return 1
  fi
  if [ "$moved" = "1" ]; then
    ok "Phase 2/3 迁移已移出 migrations/（apply 时不会被执行）"
  fi
}

restore_one_migration() {
  local name="$1"
  if migration_held "$name"; then
    mv "$HOLD_DIR/$name" "$MIGRATIONS_DIR/"
    ok "已恢复: $name"
    return 0
  fi
  if migration_present "$name"; then
    log "迁移目录已在位: $name"
    return 0
  fi
  err "找不到迁移目录: $name（既不在 migrations/ 也不在 $HOLD_DIR）"
  return 1
}

restore_held_migrations() {
  restore_one_migration "$MIGRATION_INDEXES" || return 1
  restore_one_migration "$MIGRATION_CLEANUP" || return 1
  if [ -d "$HOLD_DIR" ] && [ -z "$(ls -A "$HOLD_DIR" 2>/dev/null)" ]; then
    rmdir "$HOLD_DIR" 2>/dev/null || true
  fi
}

cleanup_nested_db_dir() {
  if [ -d "$PROJECT_DIR/db/db" ]; then
    warn "清理嵌套 db/db/（migrate 误生成的空库）"
    rm -rf "$PROJECT_DIR/db/db"
  fi
}

run_prisma_generate() {
  prepare_toolchain || return 1
  log "重新生成 Prisma Client..."
  (cd "$PROJECT_DIR" && npm run prisma:generate) || return 1
}

run_prisma_deploy() {
  prepare_toolchain || return 1
  log "执行 prisma migrate deploy（目标: db/dev.db）..."
  if ! (cd "$PROJECT_DIR" && npx prisma migrate deploy --config db/prisma.config.ts); then
    err "migrate deploy 失败"
    return 1
  fi
  cleanup_nested_db_dir
  ok "migrate deploy 完成"
}

run_tsx() {
  local script_path="$1"
  shift
  prepare_toolchain || return 1
  (cd "$PROJECT_DIR" && npx tsx "$script_path" "$@")
}

confirm_or_abort() {
  local prompt="$1"
  if [ "$SKIP_CONFIRM" = "1" ]; then
    return 0
  fi
  echo ""
  warn "$prompt"
  printf "输入 yes 继续: "
  local answer
  read -r answer
  if [ "$answer" != "yes" ]; then
    err "已取消"
    return 1
  fi
}

parse_options() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes) SKIP_CONFIRM=1 ;;
      --skip-backup) SKIP_BACKUP=1 ;;
      --skip-build) SKIP_BUILD=1 ;;
      --skip-start) SKIP_START=1 ;;
      --backup=*) ROLLBACK_BACKUP="${1#*=}" ;;
      -h|--help) CMD="help" ;;
      *) err "未知选项: $1"; return 2 ;;
    esac
    shift
  done
}

cmd_help() {
  sed -n '3,28p' "$0" | sed 's/^# \{0,1\}//'
}

cmd_status() {
  log "项目目录: $PROJECT_DIR"
  log "迁移脚本: $MIGRATION_ROOT"
  log "数据库:   $DB_FILE ($([ -f "$DB_FILE" ] && echo "存在" || echo "缺失"))"
  log "报告目录: $REPORT_DIR"
  echo ""
  log "迁移目录状态:"
  for name in "$MIGRATION_ADDITIVE" "$MIGRATION_INDEXES" "$MIGRATION_CLEANUP"; do
    if migration_present "$name"; then
      printf "  %s = migrations/ 内\n" "$name"
    elif migration_held "$name"; then
      printf "  %s = 暂存于 .annual-goal-migrate-hold/\n" "$name"
    else
      printf "  %s = 缺失\n" "$name"
    fi
  done
  echo ""
  log "最近备份:"
  ls -1t "$PROJECT_DIR/db"/dev.db.bak-* 2>/dev/null | head -5 || warn "  (无)"
  echo ""
  log "最近 CSV 报告:"
  ls -1t "$REPORT_DIR"/*annual* 2>/dev/null | head -8 || warn "  (无)"
}

cmd_dry_run() {
  if [ ! -f "$DB_FILE" ]; then
    err "数据库不存在: $DB_FILE"
    return 1
  fi
  mkdir -p "$REPORT_DIR"
  log "=== Phase 2 Assignment dry-run ==="
  run_tsx "$PHASE2_SCRIPT" --dry-run || return 1
  echo ""
  log "=== Phase 3 Quarter dry-run ==="
  run_tsx "$PHASE3_SCRIPT" --dry-run || return 1
  echo ""
  ok "dry-run 完成，请检查 $REPORT_DIR 下 CSV"
  warn "确认 severity=ERROR 为 0，或每条冲突均有业务裁决后再 cutover"
}

cmd_pre_migrate() {
  if [ ! -f "$DB_FILE" ]; then
    err "数据库不存在: $DB_FILE"
    return 1
  fi
  confirm_or_abort "预迁移将：暂存 Phase2/3 → apply Phase1（加法迁移，旧应用仍可运行）→ dry-run" || return 1

  hold_later_migrations || return 1
  run_prisma_generate || return 1
  run_prisma_deploy || return 1
  cmd_dry_run
}

cmd_cutover() {
  if [ ! -f "$DB_FILE" ]; then
    err "数据库不存在: $DB_FILE"
    return 1
  fi

  confirm_or_abort "正式切换将：停服 → 备份 → 数据 apply → Phase2/3 迁移 → build → 启服。年度指标模块会短暂不可用。" || return 1

  log "=== 1/8 暂存 Phase 2/3 迁移 ==="
  hold_later_migrations || return 1

  log "=== 2/8 停止服务 ==="
  bash "$DEPOT_PROD" stop || return 1

  if [ "$SKIP_BACKUP" != "1" ]; then
    log "=== 3/8 备份数据库 ==="
    local backup="$PROJECT_DIR/db/dev.db.bak-$(date +%Y%m%d-%H%M%S)-before-annual-goal-cutover"
    cp "$DB_FILE" "$backup" || return 1
    ok "已备份: $backup"
  else
    warn "跳过备份（--skip-backup）"
  fi

  log "=== 4/8 确保 Phase 1 已应用 ==="
  run_prisma_generate || return 1
  run_prisma_deploy || return 1

  log "=== 5/8 数据回填 apply ==="
  run_tsx "$PHASE2_SCRIPT" --apply || return 1
  run_tsx "$PHASE3_SCRIPT" --apply || return 1

  log "=== 6/8 应用 Phase 2 唯一索引 ==="
  restore_one_migration "$MIGRATION_INDEXES" || return 1
  run_prisma_deploy || return 1

  log "=== 7/8 应用 Phase 3 清理迁移 ==="
  restore_one_migration "$MIGRATION_CLEANUP" || return 1
  run_prisma_deploy || return 1
  if [ -d "$HOLD_DIR" ] && [ -z "$(ls -A "$HOLD_DIR" 2>/dev/null)" ]; then
    rmdir "$HOLD_DIR" 2>/dev/null || true
  fi

  if [ "$SKIP_BUILD" != "1" ]; then
    log "=== 8/8 构建应用 ==="
    prepare_toolchain || return 1
    if ! (cd "$PROJECT_DIR" && npm run build); then
      err "build 失败，服务仍处于停止状态"
      warn "可用 rollback 恢复数据库后排查"
      return 1
    fi
    ok "build 完成"
  else
    warn "跳过 build（--skip-build）"
  fi

  if [ "$SKIP_START" != "1" ]; then
    log "=== 启动服务 ==="
    bash "$DEPOT_PROD" start || return 1
  else
    warn "跳过启服（--skip-start），请手动: bash scripts/depot-prod.sh start"
  fi

  echo ""
  ok "正式切换完成"
  log "请按 requirements/handoff/prod-env/2026-07-30-年度指标生产迁移-命令清单.md 执行验收"
}

cmd_restore_hold() {
  restore_held_migrations
}

cmd_rollback() {
  if [ -z "$ROLLBACK_BACKUP" ]; then
    err "请指定备份: bash scripts/annual-goals-migration/run.sh rollback --backup=db/dev.db.bak-XXXX"
    return 1
  fi
  local backup_path="$ROLLBACK_BACKUP"
  if [[ "$backup_path" != /* ]]; then
    backup_path="$PROJECT_DIR/$backup_path"
  fi
  if [ ! -f "$backup_path" ]; then
    err "备份文件不存在: $backup_path"
    return 1
  fi
  confirm_or_abort "回滚将：停服 → 用备份覆盖 db/dev.db。不会自动回退 git 代码或 .next。" || return 1

  bash "$DEPOT_PROD" stop || true
  cp "$backup_path" "$DB_FILE" || return 1
  ok "数据库已恢复: $backup_path"
  warn "若已部署新代码，还需 git checkout 到迁移前版本并 npm run build"
  warn "然后: bash scripts/depot-prod.sh start"
}

CMD="${1:-help}"
shift || true
parse_options "$@" || exit 2

case "$CMD" in
  help|-h|--help) cmd_help ;;
  status) cmd_status ;;
  pre-migrate) cmd_pre_migrate ;;
  dry-run) cmd_dry_run ;;
  cutover) cmd_cutover ;;
  restore-hold) cmd_restore_hold ;;
  rollback) cmd_rollback ;;
  *)
    err "未知命令: $CMD"
    cmd_help
    exit 2
    ;;
esac
