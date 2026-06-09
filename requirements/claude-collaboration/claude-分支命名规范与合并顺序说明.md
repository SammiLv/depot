# Claude 多终端协作：分支命名规范与合并顺序说明

## 1. 目标

这份说明用于统一多终端 Claude 并行开发时的：

- 菜单式分支命名方式
- DB 相关分支的使用方式
- 合并顺序
- 冲突处理优先级

核心原则：

- 按本轮菜单并行
- 平台层收口
- DB/schema 串行
- 高频小合并，避免大分支长期漂移

---

## 2. 分支命名规范

建议统一使用：

```text
feat/menu-<menu>-<topic>
fix/menu-<menu>-<topic>
refactor/menu-<menu>-<topic>
chore/menu-<menu>-<topic>
```

平台与 DB 例外：

```text
feat/platform-<topic>
feat/db-<topic>
```

---

## 3. 推荐 menu 名称

- `dashboard`
- `annual-goals`
- `quarterly-work`
- `kpi`
- `talent`
- `todos`
- `notifications`
- `organization`

---

## 4. 推荐分支命名示例

### 菜单功能

```text
feat/menu-annual-goals-overview
feat/menu-kpi-progress-panel
feat/menu-quarterly-work-list
feat/menu-notifications-center
feat/menu-organization-role-panel
```

### 平台类改动

```text
feat/platform-shared-support
feat/platform-auth-shell
feat/platform-db-coordination
feat/platform-layout-adjust
```

### DB / Prisma 相关改动

```text
feat/db-annual-goals-kpi-fields
feat/db-quarterly-work-status
feat/db-organization-role-refactor
```

---

## 5. worktree 与分支的使用方式

当前协作约定要求：**主仓库目录保留为干净基线，多个终端通过独立 worktree 在项目外层协作**。

关键规则：

- 分支是整个仓库级别的，不是某个子目录级别的。
- 不要 `cd src/app/(authenticated)/annual-goals` 后在子目录里理解成“把分支建到这个目录里”。
- 正确做法是先在仓库根目录执行 `git worktree add <路径> -b <分支名>`，再进入新目录开发。
- 已创建过的分支，再挂载 worktree 时不要重复用 `-b`。
- 主仓库目录尽量保持在 `main`，不要拿主仓库目录充当多个终端的并行开发现场。

建议目录示例：

- `../depot-coordination/depot-annual-goals`
- `../depot-coordination/depot-quarterly-work`
- `../depot-coordination/depot-platform`

例如：

- 年度指标：`../depot-coordination/depot-annual-goals` + `feat/menu-annual-goals-<topic>`
- 季度工作：`../depot-coordination/depot-quarterly-work` + `feat/menu-quarterly-work-<topic>`
- 平台收口：`../depot-coordination/depot-platform` + `feat/platform-<topic>`

不要把多个无关菜单长期塞在同一个分支里，也不要让多个终端共享主仓库同一个 working tree。

---

## 6. 无 DB 改动时的推荐合并顺序

1. 两个菜单分支先各自开发
2. 如涉及共享壳层、共享 UI、菜单入口或权限显示，先由 platform 分支统一收口
3. 菜单分支各自完成自测
4. 菜单分支按粒度小的优先合并
5. 平台分支可先合，随后菜单分支 rebase `main`

---

## 7. 有 DB 改动时的推荐合并顺序

### 原则

- 先合 DB 基础变更
- 再让菜单分支消费新 schema
- 不要让多个菜单分支各自带 migration

### 标准顺序

#### Phase 1：DB 分支先行
DB 分支 owner 先完成：

- schema 变更
- migration
- generate
- seed 或最小数据适配
- 必要的 server/db 最小兼容调整

#### Phase 2：平台层适配（如有）
如果 schema 变化影响：

- 登录态装配
- 菜单权限显示
- 通用数据访问入口

则由 platform 分支先做最小适配。

#### Phase 3：菜单分支同步 DB 基线
各菜单分支执行：

```bash
git fetch origin
git rebase main
```

然后再补：

- Prisma 查询
- server action
- 页面联调
- 交互完成

#### Phase 4：菜单分支依次合并
建议按依赖顺序合：

1. 依赖最少的菜单分支
2. 依赖共享查询或共享状态的菜单分支
3. 依赖多个菜单联动的 dashboard / 聚合页分支

---

## 8. 冲突处理优先级

### 优先级 1：DB/schema 分支
以下内容以 DB owner 为准：

- `db/*`
- `src/generated/prisma/*`
- `src/server/db/prisma.ts`

### 优先级 2：平台分支
以下内容以 platform owner 为准：

- `src/components/app-shell.tsx`
- `src/components/ui-kit.tsx`
- `src/app/(authenticated)/layout.tsx`
- `src/server/auth/*`
- `src/server/permissions/*`

### 优先级 3：菜单分支
以下内容由当前菜单 owner 自主决定：

- 当前菜单页面
- 当前菜单 server 查询
- 当前菜单内部私有组件

---

## 9. 何时应该拆新分支

出现以下情况时，建议拆新分支：

- 本轮开始切换到另一个菜单
- 开始涉及共享壳层
- 开始涉及 DB schema
- 当前分支已经完成一个独立菜单目标
- 当前分支内容开始变杂

简单说：

- 一个菜单目标一个分支
- 平台接入一个分支
- DB 变更一个分支

---

## 10. 最终建议

对你当前的使用习惯，最稳的方式是：

- 主仓库目录保持在 `main`
- 默认准备 3 个独立 worktree：`menu-a / menu-b / platform`
- 按需启用第 4 个独立 worktree：`db`
- 所有 DB 结构变更由 platform 或 DB owner 串行处理
- 所有共享壳层改动由 platform owner 收口
- 所有业务改动按本轮菜单动态推进

一句话版：

> 分支按菜单命名，终端在各自独立 worktree 中协作，平台统一收口，DB 优先落地，菜单再并行合入。
