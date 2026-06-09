# Claude 多终端协作：首次落地执行手册

## 1. 适用场景

这份手册用于你第一次在同一个项目里，同时启用多个 Claude 终端做不同菜单功能迭代时的实际操作。

目标是先稳定跑通：

- 多个终端并行开发
- 不互相覆盖代码
- 共享层有人收口
- DB 改动有人兜底

---

## 2. 首次落地建议规模

第一次不要一上来开太多。

建议先从 **默认 3 个终端** 开始：

1. 菜单终端 A
2. 菜单终端 B
3. 平台终端

如果本轮 DB 改动很重，再额外开：

4. DB 终端

---

## 3. 第一次推荐分工

第一次建议按“本轮要改的两个菜单”来拆，而不是按大模块包拆。

### 终端 A：菜单 1
例如：
- `src/app/(authenticated)/annual-goals`
- `src/server/annual-goals`

### 终端 B：菜单 2
例如：
- `src/app/(authenticated)/kpi`
- `src/server/kpi`

### 终端 C：平台 / 公共 / DB 协调
- `src/components/app-shell.tsx`
- `src/components/ui-kit.tsx`
- `src/app/(authenticated)/layout.tsx`
- `src/app/login`
- `src/server/auth`
- `src/server/permissions`
- `src/server/dingtalk`

如涉及 DB，再由终端 C 优先负责：
- `db/`
- `src/generated/prisma/`
- `src/server/db/prisma.ts`

如果 DB 改动明显过重，再单独开终端 D。

---

## 4. 第一次启动前要做的事

在主仓库先完成下面 4 件事：

### Step 1：确认主仓库干净或你清楚当前改动归属
执行：

```bash
git status
```

### Step 2：先更新主干

```bash
git checkout main
git pull
```

### Step 3：确认当前分支与工作区情况

执行：

```bash
git status
git branch --show-current
```

### Step 4：决定本轮要改哪 2 个菜单，以及是否涉及 DB
只要涉及以下任一项，就视为 DB 改动：

- 加字段
- 改字段类型
- 改关联关系
- 改 Prisma schema
- 改 migration
- 改 generated client

---

## 5. 第一次创建 worktree 和分支

### 方案 A：本轮做“年度指标 + KPI 管理”

先在主仓库根目录执行：

```bash
git worktree add ../depot-coordination/depot-annual-goals -b feat/menu-annual-goals-overview
git worktree add ../depot-coordination/depot-kpi -b feat/menu-kpi-progress-panel
git worktree add ../depot-coordination/depot-platform -b feat/platform-db-coordination
```

### 方案 B：本轮做“季度工作 + 通知中心”

```bash
git worktree add ../depot-coordination/depot-quarterly-work -b feat/menu-quarterly-work-list
git worktree add ../depot-coordination/depot-notifications -b feat/menu-notifications-center
git worktree add ../depot-coordination/depot-platform -b feat/platform-db-coordination
```

如果某个分支已经创建过，则不要重复用 `-b`，而是直接挂载已有分支：

```bash
git worktree add ../depot-coordination/depot-quarterly-work feat/menu-quarterly-work-list
```

第一次建议按“终端职责”命名目录和分支；主仓库目录尽量保持在 `main`，不要直接拿主仓库目录给多个终端并行开发。

---

## 6. 打开终端后的实际顺序

### 第一步：先准备主仓库

主仓库目录只保留为基线入口，先确认：

```bash
git checkout main
git status
```

### 第二步：先启动 Platform 终端

进入平台 worktree 目录：

```bash
cd ../depot-coordination/depot-platform
```

先让平台终端明确：

1. 本轮哪些共享文件允许改
2. 是否涉及 DB
3. 菜单终端需要哪些公共支持

### 第三步：再启动两个菜单终端
例如分别进入各自 worktree 目录：

```bash
cd ../depot-coordination/depot-annual-goals
cd ../depot-coordination/depot-kpi
```

### 第四步：如 DB 改动很重，再启用 DB worktree 终端

```bash
cd ../depot-coordination/depot-db
```

---

## 7. 第一次运行时的建议节奏

### 阶段 1：先做边界确认
每个终端先不要急着写代码，先做：

- 阅读自己负责目录
- 识别是否需要共享层改动
- 识别是否需要 DB 改动
- 列出本终端本轮 1~3 个小目标

### 阶段 2：菜单终端先做低冲突部分
优先做：

- 页面结构
- 模块内组件
- 局部 server 查询
- 局部交互

先不要急着碰：

- `src/components/app-shell.tsx`
- `src/components/ui-kit.tsx`
- `src/app/(authenticated)/layout.tsx`
- `db/`
- `src/generated/prisma/`

### 阶段 3：共享层由 Platform 收口
如果菜单终端发现需要：

- 加菜单入口
- 改全局布局
- 改共用按钮或卡片
- 改权限菜单显示

统一交给 Platform 终端处理。

### 阶段 4：DB 由 Platform 或 DB 终端串行落地
如果要改 schema：

1. 先由终端 C 或 D 改
2. DB 分支先合
3. 菜单分支再同步

---

## 8. 第一次不要做的事

1. 不要多个终端直接共用同一个分支。
2. 不要多个终端同时改 `package.json`。
3. 不要多个终端同时改 Prisma schema。
4. 不要一开始就抽很多共享组件。
5. 不要把一个终端做成“大包终端”，同时长期负责很多菜单。

---

## 9. 每个终端的开场动作清单

每个 Claude 终端启动后，建议都先完成这 4 步：

1. 读自己负责目录下的关键文件
2. 总结本终端本轮要做的 1~3 个小目标
3. 明确是否需要共享层支持
4. 明确是否依赖 DB 变更

---

## 10. 第一天的推荐执行方式

### 上午
- 主仓库保持在 `main`
- 创建好 3 个终端对应 worktree
- 启动 platform 终端
- 启动 2 个菜单终端
- 各自完成阅读和边界确认

### 中午前
- 菜单终端开始做低冲突部分
- 把共享层需求收集给 platform
- 如果发现要改 DB，先由 platform 接住；太重再加 DB 终端

### 下午
- 平台层先收口
- DB 层如有需要先落地
- 菜单层继续接入真实逻辑

### 收工前
- 每个分支至少做一次小提交
- 同步一次主干状态
- 记录下轮还要继续的菜单分支

---

## 11. 第一次成功的判断标准

只要达到下面几点，就算方案跑通：

1. 多个终端能稳定在各自 worktree 目录内按各自分支工作
2. 没有互相覆盖文件
3. 共享层改动由平台终端统一处理
4. DB 改动没有多分支乱改 schema
5. 每个终端都能完成一个独立小目标并提交

---

## 12. 一句话版本

第一次落地就按“两个菜单终端 + 一个平台终端”来跑；按本轮菜单动态分工，不再按大模块永久分组。