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
feat/platform-annual-goals-support
feat/platform-kpi-menu-entry
feat/platform-layout-adjust
feat/platform-auth-shell
```

### DB / Prisma 相关改动

```text
feat/db-annual-goals-kpi-fields
feat/db-quarterly-work-status
feat/db-organization-role-refactor
```

---

## 5. worktree 与分支的对应关系

建议保持“一个 worktree 对应一个本轮菜单分支”。

例如：

- `../depot-annual-goals` -> `feat/menu-annual-goals-overview`
- `../depot-kpi` -> `feat/menu-kpi-progress-panel`
- `../depot-quarterly-work` -> `feat/menu-quarterly-work-list`
- `../depot-notifications` -> `feat/menu-notifications-center`
- `../depot-platform` -> `feat/platform-annual-goals-kpi-support`
- `../depot-db` -> `feat/db-annual-goals-kpi-fields`

不要把多个无关菜单长期塞在同一个分支里。

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
DB worktree / DB owner 先完成：

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

- 默认 3 个 worktree：`menu-a / menu-b / platform`
- 按需启用第 4 个：`db`
- 所有 DB 结构变更由 platform 或 DB owner 串行处理
- 所有共享壳层改动由 platform owner 收口
- 所有业务改动按本轮菜单动态推进

一句话版：

> 分支按菜单命名，worktree 按本轮菜单隔离，平台统一收口，DB 优先落地，菜单再并行合入。
