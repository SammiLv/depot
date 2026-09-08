#!/usr/bin/env bash
# =============================================================================
# depot-test.sh — Depot 开发/测试环境一键脚本（供同事拉取、更新、联调代码）
#
# 与 depot-prod.sh（生产 Windows 机）的区别：
#   - 跨平台：macOS / Windows Git Bash 均可运行
#   - 服务跑 next dev（热更新），而非 next start
#   - 数据库用 prisma db push（开发库），不用 migrate deploy
#   - push 默认推共享集成分支 depot-KPI，也可用 push main 指定推 main
#
# 用法:
#   bash scripts/depot-test.sh init                 # 新环境初始化（检查并安装 git/node/pnpm，装依赖，建库）
#   bash scripts/depot-test.sh pull                 # 拉 main 最新代码 + 重建环境 + 重启服务
#   bash scripts/depot-test.sh pull depot-KPI       # 拉 depot-KPI 最新代码 + 重建环境 + 重启服务
#   bash scripts/depot-test.sh push                 # 推当前代码到 origin/depot-KPI（跟踪 main 时自动改跟踪 depot-KPI）
#   bash scripts/depot-test.sh push main            # 推当前代码到 origin/main（不改跟踪关系）
#   bash scripts/depot-test.sh commit -m "fix: xx"  # 提交当前改动到本地当前分支
#   bash scripts/depot-test.sh start|stop|restart   # 日常运维
#   bash scripts/depot-test.sh status|config|tail   # 状态 / 配置 / 日志
#
# init 选项（持久化到 .env，可选）:
#   --app-key=KEY    钉钉 AppKey
#   --app-url=URL    APP_URL（默认 http://localhost:3000）
#
# start / restart 选项（仅本次生效）:
#   --port=N         绑端口（默认 3000）
#   --hostname=X     绑地址（默认 0.0.0.0）
#
# 设计要点:
#   - 环境配置持久化在 .env（已 gitignore）
#   - 日志追加到 logs/depot-test.log，PID 写入 logs/depot-test.pid
#   - 依赖安装走国内镜像 registry.npmmirror.com
#   - push 前做 GitHub 连通性预检，自动临时清除/恢复 ghfast.top 镜像规则
#   - 防重复启动、仅清理本服务进程（不误杀其他 node）
# =============================================================================

set -u

# ===================== 脚本默认值 =====================
DEFAULT_PORT=3000
DEFAULT_HOSTNAME="0.0.0.0"
DEFAULT_PUSH_BRANCH="depot-KPI"    # push 的默认目标分支（可用 push main 或 --to=main 改推 main）
PNPM_VERSION="11.20.0"             # 与 package.json packageManager 对齐
NODE_MIN_MAJOR=22                  # 最低 Node 大版本（推荐 24）
PNPM_REGISTRY="https://registry.npmmirror.com"
# =======================================================================

# ----- 路径 -----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/depot-test.log"
PID_FILE="$LOG_DIR/depot-test.pid"
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

# ----- 平台检测 -----
detect_os() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    Darwin*)              echo "mac" ;;
    *)                    echo "linux" ;;
  esac
}
OS="$(detect_os)"

# 确保 Windows System32 在 PATH 中（netstat / tasklist / taskkill 在那里）
if [ "$OS" = "windows" ]; then
  if [ -d "/c/Windows/System32" ] && [[ ":$PATH:" != *":/c/Windows/System32:"* ]]; then
    export PATH="/c/Windows/System32:$PATH"
  fi
fi

# ----- 进程/端口管理（按平台分支） -----

# 取占用 $PORT 的 PID
pid_listening_on_port() {
  if [ "$OS" = "windows" ]; then
    # 不用 sort -u:Git Bash 的 sort 在精简 PATH 下吞输出，改用 awk 去重
    netstat -ano 2>/dev/null \
      | grep -E ":${PORT}[[:space:]].*LISTENING" \
      | awk '{print $NF}' \
      | awk '!seen[$0]++'
  else
    lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null
  fi
}

# 杀进程（Windows 需绕开 MSYS 路径转换）
kill_pid() {
  local pid="$1"
  if [ "$OS" = "windows" ]; then
    MSYS_NO_PATHCONV=1 taskkill /PID "$pid" /F >/dev/null 2>&1
  else
    kill "$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1
  fi
}

# 判断进程是否还活着
pid_alive() {
  local pid="$1"
  if [ -z "$pid" ]; then
    return 1
  fi
  if [ "$OS" = "windows" ]; then
    MSYS_NO_PATHCONV=1 tasklist /FI "PID eq $pid" 2>/dev/null | grep -q "$pid"
  else
    kill -0 "$pid" >/dev/null 2>&1
  fi
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

# ----- .env 读写 -----

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
    awk -v k="$key" -v v="$value" '
      $0 ~ "^" k "=" { printf("%s=\"%s\"\n", k, v); found=1; next }
      { print }
      END { if (!found) printf("\n%s=\"%s\"\n", k, v) }
    ' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
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

# ----- node / pnpm 探测与安装 -----

# 探测 node 所在目录（标准输出）；找不到返回非 0
# 顺序：nvm 管理的 Node 24+（项目标准版本）→ PATH → 平台常见安装位置
# 注意必须与本机安装依赖时的 Node 大版本一致，否则 better-sqlite3 原生绑定 ABI 不匹配
find_node_dir() {
  # 1. nvm 版本目录（mac/linux ~/.nvm，windows 常见挂载），优先 v24+
  local nvm_dir latest
  for nvm_dir in "$HOME/.nvm/versions/node" "/c/nvm/versions/node" "$HOME/AppData/Roaming/nvm"; do
    if [ -d "$nvm_dir" ]; then
      latest=$(ls -d "$nvm_dir"/v2[4-9]*/bin "$nvm_dir"/v2[4-9]* 2>/dev/null | sort -V | tail -1)
      if [ -n "$latest" ] && { [ -x "$latest/node" ] || [ -x "$latest/node.exe" ]; }; then
        echo "$latest"
        return 0
      fi
    fi
  done
  # 2. PATH 里的 node
  if command -v node >/dev/null 2>&1; then
    command -v node | xargs dirname
    return 0
  fi
  # 3. 平台常见安装位置
  local candidates=()
  if [ "$OS" = "windows" ]; then
    candidates=(
      "/c/Program Files/nodejs"
      "/c/Program Files (x86)/nodejs"
    )
  else
    candidates=(
      "/usr/local/bin"
      "/opt/homebrew/bin"
    )
  fi
  local d
  for d in "${candidates[@]}"; do
    if [ -x "$d/node.exe" ] || [ -x "$d/node" ]; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

node_major_version() {
  node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo "0"
}

# 安装 git（按平台）
install_git() {
  log "尝试安装 git..."
  if [ "$OS" = "mac" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install git
    else
      err "未检测到 Homebrew。请先装 Command Line Tools: xcode-select --install（会弹窗确认），或装 Homebrew 后重试"
      return 1
    fi
  elif [ "$OS" = "windows" ]; then
    if command -v winget >/dev/null 2>&1; then
      winget install --id Git.Git -e --source winget
    else
      err "未检测到 winget。请手动安装 Git for Windows: https://git-scm.com/download/win"
      return 1
    fi
  else
    err "请用系统包管理器安装 git（如 apt/dnf install git）"
    return 1
  fi
}

# 安装 node（按平台）
install_node() {
  log "尝试安装 Node.js..."
  if [ "$OS" = "mac" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install node
    else
      err "未检测到 Homebrew。请安装 Node.js $NODE_MIN_MAJOR+（推荐 nvm: https://github.com/nvm-sh/nvm）"
      return 1
    fi
  elif [ "$OS" = "windows" ]; then
    if command -v winget >/dev/null 2>&1; then
      winget install --id OpenJS.NodeJS -e --source winget
    else
      err "未检测到 winget。请手动安装 Node.js $NODE_MIN_MAJOR+: https://nodejs.org/"
      return 1
    fi
  else
    err "请用系统包管理器或 nvm 安装 Node.js $NODE_MIN_MAJOR+"
    return 1
  fi
}

# 安装/激活 pnpm（优先 corepack，与 packageManager 字段对齐）
install_pnpm() {
  log "尝试通过 corepack 激活 pnpm@$PNPM_VERSION..."
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    if corepack prepare "pnpm@$PNPM_VERSION" --activate 2>/dev/null; then
      return 0
    fi
  fi
  warn "corepack 不可用，改用 npm 全局安装"
  if command -v npm >/dev/null 2>&1; then
    npm install -g "pnpm@$PNPM_VERSION" --registry="$PNPM_REGISTRY"
    return $?
  fi
  err "corepack 和 npm 都不可用，无法安装 pnpm"
  return 1
}

# 确保 node/pnpm 可用（把探测到的 node 目录加入 PATH）
ensure_runtime() {
  local node_dir
  node_dir=$(find_node_dir) || {
    err "找不到 node。请先执行: bash scripts/depot-test.sh init"
    return 1
  }
  export PATH="$node_dir:$PATH"
  if ! command -v pnpm >/dev/null 2>&1; then
    err "找不到 pnpm。请先执行: bash scripts/depot-test.sh init"
    return 1
  fi
  return 0
}

# ----- 用法 -----
print_usage() {
  cat <<USAGE
depot-test.sh — Depot 开发/测试环境一键脚本（当前平台: ${OS}）

新环境（一次性）:
  bash scripts/depot-test.sh init [--app-url=URL] [--app-key=KEY]

日常开发（反复用）:
  bash scripts/depot-test.sh pull                  # 拉 origin/main 最新代码 + 重建 + 重启
  bash scripts/depot-test.sh pull depot-KPI        # 拉 origin/depot-KPI 最新代码 + 重建 + 重启
  bash scripts/depot-test.sh pull --from=depot-KPI # 同上（等号语法）
  bash scripts/depot-test.sh push                  # 推当前代码到 origin/${DEFAULT_PUSH_BRANCH}
  bash scripts/depot-test.sh push main             # 推当前代码到 origin/main
  bash scripts/depot-test.sh push --to=main        # 同上（等号语法）
  bash scripts/depot-test.sh commit -m "fix: xxx"  # 提交改动到本地当前分支

日常运维:
  bash scripts/depot-test.sh start [--port=N] [--hostname=X]
  bash scripts/depot-test.sh stop
  bash scripts/depot-test.sh restart
  bash scripts/depot-test.sh status
  bash scripts/depot-test.sh config
  bash scripts/depot-test.sh tail

说明:
  - 服务跑 next dev（热更新），默认端口 $DEFAULT_PORT
  - push 默认推到 ${DEFAULT_PUSH_BRANCH} 分支；若本地分支跟踪的是 origin/main，
    push 后自动改为跟踪 origin/${DEFAULT_PUSH_BRANCH}
  - push main 可指定推送到 main 分支（不改变跟踪关系）
  - 配置优先级: CLI 参数 > .env > 脚本默认
USAGE
}

# ----- 命令实现 -----

cmd_config() {
  if [ ! -f "$ENV_FILE" ]; then
    warn ".env 不存在: $ENV_FILE"
    warn "可先执行: bash scripts/depot-test.sh init"
    return 1
  fi
  log ".env 当前配置（AppKey 仅显示是否已配置，不输出任何密钥内容）:"
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
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

# 新环境初始化：检查并按需安装 git / node / pnpm，然后装依赖、建库
cmd_init() {
  log "=== 1/5 检查 git ==="
  if command -v git >/dev/null 2>&1; then
    ok "git 已安装: $(git --version)"
  else
    install_git || return 1
    command -v git >/dev/null 2>&1 || { err "git 安装后仍不可用，请重开终端后重试"; return 1; }
    ok "git 安装完成: $(git --version)"
  fi
  echo ""

  log "=== 2/5 检查 Node.js（要求 $NODE_MIN_MAJOR+，推荐 24）==="
  local node_dir
  node_dir=$(find_node_dir || true)
  if [ -n "$node_dir" ]; then
    export PATH="$node_dir:$PATH"
    local major
    major=$(node_major_version)
    if [ "$major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
      ok "node 已安装: $(node --version)（${node_dir}）"
      [ "$major" -lt 24 ] && warn "推荐 Node 24，当前 $major 也可运行"
    else
      warn "node 版本过低（$(node --version)），需要 $NODE_MIN_MAJOR+"
      install_node || return 1
    fi
  else
    install_node || return 1
    node_dir=$(find_node_dir || true)
    [ -n "$node_dir" ] && export PATH="$node_dir:$PATH"
    command -v node >/dev/null 2>&1 || { err "node 安装后仍不可用，请重开终端后重试"; return 1; }
    ok "node 安装完成: $(node --version)"
  fi
  echo ""

  log "=== 3/5 检查 pnpm（${PNPM_VERSION}）==="
  if command -v pnpm >/dev/null 2>&1; then
    ok "pnpm 已安装: $(pnpm --version)"
  else
    install_pnpm || return 1
    command -v pnpm >/dev/null 2>&1 || { err "pnpm 安装后仍不可用，请重开终端后重试"; return 1; }
    ok "pnpm 安装完成: $(pnpm --version)"
  fi
  echo ""

  log "=== 4/5 安装项目依赖（pnpm install）==="
  if ! (cd "$PROJECT_DIR" && pnpm install --registry="$PNPM_REGISTRY"); then
    err "pnpm install 失败"
    return 1
  fi
  ok "依赖安装完成"
  echo ""

  log "=== 5/5 初始化数据库（prisma generate + db push）==="
  if ! (cd "$PROJECT_DIR" && pnpm run prisma:generate); then
    err "prisma generate 失败"
    return 1
  fi
  if ! (cd "$PROJECT_DIR" && pnpm exec prisma db push --config db/prisma.config.ts --accept-data-loss); then
    err "prisma db push 失败"
    return 1
  fi
  ok "数据库就绪（db/dev.db）"
  echo ""

  # 可选：写入 .env
  if [ -n "$DINGTALK_APP_KEY" ] || [ -n "$CLI_APP_URL" ]; then
    [ -n "$DINGTALK_APP_KEY" ] && write_env_value "DINGTALK_APP_KEY" "$DINGTALK_APP_KEY"
    [ -n "$CLI_APP_URL" ] && write_env_value "APP_URL" "$CLI_APP_URL"
    ok ".env 配置已写入"
    echo ""
  fi

  ok "初始化完成！启动服务: bash scripts/depot-test.sh start"
  log "首次访问请先打开 $APP_URL/login?mode=init 初始化系统管理员账号"
}

cmd_status() {
  local pids
  pids="$(pid_listening_on_port)"
  if [ -n "$pids" ]; then
    ok "服务在运行（next dev）"
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
    warn "端口 $PORT 清理后仍被占用（非本服务进程？），请检查："
    pid_listening_on_port
    return 1
  fi

  mkdir -p "$LOG_DIR"

  log "启动服务（next dev）:"
  log "  HOSTNAME=$HOSTNAME_BIND  PORT=$PORT  APP_URL=$APP_URL"
  log "  APP_KEY=$(secret_status "$DINGTALK_APP_KEY")"
  log "日志写入: $LOG_FILE"

  # 探测 node 路径(直接调 next 的 JS 入口,绕开 pnpm/cmd 链,PID 更准确)
  local node_dir
  node_dir=$(find_node_dir) || {
    err "找不到 node。请先执行: bash scripts/depot-test.sh init"
    return 1
  }
  log "node 路径: $node_dir/node"

  local node_bin="$node_dir/node"
  [ -x "$node_dir/node.exe" ] && node_bin="$node_dir/node.exe"

  # 项目本地 next 入口（Windows 转 Windows 路径，避免 MSYS 的 /c/ 被解析成 C:\c\）
  local next_bin="$PROJECT_DIR/node_modules/next/dist/bin/next"
  if [ ! -f "$next_bin" ]; then
    err "找不到 next 入口: $next_bin（请先跑 pnpm install 或 bash scripts/depot-test.sh init）"
    return 1
  fi
  if [ "$OS" = "windows" ]; then
    next_bin=$(cygpath -w "$next_bin" 2>/dev/null || echo "$next_bin")
  fi

  (
    cd "$PROJECT_DIR" || exit 1
    PATH="$node_dir:$PATH"
    export PATH
    # CLI 临时覆盖优先于 .env 文件（export 后 Next.js 进程内生效）
    export NODE_ENV=development
    export NOTIFICATION_SCHEDULER_ENABLED=true
    export APP_URL="$APP_URL"
    export DINGTALK_APP_KEY="$DINGTALK_APP_KEY"
    export DEV_ALLOWED_ORIGINS="localhost:$PORT,127.0.0.1:$PORT"
    # Git Bash 下直接 & 即可：bash 退出时后台进程不会被 SIGHUP 杀掉（win32 子进程）
    # mac/linux 用 nohup 防 SIGHUP；nohup 会 exec 目标进程，$! 仍指向 node
    if [ "$OS" = "windows" ]; then
      "$node_bin" "$next_bin" dev -H "$HOSTNAME_BIND" -p "$PORT" \
        >> "$LOG_FILE" 2>&1 &
    else
      nohup "$node_bin" "$next_bin" dev -H "$HOSTNAME_BIND" -p "$PORT" \
        >> "$LOG_FILE" 2>&1 &
    fi
    echo $! > "$PID_FILE"
  )

  log "等待服务就绪..."
  local ready=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    sleep 1
    if [ -n "$(pid_listening_on_port)" ]; then
      ready=1
      break
    fi
  done

  if [ "$ready" = "1" ]; then
    ok "服务已启动: $APP_URL"
    cmd_status
  else
    err "服务启动失败（20 秒内未监听端口 ${PORT}）"
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

  log "停止服务（kill PID: ${pids}）"
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

# pull 是否需要 pnpm install：node_modules 缺失，或本次 pull 改动了 package.json / pnpm-lock.yaml
pull_needs_pnpm_install() {
  if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    return 0
  fi
  if [ ! -d "$PROJECT_DIR/node_modules/next" ]; then
    return 0
  fi
  if (cd "$PROJECT_DIR" && git diff --name-only ORIG_HEAD HEAD 2>/dev/null \
    | grep -qE '^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$'); then
    return 0
  fi
  return 1
}

cmd_pull() {
  # 0. 工作区状态检查（有未提交改动就拒绝，避免覆盖本地修改）
  log "=== 0/5 检查工作区状态 ==="
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    err "工作区有未提交的本地改动："
    git status --short | head -20
    err "请先 commit 或 stash 再 pull"
    return 1
  fi
  ok "工作区干净"
  echo ""

  # 0.5 确保 node/pnpm 可用
  ensure_runtime || return 1
  log "node: $(node --version)  pnpm: $(pnpm --version)"
  echo ""

  # 1. 拉取指定分支最新代码（默认 main；用项目里配置好的镜像: ghfast.top 代理 github.com）
  log "=== 1/5 拉取 ${PULL_BRANCH} 最新代码（git pull origin ${PULL_BRANCH}）==="
  if ! (cd "$PROJECT_DIR" && git pull --no-rebase origin "$PULL_BRANCH"); then
    err "git pull 失败（可能是冲突或网络问题）"
    return 1
  fi
  echo ""

  # 2. 装依赖（仅 node_modules 缺失或依赖清单有变更时）
  log "=== 2/5 检查/安装依赖（pnpm install）==="
  if pull_needs_pnpm_install; then
    log "依赖有变更或 node_modules 缺失，执行 pnpm install"
    if ! (cd "$PROJECT_DIR" && pnpm install --registry="$PNPM_REGISTRY"); then
      err "pnpm install 失败"
      return 1
    fi
  else
    ok "依赖未变且 node_modules 已存在，跳过 pnpm install"
  fi
  echo ""

  # 3. Prisma 客户端（idempotent，重新生成无副作用）
  log "=== 3/5 重新生成 Prisma 客户端 ==="
  if ! (cd "$PROJECT_DIR" && pnpm run prisma:generate); then
    err "prisma generate 失败"
    return 1
  fi
  echo ""

  # 4. 停服务释放 SQLite 锁（db push 需要独占写库；服务在跑会 database is locked）
  log "=== 4/5 停止当前服务（释放数据库锁）==="
  cmd_stop || true
  echo ""

  # 5. 同步数据库结构（开发库用 db push，幂等）并重启
  log "=== 5/5 同步数据库结构并重启服务 ==="
  if ! (cd "$PROJECT_DIR" && pnpm exec prisma db push --config db/prisma.config.ts --accept-data-loss); then
    err "prisma db push 失败"
    warn "尝试恢复服务..."
    cmd_start || err "服务恢复失败，请手动: bash scripts/depot-test.sh start"
    return 1
  fi
  # 兼容旧版误生成的嵌套库目录
  if [ -d "$PROJECT_DIR/db/db" ]; then
    warn "清理嵌套的 db/db/ 目录"
    rm -rf "$PROJECT_DIR/db/db"
  fi
  echo ""
  cmd_start
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

# GitHub 是否可达（Git Bash 下 curl -sI | grep ^HTTP 会误判，改用 http_code）
github_reachable() {
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" \
    --connect-timeout 5 --max-time 15 https://github.com 2>/dev/null || echo "000")
  [ "$code" != "000" ] && [ -n "$code" ]
}

cmd_push() {
  # 0/4 网络预检(关键:不通就告诉用户怎么开代理,不要瞎试)
  log "=== 0/4 网络预检(必须可达 GitHub)==="
  if ! github_reachable; then
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

  # 2/4 实际 push：当前分支 → origin/$PUSH_TARGET
  local branch
  branch=$(cd "$PROJECT_DIR" && git symbolic-ref --short HEAD 2>/dev/null || echo "")
  if [ -z "$branch" ]; then
    err "当前处于 detached HEAD，无法确定本地分支"
    push_mirror_restore
    return 1
  fi
  log "=== 2/4 git push origin ${branch}:${PUSH_TARGET} ==="
  local push_ok=0
  (cd "$PROJECT_DIR" && git push origin "$branch:$PUSH_TARGET") || push_ok=1

  # 3/4 恢复镜像规则
  echo ""
  log "=== 3/4 恢复镜像规则 ==="
  push_mirror_restore
  ok "已恢复(以后 pull 自动走镜像)"
  echo ""

  # 4/4 跟踪关系调整 + 总结
  log "=== 4/4 总结 ==="
  if [ "$push_ok" -ne 0 ]; then
    err "git push 失败"
    err ""
    err "可能原因:"
    err "  - ${PUSH_TARGET} 上有别人的新提交 → 先 bash scripts/depot-test.sh pull ${PUSH_TARGET} 同步后再推"
    err "  - 403:PAT 权限不够 → 检查 https://github.com/settings/tokens"
    err "  - 401:PAT 无效 / 已过期"
    return 1
  fi
  ok "push 成功: $branch → origin/${PUSH_TARGET}"

  # 推到默认集成分支且当前跟踪的是 origin/main 时，改为跟踪 origin/$PUSH_TARGET
  # （指定 push main 时不改动跟踪关系）
  local upstream
  upstream=$(cd "$PROJECT_DIR" && git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || echo "")
  if [ "$PUSH_TARGET" != "main" ] && [ "$upstream" = "origin/main" ]; then
    if (cd "$PROJECT_DIR" && git branch --set-upstream-to="origin/${PUSH_TARGET}" "$branch"); then
      ok "分支跟踪已从 origin/main 切换为 origin/${PUSH_TARGET}"
    else
      warn "跟踪切换失败，可手动: git branch --set-upstream-to=origin/${PUSH_TARGET}"
    fi
  elif [ -n "$upstream" ]; then
    log "当前跟踪: ${upstream}（保持不变）"
  fi
  (cd "$PROJECT_DIR" && git status -sb)
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
    err "示例: bash scripts/depot-test.sh commit -m \"fix: xxx\""
    return 1
  fi
  log "commit message: $msg"
  echo ""

  # 3/4 实际 commit
  log "=== 3/4 提交到本地当前分支 ==="
  local branch
  branch=$(cd "$PROJECT_DIR" && git symbolic-ref --short HEAD 2>/dev/null || echo "(detached)")
  log "当前分支: $branch"
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
  warn "改动还在本地仓库,跑 'bash scripts/depot-test.sh push' 推到 ${DEFAULT_PUSH_BRANCH}（或 push main 推到 main）"
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
      --app-url=*)    APP_URL="${1#*=}"; CLI_APP_URL="${1#*=}" ;;
      --app-key=*)    DINGTALK_APP_KEY="${1#*=}" ;;
      --from=*)       PULL_BRANCH="${1#*=}"      ;;
      --to=*)         PUSH_TARGET="${1#*=}"      ;;
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
CLI_APP_URL=""
DINGTALK_APP_KEY=""
COMMIT_MSG=""
PULL_BRANCH="main"
PUSH_TARGET="$DEFAULT_PUSH_BRANCH"

# pull 的位置参数：pull depot-KPI 等价于 pull --from=depot-KPI
if [ "$CMD" = "pull" ] && [ $# -gt 0 ] && [[ "$1" != -* ]]; then
  PULL_BRANCH="$1"
  shift
fi

# push 的位置参数：push main 等价于 push --to=main
if [ "$CMD" = "push" ] && [ $# -gt 0 ] && [[ "$1" != -* ]]; then
  PUSH_TARGET="$1"
  shift
fi

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
[ -z "$APP_URL" ] && APP_URL="http://localhost:$PORT"
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
