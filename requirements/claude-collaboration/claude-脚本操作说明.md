# Claude 脚本操作说明

这个文档用于统一记录 `scripts/` 目录下各个脚本的作用、使用方法和注意事项。后续新增脚本时，也继续补充到这个文档中，按脚本分节维护。

## 一、refresh-env-after-merge.sh

适用脚本：`scripts/refresh-env-after-merge.sh`

### 概述

用于在主仓库或各 worktree / 分支合并最新代码后，一键完成依赖安装、Prisma 同步、构建，以及按指定 `dev:*` / `start:*` 脚本重启对应服务。

### 用法

```bash
./scripts/refresh-env-after-merge.sh <npm启动脚本>
```

参数说明：
- 第 1 个参数：`npm` 启动脚本，仅支持 `dev:*` 或 `start:*`
- 端口、`APP_URL`、`DEV_ALLOWED_ORIGINS` 会从 `package.json` 的对应 script 自动推导

脚本会自动执行：
- `npm install`
- `npm run prisma:generate`
- `npx prisma db push --config db/prisma.config.ts --accept-data-loss`
- `npm run build`
- 停掉目标端口上的旧服务
- 按指定脚本重新启动服务
- 等待端口监听成功

### 常用命令清单

#### office

```bash
./scripts/refresh-env-after-merge.sh start:office
```

#### home

```bash
./scripts/refresh-env-after-merge.sh start:home
```

#### quarterly

```bash
./scripts/refresh-env-after-merge.sh dev:quarterly
```

#### annual

```bash
./scripts/refresh-env-after-merge.sh dev:annual
```

#### platform

```bash
./scripts/refresh-env-after-merge.sh dev:platform
```

#### kpi

```bash
./scripts/refresh-env-after-merge.sh dev:kpi
```

### 日志文件

日志会输出到 `scripts/log/` 目录，例如：
- `scripts/log/refresh-start-office.log`
- `scripts/log/refresh-start-home.log`
- `scripts/log/refresh-dev-quarterly.log`
- `scripts/log/refresh-dev-annual.log`
- `scripts/log/refresh-dev-platform.log`
- `scripts/log/refresh-dev-kpi.log`

## 二、sync-from-main.sh

适用脚本：`scripts/sync-from-main.sh`

### 概述

用于在当前非 `main` 分支上，快速把本地 `main` 的最新提交合并进当前分支，减少手动输入 `git merge --no-edit main` 的步骤。

### 用法

```bash
./scripts/sync-from-main.sh
```

### 作用

脚本会自动执行：
- 读取当前分支名
- 如果当前已经在 `main`，直接提示无需同步并退出
- 如果当前不在 `main`，执行 `git merge --no-edit main`

### 适用场景

- 当前在功能分支或 worktree 分支上，想把本地 `main` 的最新代码合并进来
- 合并前已经先在 `main` 分支拉取或同步过最新代码

### 注意事项

- 这个脚本依赖你本地的 `main` 已经是最新状态
- 如果当前分支和 `main` 有冲突，需要按正常 Git 流程手动解决冲突

## 三、commit-and-merge-to-main.sh

适用脚本：`scripts/commit-and-merge-to-main.sh`

### 概述

用于在当前 worktree / 功能分支上一键完成提交，并把这次提交直接 cherry-pick 到本地 `main` worktree，适合多 worktree 并行开发时快速回收单个分支成果。

### 用法

```bash
./scripts/commit-and-merge-to-main.sh <commit-message>
```

参数说明：
- 第 1 个参数：提交信息

### 作用

脚本会自动执行：
- 检查当前分支不是 `main`
- 查找本地 `main` worktree
- 如果当前没有变更，直接退出
- 执行 `git add .`
- 执行 `git commit -m "<commit-message>"`
- 读取刚提交的 commit id
- 在本地 `main` worktree 上执行 `git cherry-pick <commit-id>`

### 适用场景

- 当前在某个 worktree / 功能分支开发完成后，想一键提交当前分支并同步到本地 `main`

### 注意事项

- 需要本地已经存在 `main` worktree，否则脚本会报错退出
- 当前脚本会直接 `git add .`，因此执行前要确认工作区中所有变更都应该进入本次提交
- 如果 cherry-pick 发生冲突，需要切到对应 worktree 按正常 Git 流程处理
