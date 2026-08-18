"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { TalentRuleCategory, TalentRuleDurationUnit, TalentRuleOutputType } from "@prisma/client";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { validateRestrictionRuleRevision, type RuleOutputInput } from "./restriction-rule-domain";
import { kpiRatingBandOptions, talentGradeThresholdOptions } from "./configured-level-options";
import { parseIncidentLevelOptions } from "./incident-level-config";

export type RestrictionRuleDraftActionState = {
  status: "idle" | "success" | "error";
  message: string;
  ruleId?: string;
};

const ruleCategories = ["WORK_INCIDENT", "QUARTERLY_KPI", "BUSINESS_ASSESSMENT", "TALENT_REVIEW", "EMPLOYEE_PROFILE"] as const;
const outputTypes = ["KPI_PROCESSING", "REWARD_PROCESSING", "SALARY_RESTRICTION", "PROMOTION_RESTRICTION", "ANNUAL_BONUS_PROCESSING", "TRAINING_OR_TRANSFER", "SALARY_REDUCTION", "CONTRACT_PROCESSING"] as const;
const durationUnits = ["DAY", "MONTH", "QUARTER", "YEAR"] as const;

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key}不能为空`);
  return value;
}

function optionalDate(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`${key}无效`);
  return date;
}

function includesValue<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value as T[number]);
}

function parseOutputs(formData: FormData): RuleOutputInput[] {
  let parsed: unknown;
  try { parsed = JSON.parse(String(formData.get("outputsJson") ?? "[]")) as unknown; } catch { throw new Error("规则输出格式无效"); }
  if (!Array.isArray(parsed)) throw new Error("规则输出格式无效");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第${index + 1}项规则输出无效`);
    const row = item as Record<string, unknown>;
    const outputType = String(row.outputType ?? "");
    if (!includesValue(outputTypes, outputType)) throw new Error(`第${index + 1}项输出类型无效`);
    const durationUnitValue = String(row.durationUnit ?? "");
    const durationUnit: TalentRuleDurationUnit | null = durationUnitValue && includesValue(durationUnits, durationUnitValue) ? durationUnitValue : null;
    const numericValue = row.numericValue === null || row.numericValue === "" || row.numericValue === undefined ? null : Number(row.numericValue);
    const durationValue = row.durationValue === null || row.durationValue === "" || row.durationValue === undefined ? null : Number(row.durationValue);
    if (numericValue != null && !Number.isFinite(numericValue)) throw new Error(`第${index + 1}项数值无效`);
    if (durationValue != null && !Number.isInteger(durationValue)) throw new Error(`第${index + 1}项限制时长无效`);
    return {
      outputType: outputType as TalentRuleOutputType,
      handlingCode: String(row.handlingCode ?? "").trim(),
      numericValue,
      durationValue,
      durationUnit,
      effectPeriodCode: String(row.effectPeriodCode ?? "").trim() || null,
      parametersJson: "{}",
      description: String(row.description ?? "").trim() || null,
      sortOrder: (index + 1) * 10,
    };
  });
}

async function configurationManager() {
  const user = await requireCurrentUser();
  const permission = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageConfig);
  if (!permission.hasPermission) throw new Error("没有人才规则配置权限");
  return user;
}

async function assertDepartment(user: Awaited<ReturnType<typeof requireCurrentUser>>, departmentOrgNodeId: string) {
  const authorizedIds = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageConfig);
  if (authorizedIds !== null && !authorizedIds.includes(departmentOrgNodeId)) throw new Error("不能配置该部门的人才规则");
}

async function fieldWithDepartmentOptions<T extends { source: TalentRuleCategory; enumValuesJson: string }>(field: T, departmentOrgNodeId: string) {
  let options: Array<{ value: string; label: string }>;
  let configurationName: string;
  if (field.source === "WORK_INCIDENT") {
    const activeVersion = await prisma.workIncidentRuleVersion.findFirst({
      where: { departmentOrgNodeId, status: "ACTIVE", deletedAt: null },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    });
    if (!activeVersion) throw new Error("当前部门尚未发布工作事故等级配置");
    options = parseIncidentLevelOptions(activeVersion.matrixJson);
    configurationName = "工作事故等级配置";
  } else if (field.source === "QUARTERLY_KPI") {
    const activeVersion = await prisma.kpiRatingRuleVersion.findFirst({
      where: { departmentOrgNodeId, status: "ACTIVE", deletedAt: null },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    });
    if (!activeVersion) throw new Error("当前部门尚未发布绩效等级规则");
    const bands = await prisma.kpiRatingBand.findMany({ where: { ruleVersionId: activeVersion.id }, orderBy: { sortOrder: "asc" } });
    options = kpiRatingBandOptions(bands);
    configurationName = "绩效等级规则";
  } else if (field.source === "TALENT_REVIEW") {
    const activeTemplate = await prisma.talentReviewTemplateVersion.findFirst({
      where: { departmentOrgNodeId, status: "ACTIVE", deletedAt: null },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    });
    if (!activeTemplate) throw new Error("当前部门尚未发布人才盘点模型");
    const thresholds = await prisma.talentGradeThreshold.findMany({ where: { templateVersionId: activeTemplate.id }, orderBy: { sortOrder: "asc" } });
    options = talentGradeThresholdOptions(thresholds);
    configurationName = "人才盘点模型等级区间";
  } else {
    return field;
  }
  if (!options.length) throw new Error(`当前部门已发布的${configurationName}没有可用等级`);
  return { ...field, enumValuesJson: JSON.stringify(options) };
}

function refreshTalentWorkspace() { revalidatePath("/talent"); }

export async function saveTalentRestrictionRuleDraft(
  _previousState: RestrictionRuleDraftActionState,
  formData: FormData,
): Promise<RestrictionRuleDraftActionState> {
  try {
    const user = await configurationManager();
    const ruleId = String(formData.get("ruleId") ?? "").trim();
    const name = required(formData, "规则名称");
    const departmentOrgNodeId = required(formData, "适用部门");
    await assertDepartment(user, departmentOrgNodeId);
    const categoryValue = required(formData, "规则类别");
    if (!includesValue(ruleCategories, categoryValue)) throw new Error("规则类别无效");
    const category = categoryValue as TalentRuleCategory;
    const fieldDefinitionId = required(formData, "触发字段");
    const comparisonValue = required(formData, "触发字段值");
    const storedField = await prisma.talentRuleFieldDefinition.findFirst({ where: { id: fieldDefinitionId, isEnabled: true } });
    if (!storedField) throw new Error("触发字段不存在或已停用");
    if (storedField.source !== category) throw new Error("规则类别与触发字段来源不一致");
    const field = await fieldWithDepartmentOptions(storedField, departmentOrgNodeId);
    const effectiveFrom = optionalDate(formData, "生效日期");
    if (!effectiveFrom) throw new Error("生效日期不能为空");
    const effectiveTo = optionalDate(formData, "失效日期");
    const priority = Number(required(formData, "优先级"));
    const outputs = parseOutputs(formData);
    validateRestrictionRuleRevision(
      { effectiveFrom, effectiveTo, priority },
      field,
      { operator: "EQUALS", comparisonValueJson: JSON.stringify(comparisonValue) },
      outputs,
    );
    const duplicate = await prisma.talentRestrictionRule.findFirst({
      where: { departmentOrgNodeId, name, deletedAt: null, ...(ruleId ? { id: { not: ruleId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new Error("同一部门的规则名称不能重复");

    const existing = ruleId ? await prisma.talentRestrictionRule.findFirst({ where: { id: ruleId, status: { in: ["DRAFT", "ACTIVE"] }, deletedAt: null } }) : null;
    if (ruleId && !existing) throw new Error("规则不存在、已停用或不可编辑");
    if (existing) await assertDepartment(user, existing.departmentOrgNodeId);
    if (existing?.status === "ACTIVE" && (name !== existing.name || category !== existing.category || departmentOrgNodeId !== existing.departmentOrgNodeId)) {
      throw new Error("已生效规则的名称、类别和适用部门不可在修订中变更");
    }

    const result = await prisma.$transaction(async (tx) => {
      const rule = existing
        ? existing.status === "DRAFT"
          ? await tx.talentRestrictionRule.update({ where: { id: existing.id }, data: { name, category, departmentOrgNodeId } })
          : existing
        : await tx.talentRestrictionRule.create({ data: {
            code: `TRR_${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
            name,
            category,
            departmentOrgNodeId,
            status: "DRAFT",
            createdById: user.id,
          } });
      let revision = await tx.talentRestrictionRuleRevision.findFirst({ where: { ruleId: rule.id, status: "DRAFT" }, orderBy: { revisionNo: "desc" } });
      const createdRevision = !revision;
      if (!revision) {
        const latest = await tx.talentRestrictionRuleRevision.aggregate({ where: { ruleId: rule.id }, _max: { revisionNo: true } });
        revision = await tx.talentRestrictionRuleRevision.create({ data: {
          ruleId: rule.id,
          revisionNo: (latest._max.revisionNo ?? 0) + 1,
          status: "DRAFT",
          policyBasis: String(formData.get("制度依据") ?? "").trim() || null,
          description: String(formData.get("规则说明") ?? "").trim() || null,
          effectiveFrom,
          effectiveTo,
          priority,
          revisionNote: String(formData.get("修订说明") ?? "").trim() || null,
          createdById: user.id,
        } });
      } else {
        revision = await tx.talentRestrictionRuleRevision.update({ where: { id: revision.id }, data: {
          policyBasis: String(formData.get("制度依据") ?? "").trim() || null,
          description: String(formData.get("规则说明") ?? "").trim() || null,
          revisionNote: String(formData.get("修订说明") ?? "").trim() || null,
          effectiveFrom,
          effectiveTo,
          priority,
        } });
      }
      if (rule.status === "DRAFT" && (!existing?.currentRevisionId || existing.currentRevisionId !== revision.id)) {
        await tx.talentRestrictionRule.update({ where: { id: rule.id }, data: { currentRevisionId: revision.id } });
      }
      await tx.talentRestrictionRuleCondition.deleteMany({ where: { revisionId: revision.id } });
      await tx.talentRestrictionRuleOutput.deleteMany({ where: { revisionId: revision.id } });
      await tx.talentRestrictionRuleCondition.create({ data: {
        revisionId: revision.id,
        fieldDefinitionId: field.id,
        operator: "EQUALS",
        comparisonValueJson: JSON.stringify(comparisonValue),
      } });
      await tx.talentRestrictionRuleOutput.createMany({ data: outputs.map((output) => ({ ...output, revisionId: revision.id })) });
      if (rule.status === "ACTIVE") await tx.talentRestrictionRule.update({ where: { id: rule.id }, data: { updatedAt: new Date() } });
      return { rule, revision, outputCount: outputs.length, createdRevision };
    });
    await prisma.talentActionLog.create({ data: {
      targetType: "TalentRestrictionRule",
      targetId: result.rule.id,
      action: !existing ? "CREATE_DRAFT" : result.createdRevision ? "CREATE_REVISION_DRAFT" : "UPDATE_DRAFT",
      actorId: user.id,
      afterJson: JSON.stringify({ ...result, fieldDefinitionId: field.id, comparisonValue }),
    } });
    refreshTalentWorkspace();
    return { status: "success", message: `${result.revision.revisionNo === 1 ? "规则" : `R${result.revision.revisionNo}修订`}草稿已保存`, ruleId: result.rule.id };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "规则草稿保存失败" };
  }
}

export async function publishTalentRestrictionRuleDraft(
  _previousState: RestrictionRuleDraftActionState,
  formData: FormData,
): Promise<RestrictionRuleDraftActionState> {
  try {
    const user = await configurationManager();
    const ruleId = required(formData, "ruleId");
    const rule = await prisma.talentRestrictionRule.findFirst({
      where: { id: ruleId, status: { in: ["DRAFT", "ACTIVE"] }, deletedAt: null },
    });
    if (!rule) throw new Error("规则不存在、已停用或不可发布");
    await assertDepartment(user, rule.departmentOrgNodeId);
    const revision = await prisma.talentRestrictionRuleRevision.findFirst({
      where: { ruleId, status: "DRAFT" },
      orderBy: { revisionNo: "desc" },
    });
    if (!revision) throw new Error("该规则没有待发布的草稿");
    const [condition, outputs] = await Promise.all([
      prisma.talentRestrictionRuleCondition.findUnique({ where: { revisionId: revision.id } }),
      prisma.talentRestrictionRuleOutput.findMany({ where: { revisionId: revision.id }, orderBy: { sortOrder: "asc" } }),
    ]);
    if (!condition) throw new Error("发布前必须配置触发条件");
    const storedField = await prisma.talentRuleFieldDefinition.findFirst({ where: { id: condition.fieldDefinitionId, isEnabled: true } });
    if (!storedField) throw new Error("触发字段不存在或已停用");
    if (storedField.source !== rule.category) throw new Error("规则类别与触发字段来源不一致");
    const field = await fieldWithDepartmentOptions(storedField, rule.departmentOrgNodeId);
    validateRestrictionRuleRevision(
      { effectiveFrom: revision.effectiveFrom, effectiveTo: revision.effectiveTo, priority: revision.priority },
      field,
      { operator: "EQUALS", comparisonValueJson: condition.comparisonValueJson },
      outputs.map((output) => ({
        outputType: output.outputType,
        handlingCode: output.handlingCode,
        numericValue: output.numericValue,
        durationValue: output.durationValue,
        durationUnit: output.durationUnit,
        effectPeriodCode: output.effectPeriodCode,
        parametersJson: output.parametersJson,
        description: output.description,
        sortOrder: output.sortOrder,
      })),
    );
    const publishedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.talentRestrictionRuleRevision.updateMany({
        where: { ruleId, id: { not: revision.id }, status: { in: ["ACTIVE", "SCHEDULED"] } },
        data: { status: "RETIRED" },
      });
      await tx.talentRestrictionRuleRevision.update({
        where: { id: revision.id },
        data: { status: "ACTIVE", publishedById: user.id, publishedAt },
      });
      await tx.talentRestrictionRule.update({
        where: { id: ruleId },
        data: { status: "ACTIVE", currentRevisionId: revision.id },
      });
    });
    await prisma.talentActionLog.create({ data: {
      targetType: "TalentRestrictionRuleRevision",
      targetId: revision.id,
      action: "PUBLISH",
      actorId: user.id,
      afterJson: JSON.stringify({ ruleId, revisionNo: revision.revisionNo, publishedAt, outputCount: outputs.length }),
    } });
    refreshTalentWorkspace();
    return { status: "success", message: `R${revision.revisionNo}已发布并成为当前生效版本`, ruleId };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "规则发布失败" };
  }
}

export async function disableTalentRestrictionRule(
  _previousState: RestrictionRuleDraftActionState,
  formData: FormData,
): Promise<RestrictionRuleDraftActionState> {
  try {
    const user = await configurationManager();
    const ruleId = required(formData, "ruleId");
    const rule = await prisma.talentRestrictionRule.findFirst({ where: { id: ruleId, status: "ACTIVE", deletedAt: null } });
    if (!rule) throw new Error("规则不存在或当前不是生效状态");
    await assertDepartment(user, rule.departmentOrgNodeId);
    const disabledAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.talentRestrictionRuleRevision.updateMany({
        where: { ruleId, status: { in: ["ACTIVE", "SCHEDULED"] } },
        data: { status: "RETIRED" },
      });
      await tx.talentRestrictionRuleRevision.updateMany({
        where: { ruleId, status: "DRAFT" },
        data: { status: "WITHDRAWN" },
      });
      await tx.talentRestrictionRule.update({ where: { id: ruleId }, data: { status: "DISABLED" } });
    });
    await prisma.talentActionLog.create({ data: {
      targetType: "TalentRestrictionRule",
      targetId: ruleId,
      action: "DISABLE",
      actorId: user.id,
      afterJson: JSON.stringify({ name: rule.name, disabledAt }),
    } });
    refreshTalentWorkspace();
    return { status: "success", message: `规则“${rule.name}”已禁用`, ruleId };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "规则禁用失败" };
  }
}

export async function deleteTalentRestrictionRule(
  _previousState: RestrictionRuleDraftActionState,
  formData: FormData,
): Promise<RestrictionRuleDraftActionState> {
  try {
    const user = await configurationManager();
    const ruleId = required(formData, "ruleId");
    const rule = await prisma.talentRestrictionRule.findFirst({
      where: { id: ruleId, status: { in: ["DRAFT", "DISABLED"] }, deletedAt: null },
    });
    if (!rule) throw new Error("只有草稿或已禁用规则可以删除");
    await assertDepartment(user, rule.departmentOrgNodeId);
    const revisions = await prisma.talentRestrictionRuleRevision.findMany({ where: { ruleId }, select: { id: true, revisionNo: true, status: true } });
    const revisionIds = revisions.map((revision) => revision.id);
    await prisma.$transaction(async (tx) => {
      await tx.talentRestrictionRuleCondition.deleteMany({ where: { revisionId: { in: revisionIds } } });
      await tx.talentRestrictionRuleOutput.deleteMany({ where: { revisionId: { in: revisionIds } } });
      await tx.talentRestrictionRuleRevision.deleteMany({ where: { ruleId } });
      await tx.talentRestrictionRule.delete({ where: { id: ruleId } });
    });
    await prisma.talentActionLog.create({ data: {
      targetType: "TalentRestrictionRule",
      targetId: ruleId,
      action: "DELETE",
      actorId: user.id,
      afterJson: JSON.stringify({ rule, revisions }),
    } });
    refreshTalentWorkspace();
    return { status: "success", message: `规则“${rule.name}”已删除`, ruleId };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "规则删除失败" };
  }
}

export async function deleteTalentRestrictionRuleDraft(
  _previousState: RestrictionRuleDraftActionState,
  formData: FormData,
): Promise<RestrictionRuleDraftActionState> {
  try {
    const user = await configurationManager();
    const ruleId = required(formData, "ruleId");
    const rule = await prisma.talentRestrictionRule.findFirst({ where: { id: ruleId, status: { in: ["DRAFT", "ACTIVE"] }, deletedAt: null } });
    if (!rule) throw new Error("规则不存在、已停用或不可删除草稿");
    await assertDepartment(user, rule.departmentOrgNodeId);
    if (rule.status === "ACTIVE") {
      const draftRevision = await prisma.talentRestrictionRuleRevision.findFirst({ where: { ruleId, status: "DRAFT" }, orderBy: { revisionNo: "desc" } });
      if (!draftRevision) throw new Error("该规则没有可删除的修订草稿");
      await prisma.$transaction(async (tx) => {
        await tx.talentRestrictionRuleCondition.deleteMany({ where: { revisionId: draftRevision.id } });
        await tx.talentRestrictionRuleOutput.deleteMany({ where: { revisionId: draftRevision.id } });
        await tx.talentRestrictionRuleRevision.delete({ where: { id: draftRevision.id } });
        await tx.talentRestrictionRule.update({ where: { id: ruleId }, data: { updatedAt: new Date() } });
      });
      await prisma.talentActionLog.create({ data: { targetType: "TalentRestrictionRuleRevision", targetId: draftRevision.id, action: "DELETE_DRAFT", actorId: user.id, afterJson: JSON.stringify(draftRevision) } });
      refreshTalentWorkspace();
      return { status: "success", message: `R${draftRevision.revisionNo}修订草稿已删除`, ruleId };
    }
    const revisions = await prisma.talentRestrictionRuleRevision.findMany({ where: { ruleId }, select: { id: true } });
    const revisionIds = revisions.map((revision) => revision.id);
    await prisma.$transaction(async (tx) => {
      await tx.talentRestrictionRuleCondition.deleteMany({ where: { revisionId: { in: revisionIds } } });
      await tx.talentRestrictionRuleOutput.deleteMany({ where: { revisionId: { in: revisionIds } } });
      await tx.talentRestrictionRuleRevision.deleteMany({ where: { ruleId } });
      await tx.talentRestrictionRule.delete({ where: { id: ruleId } });
    });
    await prisma.talentActionLog.create({ data: { targetType: "TalentRestrictionRule", targetId: ruleId, action: "DELETE_DRAFT", actorId: user.id, afterJson: JSON.stringify(rule) } });
    refreshTalentWorkspace();
    return { status: "success", message: `草稿“${rule.name}”已删除` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "规则草稿删除失败" };
  }
}
