/**
 * 「离职人员」系统组排最后，其余保持传入顺序（Array.sort 稳定排序，相对顺序不变）。
 * 用于产品管理/KPI/人才等模块的业务组下拉与 Tab。
 */
export function sortResignedPoolTeamsLast<T extends { isResignedPool?: boolean | null }>(
  teams: readonly T[],
): T[] {
  return [...teams].sort((left, right) => Number(Boolean(left.isResignedPool)) - Number(Boolean(right.isResignedPool)));
}

/**
 * 离职成员排最后，其余保持传入顺序（稳定）。
 * 用于负责人筛选下拉：在职在前、离职在后。
 */
export function sortResignedMembersLast<T extends { isResigned?: boolean | null }>(
  members: readonly T[],
): T[] {
  return [...members].sort((left, right) => Number(Boolean(left.isResigned)) - Number(Boolean(right.isResigned)));
}
