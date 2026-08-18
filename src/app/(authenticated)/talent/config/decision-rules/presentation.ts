import type {
  TalentRestrictionRevisionStatus,
  TalentRestrictionRuleStatus,
  TalentRuleCategory,
  TalentRuleFieldSource,
  TalentRuleOutputType,
} from "@prisma/client";

export const categoryLabels: Record<TalentRuleCategory, string> = {
  WORK_INCIDENT: "工作事故",
  QUARTERLY_KPI: "季度KPI",
  BUSINESS_ASSESSMENT: "业务考核",
  TALENT_REVIEW: "人才盘点",
  EMPLOYEE_PROFILE: "员工档案",
};

export const sourceLabels: Record<TalentRuleFieldSource, string> = categoryLabels;

export const ruleStatusLabels: Record<TalentRestrictionRuleStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "已生效",
  DISABLED: "已停用",
};

export const revisionStatusLabels: Record<TalentRestrictionRevisionStatus, string> = {
  DRAFT: "草稿",
  SCHEDULED: "待生效",
  ACTIVE: "已生效",
  RETIRED: "历史版本",
  WITHDRAWN: "已撤回",
};

export const outputTypeLabels: Record<TalentRuleOutputType, string> = {
  KPI_PROCESSING: "KPI处理",
  REWARD_PROCESSING: "奖励限制",
  SALARY_RESTRICTION: "加薪限制",
  PROMOTION_RESTRICTION: "晋升限制",
  ANNUAL_BONUS_PROCESSING: "年终奖处理",
  TRAINING_OR_TRANSFER: "培训或调岗",
  SALARY_REDUCTION: "降薪处理",
  CONTRACT_PROCESSING: "合同处理",
};

const handlingLabels: Record<string, string> = {
  NO_DEDUCTION: "不扣分",
  DEDUCT_POINTS: "扣分",
  NONE: "无处理",
  RESTRICT: "限制",
  CANCEL: "取消",
  MANUAL_REVIEW: "人工复核",
  PROHIBIT: "禁止",
  TRAINING: "培训",
  TRANSFER: "调岗",
  TRAINING_OR_TRANSFER: "培训或调岗",
  SUGGEST_REDUCTION: "建议降薪",
  DO_NOT_RENEW: "不续签",
  SUGGEST_TERMINATION: "解除合同",
  IMMEDIATE_TERMINATION_RECOMMENDATION: "立即解除合同",
};

const durationUnitLabels: Record<string, string> = { DAY: "天", MONTH: "个月", QUARTER: "个季度", YEAR: "年" };
const effectPeriodLabels: Record<string, string> = { CURRENT_QUARTER: "当季度", CURRENT_YEAR: "当年度", UNTIL_MANUAL_RELEASE: "直至人工解除", IMMEDIATE: "立即" };

export function parseComparisonValue(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function comparisonValueLabel(enumValuesJson: string | null | undefined, comparisonValueJson: string | null | undefined) {
  const value = parseComparisonValue(comparisonValueJson);
  if (!value || !enumValuesJson) return "未配置";
  try {
    const options = JSON.parse(enumValuesJson) as Array<{ value?: string; label?: string }>;
    return options.find((option) => option.value === value)?.label || value;
  } catch {
    return value;
  }
}

export function conditionSummary(field: { displayName: string; enumValuesJson: string } | null, comparisonValueJson: string | null | undefined) {
  if (!field) return "触发条件未配置";
  return `${field.displayName} = ${comparisonValueLabel(field.enumValuesJson, comparisonValueJson)}`;
}

export function outputSummary(output: {
  outputType: TalentRuleOutputType;
  handlingCode: string;
  numericValue: number | null;
  durationValue: number | null;
  durationUnit: string | null;
  effectPeriodCode: string | null;
}) {
  const rewardHandlingLabels: Record<string, string> = {
    NONE: "不限制",
    PROHIBIT: "禁止奖励",
    RESTRICT: "禁止奖励",
    CANCEL: "禁止奖励",
    MANUAL_REVIEW: "人工复核",
  };
  const handlingLabel = output.outputType === "REWARD_PROCESSING"
    ? rewardHandlingLabels[output.handlingCode] ?? output.handlingCode
    : handlingLabels[output.handlingCode] ?? output.handlingCode;
  const parts = [outputTypeLabels[output.outputType], handlingLabel];
  if (output.numericValue != null) parts.push(`${output.numericValue}分`);
  if (output.durationValue != null && output.durationUnit) parts.push(`${output.durationValue}${durationUnitLabels[output.durationUnit] ?? output.durationUnit}`);
  if (output.effectPeriodCode) parts.push(effectPeriodLabels[output.effectPeriodCode] ?? output.effectPeriodCode);
  return parts.join(" · ");
}

export function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("zh-CN") : "长期有效";
}

export function formatDateTime(value: Date | null | undefined) {
  return value ? value.toLocaleString("zh-CN", { hour12: false }) : "—";
}
