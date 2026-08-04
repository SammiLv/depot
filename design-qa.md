# KPI 审批策略配置界面视觉验收

- Source visual truth: `/var/folders/ts/_kyh18mx3x7495xj0_x1gfrh0000gn/T/codex-clipboard-4c9b93a7-5b10-41c2-97d0-13986e55cc02.png`
- Source pixels: `1742 x 1230`
- Previous implementation reference: `/var/folders/ts/_kyh18mx3x7495xj0_x1gfrh0000gn/T/codex-clipboard-4ab4a5b2-95e6-4cd2-ac31-ac14614a63b7.png`
- Previous implementation pixels: `1968 x 1486`
- Latest toolbar source: `/var/folders/ts/_kyh18mx3x7495xj0_x1gfrh0000gn/T/codex-clipboard-7540456f-90c1-43d1-aa63-cd718b05ff9f.png`
- Text-button style source: `/var/folders/ts/_kyh18mx3x7495xj0_x1gfrh0000gn/T/codex-clipboard-494fae4a-11ee-4b23-bf02-ad16be92013f.png`
- Intended viewport: desktop Chrome, approximately `1968 x 1486`
- Density normalization: not performed; reference images represent different screens and are used only for component interaction/style direction.
- State: KPI 审批策略弹窗，审批节点或审批人下拉面板展开。

## Full-view comparison evidence

Source shows an app-rendered dropdown panel with a search field, scrollable options, selected-row highlight, and checkmark. The implementation replaces both native selects with the same DOM-rendered interaction structure while retaining the existing KPI modal layout and tokens.

## Focused region comparison evidence

Code-level focused inspection confirms the two target controls now use a shared searchable dropdown component with the existing `bg-card`, `border-border`, `text-primary`, rounded-corner, shadow, and Lucide check/chevron conventions. A browser-rendered focused screenshot could not be captured because the in-app browser was redirected to `/login`.

## Findings

- [P2] Browser-rendered open state not captured
  - Location: KPI approval policy modal, approval-node and approver controls.
  - Evidence: local URL redirects the verification browser to the login page; no authenticated implementation screenshot is available.
  - Impact: exact overlay position, clipping, and visual fidelity cannot be conclusively compared with the reference.
  - Fix: sign in to the local 3004 environment, open either dropdown, and capture the same desktop viewport.

## Required fidelity surfaces

- Fonts and typography: existing project typography tokens are preserved; rendered comparison blocked by authentication.
- Spacing and layout rhythm: existing three-column form grid is preserved; rendered overlay comparison blocked.
- Colors and visual tokens: existing project semantic tokens are reused.
- Image quality and asset fidelity: no raster assets are required; existing Lucide icons are reused.
- Copy and content: search placeholders, automatic approver copy, option labels, and empty states are implemented.

## Comparison history

- Initial implementation replaced native selects with DOM-rendered searchable dropdowns.
- Follow-up semantics fix makes the approver field read-only in cascade mode, clears stale explicit users when switching modes, and rejects invalid cascade overrides on the server.
- TypeScript compilation, 34 KPI unit tests, production build, and whitespace checks passed.
- Post-fix visual evidence remains unavailable because the verification browser is unauthenticated.
- 2026-08-03 follow-up replaced the flat approval-node checkbox list with an expandable organization tree. It includes search, layer-by-layer expand/collapse, current-layer selection, department/leaf shortcuts, selected-count feedback, and automatic ancestor/descendant conflict removal.
- Department policy trees are restricted to the policy subtree plus explicit public ancestors, preventing unrelated department branches from appearing below the company node.
- Latest follow-up compresses the selector controls into one horizontal toolbar with a short search field and seven borderless text actions. Department/leaf shortcuts and the separate layer summary were removed as requested.
- Approval policy summaries now use a table with headers for strategy name, description, scope, approval steps, status, and actions. Each policy occupies one row, while multiple ordered steps remain grouped inside the approval-step cell.

## Implementation checklist

- [x] Replace both native selects.
- [x] Keep the expanded panel in page DOM so external screenshot tools do not collapse it.
- [x] Add search, selected state, checkmark, Escape close, and outside-click close.
- [x] Fix cascade mode to automatic approvers only and prevent explicit-user overrides in both UI and server validation.
- [ ] Capture authenticated open-state screenshot and verify clipping/positioning.
- [x] Add an expandable and searchable organization tree for approval-node selection.
- [x] Add current-layer, all-department, and all-leaf bulk selection.
- [x] Keep saved results as explicit organization node IDs and preserve server-side conflict validation.
- [ ] Capture the authenticated organization-tree state and compare desktop spacing, scroll height, and expanded hierarchy against the current KPI modal.
- [ ] Capture the authenticated policy table and verify column widths, long scope wrapping, multi-step row height, and horizontal overflow.

final result: blocked
