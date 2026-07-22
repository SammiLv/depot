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
#   bash scripts/depot-prod.sh config              # 查看生效配置
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
#   - 防重复启动、仅清理本服务进程（不误杀其他 node）、start 失败自动 tail 日志
#   - 状态/配置展示时不输出 AppKey 明文或片段
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

# 清理本服务残留进程：PID 文件记录的旧实例 + 目标端口监听者（不误杀其他 node）
cleanup_depot_processes() {
  local old_pid pids

  if [ -f "$PID_FILE" ]; then
    old_pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$old_pid" ] && pid_alive "$old_pid"; then
      log "结束 PID 文件记录的旧实例: $old_pid"
      kill_pid "$old_pid" || true
      sleep 1
    fi
  fi

  pids="$(pid_listening_on_port)"
  if [ -n "$pids" ]; then
    log "清理端口 $PORT 上的监听进程..."
    for old_pid in $pids; do
      kill_pid "$old_pid" || true
    done
    sleep 1
  fi

  rm -f "$PID_FILE"
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

# 敏感配置状态（不输出任何密钥字符）
secret_status() {
  local v="$1"
  if [ -z "$v" ]; then
    echo "(未配置)"
  else
    echo "(已配置)"
  fi
}

# 是否为 AppKey 类敏感字段（禁止任何输出到终端/日志）
is_app_key_field() {
  local key="$1"
  [[ "$key" == "DINGTALK_APP_KEY" || "$key" == "APP_KEY" ]]
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
       bash scripts/depot-prod.sh config
       bash scripts/depot-prod.sh tail
  3) 拉新代码（git pull + 重建 + 重启，一次完成）:
       bash scripts/depot-prod.sh pull
  4) 推当前分支到 GitHub（自动处理镜像规则）:
       bash scripts/depot-prod.sh push               # 推当前分支
       bash scripts/depot-prod.sh push --branch=dev # 推指定分支
  5) 代码提交（git add + commit 到本地）:
       bash scripts/depot-prod.sh commit -m "fix: xxx"   # 提交 + 写 message
       bash scripts/depot-prod.sh commit --message="fix: xxx"  # 同上(等号语法)

init 选项（持久化到 .env）:
  --app-key=KEY    钉钉 AppKey
  --app-url=URL    APP_URL

start / restart 选项（仅本次生效，临时覆盖）:
  --port=N         绑端口（默认 80）
  --hostname=X     绑地址（默认 0.0.0.0）
  --app-url=URL    临时覆盖 APP_URL
  --app-key=KEY    临时覆盖 AppKey

push 选项:
  --branch=NAME    推哪个分支（默认当前分支）

commit 选项:
  -m "MESSAGE"     commit message(必填)
  --message=MSG    同上(等号语法)

配置优先级: CLI 参数 > .env > 脚本默认

示例:
  bash scripts/depot-prod.sh init --app-key=YOUR_KEY --app-url=http://depot.rj-info.com
  bash scripts/depot-prod.sh start
  bash scripts/depot-prod.sh config
  bash scripts/depot-prod.sh restart --port=8080    # 临时换端口
USAGE
}

# ----- 命令实现 -----

cmd_config() {
  if [ ! -f "$ENV_FILE" ]; then
    warn ".env 不存在: $ENV_FILE"
    warn "请先执行: bash scripts/depot-prod.sh init --app-key=xxx"
    return 1
  fi
  log ".env 当前配置（AppKey 仅显示是否已配置，不输出任何密钥内容）:"
  while IFS='=' read -r key value; do
    # 跳过注释/空行
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    # 去掉 value 两侧的引号
    local v="${value%\"}"
    v="${v#\"}"
    v="${v%\'}"
    v="${v#\'}"
    if is_app_key_field "$key"; then
      printf "  %s = %s\n" "$key" "$(secret_status "$v")"
    elif [[ "$key" =~ (SECRET|TOKEN|PASSWORD) ]]; then
      printf "  %s = %s\n" "$key" "$(secret_status "$v")"
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
  printf "  DINGTALK_APP_KEY = %s\n" "$(secret_status "$cur_key")"
  printf "  APP_URL         = %s\n" "${cur_url:-(未设置)}"
  echo ""

  log "=== 即将写入 ==="
  [ -n "$DINGTALK_APP_KEY" ] && log "  DINGTALK_APP_KEY = (将更新)"
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
    log "  APP_KEY:  $(secret_status "$DINGTALK_APP_KEY")"
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
  # 0. 仅清理本服务：PID 文件旧实例 + 目标端口（不误杀其他 node 进程）
  cleanup_depot_processes

  # 1. 防重复（清理后端口仍占用 → 非本服务进程占用）
  if [ -n "$(pid_listening_on_port)" ]; then
    warn "端口 $PORT 清理后仍被占用（非 next start 进程？），请检查："
    pid_listening_on_port
    return 1
  fi

  mkdir -p "$LOG_DIR"

  log "启动服务:"
  log "  HOSTNAME=$HOSTNAME_BIND  PORT=$PORT  APP_URL=$APP_URL"
  log "  APP_KEY=$(secret_status "$DINGTALK_APP_KEY")"
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
    # CLI 临时覆盖优先于 .env 文件（export 后 Next.js 进程内生效）
    export APP_URL="$APP_URL"
    export DINGTALK_APP_KEY="$DINGTALK_APP_KEY"
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

  # 5. 重新构建（短暂停机；build 失败则回滚 .next 并恢复旧服务）
  log "=== 5/6 重新构建（短暂停机）==="
  local was_running=0
  if [ -n "$(pid_listening_on_port)" ]; then
    was_running=1
  fi
  log "  步骤 5a: 停止当前服务"
  cmd_stop || true
  log "  步骤 5b: 备份旧构建产物 .next/ → .next.backup/"
  rm -rf "$PROJECT_DIR/.next.backup"
  if [ -d "$PROJECT_DIR/.next" ]; then
    mv "$PROJECT_DIR/.next" "$PROJECT_DIR/.next.backup"
  fi
  log "  步骤 5c: 执行 next build"
  if ! (cd "$PROJECT_DIR" && npm run build); then
    err "build 失败"
    rm -rf "$PROJECT_DIR/.next"
    if [ -d "$PROJECT_DIR/.next.backup" ]; then
      mv "$PROJECT_DIR/.next.backup" "$PROJECT_DIR/.next"
      ok "已回滚到备份的 .next/"
    fi
    if [ "$was_running" = "1" ]; then
      warn "正在恢复旧版本服务..."
      if cmd_start; then
        ok "旧版本服务已恢复运行"
      else
        err "旧版本服务恢复失败，请手动: bash scripts/depot-prod.sh start"
      fi
    else
      warn "部署前服务未运行，请排查 build 错误后手动 start"
    fi
    return 1
  fi
  rm -rf "$PROJECT_DIR/.next.backup"
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

# 备份/恢复镜像规则的辅助函数
push_mirror_backup() {
  PUSH_MIRROR_BACKUP_FILE=$(mktemp)
  git config --local --get-regexp "^url\..*\.insteadOf$" > "$PUSH_MIRROR_BACKUP_FILE" 2>/dev/null || true
  while IFS= read -r rule; do
    [ -z "$rule" ] && continue
    local key="${rule%% *}"
    git config --local --unset "$key" 2>/dev/null || true
  done < "$PUSH_MIRROR_BACKUP_FILE"
  PUSH_MIRROR_BACKUP_COUNT=$(wc -l < "$PUSH_MIRROR_BACKUP_FILE" 2>/dev/null | tr -d ' ' || echo 0)
}

push_mirror_restore() {
  if [ -z "$PUSH_MIRROR_BACKUP_FILE" ] || [ ! -f "$PUSH_MIRROR_BACKUP_FILE" ]; then
    return 0
  fi
  while IFS= read -r rule; do
    [ -z "$rule" ] && continue
    local key="${rule%% *}"
    local val="${rule#* }"
    git config --local --add "$key" "$val" 2>/dev/null || true
  done < "$PUSH_MIRROR_BACKUP_FILE"
  rm -f "$PUSH_MIRROR_BACKUP_FILE" 2>/dev/null
  PUSH_MIRROR_BACKUP_FILE=""
}

cmd_push() {
  # 0/4 网络预检(关键:不通就告诉用户怎么开代理,不要瞎试)
  log "=== 0/4 网络预检(必须可达 GitHub)==="
  if ! curl -sI --connect-timeout 5 --max-time 10 https://github.com 2>/dev/null | grep -q "^HTTP"; then
    err "GitHub 不可达,无法 push"
    err ""
    err "可能原因:"
    err "  1. 公司网络封 GitHub(直连 + ghfast.top 镜像都只能读不能写)"
    err "  2. 没启用代理 / VPN / FlClash 等"
    err ""
    err "建议:"
    err "  - 启用 FlClash / VPN / 公司代理"
    err "  - 在浏览器里手动访问 https://github.com 验证"
    err "  - 通后再回来重试"
    return 1
  fi
  ok "GitHub 可达"
  echo ""

  # 1/4 临时清掉镜像规则
  log "=== 1/4 临时清掉镜像规则 ==="
  PUSH_MIRROR_BACKUP_FILE=""
  push_mirror_backup
  if [ "${PUSH_MIRROR_BACKUP_COUNT:-0}" -gt 0 ]; then
    ok "已临时清除 $PUSH_MIRROR_BACKUP_COUNT 条镜像规则"
  else
    log "无镜像规则,跳过"
  fi
  echo ""

  # 2/4 实际 push
  local branch="$PUSH_BRANCH"
  if [ -z "$branch" ]; then
    branch=$(cd "$PROJECT_DIR" && git symbolic-ref --short HEAD 2>/dev/null || echo "main")
  fi
  log "=== 2/4 git push origin $branch ==="
  log "(会用 Windows Credential Manager 缓存的 PAT;首次会弹 GitHub Token 框)"
  local push_ok=0
  (cd "$PROJECT_DIR" && git push origin "$branch") || push_ok=1

  # 3/4 恢复镜像规则
  echo ""
  log "=== 3/4 恢复镜像规则 ==="
  push_mirror_restore
  ok "已恢复(以后 pull 自动走镜像)"
  echo ""

  # 4/4 总结
  log "=== 4/4 总结 ==="
  if [ "$push_ok" -ne 0 ]; then
    err "git push 失败"
    err ""
    err "可能原因:"
    err "  - 403:PAT 权限不够 → 检查 https://github.com/settings/tokens"
    err "  - 404:仓库不存在 / 拼写错"
    err "  - 401:PAT 无效 / 已过期"
    err "  - 'could not read Username':WorkBuddy bash 无 tty 设备,需要用 cmd 跑"
    return 1
  fi
  ok "push 成功"
  (cd "$PROJECT_DIR" && git status -sb)
  log ""
  ok "镜像规则已恢复(后续 pull/fetch 自动走 ghfast.top 加速)"
}

cmd_commit() {
  # 0/4 检查 git 用户配置
  log "=== 0/4 检查 git 用户配置 ==="
  local user_name user_email
  user_name=$(cd "$PROJECT_DIR" && git config user.name 2>/dev/null)
  user_email=$(cd "$PROJECT_DIR" && git config user.email 2>/dev/null)
  if [ -z "$user_name" ] || [ -z "$user_email" ]; then
    err "git 用户配置未设置"
    err ""
    err "请跑:"
    err "  git config --global user.name  \"你的名字\""
    err "  git config --global user.email \"你的邮箱\""
    return 1
  fi
  log "user.name:  $user_name"
  log "user.email: $user_email"
  echo ""

  # 1/4 预览要 commit 的内容
  log "=== 1/4 要 commit 的内容 ==="
  if [ -z "$(cd "$PROJECT_DIR" && git status --short)" ]; then
    err "工作区干净,没有可提交的内容"
    return 1
  fi
  (cd "$PROJECT_DIR" && git status --short)
  echo ""
  log "改动统计:"
  (cd "$PROJECT_DIR" && git diff --stat HEAD 2>/dev/null | tail -5)
  echo ""

  # 2/4 接收 commit message
  local msg="$COMMIT_MSG"
  if [ -z "$msg" ]; then
    err "请通过 -m \"你的 commit message\" 传 commit message"
    err "示例: bash scripts/depot-prod.sh commit -m \"fix: xxx\""
    return 1
  fi
  log "commit message: $msg"
  echo ""

  # 3/4 实际 commit
  log "=== 3/4 提交 ==="
  log "git add -A"
  (cd "$PROJECT_DIR" && git add -A) || { err "git add 失败"; return 1; }
  log "git commit -m \"$msg\""
  if (cd "$PROJECT_DIR" && git commit -m "$msg"); then
    ok "commit 成功"
  else
    err "git commit 失败"
    return 1
  fi
  echo ""

  # 4/4 总结
  log "=== 4/4 总结 ==="
  (cd "$PROJECT_DIR" && git log --oneline -3)
  log ""
  warn "改动还在本地仓库,跑 'bash scripts/depot-prod.sh push' 推上去"
}

# ----- 参数解析 -----
parse_options() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port=*)       PORT="${1#*=}"             ;;
      --hostname=*)   HOSTNAME_BIND="${1#*=}"    ;;
      --app-url=*)    APP_URL="${1#*=}"          ;;
      --app-key=*)    DINGTALK_APP_KEY="${1#*=}" ;;
      --branch=*)     PUSH_BRANCH="${1#*=}"      ;;
      -m)             COMMIT_MSG="$2"; shift    ;;
      --message=*)    COMMIT_MSG="${1#*=}"      ;;
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
PUSH_BRANCH=""
COMMIT_MSG=""

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
  push)     cmd_push     ;;
  commit)   cmd_commit   ;;
  status)   cmd_status   ;;
  config)   cmd_config   ;;
  tail)     cmd_tail     ;;
  help|-h|--help) print_usage ;;
  "" )      print_usage; exit 2 ;;
  *)        err "未知命令: $CMD"; print_usage; exit 2 ;;
esac
