# 2026-08-27 Quarterly Work Handoff — 任务新增「是否需要开发」字段（待实现方案）

## 交接说明
- **状态：待实现，代码尚未改动。** 本文档是一份可直接执行的实现方案，接手方按此落地即可。
- 范围：产品管理·任务看板（数据模型 `QuarterlyWork`）。
- 目标：为任务新增一个布尔字段，语义为**「是否需要开发」**，用于区分需要研发投入与无需开发的任务，便于后续统计与筛选。

## 需求要点
- 新建 / 编辑任务时**必填**（两选：是 / 否）。
- 历史数据保持为空（字段可空、无默认值、不做 backfill），上线后由人工在编辑时逐条补齐。
- 任务卡片：仅当「需开发」时显示一枚徽章；「否」与历史空值不显示。
- 列表视图：新增一列「是否需开发」，显示 是 / 否 / -（历史空值）。
- 任务看板顶部新增「仅看需开发」筛选开关，同时作用于卡片视图与列表视图。
- 复用现有 `requireManageProductTask` 权限，不新增权限项。

## 字段命名约定
- Prisma / DB 字段：`needsDevelopment Boolean?`
- 表单 / FormData name：`needsDevelopment`
- 值语义：`true`=需要开发，`false`=无需开发，`null`=历史未设置

## 改动清单

### 1. 数据模型 — `db/prisma/schema.prisma`
`model QuarterlyWork`（约 line 829）新增：
```prisma
needsDevelopment Boolean?
```
可空、无 `@default` → 历史行自然为 `null`。生成 migration：`add_quarterly_work_needs_development`（仅 add column，不 backfill）。

> 本仓 Prisma schema 位于 `db/prisma/`，migration 与 client 生成按仓库既有约定执行（参考 `db/prisma.config.ts` 与既有 migration 目录命名）。

### 2. 服务端查询 — `src/server/quarterly-work/quarterly-work-query.ts`
- `BoardItem` 类型（line 29-53）新增 `needsDevelopment: boolean | null;`
- `activeWorks` 查询（line 420-423）无 `select`、取全字段，因此 `work.needsDevelopment` 自动可用，**无需改 select**。
- `toBoardItem`（line 540-574）映射 `needsDevelopment: work.needsDevelopment,`
- 筛选说明：现有 tab 搜索是**纯客户端** `useMemo` 过滤，「仅看需开发」也走客户端过滤（见第 4 步），因此 query 层无需加筛选参数。

### 3. 服务端 action — `src/server/quarterly-work/actions.ts`
新增必填布尔解析工具（放在 `parseOptionalFloat` 等工具附近，line 60 区域）：
```ts
function parseRequiredBoolean(value: FormDataEntryValue | null, fieldName: string) {
  const text = (value as string | null)?.trim();
  if (text === "true") return true;
  if (text === "false") return false;
  throw new Error(`${fieldName}为必填项`);
}
```
- `createQuarterlyWork`（line 380-453）：
  - 解析 `const needsDevelopment = parseRequiredBoolean(formData.get("needsDevelopment"), "是否需要开发");`
  - 写入 `prisma.quarterlyWork.create` 的 `data`（line 417-436）。
- `updateQuarterlyWork`（line 455-587）：
  - 同样解析 `needsDevelopment`。
  - `existingWork` 的 `select`（line 481-494）加 `needsDevelopment: true`。
  - `update` 的 `data`（line 522-538）写入 `needsDevelopment`。
  - `buildFieldChangeRemark` 列表（line 552-567）追加一条：
    ```ts
    { label: "是否需要开发",
      previous: existingWork.needsDevelopment === null ? null : (existingWork.needsDevelopment ? "是" : "否"),
      next: needsDevelopment ? "是" : "否" },
    ```
    使操作日志记录变更（历史 `null` → 首次编辑显示为「未设置 → 是/否」）。

### 4. 前端 — `src/app/(authenticated)/quarterly-work/content.tsx`
复用现有 `Badge`（`@/components/ui-kit`，已在 line 6 导入）。

**4a. 表单 `QuarterlyWorkForm`（line 543-767）** — 新增一行「是否需要开发 *」，两选必填 select，`name="needsDevelopment"`：
- 选项：`是`(value=`true`) / `否`(value=`false`)。
- 新建：无默认选中（`defaultValue=""` + 占位 `disabled` 项 + `required`），强制选择。
- 编辑：`item?.needsDevelopment === true` → 默认 `true`；`=== false` → 默认 `false`；`=== null`（历史）→ 无默认选中，仍必须选择才能保存。
- 位置建议放在「任务描述」上方；样式对齐现有 select（如「任务结果」line 714-726）。

**4b. 卡片视图（line 2541 标题处）** — 标题右侧仅当 `it.needsDevelopment === true` 时渲染徽章：
```tsx
<div className="flex items-center gap-2">
  <div className="text-sm font-medium leading-snug">{it.title}</div>
  {it.needsDevelopment ? <Badge tone="info">需开发</Badge> : null}
</div>
```
`false` 与 `null` 不显示。

**4c. 列表视图（line 2602 表头 / line 2619 行）** — 新增一列「是否需开发」：
- 表头 line 2602 的 `grid-cols-[...]` 增加一列宽度，并插入 `<div>是否需开发</div>`。
- 行 line 2619 对应插入单元格：`item.needsDevelopment === null ? "-" : (item.needsDevelopment ? "是" : "否")`。
- 表头与行的列数、grid 模板需同步调整，保持对齐（当前为 12 列）。

**4d. 「仅看需开发」筛选** — 客户端 state：
- 组件顶部（line 1866 附近搜索 state 旁）新增 `const [needsDevOnly, setNeedsDevOnly] = useState(false);`
- 任务看板 `BoardSearchBar`（line 2510-2514）旁新增开关/复选框「仅看需开发」，绑定 `needsDevOnly`。
- `filteredTaskColumns`（line 1971-1977）的 `items.filter` 追加条件 `(!needsDevOnly || item.needsDevelopment === true)`，并把 `needsDevOnly` 加入 `useMemo` 依赖。
- 开关仅对 `tab === "board"` 生效；卡片与列表视图都消费 `filteredTaskColumns`，因此两视图同时受控。

### 5. 权限 / 兼容
- 复用 `requireManageProductTask`，无需新增权限项。
- 字段可空、无默认值：历史数据 `null`，卡片/列表正常展示（徽章不显示、列显示「-」）；仅在用户编辑历史任务时被强制补齐。

## 验证
1. **迁移**：按仓库约定生成并应用 migration，确认 dev.db 新增列且历史行为 `null`。
2. **改动生效**：依赖 dev 热更新即可；若 Prisma client 变更需 `prisma generate`。
3. **新建任务**：不选「是否需要开发」应被拦截，报「是否需要开发为必填项」；选「是」保存后，卡片出现「需开发」徽章、列表列显示「是」。
4. **编辑历史任务**（`needsDevelopment=null`）：表单无默认选中且必填；保存后操作日志出现「是否需要开发：未设置 → 是/否」记录。
5. **筛选**：勾选「仅看需开发」，卡片与列表仅剩 `needsDevelopment===true` 的任务；取消恢复全部。
6. **列表视图**：切到「列表」，确认新列表头与行对齐、grid 未错位。

## 风险 / 待确认点
- 表单为**必填**：编辑历史任务（值为 `null`）时用户必须先补选，否则无法保存——这是预期行为，接手时确认产品认可。
- 列表视图 grid 为固定 12 列模板，新增列需同时改表头与行的 `grid-cols` 和单元格数量，易错位，改完务必切到列表视图核对对齐。
- 「仅看需开发」是纯客户端过滤，跨年度/季度切换（走 URL 重新拉数）后 `needsDevOnly` 状态是否保留，按现有搜索框行为对齐即可（无需持久化）。
- 徽章 `tone` 用了 `info`，若与现有卡片视觉冲突可换其它 tone（可选：`primary`/`teal`）。
