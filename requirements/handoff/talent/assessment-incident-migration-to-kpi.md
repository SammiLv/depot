# 业务考核与工作事故迁移至 KPI 管理交接文档

## 一、背景与目标

目前「业务考核」和「工作事故」两个操作模块位于「人才发展」页面下。根据业务统一管理的需要，需将这两个模块迁移到「KPI 管理」页面，与「季度 KPI」「KPI 模板」放在同一组 Section Tab 下切换。

迁移后 KPI 管理顶部 Tab 顺序为：

```
季度 KPI → 业务考核 → 工作事故 → KPI 模板
```

本次迁移**只迁移操作型工作台**，不涉及底层规则配置：
- **迁移**：业务考核批次管理、工作事故记录管理
- **保留**：「人才发展 → 规则配置」中的「业务考核规则」「工作事故等级配置」

## 二、总体方案

### 2.1 页面结构调整

| 页面 | 调整前 | 调整后 |
|------|--------|--------|
| KPI 管理 (`/kpi`) | 季度 KPI、KPI 模板 | 季度 KPI、业务考核、工作事故、KPI 模板 |
| 人才发展 (`/talent`) | 人才总览、人才盘点、业务考核、工作事故、人才决策、人才履历、规则配置 | 人才总览、人才盘点、人才决策、人才履历、规则配置 |

### 2.2 组件复用

业务考核和工作事故的现有组件可直接复用：

- `src/app/(authenticated)/talent/operation-workspaces.tsx`
  - `BusinessAssessmentQuarterlyWorkspace`
  - `WorkIncidentWorkspace`

迁移后由 `src/app/(authenticated)/kpi/content.tsx` 根据当前 Tab 渲染对应组件。

### 2.3 数据权限策略

- **可见性**：业务考核批次、工作事故记录按「当前用户所在部门」过滤，同一部门内所有成员默认可见。
- **维护权限**：只有具备对应维护能力项的角色才能创建/编辑/删除。
- **不设置额外数据权限**：不通过 `VIEW_BUSINESS_ASSESSMENT` / `VIEW_WORK_INCIDENT` 控制列表可见性，仅保留 talent 模块中人才画像/决策等只读场景使用。

## 三、权限模型调整

### 3.1 新增 KPI 能力项

在 `src/server/permissions/permission-constants.ts` 的 `kpiAbilityKeys` 中新增：

```ts
manageBusinessAssessment: "MANAGE_BUSINESS_ASSESSMENT",
manageWorkIncident: "MANAGE_WORK_INCIDENT",
```

### 3.2 调整 talent 能力项

- 保留 `viewBusinessAssessment`、`viewWorkIncident`，供人才画像、人才决策等只读场景继续使用。
- 将 `manageBusinessAssessment`、`manageWorkIncident` 从 `talentAbilityKeys` 中移除（或标记为废弃）。

### 3.3 权限矩阵与默认授权

1. 在 `kpiOrdinaryPermissionAbilityKeys` 中加入新增的两个能力项，使其在「组织与权限 → KPI 管理权限」中可配置。
2. 在 `kpiDefaultPermissionGrants` 中配置默认授权：
   - `ADMIN`：ALL 作用域，默认开启
   - `DEPARTMENT_MANAGER`：SUBTREE 作用域，默认开启
   - `TEAM_LEADER`、`MEMBER`：默认不授予维护权限
3. 在 `src/app/(authenticated)/organization/page.tsx` 的 `kpiPermissionPresentation` 中补充中文名称：
   - `MANAGE_BUSINESS_ASSESSMENT` → 「维护业务考核」
   - `MANAGE_WORK_INCIDENT` → 「维护工作事故」
4. 清理 `talentDefaultPermissionGrants` 中已迁移的维护类权限，避免重复授权。

## 四、Server Action 权限检查迁移

涉及文件：

- `src/server/talent/assessment-actions.ts`
- `src/server/talent/incident-actions.ts`

将所有 `requireAbility(talentAbilityKeys.manageBusinessAssessment)` 改为 `requireAbility(kpiAbilityKeys.manageBusinessAssessment)`，工作事故同理。

同时复核数据查询范围，确保按当前用户所在部门过滤，不依赖 `VIEW_` 权限做数据隔离。

## 五、UI 层改动清单

### 5.1 KPI 管理页面 (`src/app/(authenticated)/kpi/content.tsx`)

1. 扩展 Tab 类型：
   ```ts
   type SectionTab = "quarterly-kpi" | "business-assessment" | "work-incident" | "kpi-template";
   ```
2. Tab 按钮数组增加「业务考核」「工作事故」，顺序放在「季度 KPI」之后、「KPI 模板」之前。
3. 从 `src/app/(authenticated)/talent/operation-workspaces.tsx` 导入：
   ```ts
   import { BusinessAssessmentQuarterlyWorkspace, WorkIncidentWorkspace } from "../talent/operation-workspaces";
   ```
4. 根据 `sectionTab` 渲染：
   - `quarterly-kpi`：现有季度 KPI 内容
   - `business-assessment`：`<BusinessAssessmentQuarterlyWorkspace data={assessmentData} />`
   - `work-incident`：`<WorkIncidentWorkspace data={incidentData} />`
   - `kpi-template`：现有 KPI 模板内容
5. 顶部操作按钮区域按 tab 切换：
   - 业务考核 tab：显示「新建业务考核」（需 `manageBusinessAssessment`）
   - 工作事故 tab：显示「登记事故」（需 `manageWorkIncident`）
6. 若 `getKpiData` 不返回业务考核/事故数据，需在 `src/app/(authenticated)/kpi/page.tsx` 中并行查询并传入。

### 5.2 人才发展页面 (`src/app/(authenticated)/talent/content.tsx`)

1. 从顶部 tab 列表中移除「业务考核」「工作事故」。
2. 移除对应的组件导入和渲染代码。
3. 更新 `PageHeader` 描述，例如改为「人才画像 · 人才盘点 · 人才决策」。
4. 规则配置中的「业务考核规则」「工作事故等级配置」卡片保留不动。

### 5.3 菜单与路由

- 检查 `src/components/app-shell.tsx` 或菜单配置，移除独立的「业务考核」「工作事故」入口（如有）。
- `/talent/assessments`、`/talent/incidents` 等独立路由保留作为深层跳转目标，入口改从 KPI 管理进入。

## 六、执行步骤

建议按以下顺序执行，每步可独立验证：

### 步骤 1：权限模型改造

1. 在 `kpiAbilityKeys` 中新增 `manageBusinessAssessment`、`manageWorkIncident`。
2. 在 `kpiOrdinaryPermissionAbilityKeys` 中加入这两个 key。
3. 在 `kpiDefaultPermissionGrants` 中配置默认授权。
4. 在 `organization/page.tsx` 的 `kpiPermissionPresentation` 中补充中文名称和描述。
5. 清理 `talentDefaultPermissionGrants` 中相关维护权限。
6. 运行 `npx tsc --noEmit --skipLibCheck`。

### 步骤 2：Server Action 权限检查迁移

1. 修改 `assessment-actions.ts` 中的权限 key。
2. 修改 `incident-actions.ts` 中的权限 key。
3. 复核数据查询按部门过滤。
4. 运行 TypeScript 检查。

### 步骤 3：KPI 管理页面接入

1. 扩展 `SectionTab` 和 tab 数组。
2. 导入并渲染业务考核、工作事故组件。
3. 准备并传入所需数据。
4. 调整顶部操作按钮权限判断。
5. 运行 TypeScript 检查并本地验证 tab 切换。

### 步骤 4：人才发展页面清理

1. 移除旧 tab 和组件。
2. 更新页面描述。
3. 运行 TypeScript 检查。

### 步骤 5：菜单/路由复核

1. 检查并调整菜单配置。
2. 确认深层路由仍可从 KPI 管理正常跳转。

### 步骤 6：权限配置页面验证

1. 进入「组织与权限 → KPI 管理权限」。
2. 确认出现「维护业务考核」「维护工作事故」。
3. 调整角色权限，验证 KPI 管理页面中新建/操作按钮按权限显隐。

### 步骤 7：数据可见性验证

1. 使用同一部门下不同角色账号登录。
2. 确认业务考核、工作事故列表所有人可见。
3. 确认只有有维护权限者能创建/编辑/删除。

## 七、风险与注意事项

1. **历史权限数据兼容性**
   - 数据库中若已存在 `talentAbilityKeys.manageBusinessAssessment` / `manageWorkIncident` 的授权记录，迁移后会失效。
   - 建议上线前执行一次数据迁移，将旧 talent 维护权限替换为新的 kpi 维护权限；或在代码中做短期兼容。

2. **工作事故与 KPI 的关联**
   - 工作事故扣分写入 KPI 指标项，迁移后 server action 调用路径不变，仅调整权限 key，不影响现有联动逻辑。

3. **规则配置保留在人才发展**
   - 本次不迁移「业务考核规则」「工作事故等级配置」。若后续需要统一放到 KPI 管理的规则维度，需第二轮改造。

4. **测试重点**
   - 权限矩阵显示与保存
   - Tab 切换与组件渲染
   - 新建/导入/删除操作权限控制
   - 数据按部门过滤与公开可见性

---

文档创建时间：2026-08-19
