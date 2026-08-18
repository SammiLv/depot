import type { PromotionOutcome } from "@prisma/client";

export const promotionOutcomeValues = ["SUCCESS", "REJECTED", "FAILED"] as const satisfies readonly PromotionOutcome[];

export const promotionOutcomeLabels: Record<PromotionOutcome, string> = {
  SUCCESS: "晋升成功",
  REJECTED: "申请驳回",
  FAILED: "晋升失败",
};

export function isSuccessfulPromotionOutcome(outcome: PromotionOutcome) {
  return outcome === "SUCCESS";
}
