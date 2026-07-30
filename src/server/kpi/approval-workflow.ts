import type { KpiStatus } from "@prisma/client";

export type KpiApprovalStageKey = "LEADER" | "MANAGER" | "FINAL";
export type KpiEditableStage = "SELF" | KpiApprovalStageKey;

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
