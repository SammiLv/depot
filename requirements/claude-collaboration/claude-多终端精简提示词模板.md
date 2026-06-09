# Claude 多终端精简提示词模板

## 菜单终端 A / B 通用模板

```text
你只负责本轮菜单功能开发。

本轮菜单目录：
- src/app/(authenticated)/<menu>
- src/server/<menu-server>

不要修改：
- src/components/app-shell.tsx
- src/components/ui-kit.tsx
- src/app/(authenticated)/layout.tsx
- src/app/login
- src/server/auth
- src/server/permissions
- src/server/dingtalk
- src/server/db/prisma.ts
- db
- src/generated/prisma
- package.json
- package-lock.json
- next.config.ts
- tsconfig.json

如果需要改共享层、菜单权限或数据库结构，先停下来告诉我。
```

## 菜单终端示例：年度指标

```text
你只负责本轮菜单功能开发。

本轮菜单目录：
- src/app/(authenticated)/annual-goals
- src/server/annual-goals

不要修改共享层、权限层、DB 层、根配置。
如果需要改共享层、菜单权限或数据库结构，先停下来告诉我。
```

## 菜单终端示例：KPI 管理

```text
你只负责本轮菜单功能开发。

本轮菜单目录：
- src/app/(authenticated)/kpi
- src/server/kpi

不要修改共享层、权限层、DB 层、根配置。
如果需要改共享层、菜单权限或数据库结构，先停下来告诉我。
```

## 平台终端模板

```text
你只负责本轮公共层收口。

允许修改：
- src/components/app-shell.tsx
- src/components/ui-kit.tsx
- src/app/(authenticated)/layout.tsx
- src/app/login
- src/server/auth
- src/server/permissions
- src/server/dingtalk

如果本轮涉及数据库结构改动，也由你统一协调 DB 变更。
不要主动改业务菜单页面，除非是本轮明确要求的公共接入。
```

## DB 终端模板（仅在需要第 4 终端时使用）

```text
你只负责数据库相关改动。

允许修改：
- db
- src/generated/prisma
- src/server/db/prisma.ts
- 与当前 schema 变更直接相关的最小适配代码

不要顺手改页面和大范围业务逻辑。
你的目标是：
1. 完成 schema 变更
2. 生成 migration
3. 更新 prisma generated 产物
4. 完成最小必要适配

完成后告诉我哪些菜单分支需要同步。
```
