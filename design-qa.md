# 人才档案列表小屏列宽视觉验收

- Source visual truth: `/var/folders/ts/_kyh18mx3x7495xj0_x1gfrh0000gn/T/codex-clipboard-e060803c-92db-42b4-b711-dffa20d20673.png`
- Source pixels: `2048 x 1180`
- Implementation screenshot: `outputs/talent-profile-columns-1280.png`
- Implementation pixels / CSS viewport: `1280 x 720`
- Density normalization: 源图为高分辨率桌面截图，实施图按浏览器原生 1x 密度在 `1280 x 720` 小屏桌面视口验收；比较聚焦人才档案表格区域。
- State: 人才履历主界面，默认选中“人才档案”。

## Full-view comparison evidence

保持原有页面结构、筛选、状态与操作不变，仅重新分配人才档案表格各列宽度。员工/组织与岗位名称两列已收窄，当前聘期和操作列获得更多空间，整个页面在 1280 像素视口没有横向滚动。

## Focused region comparison evidence

- 当前聘期列实测宽度 `243px`，日期文本容器宽度 `222px`、高度 `20px`，`white-space: nowrap`，完整聘期 `2024-07-16 至 2027-07-15` 保持单行。
- 员工/组织列实测宽度 `135px`，岗位名称列实测宽度 `99px`，两列相邻且不再存在明显闲置空间。
- `document.scrollWidth <= document.clientWidth`，未产生页面横向滚动。
- 浏览器日志中无 error 或 warning。

## Findings

没有未解决的 P0、P1 或 P2 问题。

## Required fidelity surfaces

- Fonts and typography: 继续使用既有字体、字号、字重；聘期日期只调整为不换行。
- Spacing and layout rhythm: 收紧前两列，将空间转移到当前聘期与操作列，行高和内边距保持不变。
- Colors and visual tokens: 未修改任何颜色或语义状态样式。
- Image quality and asset fidelity: 页面未新增或修改图片资产与图标。
- Copy and content: 字段名称和业务文案保持不变。

## Comparison history

1. 源图中当前聘期日期在小屏换行，员工/组织和岗位名称之间空间偏大。
2. 调整七列表格的栅格比例，并为聘期日期增加单行约束。
3. 在 `1280 x 720` 视口复验，聘期完整单行、前两列间距收紧、页面无横向滚动。

## Implementation checklist

- [x] 收窄员工/组织列。
- [x] 收窄岗位名称列。
- [x] 扩宽当前聘期列并禁止日期换行。
- [x] 保留操作列足够宽度，按钮文案不换行。
- [x] 验证小屏无页面横向滚动。
- [x] 验证浏览器无错误和警告。

final result: passed
