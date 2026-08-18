import type { TalentDecisionType } from "@prisma/client";

export const decisionRestrictionTypes: Record<TalentDecisionType, string[]> = {
  PROMOTION: ["NO_PROMOTION", "NO_PROMOTION_RAISE", "TERMINATION"],
  CONTRACT_RENEWAL: ["TERMINATION"],
  SALARY_ADJUSTMENT: ["NO_SALARY_ADJUSTMENT", "NO_PROMOTION_RAISE", "TERMINATION"],
  REWARD: ["NO_ANNUAL_REWARD", "NO_QUARTER_REWARD", "TERMINATION"],
  QUARTERLY_REWARD: ["NO_QUARTER_REWARD", "TERMINATION"],
  ANNUAL_REWARD: ["NO_ANNUAL_REWARD", "TERMINATION"],
  DEVELOPMENT: ["TERMINATION"],
  TERMINATION: ["TERMINATION"],
};

export const decisionControlledRestrictionTypes: Record<TalentDecisionType, Array<"PROMOTION" | "SALARY_ADJUSTMENT" | "QUARTERLY_REWARD" | "ANNUAL_REWARD" | "TERMINATION">> = {
  PROMOTION: ["PROMOTION", "TERMINATION"],
  CONTRACT_RENEWAL: ["TERMINATION"],
  SALARY_ADJUSTMENT: ["SALARY_ADJUSTMENT", "TERMINATION"],
  REWARD: ["QUARTERLY_REWARD", "ANNUAL_REWARD", "TERMINATION"],
  QUARTERLY_REWARD: ["QUARTERLY_REWARD", "TERMINATION"],
  ANNUAL_REWARD: ["ANNUAL_REWARD", "TERMINATION"],
  DEVELOPMENT: ["TERMINATION"],
  TERMINATION: ["TERMINATION"],
};

export function isFeedbackEligibleForFormalResult(status: string) {
  return status === "ADOPTED" || status === "ADJUSTED_ADOPTION";
}

export function hasBlockingQualification(rules: Array<{ passed: boolean; blocking: boolean }>) {
  return rules.some((rule) => rule.blocking && !rule.passed);
}
