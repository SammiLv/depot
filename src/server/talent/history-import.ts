import type { EmploymentContractOutcome, TalentDecisionType } from "@prisma/client";

const decisionTypeAliases: Record<string, TalentDecisionType> = {
  PROMOTION: "PROMOTION",
  "晋升": "PROMOTION",
  CONTRACT_RENEWAL: "CONTRACT_RENEWAL",
  "续签": "CONTRACT_RENEWAL",
  "聘期": "CONTRACT_RENEWAL",
  SALARY_ADJUSTMENT: "SALARY_ADJUSTMENT",
  "加薪": "SALARY_ADJUSTMENT",
  "调薪": "SALARY_ADJUSTMENT",
  REWARD: "REWARD",
  "奖励": "REWARD",
  QUARTERLY_REWARD: "QUARTERLY_REWARD",
  "季度奖励": "QUARTERLY_REWARD",
  ANNUAL_REWARD: "ANNUAL_REWARD",
  "年终奖励": "ANNUAL_REWARD",
};

const contractOutcomeAliases: Record<string, EmploymentContractOutcome> = {
  RENEWED: "RENEWED",
  "已续签": "RENEWED",
  "续签": "RENEWED",
  NOT_RENEWED: "NOT_RENEWED",
  "不续签": "NOT_RENEWED",
  EXTENDED: "EXTENDED",
  "延期": "EXTENDED",
  TERMINATED: "TERMINATED",
  "终止": "TERMINATED",
};

export function normalizeHistoryDecisionType(value: unknown) {
  return decisionTypeAliases[String(value ?? "").trim().toUpperCase()] ?? null;
}

export function normalizeContractOutcome(value: unknown) {
  return contractOutcomeAliases[String(value ?? "").trim().toUpperCase()] ?? null;
}

export function parseHistoryDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text.replaceAll("/", "-"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseOptionalHistoryInteger(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

export function historyImportRecordKey(input: {
  decisionType: TalentDecisionType;
  recordNo: string;
  userId: string;
  startDate?: Date | null;
  renewalSequence?: number | null;
}) {
  if (input.decisionType === "CONTRACT_RENEWAL") {
    return `${input.decisionType}:${input.userId}:${input.startDate?.toISOString() ?? ""}:${input.renewalSequence ?? ""}`;
  }
  if (["REWARD", "QUARTERLY_REWARD", "ANNUAL_REWARD"].includes(input.decisionType)) return `REWARD:${input.recordNo}`;
  return `${input.decisionType}:${input.recordNo}`;
}
