export function assertValidJobLevelStep(stepOrder: number) {
  if (!Number.isInteger(stepOrder) || stepOrder < 1) {
    throw new Error("职级分档序号必须是大于 0 的整数");
  }
}

export function assertValidSalaryCap(maxSalary: number) {
  if (!Number.isInteger(maxSalary) || maxSalary <= 0) {
    throw new Error("薪资上限必须是大于 0 的整数");
  }
}

export function salaryCapScopesOverlap(
  left: { jobLevelGroupId: string; jobLevelId: string | null; effectiveFrom: Date; effectiveTo: Date | null },
  right: { jobLevelGroupId: string; jobLevelId: string | null; effectiveFrom: Date; effectiveTo: Date | null },
) {
  if (left.jobLevelGroupId !== right.jobLevelGroupId || left.jobLevelId !== right.jobLevelId) return false;
  const leftEnd = left.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightEnd = right.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return left.effectiveFrom.getTime() <= rightEnd && right.effectiveFrom.getTime() <= leftEnd;
}
