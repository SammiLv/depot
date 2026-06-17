# KPI 功能改造执行计划

## 1. 背景与目标

当前 KPI 功能把两类不同对象的流程耦合在了一起：

1. **KPI 模板流程**
   - 对象：`KpiTemplate`
   - 真实业务：模板需要独立经历草稿、提交审核、审核通过/退回，审核通过后才能被季度 KPI 默认使用。
   - 额外要求：模板支持按 **人 / 小组 / 角色** 分配适用范围。

2. **季度个人 KPI 单据评定流程**
   - 对象：`PersonalKpi`
   - 真实业务：每个季度每位成员都要生成一张新的 KPI 单据，并基于当前生效模板形成快照。
   - 该流程**不需要审批**，只需要走：
     - 待自评 / 草稿
     - 自评中
     - 组长评
     - 主管评
     - 已完成

当前系统问题：
- `KpiTemplate` 只是静态模板定义，没有独立审核流程。
- `PersonalKpi.status` 仍混有 `PENDING_LEADER` / `PENDING_MANAGER` 这类审批语义。
- KPI 管理页顶部“流程进度”统计的是 `PersonalKpi.status`，但状态口径不符合真实业务。
- “生成 KPI” 按钮语义不清，实际应改为“季度初始化”，按模板分配规则一键批量生成本季度 KPI 单据。

本次改造目标：
- 拆开模板治理流程与季度单据评定流程。
- 支持模板按人/小组/角色分配。
- 支持季度一键初始化 KPI 单据。
- `PersonalKpiItem` 必须保存模板快照，后续模板修改不影响已生成季度单据。

---

## 2. 目标业务规则

### 2.1 模板流程（`KpiTemplate`）
- 草稿
- 提交审核
- 审核通过
- 审核退回
- 审核通过后可被季度 KPI 默认使用

### 2.2 模板适用范围
模板可分配给：
- 单个成员
- 某个小组（组织节点）
- 某个角色

当成员同时命中多条分配规则时，模板优先级为：
1. 按人
2. 按小组
3. 按角色

### 2.3 季度个人 KPI 单据流程（`PersonalKpi`）
- 每人每季度一张单据
- 单据由季度初始化批量创建
- 自动采用该成员当季命中的**最新版已审核通过模板**
- 单据状态仅保留：
  - `DRAFT` / `PENDING_SELF_REVIEW`（待自评口径最终再统一）
  - `SELF_REVIEWING`
  - `PENDING_LEADER_SCORE`
  - `PENDING_MANAGER_SCORE`
  - `COMPLETED`
- 不再出现“待主管审批 / 待经理审批”这类审批流状态

### 2.4 季度初始化
进入新季度后，支持一次性执行：
- **初始化某季度 KPI**

系统自动完成：
1. 找出当前范围内所有成员
2. 根据模板分配规则解析每人应使用的模板
3. 为每位成员创建当季 `PersonalKpi`
4. 将模板项复制为 `PersonalKpiItem` 快照
5. 跳过未命中模板的成员，并给出结果提示

幂等要求：
- 同一成员同一年同一季度不能重复创建单据

---

## 3. 数据模型改造

## 3.1 `KpiTemplate` 增强
**现状**：只有名称、描述、是否启用，没有流程字段。

**新增说明**：
- 系统允许**多个模板并存**，不同模板可服务不同成员、小组或角色。
- 模板的“多条记录”和“版本演进”需要分开理解：
  - **模板实例**：表示一套可独立分配的模板方案，可同时存在多套。
  - **模板版本**：表示某一套模板方案的版本演进，用于表达审核通过后的最新版。
- 季度初始化时，系统应从“成员命中的模板实例”中，选取**最新版已审核通过版本**进行快照生成。

**新增建议字段**：
- `status`：模板状态（如 `DRAFT` / `PENDING_APPROVAL` / `APPROVED` / `REJECTED`）
- `version`：模板版本号
- `submittedAt`
- `approvedAt`
- `rejectedAt`（可选）
- `reviewComment`（可选）
- `isLatest` 或通过查询规则确定最新版
- `deletedAt`（建议补上，便于软删）

## 3.2 新增 `KpiTemplateAssignment`
新增模板分配表，用于表达模板适用对象：
- `id`
- `templateId`
- `targetType`：`USER` / `ORG_NODE` / `ROLE`
- `targetUserId`（按人时使用）
- `targetOrgNodeId`（按小组时使用）
- `targetRoleType`（按角色时使用）
- `priority`（可选，若固定按 人 > 小组 > 角色，则也可不存）
- `effectiveFromYear`（可选）
- `effectiveFromQuarter`（可选）
- `effectiveToYear`（可选）
- `effectiveToQuarter`（可选）
- `isActive`
- `createdAt`
- `updatedAt`

## 3.3 `PersonalKpi` 调整
**保留季度单据定位**，新增/调整建议：
- 保留：`year`, `quarter`, `userId`, `orgNodeId`, `templateId`
- 新增：`templateVersion`
- 重构：`status` 改为新的评定流枚举
- 增加唯一约束：`@@unique([year, quarter, userId])`
- 视需要补充：`initializedAt`, `initializedById`

## 3.4 `PersonalKpiItem` 保持快照模式
继续保留：
- `sourceTemplateItemId`

并明确：
- `name`
- `description`
- `weight`
- `target`
- `scoringStandard`
- `sortOrder`
这些字段在初始化时从模板复制一份，后续不跟模板联动。

## 3.5 状态枚举重构
需要新增/调整 Prisma enum：

### 模板状态枚举（新增）
- `DRAFT`
- `PENDING_APPROVAL`
- `APPROVED`
- `REJECTED`

### 个人 KPI 状态枚举（重构）
候选口径：
- `DRAFT`
- `PENDING_SELF_REVIEW`
- `PENDING_LEADER_SCORE`
- `PENDING_MANAGER_SCORE`
- `COMPLETED`

说明：
- `PENDING_SELF_REVIEW` 可直接承担“待自评/自评中”的含义；
- 若后续确实需要区分“未开始自评”和“正在自评”，再拆细。

---

## 4. 服务端逻辑改造

## 4.1 模板查询与适配逻辑
新增模板分配解析服务：
- 根据用户、组织节点、角色解析当前应使用模板
- 处理优先级：人 > 小组 > 角色
- 系统允许成员命中多套模板实例，但最终只选择一套模板实例进入初始化
- 只取**已审核通过**模板
- 多版本时取命中模板实例下的**最新版已审核通过版本**

建议新增目录：
- `src/server/kpi-template/*`
- 或扩展 `src/server/kpi/*`

## 4.2 季度初始化服务
新增“季度初始化”动作：
- 输入：`year`, `quarter`, 可选范围（全员 / 某部门 / 某小组）
- 输出：初始化结果摘要
  - 成功创建多少张
  - 已存在多少张
  - 未命中模板多少人
  - 冲突/异常明细

核心处理步骤：
1. 查找目标成员范围
2. 逐个解析应命中模板
3. 查是否已存在 `(year, quarter, userId)` 单据
4. 不存在则创建 `PersonalKpi`
5. 批量复制 `KpiTemplateItem` 到 `PersonalKpiItem`
6. 返回初始化报告

## 4.3 KPI 查询逻辑改造
修改：`src/server/kpi/kpi-query.ts`

调整点：
- 删除审批语义统计：`PENDING_LEADER`, `PENDING_MANAGER`
- 统计口径改为评定流：
  - 待自评
  - 自评中（如最终不拆则并入待自评）
  - 组长评
  - 主管评
  - 已完成
- `rows` 表格中的阶段展示同步调整
- `totalCount` 文案口径改清楚：
  - 若统计单据数，文案改为“共 X 份 KPI”
  - 若统计成员数，则需基于唯一成员数而非 `kpis.length`

## 4.4 Dashboard 统计同步
修改：`src/server/dashboard/dashboard-query.ts`

同步更新：
- KPI 状态统计分组
- 待我处理数量口径
- 自评中 / 已评分 / 已完成等卡片定义

---

## 5. 前端页面改造

## 5.1 KPI 管理页
修改文件：
- `src/app/(authenticated)/kpi/content.tsx`
- `src/server/kpi/kpi-query.ts`

改造点：
1. 顶部流程进度改为季度 KPI 评定流
2. “共 X 名成员” 文案与实际口径统一
3. “生成 KPI” 按钮改为：
   - `初始化本季度 KPI`
   - 或 `批量初始化 KPI`
4. 初始化按钮触发季度初始化服务
5. 表格阶段列改为新的单据阶段口径

## 5.2 模板管理入口
当前 KPI 页面只有：
- 导入模板
- 生成 KPI

建议补充明确模板入口：
- 模板管理
- 模板分配
- 模板审核

可选实现：
- 先在 KPI 页加按钮打开弹层/子页
- 或新增独立路由如 `/kpi/templates`

## 5.3 初始化反馈
季度初始化后需要反馈结果：
- 成功创建数量
- 已存在数量
- 未命中模板成员
- 初始化失败原因

---

## 6. 迁移与兼容策略

## 6.1 数据迁移
需要 Prisma migration：
- 新增模板状态字段
- 新增模板分配表
- 调整 `PersonalKpi.status` 枚举
- 新增 `templateVersion`
- 新增唯一约束 `(year, quarter, userId)`

## 6.2 旧数据处理
对现有 `PersonalKpi`：
- 原 `PENDING_LEADER` / `PENDING_MANAGER` 要映射到新状态
- 需要业务映射表，建议：
  - `DRAFT` → `DRAFT` / `PENDING_SELF_REVIEW`
  - `PENDING_LEADER` / `PENDING_MANAGER` → 视旧含义决定迁移到 `PENDING_SELF_REVIEW` 或 `PENDING_LEADER_SCORE`
  - `PENDING_LEADER_SCORE` 保留为组长评
  - `PENDING_MANAGER_SCORE` 保留为主管评
  - `COMPLETED` 保留
- 迁移规则需在改库前再确认一次

## 6.3 模板版本
如果旧模板没有版本号：
- 初始迁移统一写为 `1`
- 后续模板编辑采用“复制出新版本”而不是原地覆盖

---

## 7. 建议实施顺序

### 阶段 1：数据层
1. 调整 Prisma schema
2. 写 migration
3. 重建本地数据库并补 seed

### 阶段 2：服务端层
1. 实现模板状态与分配查询
2. 实现季度初始化服务
3. 重构 KPI 查询统计口径
4. 同步 dashboard KPI 统计

### 阶段 3：前端层
1. 调整 KPI 管理页顶部流程
2. 更改按钮文案与交互
3. 接入季度初始化动作
4. 新增模板入口（至少占位）

### 阶段 4：验证
1. 创建模板并审核通过
2. 为人/小组/角色分配模板
3. 一键初始化某季度 KPI
4. 校验每位命中成员只生成一张单据
5. 校验 `PersonalKpiItem` 为快照，不随模板后改而变
6. 校验季度 KPI 状态仅走评定流
7. 校验 KPI 管理页与 dashboard 展示口径一致

---

## 8. 涉及核心文件

### 数据模型
- `db/prisma/schema.prisma`
- `db/prisma/migrations/*`
- `db/prisma/seed.ts`

### KPI 页面与查询
- `src/app/(authenticated)/kpi/content.tsx`
- `src/app/(authenticated)/kpi/page.tsx`
- `src/server/kpi/kpi-query.ts`

### Dashboard 统计
- `src/server/dashboard/dashboard-query.ts`

### 新增模板与初始化逻辑（建议）
- `src/server/kpi-template/*`
- `src/server/kpi/*`

---

## 9. 需要执行前再次确认的唯一事项

在正式改库前，需确认 `PersonalKpi` 新状态的最终中文口径是否固定为：
- 待自评
- 自评中（是否单独拆）
- 组长评
- 主管评
- 已完成

若“待自评”和“自评中”不需要分开，则枚举可更简化，页面也会更清晰。
