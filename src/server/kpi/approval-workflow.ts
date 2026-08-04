import type { KpiStatus } from "@prisma/client";

export type KpiApprovalStageKey = "LEADER" | "MANAGER" | "FINAL";
export type KpiEditableStage = "SELF" | KpiApprovalStageKey;
export type KpiProgressStageKey = "INIT" | "SELF_REVIEW" | "LEADER" | "MANAGER" | "FINAL";

export const kpiProgressStageLabels: Record<KpiProgressStageKey, string> = {
  INIT: "初始化",
  SELF_REVIEW: "自评",
  LEADER: "组长评",
  MANAGER: "主管评",
  FINAL: "终审",
};

export const kpiProgressStageOrder: KpiProgressStageKey[] = [
  "INIT",
  "SELF_REVIEW",
  "LEADER",
  "MANAGER",
  "FINAL",
];

const legacyStatusOrder: KpiStatus[] = [
  "DRAFT",
  "PENDING_SELF_REVIEW",
  "PENDING_LEADER_SCORE",
  "PENDING_MANAGER_SCORE",
  "PENDING_FINAL_REVIEW",
  "COMPLETED",
];

const legacyProgressStageStatus: Record<Exclude<KpiProgressStageKey, "INIT">, KpiStatus> = {
  SELF_REVIEW: "PENDING_SELF_REVIEW",
  LEADER: "PENDING_LEADER_SCORE",
  MANAGER: "PENDING_MANAGER_SCORE",
  FINAL: "PENDING_FINAL_REVIEW",
};

type ApprovalStepProgress = {
  stageKey: string;
  status: string;
};

export function hasCompletedKpiProgressStage(
  input: {
    status: KpiStatus;
    approvalSteps?: ApprovalStepProgress[];
  },
  stage: KpiProgressStageKey,
): boolean {
  const { status, approvalSteps } = input;

  if (stage === "INIT") {
    return true;
  }

  if (stage === "SELF_REVIEW") {
    return !isSelfReviewStatus(status);
  }

  if (approvalSteps && approvalSteps.length > 0) {
    const approvalStageKey = stage as KpiApprovalStageKey;
    const step = approvalSteps.find((item) => item.stageKey === approvalStageKey);
    if (step) {
      return step.status === "COMPLETED";
    }
    return status === "COMPLETED";
  }

  const statusIndex = legacyStatusOrder.indexOf(status);
  const targetIndex = legacyStatusOrder.indexOf(legacyProgressStageStatus[stage as Exclude<KpiProgressStageKey, "INIT">]);
  return statusIndex > targetIndex;
}

export function buildKpiCompletedProgressStages(input: {
  status: KpiStatus;
  approvalSteps?: ApprovalStepProgress[];
}) {
  return {
    init: hasCompletedKpiProgressStage(input, "INIT"),
    selfReview: hasCompletedKpiProgressStage(input, "SELF_REVIEW"),
    leader: hasCompletedKpiProgressStage(input, "LEADER"),
    manager: hasCompletedKpiProgressStage(input, "MANAGER"),
    final: hasCompletedKpiProgressStage(input, "FINAL"),
  };
}

export function getEditableStageFromApprovalStep(stageKey: string | null | undefined): KpiApprovalStageKey | null {
  if (stageKey === "LEADER" || stageKey === "MANAGER" || stageKey === "FINAL") {
    return stageKey;
  }
  return null;
}

export function getKpiStatusForApprovalStep(stageKey: string): KpiStatus {
  if (stageKey === "LEADER") return "PENDING_LEADER_SCORE";
  if (stageKey === "MANAGER") return "PENDING_MANAGER_SCORE";
  if (stageKey === "FINAL") return "PENDING_FINAL_REVIEW";
  throw new Error(`不支持的 KPI 审批步骤类型：${stageKey}`);
}

export function getApprovalStepDisplayLabel(stageKey: string | null | undefined) {
  if (stageKey === "LEADER") return "组长评";
  if (stageKey === "MANAGER") return "主管评";
  if (stageKey === "FINAL") return "终审";
  return null;
}

export function getInitialApprovalStepStatus(stepIndex: number) {
  return stepIndex === 0 ? "PENDING" as const : "WAITING" as const;
}

export function isSelfReviewStatus(status: KpiStatus) {
  return status === "DRAFT" || status === "PENDING_SELF_REVIEW";
}

export function getLegacyNextKpiStatus(status: KpiStatus): KpiStatus {
  if (status === "DRAFT" || status === "PENDING_SELF_REVIEW") return "PENDING_LEADER_SCORE";
  if (status === "PENDING_LEADER_SCORE") return "PENDING_MANAGER_SCORE";
  if (status === "PENDING_MANAGER_SCORE") return "PENDING_FINAL_REVIEW";
  if (status === "PENDING_FINAL_REVIEW") return "COMPLETED";
  throw new Error("当前阶段不能继续流转");
}
