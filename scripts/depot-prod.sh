#!/usr/bin/env bash
# =============================================================================
# depot-prod.sh — Depot 生产环境启动/控制程序
#
# 两阶段设计：
#   1) init       一次性环境配置（写 .env），新环境部署前执行
#   2) start/stop 日常运维（读 .env，不带任何配置参数）
#
# 用法:
#   bash scripts/depot-prod.sh init   [options]    # 一次性配置环境
#   bash scripts/depot-prod.sh start               # 启动（读 .env）
#   bash scripts/depot-prod.sh stop                # 停止
#   bash scripts/depot-prod.sh restart             # 重启
#   bash scripts/depot-prod.sh pull                # 拉代码+重建+重启
#   bash scripts/depot-prod.sh status              # 查看运行状态
#   bash scripts/depot-prod.sh config [--show-secret]  # 查看生效配置
#   bash scripts/depot-prod.sh tail                # 实时跟踪日志
#   bash scripts/depot-prod.sh help
#
# init 选项（要持久化到 .env）:
#   --app-key=KEY    钉钉 AppKey
#   --app-url=URL    APP_URL（如 http://depot.rj-info.com）
#
# start / restart 选项（仅本次生效，不写 .env）:
#   --port=N         绑端口（默认 80）
#   --hostname=X     绑地址（默认 0.0.0.0）
#   --app-url=URL    临时覆盖 APP_URL
#   --app-key=KEY    临时覆盖 AppKey
#
# 配置优先级（高→低）:
#   CLI 参数 > .env > 脚本默认
#
# 设计要点:
#   - 环境配置（key、APP_URL）持久化在 .env（已 gitignore）
#   - 启动参数（port、hostname）保留在脚本默认，临时覆盖用 CLI
#   - 日志追加到 logs/server.log（不刷终端）
#   - PID 写入 logs/server.pid
#   - Git Bash MSYS 路径转换已绕开
#   - 防重复启动、防误杀、start 失败自动 tail 日志
#   - 状态/配置展示时敏感字段自动脱敏
# =============================================================================

set -u

# ===================== 脚本默认值（仅端口/地址这种运行时参数） =====================
DEFAULT_PORT=80
DEFAULT_HOSTNAME="0.0.0.0"
# =======================================================================

# ----- 路径 -----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/server.log"
PID_FILE="$LOG_DIR/server.pid"
ENV_FILE="$PROJECT_DIR/.env"
LOG_TAIL_LINES="${LOG_TAIL_LINES:-30}"

# ----- 颜色 -----
if [ -t 1 ]; then
  C_GREEN=$'\033[0;32m'
  C_RED=$'\033[0;31m'
  C_YELLOW=$'\033[0;33m'
  C_CYAN=$'\033[0;36m'
  C_RESET=$'\033[0m'
else
  C_GREEN=""; C_RED=""; C_YELLOW=""; C_CYAN=""; C_RESET=""
fi

# ----- 工具函数 -----
log()  { printf "%s[%s]%s %s\n" "$C_CYAN" "$(date '+%H:%M:%S')" "$C_RESET" "$*"; }
ok()   { printf "%s[ ok ]%s %s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf "%s[warn]%s %s\n" "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf "%s[fail]%s %s\n" "$C_RED"   "$C_RESET" "$*" >&2; }

# 取占用 $PORT 的 PID
pid_listening_on_port() {
  # 不用 sort -u:Git Bash 的 sort 在精简 PATH 下吞输出
  # 改用 awk 去重,更可靠
  netstat -ano 2>/dev/null \
    | grep -E ":${PORT}[[:space:]].*LISTENING" \
    | awk '{print $NF}' \
    | awk '!seen[$0]++'
}

# 绕开 MSYS 路径转换杀进程
kill_pid() {
  local pid="$1"
  MSYS_NO_PATHCONV=1 taskkill /PID "$pid" /F >/dev/null 2>&1
}

# 确保 Windows System32 在 PATH 中（netstat / tasklist 等命令在那里）
# 解决从 cmd 调用 bash 时 PATH 缺 System32 导致命令找不到的问题
ensure_system32() {
  local sys32="/c/Windows/System32"
  if [ -d "$sys32" ] && [[ ":$PATH:" != *":$sys32:"* ]]; then
    export PATH="$sys32:$PATH"
  fi
}
ensure_system32

# 判断进程是否还活着
pid_alive() {
  local pid="$1"
  [ -n "$pid" ] && MSYS_NO_PATHCONV=1 tasklist /FI "PID eq $pid" 2>/dev/null | grep -q "$pid"
}

# 取所有 node.exe 的 PID（这台机器只跑本服务，可以放心全杀）
node_pids() {
  tasklist 2>/dev/null | grep "node.exe" | awk '{print $2}' | sort -u
}

# 杀所有 node.exe 进程（仅适用于本机只跑本服务的场景）
kill_all_node() {
  local pids
  pids=$(node_pids)
  if [ -z "$pids" ]; then
    return 0
  fi
  for p in $pids; do
    kill_pid "$p" || true
  done
}

# 从 .env 读一个 key 的值（去掉首尾引号）
read_env_value() {
  local key="$1"
  local val
  val=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | sed -E "s/^${key}=//; s/^[[:space:]]+//; s/[[:space:]]+$//; s/^['\"]//; s/['\"]$//")
  printf '%s' "$val"
}

# 在 .env 中更新或追加一个 key=value
write_env_value() {
  local key="$1"
  local value="$2"
  local tmp
  tmp=$(mktemp)

  if [ ! -f "$ENV_FILE" ]; then
    printf '%s="%s"\n' "$key" "$value" > "$ENV_FILE"
    rm -f "$tmp"
    return
  fi

  if grep -qE "^${key}=" "$ENV_FILE"; then
    # 替换已有行
    awk -v k="$key" -v v="$value" '
      $0 ~ "^" k "=" { printf("%s=\"%s\"\n", k, v); found=1; next }
      { print }
      END { if (!found) printf("\n%s=\"%s\"\n", k, v) }
    ' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    # 追加
    printf '\n%s="%s"\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

# 脱敏显示:前 6 字符 + ***
mask_secret() {
  local v="$1"
  if [ -z "$v" ]; then
    echo "(空)"
  else
    echo "${v:0:6}***(共 ${#v} 字符)"
  fi
}

# 探测 node.exe 路径,返回其所在目录(标准输出);找不到则 stderr 报错
# 解决 nohup 子进程不继承完整 PATH + 不想依赖 npx/npm 链式调用的问题
ensure_node_path() {
  # 1. 先看 PATH 里有没有 node
  if command -v node >/dev/null 2>&1; then
    command -v node | xargs dirname
    return 0
  fi
  # 2. 常见候选位置
  local candidates=(
    "/c/Users/rj/.workbuddy/binaries/node/versions/22.22.2"
    "/c/Program Files/nodejs"
    "/c/Program Files (x86)/nodejs"
    "/c/nvm/versions/node"
  )
  for d in "${candidates[@]}"; do
    if [ -x "$d/node.exe" ] || [ -x "$d/node" ]; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

# 探测 Windows System32 路径(npm/next 在某些场景下会调 cmd 等系统工具)
ensure_system32_in_path() {
  local sys32="/c/Windows/System32"
  if [ -d "$sys32" ] && [[ ":$PATH:" != *":$sys32:"* ]]; then
    PATH="$sys32:$PATH"
  fi
  export PATH
}

# ----- 用法 -----
print_usage() {
  cat <<'USAGE'
depot-prod.sh — Depot 生产环境启动/控制程序

两阶段用法:
  1) 新环境部署前（一次性）:
       bash scripts/depot-prod.sh init --app-key=xxx --app-url=http://x.y.z
  2) 日常运维（反复用）:
       bash scripts/depot-prod.sh start
       bash scripts/depot-prod.sh restart
       bash scripts/depot-prod.sh stop
       bash scripts/depot-prod.sh status
       bash scripts/depot-prod.sh config [--show-secret]
       bash scripts/depot-prod.sh tail
  3) 拉新代码（git pull + 重建 + 重启，一次完成）:
       bash scripts/depot-prod.sh pull

init 选项（持久化到 .env）:
  --app-key=KEY    钉钉 AppKey
  --app-url=URL    APP_URL

start / restart 选项（仅本次生效，临时覆盖）:
  --port=N         绑端口（默认 80）
  --hostname=X     绑地址（默认 0.0.0.0）
  --app-url=URL    临时覆盖 APP_URL
  --app-key=KEY    临时覆盖 AppKey

配置优先级: CLI 参数 > .env > 脚本默认

示例:
  bash scripts/depot-prod.sh init --app-key=elected --app-url=http://depot.rj-info.com
  bash scripts/depot-prod.sh start
  bash scripts/depot-prod.sh config
  bash scripts/depot-prod.sh config --show-secret
  bash scripts/depot-prod.sh restart --port=8080    # 临时换端口
USAGE
}

# ----- 命令实现 -----

cmd_config() {
  local show_secret="${SHOW_SECRET:-0}"
  if [ ! -f "$ENV_FILE" ]; then
    warn ".env 不存在: $ENV_FILE"
    warn "请先执行: bash scripts/depot-prod.sh init --app-key=xxx"
    return 1
  fi
  log ".env 当前配置（敏感字段已脱敏，加 --show-secret 显示完整值）:"
  while IFS='=' read -r key value; do
    # 跳过注释/空行
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    # 去掉 value 两侧的引号
    local v="${value%\"}"
    v="${v#\"}"
    v="${v%\'}"
    v="${v#\'}"
    # 敏感字段脱敏（除非 --show-secret）
    if [[ "$key" =~ (KEY|SECRET|TOKEN|PASSWORD) ]]; then
      if [ "$show_secret" = "1" ]; then
        printf "  %s = %s\n" "$key" "$v"
      else
        printf "  %s = %s\n" "$key" "$(mask_secret "$v")"
      fi
    else
      printf "  %s = %s\n" "$key" "$v"
    fi
  done < "$ENV_FILE"
}

cmd_init() {
  if [ -z "$DINGTALK_APP_KEY" ] && [ -z "$APP_URL" ]; then
    err "init 至少需要传一个参数（--app-key 或 --app-url）"
    print_usage
    return 2
  fi

  echo ""
  log "=== 当前 .env 中的相关键 ==="
  local cur_key cur_url
  cur_key=$(read_env_value "DINGTALK_APP_KEY")
  cur_url=$(read_env_value "APP_URL")
  printf "  DINGTALK_APP_KEY = %s\n" "$(mask_secret "$cur_key")"
  printf "  APP_URL         = %s\n" "${cur_url:-(未设置)}"
  echo ""

  log "=== 即将写入 ==="
  [ -n "$DINGTALK_APP_KEY" ] && log "  DINGTALK_APP_KEY = $DINGTALK_APP_KEY"
  [ -n "$APP_URL" ] && log "  APP_URL         = $APP_URL"
  echo ""

  # 备份现有 .env
  if [ -f "$ENV_FILE" ]; then
    local backup="${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
    cp "$ENV_FILE" "$backup"
    ok "已备份: $backup"
  else
    warn ".env 不存在，将创建新文件"
  fi

  # 写入
  [ -n "$DINGTALK_APP_KEY" ] && write_env_value "DINGTALK_APP_KEY" "$DINGTALK_APP_KEY"
  [ -n "$APP_URL" ] && write_env_value "APP_URL" "$APP_URL"

  echo ""
  log "=== 写入后 ==="
  cmd_config

  echo ""
  ok ".env 配置完成"
  log "重启服务使其生效: bash scripts/depot-prod.sh restart"
}

cmd_status() {
  local pids
  pids="$(pid_listening_on_port)"
  if [ -n "$pids" ]; then
    ok "服务在运行"
    log "  端口 $PORT 监听 PID: $pids"
    log "  APP_URL:  $APP_URL"
    log "  APP_KEY:  $(mask_secret "$DINGTALK_APP_KEY")"
    if [ -f "$PID_FILE" ]; then
      log "  PID 文件: $PID_FILE (内容: $(cat "$PID_FILE" 2>/dev/null))"
    fi
    log "  日志文件: $LOG_FILE"
  else
    warn "服务未运行（端口 $PORT 无监听）"
    if [ -f "$PID_FILE" ]; then
      warn "  PID 文件残留: $(cat "$PID_FILE" 2>/dev/null)"
    fi
  fi
}

cmd_start() {
  # 0. 清理本机所有 node 进程（这台机器只跑本服务；80/8080 等所有实例都会被清掉）
  #    这样 --port 临时覆盖 / restart 才是真正"清后启"
  if [ -n "$(node_pids)" ]; then
    log "清理本机残留 node 进程..."
    kill_all_node
    sleep 2
  fi
  rm -f "$PID_FILE"

  # 1. 防重复（清理后端口仍占用 → 非 next start 进程占用）
  if [ -n "$(pid_listening_on_port)" ]; then
    warn "端口 $PORT 清理后仍被占用（非 next start 进程？），请检查："
    pid_listening_on_port
    return 1
  fi

  mkdir -p "$LOG_DIR"

  log "启动服务:"
  log "  HOSTNAME=$HOSTNAME_BIND  PORT=$PORT  APP_URL=$APP_URL"
  log "  DINGTALK_APP_KEY=$(mask_secret "$DINGTALK_APP_KEY")"
  log "日志写入: $LOG_FILE"

  # 探测 node 路径(直接调 next 的 JS 入口,绕开 npx/npm/cmd 链)
  local node_dir
  node_dir=$(ensure_node_path) || {
    err "找不到 node.exe。请安装 Node.js 18+ 或把现有 node 加到 PATH"
    return 1
  }
  log "node 路径: $node_dir/node"

  # 项目本地 next 入口（转 Windows 路径，避免 MSYS 的 /c/ 被解析成 C:\c\）
  local next_bin="$PROJECT_DIR/node_modules/next/dist/bin/next"
  if [ ! -f "$next_bin" ]; then
    err "找不到 next 入口: $next_bin（请先跑 npm install）"
    return 1
  fi
  local next_bin_win
  next_bin_win=$(cygpath -w "$next_bin" 2>/dev/null || echo "$next_bin")

  (
    cd "$PROJECT_DIR" || exit 1
    # 加 System32(npm/next 偶尔会调 cmd.exe 等系统工具)
    PATH="/c/Windows/System32:$node_dir:$PATH"
    export PATH
    # 不套 nohup（nohup 会成为 $! 的进程，PID 不准）
    # 不套 setsid（Git Bash 没有这个命令）
    # Git Bash 下直接 & 即可：bash 退出时后台进程不会被 SIGHUP 杀掉（win32 子进程）
    "$node_dir/node" "$next_bin_win" start -H "$HOSTNAME_BIND" -p "$PORT" \
      >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
  )

  log "等待服务就绪..."
  local ready=0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if [ -n "$(pid_listening_on_port)" ]; then
      ready=1
      break
    fi
  done

  if [ "$ready" = "1" ]; then
    ok "服务已启动"
    cmd_status
  else
    err "服务启动失败（10 秒内未监听端口 $PORT）"
    err "最近 $LOG_TAIL_LINES 行日志:"
    tail -n "$LOG_TAIL_LINES" "$LOG_FILE" >&2 || true
    return 1
  fi
}

cmd_stop() {
  local pids
  pids="$(pid_listening_on_port)"

  if [ -z "$pids" ]; then
    warn "端口 $PORT 无监听，服务已停止"
    rm -f "$PID_FILE"
    return 0
  fi

  log "停止服务（kill PID: $pids）"
  for pid in $pids; do
    if kill_pid "$pid"; then
      ok "已结束 PID $pid"
    else
      warn "结束 PID $pid 失败（可能已退出）"
    fi
  done

  local i
  for i in 1 2 3 4 5; do
    sleep 1
    if [ -z "$(pid_listening_on_port)" ]; then
      ok "端口 $PORT 已释放"
      rm -f "$PID_FILE"
      return 0
    fi
  done

  err "端口 $PORT 在 5 秒内未释放"
  pid_listening_on_port
  return 1
}

cmd_restart() {
  cmd_stop || true
  sleep 1
  cmd_start
}

cmd_pull() {
  # 0. 工作区状态检查（有未提交改动就拒绝，避免覆盖本地修改）
  log "=== 0/6 检查工作区状态 ==="
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    err "工作区有未提交的本地改动："
    git status --short | head -20
    err "请先 commit 或 stash 再 pull"
    return 1
  fi
  ok "工作区干净"
  echo ""

  # 0.5 把 node 和 System32 加到 PATH(让 npm/npx 跑得起来)
  local pull_node_dir
  pull_node_dir=$(ensure_node_path) || {
    err "找不到 node.exe（pull 需要 npm/npx）"
    return 1
  }
  export PATH="/c/Windows/System32:$pull_node_dir:$PATH"
  log "node 路径: $pull_node_dir/node (已加入 PATH)"
  echo ""

  # 1. 拉取最新代码（用项目里配置好的镜像: ghfast.top 代理 github.com）
  log "=== 1/6 拉取最新代码（git pull）==="
  if ! (cd "$PROJECT_DIR" && git pull); then
    err "git pull 失败（可能是冲突或网络问题）"
    return 1
  fi
  echo ""

  # 2. 装依赖（用国内镜像，避开 npmjs.org 限制）
  log "=== 2/6 安装依赖（npm install）==="
  if ! (cd "$PROJECT_DIR" && npm install --registry=https://registry.npmmirror.com); then
    err "npm install 失败"
    return 1
  fi
  echo ""

  # 3. Prisma 客户端（idempotent，重新生成无副作用）
  log "=== 3/6 重新生成 Prisma 客户端 ==="
  if ! (cd "$PROJECT_DIR" && npm run prisma:generate); then
    err "prisma generate 失败"
    return 1
  fi
  echo ""

  # 4. 数据库迁移（migrate deploy 是幂等的，只应用新迁移）
  #    必须在 db/ 子目录跑，prisma.config.ts 才会被正确加载
  #    但 prisma.config.ts 按 cwd 解析数据库路径，从 db/ 跑会生成嵌套的 db/db/dev.db
  #    应用实际连的是 db/dev.db（Prisma 客户端走 resolveDatabaseUrl 的解析逻辑）
  #    所以嵌套 db/db/dev.db 是空的垃圾，migrate 跑完要清掉
  log "=== 4/6 应用数据库迁移（migrate deploy）==="
  if ! (cd "$PROJECT_DIR/db" && npx prisma migrate deploy); then
    err "migrate deploy 失败"
    return 1
  fi
  # 清理嵌套产生的空 db/db/ 目录
  if [ -d "$PROJECT_DIR/db/db" ]; then
    warn "清理嵌套的 db/db/ 目录（migrate 产生的空库，应用实际连的是 db/dev.db）"
    rm -rf "$PROJECT_DIR/db/db"
  fi
  echo ""

  # 5. 重新构建（短暂停机：先停服务 → 清 .next → build）
  log "=== 5/6 重新构建（短暂停机）==="
  log "  步骤 5a: 停止当前服务"
  cmd_stop || true
  log "  步骤 5b: 清理旧构建产物 .next/"
  rm -rf "$PROJECT_DIR/.next"
  log "  步骤 5c: 执行 next build"
  if ! (cd "$PROJECT_DIR" && npm run build); then
    err "build 失败"
    err "服务已停止，请排查后手动: bash scripts/depot-prod.sh start"
    return 1
  fi
  echo ""

  # 6. 启动新版本
  log "=== 6/6 启动新版本 ==="
  cmd_start
}

cmd_tail() {
  if [ ! -f "$LOG_FILE" ]; then
    warn "日志文件不存在: $LOG_FILE"
    return 1
  fi
  log "跟踪日志: $LOG_FILE (Ctrl+C 退出)"
  tail -n 50 -f "$LOG_FILE"
}

# ----- 参数解析 -----
parse_options() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port=*)       PORT="${1#*=}"             ;;
      --hostname=*)   HOSTNAME_BIND="${1#*=}"    ;;
      --app-url=*)    APP_URL="${1#*=}"          ;;
      --app-key=*)    DINGTALK_APP_KEY="${1#*=}" ;;
      --show-secret)  SHOW_SECRET=1              ;;
      -h|--help)      print_usage; exit 0        ;;
      *) err "未知选项: $1"; print_usage; exit 2 ;;
    esac
    shift
  done
}

# ----- 入口 -----
CMD="${1:-}"
shift || true

# 1. 初始化默认值
PORT="$DEFAULT_PORT"
HOSTNAME_BIND="$DEFAULT_HOSTNAME"
APP_URL=""
DINGTALK_APP_KEY=""
SHOW_SECRET=0

# 2. 用 .env 覆盖默认值（如果 .env 存在）
if [ -f "$ENV_FILE" ]; then
  ENV_APP_URL=$(read_env_value "APP_URL")
  ENV_APP_KEY=$(read_env_value "DINGTALK_APP_KEY")
  [ -n "$ENV_APP_URL" ] && APP_URL="$ENV_APP_URL"
  [ -n "$ENV_APP_KEY" ] && DINGTALK_APP_KEY="$ENV_APP_KEY"
fi

# 3. 用 CLI 参数覆盖（最高优先级）
parse_options "$@"

# 4. 兜底:如果 .env 和 CLI 都没给，给个最终默认值
[ -z "$APP_URL" ] && APP_URL="http://localhost:80"
[ -z "$DINGTALK_APP_KEY" ] && DINGTALK_APP_KEY=""

case "$CMD" in
  init)     cmd_init     ;;
  start)    cmd_start    ;;
  stop)     cmd_stop     ;;
  restart)  cmd_restart  ;;
  pull)     cmd_pull     ;;
  status)   cmd_status   ;;
  config)   cmd_config   ;;
  tail)     cmd_tail     ;;
  help|-h|--help) print_usage ;;
  "" )      print_usage; exit 2 ;;
  *)        err "未知命令: $CMD"; print_usage; exit 2 ;;
esac
