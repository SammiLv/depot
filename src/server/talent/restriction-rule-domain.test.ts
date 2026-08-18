import assert from "node:assert/strict";
import test from "node:test";
import {
  validateRestrictionRuleRevision,
  validateRuleCondition,
  validateRuleFieldDefinition,
  validateRuleOutputs,
  type RuleFieldDefinitionInput,
  type RuleOutputInput,
} from "./restriction-rule-domain";

const incidentLevelField: RuleFieldDefinitionInput = {
  code: "WORK_INCIDENT_LEVEL",
  displayName: "事故等级",
  sourceFieldPath: "WorkIncident.level",
  dataType: "ENUM",
  enumValuesJson: JSON.stringify(["S", "A", "B", "C", "D"].map((value) => ({ value, label: value }))),
  operatorsJson: '["EQUALS"]',
  isEnabled: true,
};

const promotionRestriction: RuleOutputInput = {
  outputType: "PROMOTION_RESTRICTION",
  handlingCode: "PROHIBIT",
  durationValue: 1,
  durationUnit: "YEAR",
  effectPeriodCode: null,
  parametersJson: "{}",
  sortOrder: 10,
};

test("字段目录只接受直接字段路径，不接受聚合表达式", () => {
  assert.equal(validateRuleFieldDefinition(incidentLevelField).options.length, 5);
  assert.throws(() => validateRuleFieldDefinition({ ...incidentLevelField, sourceFieldPath: "count(TalentReviewResult.gradeCode)" }), /不能包含聚合/);
  assert.throws(() => validateRuleFieldDefinition({ ...incidentLevelField, operatorsJson: '["GREATER_THAN"]' }), /只允许等于/);
});

test("三态员工档案事实严格区分待更新、是和否", () => {
  const field: RuleFieldDefinitionInput = {
    ...incidentLevelField,
    code: "PROFILE_TWO_C_REVIEWS_IN_CONTRACT",
    displayName: "聘期内人才盘点2次C",
    sourceFieldPath: "EmployeeTalentProfile.hasTwoCReviewsInCurrentContract",
    dataType: "TRISTATE_BOOLEAN",
    enumValuesJson: JSON.stringify([
      { value: "PENDING", label: "待更新" },
      { value: "YES", label: "是" },
      { value: "NO", label: "否" },
    ]),
  };
  assert.equal(validateRuleCondition(field, { operator: "EQUALS", comparisonValueJson: '"YES"' }), "YES");
  assert.throws(() => validateRuleCondition(field, { operator: "EQUALS", comparisonValueJson: '"UNKNOWN"' }), /不属于字段可选值/);
});

test("一个简单字段条件可以配置多个结构化输出", () => {
  assert.equal(validateRestrictionRuleRevision(
    { effectiveFrom: new Date("2026-08-13"), effectiveTo: null, priority: 100 },
    incidentLevelField,
    { operator: "EQUALS", comparisonValueJson: '"A"' },
    [
      promotionRestriction,
      { ...promotionRestriction, outputType: "SALARY_RESTRICTION", sortOrder: 20 },
      { outputType: "ANNUAL_BONUS_PROCESSING", handlingCode: "CANCEL", parametersJson: "{}", sortOrder: 30 },
    ],
  ), true);
});

test("输出类型、处理方式、扣分值和限制期限必须匹配", () => {
  assert.throws(() => validateRuleOutputs([]), /至少需要一个输出/);
  assert.throws(() => validateRuleOutputs([promotionRestriction, { ...promotionRestriction, sortOrder: 20 }]), /同一输出类型只能配置一次/);
  assert.throws(() => validateRuleOutputs([{ ...promotionRestriction, handlingCode: "DEDUCT_POINTS" }]), /不匹配/);
  assert.throws(() => validateRuleOutputs([{ outputType: "KPI_PROCESSING", handlingCode: "DEDUCT_POINTS", numericValue: 0, parametersJson: "{}", sortOrder: 10 }]), /大于0/);
  assert.throws(() => validateRuleOutputs([{ ...promotionRestriction, durationValue: null, durationUnit: null }]), /期限或结束方式/);
});

test("奖励限制只允许不限制、禁止奖励和人工复核", () => {
  const rewardOutput = { outputType: "REWARD_PROCESSING" as const, handlingCode: "PROHIBIT", effectPeriodCode: "CURRENT_QUARTER", parametersJson: "{}", sortOrder: 10 };
  assert.equal(validateRuleOutputs([rewardOutput]).length, 1);
  assert.equal(validateRuleOutputs([{ ...rewardOutput, handlingCode: "NONE", effectPeriodCode: null }]).length, 1);
  assert.equal(validateRuleOutputs([{ ...rewardOutput, handlingCode: "MANUAL_REVIEW", effectPeriodCode: null }]).length, 1);
  assert.throws(() => validateRuleOutputs([{ ...rewardOutput, handlingCode: "RESTRICT" }]), /不匹配/);
  assert.throws(() => validateRuleOutputs([{ ...rewardOutput, handlingCode: "CANCEL" }]), /不匹配/);
});

test("规则修订校验生效期和优先级", () => {
  assert.throws(() => validateRestrictionRuleRevision(
    { effectiveFrom: new Date("2026-09-01"), effectiveTo: new Date("2026-08-31"), priority: 100 },
    incidentLevelField,
    { operator: "EQUALS", comparisonValueJson: '"A"' },
    [promotionRestriction],
  ), /失效日期/);
  assert.throws(() => validateRestrictionRuleRevision(
    { effectiveFrom: new Date("2026-08-13"), priority: -1 },
    incidentLevelField,
    { operator: "EQUALS", comparisonValueJson: '"A"' },
    [promotionRestriction],
  ), /优先级/);
});
