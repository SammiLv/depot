"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { validateKpiRatingBands } from "./decision-rule-config";

export type TalentRuleActionState = { status: "idle" | "success" | "error"; message: string; id?: string };

const incidentLevelDefinitions = [
  { level: "S", name: "S级事故" },
  { level: "A", name: "A级事故" },
  { level: "B", name: "B级事故" },
  { level: "C", name: "C级事故" },
  { level: "D", name: "D级事故" },
] as const;

function normalizeIncidentLevelDefinitions(value: string) {
  const rows = JSON.parse(value) as Array<{ level?: unknown; name?: unknown }>;
  if (!Array.isArray(rows)) throw new Error("事故等级定义无法读取");
  return incidentLevelDefinitions.map(({ level, name }) => {
    const source = rows.find((row) => row.level === level);
    return { level, name: typeof source?.name === "string" && source.name.trim() ? source.name.trim() : name };
  });
}

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} 不能为空`);
  return value;
}
async function manager() {
  const user = await requireCurrentUser();
  const permission = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageConfig);
  if (!permission.hasPermission) throw new Error("没有人才规则配置权限");
  return user;
}
async function assertDepartment(user: Awaited<ReturnType<typeof requireCurrentUser>>, departmentOrgNodeId: string) {
  const ids = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageConfig);
  if (ids !== null && !ids.includes(departmentOrgNodeId)) throw new Error("不能配置该部门的人才规则");
}
function refresh() { revalidatePath("/talent"); }
async function audit(targetType: string, targetId: string, action: string, actorId: string, after: unknown) {
  await prisma.talentActionLog.create({ data: { targetType, targetId, action, actorId, afterJson: JSON.stringify(after) } });
}

const defaultKpiBands = [
  { name: "S", minScore: 110, maxScore: null, isUnbounded: true, description: "绩效优秀", sortOrder: 10 },
  { name: "A", minScore: 100, maxScore: 109, isUnbounded: false, description: "绩效良好", sortOrder: 20 },
  { name: "B", minScore: 90, maxScore: 99, isUnbounded: false, description: "基本满意", sortOrder: 30 },
  { name: "C", minScore: 70, maxScore: 89, isUnbounded: false, description: "尚需改进", sortOrder: 40 },
  { name: "D", minScore: 0, maxScore: 69, isUnbounded: false, description: "不达预期", sortOrder: 50 },
] as const;

export async function createDefaultKpiRatingRule(_state: TalentRuleActionState, formData: FormData): Promise<TalentRuleActionState> {
  try {
    const user = await manager();
    const departmentOrgNodeId = required(formData, "departmentOrgNodeId");
    await assertDepartment(user, departmentOrgNodeId);
    validateKpiRatingBands(defaultKpiBands.map((row) => ({ ...row })));
    const name = required(formData, "name");
    const quarterlyKpiTotalScoreRaw = Number(formData.get("quarterlyKpiTotalScore") ?? "");
    if (!Number.isFinite(quarterlyKpiTotalScoreRaw) || quarterlyKpiTotalScoreRaw <= 0) throw new Error("季度KPI总分必须为正数");
    const quarterlyKpiTotalScore = quarterlyKpiTotalScoreRaw;
    const latest = await prisma.kpiRatingRuleVersion.aggregate({ where: { departmentOrgNodeId, name, deletedAt: null }, _max: { version: true } });
    const row = await prisma.$transaction(async (tx) => {
      const version = await tx.kpiRatingRuleVersion.create({ data: { departmentOrgNodeId, name, version: (latest._max.version ?? 0) + 1, quarterlyKpiTotalScore, createdById: user.id } });
      await tx.kpiRatingBand.createMany({ data: defaultKpiBands.map((band) => ({ ...band, ruleVersionId: version.id })) });
      return version;
    });
    await audit("KpiRatingRuleVersion", row.id, "CREATE_DEFAULT", user.id, row); refresh();
    return { status: "success", message: `已创建“${name}”V${row.version} 草稿`, id: row.id };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "绩效管理规则创建失败" }; }
}

export async function publishKpiRatingRule(_state: TalentRuleActionState, formData: FormData): Promise<TalentRuleActionState> {
  try {
    const user = await manager(); const id = required(formData, "id");
    const rule = await prisma.kpiRatingRuleVersion.findFirst({ where: { id, status: "DRAFT", deletedAt: null } });
    if (!rule) throw new Error("只能发布草稿绩效管理规则"); await assertDepartment(user, rule.departmentOrgNodeId);
    const bands = await prisma.kpiRatingBand.findMany({ where: { ruleVersionId: id } });
    validateKpiRatingBands(bands);
    const row = await prisma.$transaction(async (tx) => {
      await tx.kpiRatingRuleVersion.updateMany({ where: { departmentOrgNodeId: rule.departmentOrgNodeId, name: rule.name, status: "ACTIVE", id: { not: id }, deletedAt: null }, data: { status: "RETIRED" } });
      return tx.kpiRatingRuleVersion.update({ where: { id }, data: { status: "ACTIVE", publishedById: user.id, publishedAt: new Date() } });
    });
    await audit("KpiRatingRuleVersion", id, "PUBLISH", user.id, row); refresh();
    return { status: "success", message: `“${rule.name}”V${rule.version} 已发布` };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "绩效管理规则发布失败" }; }
}

export async function saveKpiRatingDraft(_state: TalentRuleActionState, formData: FormData): Promise<TalentRuleActionState> {
  try {
    const user = await manager();
    const id = required(formData, "id");
    const rule = await prisma.kpiRatingRuleVersion.findFirst({ where: { id, status: "DRAFT", deletedAt: null } });
    if (!rule) throw new Error("只能修改草稿版本");
    await assertDepartment(user, rule.departmentOrgNodeId);
    const bands = await prisma.kpiRatingBand.findMany({ where: { ruleVersionId: id } });
    if (!bands.length) throw new Error("绩效等级不存在");
    // 草稿整页保存只做轻量校验（名称、整数边界、最低分≤最高分）；区间连续性在发布时由 validateKpiRatingBands 校验。
    const nextBands = bands.map((band) => {
      const name = required(formData, `band.${band.id}.name`);
      const minScore = Number(required(formData, `band.${band.id}.minScore`));
      const isUnbounded = formData.get(`band.${band.id}.isUnbounded`) === "on";
      const maxValue = String(formData.get(`band.${band.id}.maxScore`) ?? "").trim();
      const maxScore = isUnbounded ? null : Number(maxValue);
      if (!Number.isInteger(minScore) || (!isUnbounded && (!maxValue || !Number.isInteger(maxScore)))) throw new Error(`等级「${name}」的分数边界必须是整数`);
      if (maxScore !== null && minScore > maxScore) throw new Error(`等级「${name}」的最低分不能高于最高分`);
      return { id: band.id, name, minScore, maxScore, isUnbounded, description: String(formData.get(`band.${band.id}.description`) ?? "").trim() || null };
    });
    if (new Set(nextBands.map((band) => band.name)).size !== nextBands.length) throw new Error("同一版本中的绩效等级名称不能重复");
    const businessAssessmentTotalScore = Number(required(formData, "businessAssessmentTotalScore"));
    if (!Number.isFinite(businessAssessmentTotalScore) || businessAssessmentTotalScore <= 0) throw new Error("业务考核总分必须大于 0");
    const [baInitialPassPercent, baRetestPassPercent, baFinalFailPercent] = ["baInitialPassPercent", "baRetestPassPercent", "baFinalFailPercent"].map((key) => {
      const value = Number(required(formData, key));
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("摊分比例必须在 0 至 100 之间");
      return value;
    });
    // 计分规则随绩效管理规则版本冻结：草稿可编辑、发布只读；新建业务考核时按部门已发布版本冻结快照。
    const row = await prisma.$transaction(async (tx) => {
      for (const band of nextBands) {
        await tx.kpiRatingBand.update({ where: { id: band.id }, data: { name: band.name, minScore: band.minScore, maxScore: band.maxScore, isUnbounded: band.isUnbounded, description: band.description } });
      }
      return tx.kpiRatingRuleVersion.update({ where: { id }, data: { businessAssessmentTotalScore, baInitialPassPercent, baRetestPassPercent, baFinalFailPercent } });
    });
    await audit("KpiRatingRuleVersion", id, "SAVE_DRAFT", user.id, { version: row, bands: nextBands }); refresh();
    return { status: "success", message: `“${rule.name}”V${rule.version} 草稿已保存`, id };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "草稿保存失败" }; }
}

export async function deleteKpiRatingRuleDraft(_state: TalentRuleActionState, formData: FormData): Promise<TalentRuleActionState> {
  try {
    const user = await manager();
    const id = required(formData, "id");
    const rule = await prisma.kpiRatingRuleVersion.findFirst({ where: { id, status: "DRAFT", deletedAt: null } });
    if (!rule) throw new Error("只能删除草稿版本");
    await assertDepartment(user, rule.departmentOrgNodeId);
    await prisma.kpiRatingRuleVersion.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit("KpiRatingRuleVersion", id, "DELETE_DRAFT", user.id, { name: rule.name, version: rule.version }); refresh();
    return { status: "success", message: `“${rule.name}”V${rule.version} 草稿已删除` };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "草稿删除失败" }; }
}

export async function createWorkIncidentRuleVersion(_state: TalentRuleActionState, formData: FormData): Promise<TalentRuleActionState> {
  try {
    const user = await manager(); const departmentOrgNodeId = required(formData, "departmentOrgNodeId"); await assertDepartment(user, departmentOrgNodeId);
    const name = required(formData, "name");
    const latest = await prisma.workIncidentRuleVersion.aggregate({ where: { departmentOrgNodeId, name, deletedAt: null }, _max: { version: true } });
    const row = await prisma.workIncidentRuleVersion.create({ data: { departmentOrgNodeId, name, version: (latest._max.version ?? 0) + 1, matrixJson: JSON.stringify(incidentLevelDefinitions), description: "定义工作事故等级，处罚规则在人才决策规则配置中独立维护", createdById: user.id } });
    await audit("WorkIncidentRuleVersion", row.id, "CREATE", user.id, row); refresh();
    return { status: "success", message: `已创建“${name}”V${row.version}草稿` };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "工作事故等级配置创建失败" }; }
}

export async function cloneWorkIncidentRuleVersion(_state: TalentRuleActionState, formData: FormData): Promise<TalentRuleActionState> {
  try {
    const user = await manager(); const sourceId = required(formData, "sourceId");
    const source = await prisma.workIncidentRuleVersion.findFirst({ where: { id: sourceId, deletedAt: null } });
    if (!source) throw new Error("工作事故等级配置版本不存在"); await assertDepartment(user, source.departmentOrgNodeId);
    const latest = await prisma.workIncidentRuleVersion.aggregate({ where: { departmentOrgNodeId: source.departmentOrgNodeId, name: source.name, deletedAt: null }, _max: { version: true } });
    const levelDefinitions = normalizeIncidentLevelDefinitions(source.matrixJson);
    const row = await prisma.workIncidentRuleVersion.create({ data: { departmentOrgNodeId: source.departmentOrgNodeId, name: source.name, version: (latest._max.version ?? 0) + 1, policyVersion: source.policyVersion, matrixJson: JSON.stringify(levelDefinitions), description: `复制自V${source.version}，仅保留事故等级定义`, createdById: user.id } });
    await audit("WorkIncidentRuleVersion", row.id, "CLONE", user.id, row); refresh();
    return { status: "success", message: `已复制为V${row.version}草稿` };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "工作事故等级配置复制失败" }; }
}

export async function publishWorkIncidentRuleVersion(_state: TalentRuleActionState, formData: FormData): Promise<TalentRuleActionState> {
  try {
    const user = await manager(); const id = required(formData, "id");
    const rule = await prisma.workIncidentRuleVersion.findFirst({ where: { id, status: "DRAFT", deletedAt: null } });
    if (!rule) throw new Error("只能发布草稿版本"); await assertDepartment(user, rule.departmentOrgNodeId);
    const levelDefinitions = normalizeIncidentLevelDefinitions(rule.matrixJson);
    if (["S","A","B","C","D"].some((level) => !levelDefinitions.some((row) => row.level === level))) throw new Error("事故等级定义不完整");
    const row = await prisma.$transaction(async (tx) => { await tx.workIncidentRuleVersion.updateMany({ where: { departmentOrgNodeId: rule.departmentOrgNodeId, id: { not: id }, status: "ACTIVE", deletedAt: null }, data: { status: "RETIRED" } }); return tx.workIncidentRuleVersion.update({ where: { id }, data: { status: "ACTIVE", matrixJson: JSON.stringify(levelDefinitions), publishedById: user.id, publishedAt: new Date() } }); });
    await audit("WorkIncidentRuleVersion", id, "PUBLISH", user.id, row); refresh();
    return { status: "success", message: `“${row.name}”V${row.version}已发布` };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "工作事故等级配置发布失败" }; }
}
