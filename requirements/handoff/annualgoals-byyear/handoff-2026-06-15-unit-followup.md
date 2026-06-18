# Annual Goals 今日问题处理交接（2026-06-15）

## 一、今天新增完成的内容

今天主要继续收口 `annual-goals` 模块，围绕“创建人/最后更新人”展示、单位同步、元指标校验等问题做了修复。

本轮**已完成并已 build 通过**的内容：

1. 三个列表页补齐四列元数据展示：
   - 创建人
   - 创建时间
   - 最后更新人
   - 最后更新时间
2. 年度指标链路补齐 creator / updater 数据写入与查询映射
3. 本地数据库做了增量 schema 同步（未重建整库）
4. 年度指标修改单位后，服务端已补“向下同步到元指标/季度指标”的更新逻辑
5. 修复元指标编辑时，单位换算后再做“不得超过父指标目标值”的校验，避免因为单位不同导致误判
6. 元指标目标值超出父指标时，前端已改为中文提示，并放在目标值输入框下方，而不是底部英文通用报错

---

## 二、本轮已改文件

### 1. 数据模型 / 查询 / 写入链路
- `db/prisma/schema.prisma`
- `src/server/annual-goals/actions.ts`
- `src/server/annual-goals/annual-goals-query.ts`

### 2. 页面渲染 / 表单交互
- `src/app/(authenticated)/annual-goals/content.tsx`

---

## 三、已经落地的修复说明

### 1. 三张表增加“创建人 / 最后更新人”

三个列表页（年度指标、元指标、季度指标）现在都按以下四列展示：
- 创建人
- 创建时间
- 最后更新人
- 最后更新时间

后端已补：
- `AnnualGoalMetricSource.updatedById`
- `AnnualGoalMetric.createdById / updatedById`
- `AnnualGoalQuarterTarget.createdById / updatedById`

同时在 actions 中补齐创建/更新写入，在 query 中补齐用户摘要映射。

### 2. 年度指标改单位后，向下同步

已在 `src/server/annual-goals/actions.ts` 的年度指标更新链路里补上：
- 当父年度指标单位变化时
- 同步更新其下元指标单位
- 再同步更新关联季度指标所属记录的单位字段

另外，本地库里历史遗留的几条脏数据也人工补齐过一次。

### 3. 元指标超父指标时的提示位置和文案

之前在生产环境下，保存失败会落成底部英文通用报错：
- `An error occurred in the Server Components render...`

现在已改为：
- 在元指标表单的 `目标值` 输入框下方直接提示中文
- 文案：`超出父指标目标值，请重新填写`

这部分是前端先校验，不再把这类常规输入错误直接抛成底部通用报错。

---

## 四、今天未解决的问题（最重要）

### 问题：拆解元指标弹窗里，切换“年度指标”后，下方“单位”没有跟着联动变化

用户多次验证后，问题**仍然存在**。

#### 现象
在“拆解元指标”弹窗中：
- 上方 `年度指标` 下拉已经显示切换后的目标项，例如：`创新 ToB 营收 · 500万元`
- 但下方元指标表单里的 `单位` 仍然停留在旧值，例如：`分`
- 说明弹窗中“当前选中父指标”和“下方表单显示单位”之间仍然没有真正联动成功

#### 用户强调的正确口径
不是弹窗外层标题或默认值的问题，而是：
- **下方元指标对应的单位**
- 应该随着**上方年度指标下拉框当前选择结果**实时变化

#### 今天已经尝试过但未解决的方向
都在：
- `src/app/(authenticated)/annual-goals/content.tsx`

尝试过的点包括：
1. 给 `SourceMetricForm` 外层加 `key`，强制重新挂载
2. 调整 `parentMetric` 取值逻辑，避免一直回退到 `initialParent`
3. 增加 `selectedParentMetric`
4. 调整 `displayUnit` 的来源
5. 给 `unit` 输入框增加 `key`
6. 给表单内部 `unitValue` 增加 `useEffect`

但用户实际刷新验证后，问题仍旧存在。

#### 当前最可能的问题方向
高概率是以下其中之一：

1. **上方下拉框虽然显示了新文本，但并没有真正更新 `selectedParentId` / `selectedParentMetric`**
   - 也就是 UI 文字变化了，但表单内部联动状态没有跟着变

2. **下方“单位”输入框虽然看似显示 `displayUnit`，但真正渲染时仍受别的本地 state / form defaultValue 控制**
   - 导致展示值和计算值不是同一个来源

3. **`SourceMetricForm` 组件内存在多个“父指标来源”变量（`initialParent` / `parentMetric` / `selectedParentMetric`），最终渲染单位时仍走错引用**

4. **下拉切换事件发生在自定义 Select 组件里，但并没有把联动需要的状态真正传回表单主体**

#### 下一步建议（不要再盲改）
下一位接手时建议直接按下面顺序查：

1. 在 `SourceMetricForm` 内精确确认：
   - 下拉切换时，`selectedParentId` 是否真的变化
   - `selectedParentMetric?.unit` 是否真的变化
   - 最终传给单位输入框的值到底是什么

2. 重点看 `年度指标` 这个下拉组件本身的：
   - `value`
   - `onChange`
   - 是否有受控/非受控混用

3. 如果需要，直接把下方单位改成**完全派生值**：
   - 新建态时不保留任何本地 state
   - 直接 `value={selectedParentMetric?.unit ?? ""}`
   - 确认没有任何 `defaultValue` / `useState` / `formData.get("unit")` 在覆盖它

4. 不要再只靠 build 通过判断修好了，必须在页面上真实点选验证

---

## 五、今天涉及的用户反馈（很重要）

用户对这轮问题有明确负反馈：
- “一个小问题改了5遍都没改对”
- “你到底问题出在哪里”
- “是不是没有改对地方”

这说明：
- 这次不能再继续靠猜测式修改
- 必须先把状态流查清楚，再下手
- 后续修复后，最好自己在浏览器里真实切换一次确认，而不是只看 build

---

## 六、建议下次接手顺序

1. 先看本交接文件
2. 重点看 `src/app/(authenticated)/annual-goals/content.tsx` 中 `SourceMetricForm`
3. 查清楚：
   - 下拉切换是否真的改了表单内部状态
   - 单位输入框最终绑定的是谁
4. 修完后：
   - `npm run build`
   - 本地重启 `start:office`
   - 真实打开“拆解元指标”弹窗，切换不同年度指标，确认单位即时联动

---

## 七、当前任务状态

当前活跃任务：
- `#20 [in_progress] Fix annual-goals source-unit linkage`

当前结论：
- 大部分年度指标收口项已经落地
- **唯一仍明显未收口的是：拆解元指标弹窗单位联动问题**
