export type RuleFieldDataType = "ENUM" | "TRISTATE_BOOLEAN";
export type RuleOperator = "EQUALS";
export type RuleOutputType =
  | "KPI_PROCESSING"
  | "REWARD_PROCESSING"
  | "SALARY_RESTRICTION"
  | "PROMOTION_RESTRICTION"
  | "ANNUAL_BONUS_PROCESSING"
  | "TRAINING_OR_TRANSFER"
  | "SALARY_REDUCTION"
  | "CONTRACT_PROCESSING";

type EnumOption = { value: string; label: string };

export type RuleFieldDefinitionInput = {
  code: string;
  displayName: string;
  sourceFieldPath: string;
  dataType: RuleFieldDataType;
  enumValuesJson: string;
  operatorsJson: string;
  isEnabled: boolean;
};

export type RuleConditionInput = {
  operator: RuleOperator;
  comparisonValueJson: string;
};

export type RuleOutputInput = {
  outputType: RuleOutputType;
  handlingCode: string;
  numericValue?: number | null;
  durationValue?: number | null;
  durationUnit?: "DAY" | "MONTH" | "QUARTER" | "YEAR" | null;
  effectPeriodCode?: string | null;
  parametersJson: string;
  description?: string | null;
  sortOrder: number;
};

export type RuleRevisionInput = {
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  priority: number;
};

const allowedHandlingCodes: Record<RuleOutputType, readonly string[]> = {
  KPI_PROCESSING: ["NO_DEDUCTION", "DEDUCT_POINTS"],
  REWARD_PROCESSING: ["NONE", "PROHIBIT", "MANUAL_REVIEW"],
  SALARY_RESTRICTION: ["NONE", "PROHIBIT", "MANUAL_REVIEW"],
  PROMOTION_RESTRICTION: ["NONE", "PROHIBIT", "MANUAL_REVIEW"],
  ANNUAL_BONUS_PROCESSING: ["NONE", "CANCEL", "MANUAL_REVIEW"],
  TRAINING_OR_TRANSFER: ["TRAINING", "TRANSFER", "TRAINING_OR_TRANSFER", "MANUAL_REVIEW"],
  SALARY_REDUCTION: ["SUGGEST_REDUCTION", "MANUAL_REVIEW"],
  CONTRACT_PROCESSING: ["DO_NOT_RENEW", "SUGGEST_TERMINATION", "IMMEDIATE_TERMINATION_RECOMMENDATION"],
};

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label}不是有效JSON`);
  }
}

function parseEnumOptions(value: string) {
  const parsed = parseJson(value, "字段枚举值");
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("字段必须至少配置一个可选值");
  const options = parsed as EnumOption[];
  if (options.some((option) => !option || typeof option.value !== "string" || !option.value.trim() || typeof option.label !== "string" || !option.label.trim())) {
    throw new Error("字段枚举值必须包含有效的value和label");
  }
  if (new Set(options.map((option) => option.value)).size !== options.length) throw new Error("字段枚举值不能重复");
  return options;
}

function parseOperators(value: string) {
  const parsed = parseJson(value, "可用运算符");
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((operator) => operator !== "EQUALS")) {
    throw new Error("当前阶段字段只允许等于运算符");
  }
  return parsed as RuleOperator[];
}

export function validateRuleFieldDefinition(field: RuleFieldDefinitionInput) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(field.code)) throw new Error("字段编码格式无效");
  if (!field.displayName.trim()) throw new Error("字段名称不能为空");
  if (!/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(field.sourceFieldPath)) {
    throw new Error("来源字段必须是直接字段路径，不能包含聚合、公式或脚本");
  }
  const options = parseEnumOptions(field.enumValuesJson);
  const operators = parseOperators(field.operatorsJson);
  if (field.dataType === "TRISTATE_BOOLEAN") {
    const values = options.map((option) => option.value);
    if (values.join(",") !== "PENDING,YES,NO") throw new Error("三态布尔值必须依次为待更新、是、否");
  }
  return { options, operators };
}

export function validateRuleCondition(field: RuleFieldDefinitionInput, condition: RuleConditionInput) {
  if (!field.isEnabled) throw new Error("触发字段已停用");
  const { options, operators } = validateRuleFieldDefinition(field);
  if (!operators.includes(condition.operator)) throw new Error("运算符不适用于当前字段");
  const comparisonValue = parseJson(condition.comparisonValueJson, "触发字段值");
  if (typeof comparisonValue !== "string" || !options.some((option) => option.value === comparisonValue)) {
    throw new Error("触发字段值不属于字段可选值");
  }
  return comparisonValue;
}

export function validateRuleOutputs(outputs: RuleOutputInput[]) {
  if (outputs.length === 0) throw new Error("规则至少需要一个输出");
  if (new Set(outputs.map((output) => output.sortOrder)).size !== outputs.length) throw new Error("规则输出顺序不能重复");
  if (new Set(outputs.map((output) => output.outputType)).size !== outputs.length) throw new Error("同一输出类型只能配置一次");
  for (const output of outputs) {
    if (!Number.isInteger(output.sortOrder) || output.sortOrder < 0) throw new Error("规则输出顺序必须是非负整数");
    if (!allowedHandlingCodes[output.outputType].includes(output.handlingCode)) throw new Error("输出处理方式与输出类型不匹配");
    const parameters = parseJson(output.parametersJson, "输出参数");
    if (!parameters || Array.isArray(parameters) || typeof parameters !== "object") throw new Error("输出参数必须是JSON对象");
    if (output.durationValue != null) {
      if (!Number.isInteger(output.durationValue) || output.durationValue <= 0 || !output.durationUnit) throw new Error("限制时长必须是带时间单位的正整数");
    } else if (output.durationUnit) {
      throw new Error("配置时间单位时必须填写限制时长");
    }
    if (output.outputType === "KPI_PROCESSING" && output.handlingCode === "DEDUCT_POINTS" && (!(output.numericValue != null) || output.numericValue <= 0)) {
      throw new Error("KPI扣分必须填写大于0的扣分值");
    }
    const needsEnd = output.handlingCode === "RESTRICT" || output.handlingCode === "PROHIBIT";
    if (needsEnd && output.durationValue == null && !output.effectPeriodCode?.trim()) throw new Error("限制输出必须配置期限或结束方式");
  }
  return outputs;
}

export function validateRestrictionRuleRevision(
  revision: RuleRevisionInput,
  field: RuleFieldDefinitionInput,
  condition: RuleConditionInput,
  outputs: RuleOutputInput[],
) {
  if (Number.isNaN(revision.effectiveFrom.getTime())) throw new Error("生效日期无效");
  if (revision.effectiveTo && revision.effectiveTo < revision.effectiveFrom) throw new Error("失效日期不能早于生效日期");
  if (!Number.isInteger(revision.priority) || revision.priority < 0) throw new Error("优先级必须是非负整数");
  validateRuleCondition(field, condition);
  validateRuleOutputs(outputs);
  return true;
}
