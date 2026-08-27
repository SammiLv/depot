import type { Prisma } from "@prisma/client";
import { getKpiStatusForApprovalStep } from "@/server/kpi/approval-workflow";

type CurrentApprovalStep = {
  id: string;
  stageKey: string;
  stepOrder: number;
};

type TransitionKpiApprovalChainInput = {
  personalKpiId: string;
  action: "submit" | "approve" | "reject";
  currentStep: CurrentApprovalStep | null;
  comment?: string | null;
  actedAt?: Date;
};

async function skipSiblingApprovalSteps(
  tx: Prisma.TransactionClient,
  input: {
    personalKpiId: string;
    stepOrder: number;
    actedStepId: string;
    actedAt: Date;
  },
) {
  await tx.personalKpiApprovalStep.updateMany({
    where: {
      personalKpiId: input.personalKpiId,
      stepOrder: input.stepOrder,
      id: { not: input.actedStepId },
      status: { in: ["PENDING", "WAITING"] },
    },
    data: {
      status: "SKIPPED",
      completedAt: input.actedAt,
    },
  });
}

async function resetApprovalStepGroupToPending(
  tx: Prisma.TransactionClient,
  personalKpiId: string,
  stepOrder: number,
) {
  await tx.personalKpiApprovalStep.updateMany({
    where: {
      personalKpiId,
      stepOrder,
    },
    data: {
      status: "PENDING",
      comment: null,
      actedAt: null,
      completedAt: null,
    },
  });
}

export async function repairIncorrectManagerRejectRollback(
  tx: Prisma.TransactionClient,
  personalKpiId: string,
) {
  const personalKpi = await tx.personalKpi.findUnique({
    where: { id: personalKpiId },
    select: { status: true },
  });
  if (personalKpi?.status !== "PENDING_SELF_REVIEW") {
    return false;
  }

  const steps = await tx.personalKpiApprovalStep.findMany({
    where: { personalKpiId },
    orderBy: [{ stepOrder: "asc" }, { createdAt: "asc" }],
    select: { stepOrder: true, stageKey: true, status: true },
  });
  const hasRejectedManager = steps.some((step) => step.stageKey === "MANAGER" && step.status === "REJECTED");
  const leaderSteps = steps.filter((step) => step.stageKey === "LEADER");
  const leaderCompleted = leaderSteps.some((step) => step.status === "COMPLETED");
  if (!hasRejectedManager || !leaderCompleted || !leaderSteps.length) {
    return false;
  }

  const leaderStepOrder = Math.min(...leaderSteps.map((step) => step.stepOrder));
  await resetApprovalStepGroupToPending(tx, personalKpiId, leaderStepOrder);
  await tx.personalKpi.update({
    where: { id: personalKpiId },
    data: { status: "PENDING_LEADER_SCORE" },
  });
  return true;
}

async function reactivateApprovalStepGroup(
  tx: Prisma.TransactionClient,
  personalKpiId: string,
  stepOrder: number,
) {
  await tx.personalKpiApprovalStep.updateMany({
    where: {
      personalKpiId,
      stepOrder,
      status: { in: ["WAITING", "REJECTED", "SKIPPED"] },
    },
    data: {
      status: "PENDING",
      comment: null,
      actedAt: null,
      completedAt: null,
    },
  });
}

async function activateNextApprovalStepGroup(
  tx: Prisma.TransactionClient,
  personalKpiId: string,
) {
  const nextStep = await tx.personalKpiApprovalStep.findFirst({
    where: {
      personalKpiId,
      status: { in: ["PENDING", "WAITING", "REJECTED"] },
    },
    orderBy: { stepOrder: "asc" },
  });
  if (!nextStep) {
    return "COMPLETED" as const;
  }

  if (nextStep.status !== "PENDING") {
    await reactivateApprovalStepGroup(tx, personalKpiId, nextStep.stepOrder);
  }

  return getKpiStatusForApprovalStep(nextStep.stageKey);
}

export async function reconcileStalledApprovalSteps(
  tx: Prisma.TransactionClient,
  personalKpiId: string,
) {
  const pendingStep = await tx.personalKpiApprovalStep.findFirst({
    where: { personalKpiId, status: "PENDING" },
    orderBy: { stepOrder: "asc" },
    select: { id: true },
  });
  if (pendingStep) return false;

  const nextStep = await tx.personalKpiApprovalStep.findFirst({
    where: {
      personalKpiId,
      status: { in: ["WAITING", "REJECTED"] },
    },
    orderBy: { stepOrder: "asc" },
    select: { stepOrder: true },
  });
  if (!nextStep) return false;

  await reactivateApprovalStepGroup(tx, personalKpiId, nextStep.stepOrder);
  return true;
}

export async function transitionKpiApprovalChain(
  tx: Prisma.TransactionClient,
  input: TransitionKpiApprovalChainInput,
) {
  const actedAt = input.actedAt ?? new Date();

  if (input.action === "reject") {
    if (!input.currentStep) {
      throw new Error("找不到当前审批步骤");
    }
    const actingStep = await tx.personalKpiApprovalStep.findUnique({
      where: { id: input.currentStep.id },
      select: { id: true, stepOrder: true, stageKey: true },
    });
    if (!actingStep) {
      throw new Error("找不到当前审批步骤");
    }

    await tx.personalKpiApprovalStep.update({
      where: { id: actingStep.id },
      data: {
        status: "REJECTED",
        comment: input.comment ?? null,
        actedAt,
        completedAt: actedAt,
      },
    });
    await skipSiblingApprovalSteps(tx, {
      personalKpiId: input.personalKpiId,
      stepOrder: actingStep.stepOrder,
      actedStepId: actingStep.id,
      actedAt,
    });

    if (actingStep.stageKey === "LEADER") {
      return "PENDING_SELF_REVIEW" as const;
    }

    const previousStep = await tx.personalKpiApprovalStep.findFirst({
      where: {
        personalKpiId: input.personalKpiId,
        stepOrder: { lt: actingStep.stepOrder },
      },
      orderBy: { stepOrder: "desc" },
      select: { stepOrder: true, stageKey: true },
    });
    if (!previousStep) {
      return "PENDING_SELF_REVIEW" as const;
    }

    await resetApprovalStepGroupToPending(tx, input.personalKpiId, previousStep.stepOrder);
    return getKpiStatusForApprovalStep(previousStep.stageKey);
  }

  if (input.currentStep) {
    const actingStep = await tx.personalKpiApprovalStep.findUnique({
      where: { id: input.currentStep.id },
      select: { id: true, stepOrder: true },
    });
    if (!actingStep) {
      throw new Error("找不到当前审批步骤");
    }

    await tx.personalKpiApprovalStep.update({
      where: { id: actingStep.id },
      data: {
        status: "COMPLETED",
        comment: input.comment ?? null,
        actedAt,
        completedAt: actedAt,
      },
    });
    await skipSiblingApprovalSteps(tx, {
      personalKpiId: input.personalKpiId,
      stepOrder: actingStep.stepOrder,
      actedStepId: actingStep.id,
      actedAt,
    });
  }

  return activateNextApprovalStepGroup(tx, input.personalKpiId);
}
