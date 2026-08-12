export type ApprovalStepLike = {
  stepOrder: number;
  status: string;
  approverId: string;
  stageKey?: string;
  stepLabel?: string | null;
};

export function formatParallelApproverNames(names: string[]) {
  const uniqueNames = [...new Set(names.filter((name) => name && name !== "—"))];
  if (uniqueNames.length === 0) return "—";
  if (uniqueNames.length === 1) return uniqueNames[0]!;
  return uniqueNames.join(" 或 ");
}

export function getGroupedApprovalStepProgress(steps: ApprovalStepLike[]) {
  const completed = steps.some((step) => step.status === "COMPLETED");
  const active = steps.some((step) => step.status === "PENDING");
  const count = steps.some((step) => step.status !== "WAITING") ? 1 : 0;
  const status = completed
    ? "COMPLETED"
    : active
      ? "PENDING"
      : steps.find((step) => step.status === "REJECTED")?.status
        ?? steps[0]?.status
        ?? "WAITING";
  return { completed, active, count, status };
}

export type GroupedApprovalStepDisplay<T extends ApprovalStepLike = ApprovalStepLike> = {
  stepOrder: number;
  stageKey: string;
  stepLabel: string | null;
  approverName: string;
  status: string;
  active: boolean;
  completed: boolean;
  count: number;
  steps: T[];
};

export function buildGroupedApprovalStepDisplays<T extends ApprovalStepLike>(
  steps: T[],
  resolveApproverName: (step: T) => string,
): GroupedApprovalStepDisplay<T>[] {
  return groupApprovalStepsByOrder(steps).map(([stepOrder, groupSteps]) => {
    const stageKey = groupSteps[0]?.stageKey ?? "";
    const stepLabel = groupSteps.find((step) => step.stepLabel)?.stepLabel ?? groupSteps[0]?.stepLabel ?? null;
    const progress = getGroupedApprovalStepProgress(groupSteps);
    return {
      stepOrder,
      stageKey,
      stepLabel,
      approverName: formatParallelApproverNames(groupSteps.map(resolveApproverName)),
      status: progress.status,
      active: progress.active,
      completed: progress.completed,
      count: progress.count,
      steps: groupSteps,
    };
  });
}

export function getMinPendingStepOrder(steps: ApprovalStepLike[]) {
  const pendingOrders = steps
    .filter((step) => step.status === "PENDING")
    .map((step) => step.stepOrder);
  return pendingOrders.length ? Math.min(...pendingOrders) : null;
}

export function findUserPendingApprovalStep<T extends ApprovalStepLike>(
  steps: T[],
  userId: string,
): T | null {
  const minOrder = getMinPendingStepOrder(steps);
  if (minOrder == null) return null;
  return steps.find(
    (step) => step.stepOrder === minOrder && step.status === "PENDING" && step.approverId === userId,
  ) ?? null;
}

export function isUserActiveApproverAtStage<T extends ApprovalStepLike>(
  steps: T[],
  userId: string,
  stageKey: string,
): boolean {
  const step = findUserPendingApprovalStep(steps, userId);
  return step?.stageKey === stageKey;
}

export function hasCompletedApprovalStage(
  steps: Array<Pick<ApprovalStepLike, "stageKey" | "status">>,
  stageKey: string,
) {
  return steps.some((step) => step.stageKey === stageKey && step.status === "COMPLETED");
}

export function groupApprovalStepsByOrder<T extends ApprovalStepLike>(steps: T[]) {
  const groups = new Map<number, T[]>();
  for (const step of steps) {
    const group = groups.get(step.stepOrder) ?? [];
    group.push(step);
    groups.set(step.stepOrder, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right);
}
