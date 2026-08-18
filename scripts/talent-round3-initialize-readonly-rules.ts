import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, type TalentRuleCategory, type TalentRuleOutputType } from "@prisma/client";
import { validateRestrictionRuleRevision, type RuleFieldDefinitionInput, type RuleOutputInput } from "../src/server/talent/restriction-rule-domain";

function resolveDatabaseUrl() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "file:./dev.db") return `file:${path.resolve(process.cwd(), "db/dev.db")}`;
  if (!process.env.DATABASE_URL.startsWith("file:")) return process.env.DATABASE_URL;
  const rawPath = process.env.DATABASE_URL.slice("file:".length);
  return `file:${path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath)}`;
}

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl() }) });

type InitialRule = {
  code: string;
  name: string;
  category: TalentRuleCategory;
  fieldCode: string;
  comparisonValue: string;
  outputs: RuleOutputInput[];
};

const output = (outputType: TalentRuleOutputType, handlingCode: string, sortOrder: number, values: Partial<RuleOutputInput> = {}): RuleOutputInput => ({
  outputType,
  handlingCode,
  parametersJson: "{}",
  sortOrder,
  ...values,
});

const initialRules: InitialRule[] = [
  {
    code: "FORMAL_INCIDENT_A",
    name: "A级工作事故",
    category: "WORK_INCIDENT",
    fieldCode: "WORK_INCIDENT_LEVEL",
    comparisonValue: "A",
    outputs: [
      output("KPI_PROCESSING", "DEDUCT_POINTS", 10, { numericValue: 110, effectPeriodCode: "CURRENT_QUARTER" }),
      output("REWARD_PROCESSING", "PROHIBIT", 20, { durationValue: 1, durationUnit: "YEAR" }),
      output("SALARY_RESTRICTION", "PROHIBIT", 30, { durationValue: 1, durationUnit: "YEAR" }),
      output("PROMOTION_RESTRICTION", "PROHIBIT", 40, { durationValue: 1, durationUnit: "YEAR" }),
      output("ANNUAL_BONUS_PROCESSING", "CANCEL", 50, { effectPeriodCode: "CURRENT_YEAR" }),
    ],
  },
  {
    code: "FORMAL_KPI_C",
    name: "季度KPI为C级",
    category: "QUARTERLY_KPI",
    fieldCode: "QUARTERLY_KPI_RATING",
    comparisonValue: "C",
    outputs: [
      output("REWARD_PROCESSING", "PROHIBIT", 10, { effectPeriodCode: "CURRENT_QUARTER" }),
      output("SALARY_RESTRICTION", "PROHIBIT", 20, { durationValue: 6, durationUnit: "MONTH" }),
      output("TRAINING_OR_TRANSFER", "TRAINING", 30),
    ],
  },
  {
    code: "FORMAL_ASSESSMENT_FAILED",
    name: "业务考核不及格",
    category: "BUSINESS_ASSESSMENT",
    fieldCode: "BUSINESS_ASSESSMENT_RESULT",
    comparisonValue: "FAILED",
    outputs: [
      output("REWARD_PROCESSING", "PROHIBIT", 10, { effectPeriodCode: "CURRENT_QUARTER" }),
      output("SALARY_RESTRICTION", "PROHIBIT", 20, { durationValue: 6, durationUnit: "MONTH" }),
      output("PROMOTION_RESTRICTION", "PROHIBIT", 30, { durationValue: 6, durationUnit: "MONTH" }),
    ],
  },
  {
    code: "FORMAL_REVIEW_C",
    name: "人才盘点为C级",
    category: "TALENT_REVIEW",
    fieldCode: "TALENT_REVIEW_GRADE",
    comparisonValue: "C",
    outputs: [
      output("REWARD_PROCESSING", "PROHIBIT", 10, { effectPeriodCode: "CURRENT_QUARTER" }),
      output("SALARY_RESTRICTION", "PROHIBIT", 20, { durationValue: 6, durationUnit: "MONTH" }),
      output("PROMOTION_RESTRICTION", "PROHIBIT", 30, { durationValue: 1, durationUnit: "YEAR" }),
    ],
  },
  {
    code: "FORMAL_PROFILE_TWO_C_REVIEWS",
    name: "聘期内人才盘点2次C级",
    category: "EMPLOYEE_PROFILE",
    fieldCode: "PROFILE_TWO_C_REVIEWS_IN_CONTRACT",
    comparisonValue: "YES",
    outputs: [output("CONTRACT_PROCESSING", "DO_NOT_RENEW", 10)],
  },
];

async function main() {
  const [department, actor, fields] = await Promise.all([
    prisma.orgNode.findFirst({ where: { nodeType: "DEPARTMENT", name: "产品部" } }),
    prisma.user.findFirst({ where: { roleType: "ADMIN", deletedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.talentRuleFieldDefinition.findMany({ where: { isEnabled: true } }),
  ]);
  if (!department) throw new Error("未找到产品部，无法初始化只读验收规则");
  if (!actor) throw new Error("未找到系统管理员，无法记录规则创建人");
  const fieldByCode = new Map(fields.map((field) => [field.code, field]));
  let created = 0;
  for (const definition of initialRules) {
    if (await prisma.talentRestrictionRule.findUnique({ where: { code: definition.code } })) continue;
    const field = fieldByCode.get(definition.fieldCode);
    if (!field) throw new Error(`字段目录缺少：${definition.fieldCode}`);
    const fieldInput: RuleFieldDefinitionInput = {
      code: field.code,
      displayName: field.displayName,
      sourceFieldPath: field.sourceFieldPath,
      dataType: field.dataType,
      enumValuesJson: field.enumValuesJson,
      operatorsJson: field.operatorsJson,
      isEnabled: field.isEnabled,
    };
    validateRestrictionRuleRevision(
      { effectiveFrom: new Date("2026-01-01T00:00:00+08:00"), effectiveTo: null, priority: 100 },
      fieldInput,
      { operator: "EQUALS", comparisonValueJson: JSON.stringify(definition.comparisonValue) },
      definition.outputs,
    );
    await prisma.$transaction(async (tx) => {
      const ruleId = randomUUID();
      const revisionId = randomUUID();
      await tx.talentRestrictionRule.create({ data: { id: ruleId, code: definition.code, name: definition.name, category: definition.category, departmentOrgNodeId: department.id, status: "ACTIVE", createdById: actor.id } });
      await tx.talentRestrictionRuleRevision.create({ data: { id: revisionId, ruleId, revisionNo: 1, status: "ACTIVE", policyBasis: "部门绩效管理机制 V3.0", description: "用于第3轮规则列表和只读详情验收；不触发员工处理", effectiveFrom: new Date("2026-01-01T00:00:00+08:00"), priority: 100, revisionNote: "依据正式制度建立首版只读规则", createdById: actor.id, publishedById: actor.id, publishedAt: new Date() } });
      await tx.talentRestrictionRuleCondition.create({ data: { revisionId, fieldDefinitionId: field.id, operator: "EQUALS", comparisonValueJson: JSON.stringify(definition.comparisonValue) } });
      await tx.talentRestrictionRuleOutput.createMany({ data: definition.outputs.map((item) => ({ revisionId, outputType: item.outputType, handlingCode: item.handlingCode, numericValue: item.numericValue, durationValue: item.durationValue, durationUnit: item.durationUnit, effectPeriodCode: item.effectPeriodCode, parametersJson: item.parametersJson, sortOrder: item.sortOrder })) });
      await tx.talentRestrictionRule.update({ where: { id: ruleId }, data: { currentRevisionId: revisionId } });
    });
    created += 1;
  }
  console.log(`第3轮只读验收规则：新增${created}条，现有${await prisma.talentRestrictionRule.count({ where: { code: { in: initialRules.map((rule) => rule.code) } } })}条。`);
}

main().finally(() => prisma.$disconnect());
