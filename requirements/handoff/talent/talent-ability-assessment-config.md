# 人才能力评估规则配置化交接文档

## 一、背景与目标

人才画像中的「能力匹配度」当前采用硬编码公式计算：

```
能力匹配度 = (当前聘期 KPI 均值 / KPI 总分) × 60% + (当前聘期盘点均值 / 盘点模型总分) × 40%
```

为了让不同部门、不同版本可以灵活调整 KPI 与人才盘点的权重，需要将权重做成可配置项。

本次调整的产品定位是：把原「人才盘点模型」规则入口升级为「人才能力评估」，内部拆分为两个子模块：

- **人才能力测算模型**：配置能力匹配度的 KPI 权重、人才盘点权重
- **人才盘点模型**：维持现有的维度、评分档、等级区间、九宫格规则配置

## 二、产品形态

### 2.1 规则配置入口

原「人才盘点模型」入口卡片改为：

- **标题**：人才能力评估
- **描述**：配置人才能力测算权重与人才盘点评价模型
- **版本状态**：显示当前部门已发布版本
- **操作**：进入版本列表

### 2.2 进入后的页面结构

顶部增加子导航：

```
人才能力评估
配置人才能力测算权重与人才盘点评价模型

[人才能力测算模型] [人才盘点模型]
```

- **人才能力测算模型**：配置当前版本的能力匹配度权重
- **人才盘点模型**：保留现有的评价维度、评分档、等级区间、九宫格配置

## 三、数据模型设计

在 `TalentReviewTemplateVersion` 表中新增两个字段：

```prisma
model TalentReviewTemplateVersion {
  // ... 原有字段保持不变
  kpiWeight    Float @default(0.6)
  reviewWeight Float @default(0.4)
}
```

### 校验规则

- `kpiWeight + reviewWeight` 必须等于 `1`
- 每个字段取值范围 `0 ~ 1`
- 建议界面展示时保留两位小数

### 默认数据

- 现有记录会自动沿用默认值 `0.6` / `0.4`
- 新建版本时默认也是 `0.6` / `0.4`
- 无需额外初始化脚本，能力匹配度计算结果与改造前一致

## 四、规则配置页面改造

### 4.1 入口卡片文案

修改 `src/app/(authenticated)/talent/content.tsx`：

- `ConfigKey` 中 `review` 对应的显示标题从「人才盘点模型」改为「人才能力评估」
- `configs` 数组中对应卡片的 `title`、`detail` 同步更新
- `meta` 对象中的标题和描述同步更新

### 4.2 内部子模块拆分

当前 `ReviewModelConfiguration` 组件需要增加子导航：

```ts
type ReviewConfigTab = "ability-calculation" | "review-model";
```

默认显示「人才能力测算模型」。

#### 人才能力测算模型界面

展示当前版本的权重配置：

- 规则版本名称
- 版本号
- 状态（草稿/已发布/历史版本）
- KPI 权重输入框
- 人才盘点权重输入框
- 权重之和校验提示
- 保存/发布按钮

草稿状态可编辑，已发布和历史版本只读。

#### 人才盘点模型界面

保持现有功能不变，继续配置：

- 评价维度
- 评分档
- 等级区间
- 九宫格规则

## 五、Server Action 调整

涉及文件：`src/server/talent/review-actions.ts`

| Action | 调整内容 |
|--------|----------|
| `createTalentReviewTemplate` | 新建版本时默认写入 `kpiWeight: 0.6`、`reviewWeight: 0.4` |
| `updateTalentReviewTemplate` | 如果需要，可同时更新权重字段 |
| 新增 `updateTalentAbilityCalculationWeights` | 单独更新草稿版本的 KPI 权重、人才盘点权重 |
| `publishTalentReviewTemplate` | 发布前校验 `kpiWeight + reviewWeight === 1`，否则抛出错误 |
| `initializeDefaultTalentReviewTemplate` | 初始化默认规则时写入默认权重 |

## 六、计算逻辑改造

涉及文件：`src/server/talent/profile-overview-query.ts`

1. 查询 `userId` 所属部门的 `ACTIVE` `TalentReviewTemplateVersion`：

```ts
const activeReviewTemplate = await prisma.talentReviewTemplateVersion.findFirst({
  where: { departmentOrgNodeId, status: "ACTIVE", deletedAt: null },
});

const kpiWeight = activeReviewTemplate?.kpiWeight ?? 0.6;
const reviewWeight = activeReviewTemplate?.reviewWeight ?? 0.4;
```

2. 使用读取到的权重替换硬编码的 `0.6` / `0.4`：

```ts
const kpiRatio = kpiInContract.length > 0
  ? (kpiMean / options.kpiTotalScore) * kpiWeight
  : 0;
const reviewRatio = reviewsInContract.length > 0
  ? (reviewMean / options.reviewTotalScore) * reviewWeight
  : 0;
abilityMatchScore = Math.round((kpiRatio + reviewRatio) * 100);
```

3. 无 ACTIVE 规则时，默认使用 `0.6` / `0.4`，保证兼容性。

## 七、前端文案动态化

涉及文件：`src/app/(authenticated)/talent/content.tsx`

人才画像中「能力匹配度」卡片的说明文案，从固定文案改为动态显示当前权重：

```tsx
<div className="text-xs text-muted-foreground mt-1">
  (当前聘期内 KPI 均值 / 季度 KPI 总分) × {Math.round(kpiWeight * 100)}% + (当前聘期内盘点均值 / 盘点模型总分) × {Math.round(reviewWeight * 100)}%
</div>
```

权重可以从 `extras` 中返回，或在需要时单独查询 ACTIVE 规则。

## 八、执行步骤

### 步骤 1：数据库迁移

1. 在 `db/prisma/schema.prisma` 的 `TalentReviewTemplateVersion` 模型中新增 `kpiWeight`、`reviewWeight` 字段。
2. 运行：
   ```bash
   npx prisma migrate dev --name add_ability_weights_to_review_template
   ```
3. 生成 Prisma Client。

### 步骤 2：入口文案调整

修改 `src/app/(authenticated)/talent/content.tsx`：

- `ConfigKey` 显示名称
- `configs` 数组中的 `title`、`detail`
- `meta` 对象中的标题和描述

### 步骤 3：Server Action 调整

修改 `src/server/talent/review-actions.ts`：

- 创建版本时写入默认权重
- 新增/更新权重更新 action
- 发布时增加权重和校验

### 步骤 4：规则配置页面拆分

修改 `src/app/(authenticated)/talent/content.tsx` 中的 `ReviewModelConfiguration` 组件：

1. 增加子 tab 状态：`ability-calculation` / `review-model`
2. 新增「人才能力测算模型」编辑/展示界面
3. 原有人才盘点模型内容保持不变

### 步骤 5：计算逻辑改造

修改 `src/server/talent/profile-overview-query.ts`：

1. 查询 ACTIVE 人才盘点模型版本，读取权重
2. 替换硬编码权重
3. 无规则时默认兜底

### 步骤 6：前端文案动态化

修改人才画像中能力匹配度的说明文案，使其根据当前权重动态显示。

### 步骤 7：验证

1. 运行 `npx tsc --noEmit --skipLibCheck`。
2. 进入「人才发展 → 规则配置 → 人才能力评估」。
3. 创建新版本，调整 KPI/盘点权重，发布。
4. 打开人才画像，验证能力匹配度计算结果和文案随权重变化。
5. 验证无 ACTIVE 规则时，默认权重仍能正常兜底。

## 九、涉及文件清单

| 文件 | 改动内容 |
|------|----------|
| `db/prisma/schema.prisma` | 新增 `kpiWeight`、`reviewWeight` 字段 |
| `src/server/talent/review-actions.ts` | 创建/更新/发布逻辑增加权重处理 |
| `src/server/talent/profile-overview-query.ts` | 从 ACTIVE 规则读取权重并参与计算 |
| `src/app/(authenticated)/talent/content.tsx` | 入口文案、子模块拆分、能力测算界面、文案动态化 |

## 十、注意事项

1. **版本管理一致性**：权重与人才盘点模型版本绑定，发布新版本时权重也会切换。
2. **发布校验**：必须在 `publishTalentReviewTemplate` 中校验权重和为 1，避免错误配置导致计算异常。
3. **兼容性**：默认值保持 `0.6` / `0.4`，现有数据计算结果不变。
4. **数据回刷**：规则发布后不需要回刷历史能力匹配度，因为该指标是实时计算的。

---

文档创建时间：2026-08-19
