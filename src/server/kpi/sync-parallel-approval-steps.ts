import { prisma } from "@/server/db/prisma";
import { reconcileStalledApprovalSteps, repairIncorrectManagerRejectRollback } from "@/server/kpi/approval-workflow-store";
import {
  buildPersonalKpiApprovalStepData,
  resolveKpiApprovalSnapshot,
} from "@/server/kpi/approval-snapshot";
import { getMinPendingStepOrder } from "@/server/kpi/approval-step-utils";

const inProgressStatuses = [
  "PENDING_LEADER_SCORE",
  "PENDING_MANAGER_SCORE",
  "PENDING_FINAL_REVIEW",
] as const;

export async function syncParallelApprovalStepsForPersonalKpi(personalKpiId: string) {
  const personalKpi = await prisma.personalKpi.findUnique({
    where: { id: personalKpiId },
    select: {
      id: true,
      status: true,
      userId: true,
      orgNodeId: true,
    },
  });
  if (!personalKpi) {
    return { personalKpiId, added: 0, repaired: false, skipped: true as const };
  }

  let repaired = false;
  await prisma.$transaction(async (tx) => {
    if (await repairIncorrectManagerRejectRollback(tx, personalKpiId)) {
      repaired = true;
    }
  });

  if (!inProgressStatuses.includes(personalKpi.status as typeof inProgressStatuses[number]) && !repaired) {
    return { personalKpiId, added: 0, repaired, skipped: true as const };
  }

  let existingSteps = await prisma.personalKpiApprovalStep.findMany({
    where: { personalKpiId },
    orderBy: [{ stepOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!existingSteps.length) {
    return { personalKpiId, added: 0, repaired, skipped: true as const };
  }

  if (getMinPendingStepOrder(existingSteps) == null) {
    const reconciled = await prisma.$transaction((tx) => reconcileStalledApprovalSteps(tx, personalKpiId));
    if (reconciled) {
      repaired = true;
      existingSteps = await prisma.personalKpiApprovalStep.findMany({
        where: { personalKpiId },
        orderBy: [{ stepOrder: "asc" }, { createdAt: "asc" }],
      });
    }
  }

  const snapshot = await resolveKpiApprovalSnapshot({
    subjectUserId: personalKpi.userId,
    subjectOrgNodeId: personalKpi.orgNodeId,
  });
  const freshSteps = buildPersonalKpiApprovalStepData(personalKpiId, snapshot);
  const existingByApproverId = new Map(existingSteps.map((step) => [step.approverId, step]));
  const existingByStepOrder = new Map<number, typeof existingSteps>();
  for (const step of existingSteps) {
    const group = existingByStepOrder.get(step.stepOrder) ?? [];
    group.push(step);
    existingByStepOrder.set(step.stepOrder, group);
  }

  const minPendingStepOrder = getMinPendingStepOrder(existingSteps);
  const toCreate = freshSteps.filter((freshStep) => {
    if (existingByApproverId.has(freshStep.approverId)) return false;
    return existingByStepOrder.has(freshStep.stepOrder);
  }).map((freshStep) => {
    const siblings = existingByStepOrder.get(freshStep.stepOrder) ?? [];
    const siblingStatus = siblings[0]?.status ?? "WAITING";
    const status = freshStep.stepOrder === minPendingStepOrder && siblingStatus === "PENDING"
      ? "PENDING"
      : siblingStatus === "COMPLETED" || siblingStatus === "SKIPPED"
        ? siblingStatus
        : freshStep.stepOrder === minPendingStepOrder
          ? "PENDING"
          : "WAITING";
    return { ...freshStep, status };
  });

  if (toCreate.length) {
    await prisma.personalKpiApprovalStep.createMany({ data: toCreate });
  }

  return {
    personalKpiId,
    added: toCreate.length,
    repaired,
    skipped: false as const,
  };
}

export async function syncParallelApprovalStepsForInProgressKpis() {
  const personalKpis = await prisma.personalKpi.findMany({
    where: {
      status: {
        in: ["PENDING_SELF_REVIEW", ...inProgressStatuses],
      },
    },
    select: { id: true },
  });

  const results = [];
  for (const personalKpi of personalKpis) {
    results.push(await syncParallelApprovalStepsForPersonalKpi(personalKpi.id));
  }
  return results;
}
