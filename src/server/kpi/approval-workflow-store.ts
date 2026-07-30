import type { Prisma } from "@prisma/client";
import { getKpiStatusForApprovalStep } from "@/server/kpi/approval-workflow";

type CurrentApprovalStep = {
  id: string;
  stageKey: string;
};

type TransitionKpiApprovalChainInput = {
  personalKpiId: string;
  action: "submit" | "approve" | "reject";
  currentStep: CurrentApprovalStep | null;
  comment?: string | null;
  actedAt?: Date;
};

export async function transitionKpiApprovalChain(
  tx: Prisma.TransactionClient,
  input: TransitionKpiApprovalChainInput,
) {
  const actedAt = input.actedAt ?? new Date();

  if (input.action === "reject") {
    if (!input.currentStep) {
      throw new Error("找不到当前审批步骤");
    }
    await tx.personalKpiApprovalStep.update({
      where: { id: input.currentStep.id },
      data: {
        status: "REJECTED",
        comment: input.comment ?? null,
        actedAt,
        completedAt: actedAt,
      },
    });
    return "PENDING_SELF_REVIEW" as const;
  }

  if (input.currentStep) {
    await tx.personalKpiApprovalStep.update({
      where: { id: input.currentStep.id },
      data: {
        status: "COMPLETED",
        comment: input.comment ?? null,
        actedAt,
        completedAt: actedAt,
      },
    });
  }

  const nextStep = await tx.personalKpiApprovalStep.findFirst({
    where: {
      personalKpiId: input.personalKpiId,
      status: { in: ["PENDING", "WAITING", "REJECTED"] },
    },
    orderBy: { stepOrder: "asc" },
  });
  if (!nextStep) {
    return "COMPLETED" as const;
  }

  if (nextStep.status !== "PENDING") {
    await tx.personalKpiApprovalStep.update({
      where: { id: nextStep.id },
      data: {
        status: "PENDING",
        comment: null,
        actedAt: null,
        completedAt: null,
      },
    });
  }

  return getKpiStatusForApprovalStep(nextStep.stageKey);
}
