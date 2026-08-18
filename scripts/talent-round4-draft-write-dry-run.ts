import { randomUUID } from "node:crypto";
import { prisma } from "../src/server/db/prisma";
import { validateRestrictionRuleRevision, type RuleOutputInput } from "../src/server/talent/restriction-rule-domain";

const rollbackMarker = "ROUND4_DRY_RUN_ROLLBACK";
const outputs: RuleOutputInput[] = [
  { outputType: "KPI_PROCESSING", handlingCode: "NO_DEDUCTION", parametersJson: "{}", sortOrder: 10 },
  { outputType: "REWARD_PROCESSING", handlingCode: "NONE", parametersJson: "{}", sortOrder: 20 },
  { outputType: "SALARY_RESTRICTION", handlingCode: "NONE", parametersJson: "{}", sortOrder: 30 },
  { outputType: "PROMOTION_RESTRICTION", handlingCode: "NONE", parametersJson: "{}", sortOrder: 40 },
  { outputType: "ANNUAL_BONUS_PROCESSING", handlingCode: "NONE", parametersJson: "{}", sortOrder: 50 },
  { outputType: "TRAINING_OR_TRANSFER", handlingCode: "TRAINING", parametersJson: "{}", sortOrder: 60 },
  { outputType: "SALARY_REDUCTION", handlingCode: "SUGGEST_REDUCTION", parametersJson: "{}", sortOrder: 70 },
  { outputType: "CONTRACT_PROCESSING", handlingCode: "DO_NOT_RENEW", parametersJson: "{}", sortOrder: 80 },
];

async function main() {
const [department, user, field] = await Promise.all([
  prisma.orgNode.findFirst({ where: { nodeType: "DEPARTMENT" }, select: { id: true, name: true } }),
  prisma.user.findFirst({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } }),
  prisma.talentRuleFieldDefinition.findFirst({ where: { source: "WORK_INCIDENT", isEnabled: true } }),
]);
if (!department || !user || !field) throw new Error("缺少第4轮回滚验证所需的部门、用户或字段目录数据");
const options = JSON.parse(field.enumValuesJson) as Array<{ value: string }>;
const comparisonValue = options[0]?.value;
if (!comparisonValue) throw new Error("字段目录没有可用枚举值");
validateRestrictionRuleRevision(
  { effectiveFrom: new Date(), effectiveTo: null, priority: 100 },
  field,
  { operator: "EQUALS", comparisonValueJson: JSON.stringify(comparisonValue) },
  outputs,
);

const before = await prisma.talentRestrictionRule.count();
let inside: { rules: number; revisions: number; conditions: number; outputs: number; activePointerUnchanged: boolean } | null = null;
try {
  await prisma.$transaction(async (tx) => {
    const rule = await tx.talentRestrictionRule.create({ data: {
      code: `ROUND4_DRY_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      name: `第4轮回滚验证-${randomUUID().slice(0, 8)}`,
      category: "WORK_INCIDENT",
      departmentOrgNodeId: department.id,
      status: "ACTIVE",
      createdById: user.id,
    } });
    const activeRevision = await tx.talentRestrictionRuleRevision.create({ data: {
      ruleId: rule.id,
      revisionNo: 1,
      status: "ACTIVE",
      effectiveFrom: new Date(),
      priority: 100,
      createdById: user.id,
      publishedById: user.id,
      publishedAt: new Date(),
    } });
    await tx.talentRestrictionRule.update({ where: { id: rule.id }, data: { currentRevisionId: activeRevision.id } });
    const draftRevision = await tx.talentRestrictionRuleRevision.create({ data: {
      ruleId: rule.id,
      revisionNo: 2,
      status: "DRAFT",
      effectiveFrom: new Date(),
      priority: 100,
      createdById: user.id,
    } });
    await tx.talentRestrictionRuleCondition.create({ data: { revisionId: draftRevision.id, fieldDefinitionId: field.id, operator: "EQUALS", comparisonValueJson: JSON.stringify(comparisonValue) } });
    await tx.talentRestrictionRuleOutput.createMany({ data: outputs.map((output) => ({ ...output, revisionId: draftRevision.id })) });
    const afterDraft = await tx.talentRestrictionRule.findUniqueOrThrow({ where: { id: rule.id }, select: { currentRevisionId: true } });
    inside = {
      rules: await tx.talentRestrictionRule.count({ where: { id: rule.id } }),
      revisions: await tx.talentRestrictionRuleRevision.count({ where: { ruleId: rule.id } }),
      conditions: await tx.talentRestrictionRuleCondition.count({ where: { revisionId: draftRevision.id } }),
      outputs: await tx.talentRestrictionRuleOutput.count({ where: { revisionId: draftRevision.id } }),
      activePointerUnchanged: afterDraft.currentRevisionId === activeRevision.id,
    };
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
}
const after = await prisma.talentRestrictionRule.count();
console.log(JSON.stringify({ department: department.name, actor: user.name, inside, before, after, rolledBack: before === after }, null, 2));
await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
