# 2026-06-17 Quarterly Work Handoff

## 今日工作概述
今天主要继续完善年度目标、组织管理和季度工作三个关联模块，当前改动尚未提交，主要集中在以下 4 个文件：

- `src/app/(authenticated)/annual-goals/content.tsx`
- `src/app/(authenticated)/organization/content.tsx`
- `src/app/(authenticated)/quarterly-work/content.tsx`
- `src/server/annual-goals/actions.ts`

本次工作重点偏向页面表单体验、组织/权限范围约束，以及年度目标服务端动作联调，不包含从主仓库合并过来的代码内容。

## 已处理内容

### 1. 年度目标页面继续完善
文件：`src/app/(authenticated)/annual-goals/content.tsx`

已补充和整理的方向包括：
- 年度目标页面表单交互优化
- 指标、元指标、季度目标相关数值格式处理
- 根据单位控制是否允许小数输入
- 季度目标创建/调整/进度更新时间展示整理
- 负责人选择输入体验补强

代码中可重点关注这些位置：
- `getYearLabel` / `formatPercent` / `formatValue` / `formatInputValue`
- `validateUnitValue`
- `getQuarterTargetsTime`
- `SearchableMemberField`

整体判断：这部分是在继续补强年度目标录入、编辑和查看过程中的前端可用性与约束一致性。

### 2. 年度目标服务端动作联调
文件：`src/server/annual-goals/actions.ts`

已涉及的能力包括：
- 当前用户年度目标操作上下文构建
- 基于组织范围的方案编辑权限校验
- 部门/小组负责人归属校验
- 方案归属解析
- 指标进度、元指标进度汇总逻辑
- 权重与目标值上限约束

代码中可重点关注这些位置：
- `getAnnualGoalActionContext`
- `getScopedPlanPermissions`
- `resolveResponsibleUserId`
- `resolveOwner`
- `syncMetricCurrentValue`
- `assertWeightWithinLimit`
- `assertSourceMetricTargetWithinLimit`

整体判断：今天前后端联动的核心，是让年度目标在组织范围、负责人选择、指标汇总和季度目标约束上形成完整闭环。

### 3. 组织管理页面联动调整
文件：`src/app/(authenticated)/organization/content.tsx`

已处理方向包括：
- 用户管理表单联动部门、小组、角色
- 组织权限页草稿态管理
- 菜单权限与年度目标权限的批量应用逻辑
- 组织页 tab 和部门范围展示联动

代码中可重点关注这些位置：
- `UserForm`
- `TeamForm`
- `draftRoleMenuCells` / `draftAnnualGoalCells`
- `hasRoleMenuChanges` / `hasAnnualGoalPermissionChanges`

整体判断：这部分主要是在给年度目标权限配置和组织管理能力做配套支撑。

### 4. 季度工作页面继续完善
文件：`src/app/(authenticated)/quarterly-work/content.tsx`

已处理方向包括：
- 季度工作创建/编辑表单联动项目
- 关联项目时自动带出负责人、预期收益等信息
- 项目创建时补充季度范围校验
- 项目状态与季度工作状态编辑能力整理

代码中可重点关注这些位置：
- `QuarterlyWorkForm`
- `ProjectEditForm`
- `ProjectCreateForm`
- `validateQuarterRange`

整体判断：这部分是在继续梳理项目与季度工作之间的关系，减少录入重复并提升表单一致性。

## 当前状态
- 今日改动尚未提交。
- 当前工作更偏向“功能联调和体验补强”，不是全新模块开发。
- 从文件分布看，年度目标是主线，组织页和季度工作页属于同步配套调整。

## 接手建议
1. 先查看以下 4 个文件的本地 diff，确认今天已改到什么程度：
   - `src/app/(authenticated)/annual-goals/content.tsx`
   - `src/app/(authenticated)/organization/content.tsx`
   - `src/app/(authenticated)/quarterly-work/content.tsx`
   - `src/server/annual-goals/actions.ts`
2. 优先验证年度目标相关流程：
   - 部门/小组方案编辑
   - 指标与元指标录入
   - 负责人选择范围是否正确
   - 季度目标与进度录入是否符合限制
3. 再验证季度工作与项目联动：
   - 选择已有项目创建季度工作
   - 新建项目时季度范围校验
   - 项目状态和季度工作状态编辑是否正常
4. 若联调通过，再考虑整理提交；若仍有问题，建议先从 `actions.ts` 的权限与归属校验链路开始排查。

## 风险/待确认点
- 年度目标前后端规则较多，容易出现前端允许但服务端拒绝，或服务端通过但前端提示不完整的情况。
- 负责人选择基于组织范围，接手时需要重点确认部门/小组成员边界是否符合预期。
- 季度工作与项目联动存在默认值带入逻辑，需确认编辑态和创建态表现是否一致。
