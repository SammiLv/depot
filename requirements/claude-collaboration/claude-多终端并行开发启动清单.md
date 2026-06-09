# Claude 多终端并行开发启动清单

## 1. 总原则

1. 一个终端一个 worktree。
2. 一个终端一个分支。
3. 主仓库目录尽量保持在 `main`，只作为干净基线和 worktree 管理入口。
4. 默认只开 3 个终端。
5. 按本轮要改的菜单动态分工，不按大模块永久分组。
6. 第 3 个终端负责平台收口；涉及 DB 时优先负责 DB 协调。

一句话：**两个菜单终端 + 一个平台终端**；每个终端都在各自独立目录中协作，如有 DB，再由平台终端优先处理 DB，必要时才临时开第 4 个终端。

## 2. 默认 3 终端模型

### 终端 A：菜单 1
负责本轮第一个菜单对应的：

- `src/app/(authenticated)/<menu>`
- `src/server/<menu-server>`

### 终端 B：菜单 2
负责本轮第二个菜单对应的：

- `src/app/(authenticated)/<menu>`
- `src/server/<menu-server>`

### 终端 C：平台 / 公共 / DB 协调
默认负责：

- `src/components/app-shell.tsx`
- `src/components/ui-kit.tsx`
- `src/app/(authenticated)/layout.tsx`
- `src/app/login`
- `src/server/auth`
- `src/server/permissions`
- `src/server/dingtalk`

如本轮涉及 DB，再优先负责：

- `db/`
- `src/generated/prisma/`
- `src/server/db/prisma.ts`

## 3. 推荐使用方式

### 场景 A：不涉及 DB
开 3 个终端：

1. 菜单 A
2. 菜单 B
3. platform

### 场景 B：涉及 DB，但改动不大
仍然开 3 个终端：

1. 菜单 A
2. 菜单 B
3. platform + db

原则：第 3 个终端优先级是 **DB > 平台 > 零碎业务改动**。

### 场景 C：涉及 DB，且两个菜单都很重
临时开第 4 个终端：

1. 菜单 A
2. 菜单 B
3. platform
4. db

## 4. 菜单式 worktree / branch 命名

建议直接按菜单命名。

示例：

- 年度指标：`../depot-coordination/depot-annual-goals` / `feat/menu-annual-goals-<topic>`
- KPI 管理：`../depot-coordination/depot-kpi` / `feat/menu-kpi-<topic>`
- 季度工作：`../depot-coordination/depot-quarterly-work` / `feat/menu-quarterly-work-<topic>`
- 通知中心：`../depot-coordination/depot-notifications` / `feat/menu-notifications-<topic>`
- 平台终端：`../depot-coordination/depot-platform` / `feat/platform-<topic>`
- DB 终端：`../depot-coordination/depot-db` / `feat/db-<topic>`

## 5. 创建 worktree 的命令示例

### 示例：本轮开发“年度指标 + KPI 管理”

```bash
git worktree add ../depot-coordination/depot-annual-goals -b feat/menu-annual-goals-overview
git worktree add ../depot-coordination/depot-kpi -b feat/menu-kpi-progress-panel
git worktree add ../depot-coordination/depot-platform -b feat/platform-annual-goals-kpi-support
```

### 如本轮还涉及 DB

```bash
git worktree add ../depot-coordination/depot-db -b feat/db-annual-goals-kpi-fields
```

### 如果分支已经存在

```bash
git worktree add ../depot-coordination/depot-quarterly-work feat/menu-quarterly-work-list
```

## 6. 高冲突区清单

以下区域默认不要由菜单终端直接改：

- `src/components/app-shell.tsx`
- `src/components/ui-kit.tsx`
- `src/app/(authenticated)/layout.tsx`
- `src/server/auth/*`
- `src/server/permissions/*`
- `src/server/db/prisma.ts`
- `db/*`
- `src/generated/prisma/*`
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `tsconfig.json`

## 7. 开发规则

### 菜单终端
- 只改本轮菜单目录和最小必要的 server 逻辑。
- 新组件优先放菜单目录附近，不急着抽共享。
- 如果要加菜单入口、改全局布局、改权限显示、改 DB schema，先停下来交给终端 C。

### 平台终端
- 统一收口共享布局、登录、权限、共用组件。
- 本轮涉及 DB 时，统一协调 schema / migration / generated client。

## 8. 有 DB 改动时的执行顺序

1. 先由终端 C（或单独 DB 终端）完成 schema / migration / generate。
2. DB 分支优先合入。
3. 菜单分支执行：

```bash
git fetch origin
git rebase main
```

4. 再补 Prisma 查询、server action、联调。

## 9. 推荐执行顺序

1. 先确定本轮要改哪 2 个菜单。
2. 再确定是否涉及 DB。
3. 当前项目目录内按需创建并切换 2 个菜单分支 + 1 个 platform 分支。
4. 先启动 platform 终端，再启动两个菜单终端。
5. 菜单终端先做低冲突部分，公共改动交给 platform 收口。

## 10. 一句话版本

默认固定 3 终端：**菜单 A / 菜单 B / 平台终端**。
按本轮菜单动态分工，所有操作都在当前项目目录内完成，不再按大模块永久分组。