"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getAnnualGoalPlanPermissions, resolveAnnualGoalPermissionContext } from "@/server/organization/annual-goal-permissions";
import {
  findNearestDepartmentOrgNodeId,
  getDescendantOrgNodeIds,
  findOrgNodeById,
} from "@/server/organization/org-tree-utils";
import { Prisma, type AnnualMetricCalculationType, type RiskStatus } from "@prisma/client";
import {
  emitAnnualGoalRiskChanged,
  emitAnnualGoalTargetChanged,
  emitAnnualGoalTeamResponsiblePending,
  resolveAnnualGoalResponsibleUserId,
} from "@/server/notifications/annual-goal-notifications";

const calculationTypes = ["RATIO", "BOOLEAN", "MANUAL_SCORE"] as const;
const riskStatuses = ["NORMAL", "SLIGHT_DELAY", "RISK", "COMPLETED"] as const;

async function findTeamRecordByOrgNodeId(orgNodeId: string) {
  const teamNode = await prisma.orgNode.findUnique({
    where: { id: orgNodeId },
    select: { id: true, name: true, parentId: true, nodeType: true },
  });

  if (!teamNode || teamNode.nodeType !== "TEAM") return null;

  return {
    id: teamNode.id,
    orgNodeId: teamNode.id,
    name: teamNode.name,
    departmentOrgNodeId: await findNearestDepartmentOrgNodeId(teamNode.id),
  };
}

function revalidateAnnualGoals() {
  revalidatePath("/annual-goals");
  revalidatePath("/dashboard");
}

async function getAnnualGoalActionContext() {
  const user = await requireCurrentUser();
  const permissionContext = await resolveAnnualGoalPermissionContext(user);

  return {
    user,
    capabilities: permissionContext.capabilities,
    permissionContext,
  };
}

function getScopedPlanPermissions(
  context: Awaited<ReturnType<typeof getAnnualGoalActionContext>>,
  plan: { ownerType: "DEPARTMENT" | "TEAM"; departmentOrgNodeId: string | null; teamOrgNodeId: string | null; ownerOrgNodeId?: string | null; deletedAt?: Date | null }
) {
  return getAnnualGoalPlanPermissions(context.permissionContext, {
    ownerType: plan.ownerType,
    ownerOrgNodeId: plan.ownerOrgNodeId ?? null,
    deletedAt: plan.deletedAt ?? null,
  });
}

function canEditDepartmentScope(
  context: Awaited<ReturnType<typeof getAnnualGoalActionContext>>,
  scope: { departmentOrgNodeId: string | null; ownerOrgNodeId?: string | null }
) {
  return getScopedPlanPermissions(context, {
    ownerType: "DEPARTMENT",
    departmentOrgNodeId: scope.departmentOrgNodeId,
    teamOrgNodeId: null,
    ownerOrgNodeId: scope.ownerOrgNodeId ?? null,
  }).canEditDepartmentPlan;
}

function canEditTeamScope(
  context: Awaited<ReturnType<typeof getAnnualGoalActionContext>>,
  scope: { teamOrgNodeId: string | null; departmentOrgNodeId?: string | null; ownerOrgNodeId?: string | null }
) {
  return getScopedPlanPermissions(context, {
    ownerType: "TEAM",
    departmentOrgNodeId: scope.departmentOrgNodeId ?? null,
    teamOrgNodeId: scope.teamOrgNodeId,
    ownerOrgNodeId: scope.ownerOrgNodeId ?? null,
  }).canEditTeamPlan;
}

function canUpdateDepartmentProgressScope(
  context: Awaited<ReturnType<typeof getAnnualGoalActionContext>>,
  scope: { departmentOrgNodeId: string | null; ownerOrgNodeId?: string | null }
) {
  return getScopedPlanPermissions(context, {
    ownerType: "DEPARTMENT",
    departmentOrgNodeId: scope.departmentOrgNodeId,
    teamOrgNodeId: null,
    ownerOrgNodeId: scope.ownerOrgNodeId ?? null,
  }).canUpdateQuarterProgress;
}

function canUpdateTeamProgressScope(
  context: Awaited<ReturnType<typeof getAnnualGoalActionContext>>,
  scope: { teamOrgNodeId: string | null; departmentOrgNodeId?: string | null; ownerOrgNodeId?: string | null }
) {
  return getScopedPlanPermissions(context, {
    ownerType: "TEAM",
    departmentOrgNodeId: scope.departmentOrgNodeId ?? null,
    teamOrgNodeId: scope.teamOrgNodeId,
    ownerOrgNodeId: scope.ownerOrgNodeId ?? null,
  }).canUpdateTeamProgress;
}

async function requireAnnualGoalDepartmentEditor() {
  const context = await getAnnualGoalActionContext();

  if (!context.capabilities.canEditDepartmentPlans) {
    throw new Error("无权维护部门年度指标");
  }
  if (context.permissionContext.departmentEdit.hasAllAccess) {
    return context;
  }

  const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(context.user.orgNodeId);
  if (!departmentOrgNodeId || !canEditDepartmentScope(context, { departmentOrgNodeId, ownerOrgNodeId: departmentOrgNodeId })) {
    throw new Error("无权维护部门年度指标");
  }
  return context;
}

function numberFromForm(value: FormDataEntryValue | null, fieldName: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${fieldName}格式不正确`);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function roundValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function optionalString(value: FormDataEntryValue | null) {
  const s = (value as string | null)?.trim();
  return s || null;
}

const UNIT_SCALE_TO_YUAN: Record<string, number> = {
  "分": 0.01,
  "元": 1,
  "万元": 10000,
};

function convertUnitAmount(value: number, fromUnit: string, toUnit: string) {
  const fromScale = UNIT_SCALE_TO_YUAN[fromUnit.trim()];
  const toScale = UNIT_SCALE_TO_YUAN[toUnit.trim()];
  if (!fromScale || !toScale || fromScale === toScale) return value;
  return Math.round((((value * fromScale) / toScale) + Number.EPSILON) * 100) / 100;
}

async function resolveResponsibleUserId(
  responsibleUserId: string | null,
  scope: { ownerOrgNodeId?: string | null },
  emptyMessage: string
) {
  if (!responsibleUserId) return null;

  const orgScopeIds = Array.from(new Set([
    ...(scope.ownerOrgNodeId ? [scope.ownerOrgNodeId] : []),
    ...(scope.ownerOrgNodeId ? await getDescendantOrgNodeIds(scope.ownerOrgNodeId) : []),
  ]));
  if (orgScopeIds.length === 0) throw new Error(emptyMessage);

  const user = await prisma.user.findFirst({
    where: {
      id: responsibleUserId,
      isActive: true,
      deletedAt: null,
      orgNodeId: { in: orgScopeIds },
    },
    select: { id: true },
  });

  if (!user) throw new Error(emptyMessage);
  return user.id;
}

async function resolveDepartmentResponsibleUserId(
  responsibleUserId: string | null,
  scope: { departmentOrgNodeId: string | null; ownerOrgNodeId?: string | null },
) {
  return resolveResponsibleUserId(responsibleUserId, scope, "负责人必须为本部门成员");
}

async function resolveTeamResponsibleUserId(
  responsibleUserId: string | null,
  scope: { departmentOrgNodeId: string | null; teamOrgNodeId: string | null; ownerOrgNodeId?: string | null },
) {
  return resolveResponsibleUserId(responsibleUserId, scope, "负责人必须为本小组成员");
}

function isSameDepartmentScope(
  left: { departmentOrgNodeId?: string | null; ownerOrgNodeId?: string | null },
  right: { departmentOrgNodeId?: string | null; ownerOrgNodeId?: string | null },
) {
  return (left.departmentOrgNodeId ?? left.ownerOrgNodeId) === (right.departmentOrgNodeId ?? right.ownerOrgNodeId);
}

function buildAnnualGoalPlanName(ownerName: string, year: number) {
  return `${ownerName} ${year} 年度业绩指标`;
}

async function resolveOwner(
  context: Awaited<ReturnType<typeof getAnnualGoalActionContext>>,
  formData: FormData
) {
  const requestedDepartmentOrgNodeId = (formData.get("departmentOrgNodeId") as string) || null;
  const ownerOrgNodeId = requestedDepartmentOrgNodeId || await findNearestDepartmentOrgNodeId(context.user.orgNodeId);
  if (!ownerOrgNodeId) throw new Error("请选择所属部门");
  const departmentNode = await findOrgNodeById(ownerOrgNodeId);
  if (!departmentNode || departmentNode.nodeType !== "DEPARTMENT") throw new Error("所属部门无效");
  if (!canEditDepartmentScope(context, { departmentOrgNodeId: ownerOrgNodeId, ownerOrgNodeId })) throw new Error("无权维护该部门方案");
  return { departmentOrgNodeId: ownerOrgNodeId, ownerOrgNodeId, ownerName: departmentNode.name };
}

async function assertPlanEditable(planId: string) {
  const context = await getAnnualGoalActionContext();
  const plan = await prisma.annualGoalPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.deletedAt) throw new Error("年度方案不存在");
  if (plan.status === "CLOSED") throw new Error("年度方案已关闭");

  const departmentOrgNodeId = plan.departmentOrgNodeId;
  if (canEditDepartmentScope(context, { departmentOrgNodeId, ownerOrgNodeId: departmentOrgNodeId })) {
    return { context, plan };
  }

  throw new Error("无权维护该年度方案");
}

async function assertQuarterProgressUpdatable(metricId: string, sourceMetricId: string | null, requestedTeamOrgNodeId?: string | null) {
  const context = await getAnnualGoalActionContext();
  const metric = await prisma.annualGoalMetric.findUnique({ where: { id: metricId }, include: { plan: true } });
  if (!metric || metric.deletedAt || metric.plan.deletedAt) throw new Error("指标项不存在");
  if (metric.plan.status === "CLOSED") throw new Error("年度方案已关闭");

  const sourceMetric = sourceMetricId
    ? await prisma.annualGoalMetricSource.findUnique({ where: { id: sourceMetricId }, include: { parentMetric: { include: { plan: true } } } })
    : null;
  if (sourceMetricId && (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetric.deletedAt || sourceMetric.parentMetric.plan.deletedAt)) {
    throw new Error("元指标不存在");
  }

  if (sourceMetric && sourceMetric.parentMetricId !== metricId) throw new Error("元指标不存在");
  const departmentPlan = metric.plan;
  const departmentOrgNodeId = departmentPlan.departmentOrgNodeId;

  if (canUpdateDepartmentProgressScope(context, {
    departmentOrgNodeId,
    ownerOrgNodeId: departmentOrgNodeId,
  })) {
    return { context, metric, sourceMetric };
  }

  if (!context.capabilities.canUpdateProgress) {
    throw new Error("无权更新该季度指标");
  }

  const currentUserOrgNode = await findOrgNodeById(context.user.orgNodeId);
  const currentUserTeamId = requestedTeamOrgNodeId
    ?? (currentUserOrgNode?.nodeType === "TEAM" ? currentUserOrgNode.id : null);
  if (currentUserTeamId) {
    const assignment = await prisma.annualGoalMetricAssignment.findFirst({
      where: {
        teamOrgNodeId: currentUserTeamId,
        deletedAt: null,
        ...(sourceMetricId ? { sourceMetricId, metricId: null } : { metricId, sourceMetricId: null }),
      },
      select: { id: true },
    });
    if (assignment && canUpdateTeamProgressScope(context, {
      teamOrgNodeId: currentUserTeamId,
      departmentOrgNodeId,
      ownerOrgNodeId: currentUserTeamId,
    })) return { context, metric, sourceMetric };
  }

  throw new Error("无权更新该季度指标");
}

async function assertQuarterTargetsManageable(metricId: string, sourceMetricId: string | null, teamOrgNodeId: string | null) {
  const context = await getAnnualGoalActionContext();
  const metric = await prisma.annualGoalMetric.findUnique({ where: { id: metricId }, include: { plan: true } });
  if (!metric || metric.deletedAt || metric.plan.deletedAt) throw new Error("指标项不存在");
  if (metric.plan.status === "CLOSED") throw new Error("年度方案已关闭");
  if (sourceMetricId) {
    const source = await prisma.annualGoalMetricSource.findFirst({
      where: { id: sourceMetricId, parentMetricId: metricId, deletedAt: null },
      select: { id: true },
    });
    if (!source) throw new Error("元指标不存在");
  }
  const departmentOrgNodeId = metric.plan.departmentOrgNodeId;
  if (canEditDepartmentScope(context, { departmentOrgNodeId, ownerOrgNodeId: departmentOrgNodeId })) {
    return { context, metric };
  }
  if (!teamOrgNodeId || !canEditTeamScope(context, { teamOrgNodeId, departmentOrgNodeId, ownerOrgNodeId: teamOrgNodeId })) {
    throw new Error("无权维护该季度指标");
  }
  const assignment = await prisma.annualGoalMetricAssignment.findFirst({
    where: {
      teamOrgNodeId,
      deletedAt: null,
      ...(sourceMetricId ? { metricId: null, sourceMetricId } : { metricId, sourceMetricId: null }),
    },
    select: { id: true },
  });
  if (!assignment) throw new Error("小组尚未承接该指标");
  return { context, metric };
}

async function syncParentMetricFromSources(
  tx: Prisma.TransactionClient,
  metricId: string,
  updatedAt: Date,
  updatedById?: string,
) {
  const sources = await tx.annualGoalMetricSource.findMany({
    where: { parentMetricId: metricId, deletedAt: null },
    select: { currentValue: true },
  });
  const currentValue = Math.round((sources.reduce((sum, source) => sum + source.currentValue, 0) + Number.EPSILON) * 100) / 100;
  await tx.annualGoalMetric.update({
    where: { id: metricId },
    data: { currentValue, progressUpdatedAt: updatedAt, ...(updatedById ? { updatedById } : {}) },
  });
}

async function syncAnnualGoalCurrentValues(tx: Prisma.TransactionClient, metricId: string, sourceMetricId: string | null, updatedAt: Date, updatedById?: string) {
  if (sourceMetricId) {
    const sourceCurrent = await tx.annualGoalQuarterTarget.aggregate({
      where: { metricId: null, sourceMetricId, deletedAt: null },
      _sum: { currentValue: true },
    });
    await tx.annualGoalMetricSource.update({
      where: { id: sourceMetricId },
      data: { currentValue: Math.round(((sourceCurrent._sum.currentValue ?? 0) + Number.EPSILON) * 100) / 100, progressUpdatedAt: updatedAt, ...(updatedById ? { updatedById } : {}) },
    });
  }

  const directQuarterCount = await tx.annualGoalQuarterTarget.count({ where: { metricId, sourceMetricId: null, deletedAt: null } });
  if (directQuarterCount > 0) {
    const metricCurrent = await tx.annualGoalQuarterTarget.aggregate({
      where: { metricId, sourceMetricId: null, deletedAt: null },
      _sum: { currentValue: true },
    });
    await tx.annualGoalMetric.update({
      where: { id: metricId },
      data: { currentValue: Math.round(((metricCurrent._sum.currentValue ?? 0) + Number.EPSILON) * 100) / 100, progressUpdatedAt: updatedAt, ...(updatedById ? { updatedById } : {}) },
    });
    return;
  }

  const sourceCount = await tx.annualGoalMetricSource.count({
    where: { parentMetricId: metricId, deletedAt: null },
  });
  if (sourceCount > 0) {
    await syncParentMetricFromSources(tx, metricId, updatedAt, updatedById);
  }
}

async function assertWeightWithinLimit(planId: string, weight: number, metricId?: string) {
  const metrics = await prisma.annualGoalMetric.findMany({
    where: { planId, deletedAt: null, ...(metricId ? { id: { not: metricId } } : {}) },
    select: { weight: true },
  });
  const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0) + weight;
  if (totalWeight > 100) throw new Error("指标权重合计不能超过 100%");
}

async function assertSourceMetricAvailable(
  sourceMetricId: string,
  scope: { departmentOrgNodeId: string | null; ownerOrgNodeId?: string | null },
) {
  const sourceMetric = await prisma.annualGoalMetricSource.findUnique({
    where: { id: sourceMetricId },
    include: { parentMetric: { include: { plan: true } } },
  });
  if (!sourceMetric || sourceMetric.deletedAt) throw new Error("指标元数据不存在");
  if (sourceMetric.parentMetric.deletedAt || sourceMetric.parentMetric.plan.deletedAt) throw new Error("指标元数据不可用");
  if (!isSameDepartmentScope(sourceMetric.parentMetric.plan, scope)) {
    throw new Error("只能选择本部门指标下的最细指标项");
  }

  return sourceMetric;
}

const sourceMetricTargetLimitMessage = "同一指标项下的所有元指标的目标数额总额不得大于指标项的目标总额，请重新填写。";
const quarterTargetLimitMessage = "季度指标的目标数额总额不得大于对应指标项/元指标的目标总额，请重新填写。";

function authorityQuarterWhere(metricId: string, sourceMetricId: string | null) {
  return sourceMetricId
    ? { metricId: null, sourceMetricId }
    : { metricId, sourceMetricId: null };
}

async function assertSourceMetricTargetWithinLimit(parentMetricId: string, targetValue: number, sourceMetricId?: string) {
  const parentMetric = await prisma.annualGoalMetric.findUnique({
    where: { id: parentMetricId },
    select: { targetValue: true },
  });
  if (!parentMetric) throw new Error("指标项不存在");

  const sourceMetrics = await prisma.annualGoalMetricSource.findMany({
    where: { parentMetricId, deletedAt: null, ...(sourceMetricId ? { id: { not: sourceMetricId } } : {}) },
    select: { targetValue: true },
  });
  const total = sourceMetrics.reduce((sum, metric) => sum + metric.targetValue, 0) + targetValue;
  if (Math.round((total + Number.EPSILON) * 100) / 100 > Math.round((parentMetric.targetValue + Number.EPSILON) * 100) / 100) {
    throw new Error(sourceMetricTargetLimitMessage);
  }
}

async function assertQuarterTargetsWithinLimit(metricId: string, sourceMetricId: string | null, targetValue: number) {
  if (sourceMetricId) {
    const sourceMetric = await prisma.annualGoalMetricSource.findUnique({
      where: { id: sourceMetricId },
      select: { targetValue: true },
    });
    if (!sourceMetric) throw new Error("元指标不存在");
    if (Math.round((targetValue + Number.EPSILON) * 100) / 100 > Math.round((sourceMetric.targetValue + Number.EPSILON) * 100) / 100) {
      throw new Error(quarterTargetLimitMessage);
    }
    return;
  }

  const metric = await prisma.annualGoalMetric.findUnique({
    where: { id: metricId },
    select: { targetValue: true },
  });
  if (!metric) throw new Error("指标项不存在");
  if (Math.round((targetValue + Number.EPSILON) * 100) / 100 > Math.round((metric.targetValue + Number.EPSILON) * 100) / 100) {
    throw new Error(quarterTargetLimitMessage);
  }
}

async function generateMetricCode(year: number) {
  const count = await prisma.annualGoalMetric.count();
  return `AG-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function generateSourceMetricCode(year: number) {
  const count = await prisma.annualGoalMetricSource.count();
  return `AGM-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function assertAnnualGoalPlanYearUnique(departmentOrgNodeId: string, year: number, excludePlanId?: string) {
  const existingPlan = await prisma.annualGoalPlan.findFirst({
    where: {
      year,
      deletedAt: null,
      departmentOrgNodeId,
      ...(excludePlanId ? { id: { not: excludePlanId } } : {}),
    },
    select: { id: true },
  });

  if (existingPlan) {
    throw new Error("同一组织同一年只能有一个年度方案");
  }
}

export async function createAnnualGoalPlan(formData: FormData) {
  const context = await requireAnnualGoalDepartmentEditor();
  const year = numberFromForm(formData.get("year"), "年份");
  const description = optionalString(formData.get("description"));

  if (!year || year < 2000 || year > 2100) throw new Error("年份不正确");

  const { departmentOrgNodeId, ownerName } = await resolveOwner(context, formData);
  const name = buildAnnualGoalPlanName(ownerName, year);

  await assertAnnualGoalPlanYearUnique(departmentOrgNodeId, year);

  await prisma.annualGoalPlan.create({
    data: {
      year,
      name,
      description,
      departmentOrgNodeId,
      createdById: context.user.id,
    },
  });

  revalidateAnnualGoals();
}

export async function updateAnnualGoalPlan(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少方案 ID");
  const { context } = await assertPlanEditable(id);
  const year = numberFromForm(formData.get("year"), "年份");
  const description = optionalString(formData.get("description"));
  const { departmentOrgNodeId, ownerName } = await resolveOwner(context, formData);
  const name = buildAnnualGoalPlanName(ownerName, year);

  await assertAnnualGoalPlanYearUnique(departmentOrgNodeId, year, id);

  if (!year || year < 2000 || year > 2100) throw new Error("年份不正确");

  await prisma.annualGoalPlan.update({
    where: { id },
    data: { year, name, description, departmentOrgNodeId },
  });

  revalidateAnnualGoals();
}

export async function deleteAnnualGoalPlan(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少方案 ID");

  await assertPlanEditable(id);

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.annualGoalPlan.update({
      where: { id },
      data: { deletedAt },
    });

    const metrics = await tx.annualGoalMetric.findMany({
      where: { planId: id, deletedAt: null },
      select: { id: true },
    });

    if (metrics.length === 0) return;

    const metricIds = metrics.map((metric) => metric.id);
    await tx.annualGoalMetric.updateMany({ where: { id: { in: metricIds }, deletedAt: null }, data: { deletedAt } });

    const sourceMetricIds = (await tx.annualGoalMetricSource.findMany({
      where: { parentMetricId: { in: metricIds }, deletedAt: null },
      select: { id: true },
    })).map((s) => s.id);

    await tx.annualGoalMetricSource.updateMany({ where: { parentMetricId: { in: metricIds }, deletedAt: null }, data: { deletedAt } });
    await tx.annualGoalQuarterTarget.updateMany({ where: { metricId: { in: metricIds }, deletedAt: null }, data: { deletedAt } });
    if (sourceMetricIds.length > 0) {
      await tx.annualGoalQuarterTarget.updateMany({ where: { sourceMetricId: { in: sourceMetricIds }, deletedAt: null }, data: { deletedAt } });
    }
    await tx.annualGoalMetricAssignment.updateMany({
      where: {
        deletedAt: null,
        OR: [
          { metricId: { in: metricIds } },
          ...(sourceMetricIds.length ? [{ sourceMetricId: { in: sourceMetricIds } }] : []),
        ],
      },
      data: { deletedAt },
    });
  });

  revalidateAnnualGoals();
}

export async function createAnnualGoalMetric(formData: FormData) {
  const planId = formData.get("planId") as string;
  if (!planId) throw new Error("缺少方案 ID");
  const sourceMetricId = (formData.get("sourceMetricId") as string) || null;
  const parentMetricId = (formData.get("parentMetricId") as string) || null;
  const teamOrgNodeId = (formData.get("teamOrgNodeId") as string) || null;
  const responsibleUserIdInput = (formData.get("responsibleUserId") as string) || null;
  const weight = numberFromForm(formData.get("weight"), "权重");
  const { context, plan } = teamOrgNodeId
    ? {
        context: await getAnnualGoalActionContext(),
        plan: await prisma.annualGoalPlan.findUnique({ where: { id: planId } }),
      }
    : await assertPlanEditable(planId);
  if (!plan || plan.deletedAt) throw new Error("年度方案不存在");
  if (plan.status === "CLOSED") throw new Error("年度方案已关闭");

  if (weight < 0) throw new Error("数值不能小于 0");

  if (teamOrgNodeId) {
    if (!!sourceMetricId === !!parentMetricId) throw new Error("请选择一个指标项或元指标");
    const team = await findTeamRecordByOrgNodeId(teamOrgNodeId);
    const planDepartmentOrgNodeId = plan.departmentOrgNodeId;
    if (!team || team.departmentOrgNodeId !== planDepartmentOrgNodeId) throw new Error("只能承接本部门指标");
    if (!canEditTeamScope(context, {
      teamOrgNodeId,
      departmentOrgNodeId: team.departmentOrgNodeId,
      ownerOrgNodeId: teamOrgNodeId,
    })) throw new Error("无权维护该小组承接");
    const responsibleUserId = await resolveTeamResponsibleUserId(responsibleUserIdInput, {
      departmentOrgNodeId: team.departmentOrgNodeId,
      teamOrgNodeId,
      ownerOrgNodeId: teamOrgNodeId,
    });
    if (sourceMetricId) {
      const source = await assertSourceMetricAvailable(sourceMetricId, {
        departmentOrgNodeId: planDepartmentOrgNodeId,
        ownerOrgNodeId: planDepartmentOrgNodeId,
      });
      if (source.parentMetric.planId !== planId) throw new Error("元指标不属于当前年度方案");
    } else {
      const metric = await prisma.annualGoalMetric.findFirst({
        where: { id: parentMetricId!, planId, deletedAt: null },
        select: { id: true },
      });
      if (!metric) throw new Error("指标项不存在");
    }
    const activeAssignments = await prisma.annualGoalMetricAssignment.findMany({
      where: { teamOrgNodeId, deletedAt: null },
      select: { weight: true },
    });
    if (roundValue(activeAssignments.reduce((sum, item) => sum + item.weight, 0) + weight) > 100) {
      throw new Error("指标权重合计不能超过 100%");
    }
    const authority = sourceMetricId ? { metricId: null, sourceMetricId } : { metricId: parentMetricId, sourceMetricId: null };
    const existing = await prisma.annualGoalMetricAssignment.findFirst({ where: { teamOrgNodeId, ...authority } });
    if (existing && !existing.deletedAt) throw new Error("该指标已添加过，无需重复添加");
    if (existing) {
      const updated = await prisma.annualGoalMetricAssignment.update({
        where: { id: existing.id },
        data: { ...authority, weight, responsibleUserId, deletedAt: null, updatedById: context.user.id },
        select: { id: true },
      });
      if (!responsibleUserId) {
        let metricName = "";
        if (sourceMetricId) {
          const source = await prisma.annualGoalMetricSource.findUnique({ where: { id: sourceMetricId }, select: { name: true } });
          metricName = source?.name ?? "";
        } else if (parentMetricId) {
          const parentMetric = await prisma.annualGoalMetric.findUnique({ where: { id: parentMetricId }, select: { name: true } });
          metricName = parentMetric?.name ?? "";
        }
        await emitAnnualGoalTeamResponsiblePending({
          planId: plan.id,
          planName: plan.name,
          year: plan.year,
          departmentOrgNodeId: planDepartmentOrgNodeId,
          assignmentId: updated.id,
          teamOrgNodeId,
          metricName,
          metricNames: metricName ? [metricName] : [],
        });
      }
    } else {
      const created = await prisma.annualGoalMetricAssignment.create({
        data: { teamOrgNodeId, ...authority, weight, responsibleUserId, createdById: context.user.id },
        select: { id: true },
      });
      if (!responsibleUserId) {
        let metricName = "";
        if (sourceMetricId) {
          const source = await prisma.annualGoalMetricSource.findUnique({ where: { id: sourceMetricId }, select: { name: true } });
          metricName = source?.name ?? "";
        } else if (parentMetricId) {
          const parentMetric = await prisma.annualGoalMetric.findUnique({ where: { id: parentMetricId }, select: { name: true } });
          metricName = parentMetric?.name ?? "";
        }
        await emitAnnualGoalTeamResponsiblePending({
          planId: plan.id,
          planName: plan.name,
          year: plan.year,
          departmentOrgNodeId: planDepartmentOrgNodeId,
          assignmentId: created.id,
          teamOrgNodeId,
          metricName,
          metricNames: metricName ? [metricName] : [],
        });
      }
    }
    revalidateAnnualGoals();
    return;
  }

  await assertWeightWithinLimit(planId, weight);
  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const targetValue = numberFromForm(formData.get("targetValue"), "目标值");
  const currentValue = numberFromForm(formData.get("currentValue") || "0", "当前值");
  const unit = (formData.get("unit") as string)?.trim();
  const calculationType = formData.get("calculationType") as AnnualMetricCalculationType;
  const riskStatus = formData.get("riskStatus") as RiskStatus;

  if (!name || !unit) throw new Error("指标名称和单位为必填项");
  if (targetValue < 0 || currentValue < 0) throw new Error("数值不能小于 0");
  if (!calculationTypes.includes(calculationType as (typeof calculationTypes)[number])) throw new Error("计算方式不正确");
  if (!riskStatuses.includes(riskStatus as (typeof riskStatuses)[number])) throw new Error("风险状态不正确");

  const responsibleUserId = await resolveDepartmentResponsibleUserId((formData.get("responsibleUserId") as string) || null, {
    departmentOrgNodeId: plan.departmentOrgNodeId,
    ownerOrgNodeId: plan.departmentOrgNodeId,
  });

  const metricCode = await generateMetricCode(plan.year);
  await prisma.annualGoalMetric.create({
    data: { planId, metricCode, name, description, targetValue, currentValue, unit, weight, calculationType, riskStatus, responsibleUserId, createdById: context.user.id },
  });

  revalidateAnnualGoals();
}

export async function updateAnnualGoalMetric(formData: FormData) {
  const assignmentId = (formData.get("assignmentId") as string) || null;
  if (assignmentId) {
    const context = await getAnnualGoalActionContext();
    const assignment = await prisma.annualGoalMetricAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        metric: { include: { plan: true } },
        sourceMetric: { include: { parentMetric: { include: { plan: true } } } },
      },
    });
    const authorityPlan = assignment?.sourceMetric?.parentMetric.plan ?? assignment?.metric?.plan;
    if (!assignment || assignment.deletedAt || !authorityPlan || authorityPlan.deletedAt) throw new Error("小组承接不存在");
    if (authorityPlan.status === "CLOSED") throw new Error("年度方案已关闭");
    const departmentOrgNodeId = authorityPlan.departmentOrgNodeId;
    if (!canEditTeamScope(context, { teamOrgNodeId: assignment.teamOrgNodeId, departmentOrgNodeId, ownerOrgNodeId: assignment.teamOrgNodeId })) {
      throw new Error("无权维护该小组承接");
    }
    const weight = numberFromForm(formData.get("weight"), "权重");
    if (weight < 0) throw new Error("数值不能小于 0");
    const responsibleUserId = await resolveTeamResponsibleUserId((formData.get("responsibleUserId") as string) || null, {
      departmentOrgNodeId,
      teamOrgNodeId: assignment.teamOrgNodeId,
      ownerOrgNodeId: assignment.teamOrgNodeId,
    });
    const siblings = await prisma.annualGoalMetricAssignment.findMany({
      where: { teamOrgNodeId: assignment.teamOrgNodeId, deletedAt: null, id: { not: assignmentId } },
      select: { weight: true },
    });
    if (roundValue(siblings.reduce((sum, item) => sum + item.weight, 0) + weight) > 100) {
      throw new Error("指标权重合计不能超过 100%");
    }
    await prisma.annualGoalMetricAssignment.update({
      where: { id: assignmentId },
      data: {
        weight,
        responsibleUserId,
        sortOrder: formData.get("sortOrder") === null ? assignment.sortOrder : numberFromForm(formData.get("sortOrder"), "排序"),
        updatedById: context.user.id,
      },
    });
    revalidateAnnualGoals();
    return;
  }

  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少指标 ID");

  const metric = await prisma.annualGoalMetric.findUnique({ where: { id }, include: { plan: true } });
  if (!metric || metric.deletedAt) throw new Error("指标不存在");
  const { context } = await assertPlanEditable(metric.planId);

  const weight = numberFromForm(formData.get("weight"), "权重");
  if (weight < 0) throw new Error("数值不能小于 0");
  await assertWeightWithinLimit(metric.planId, weight, id);

  const adjustedAt = new Date();

  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const targetValue = numberFromForm(formData.get("targetValue") ?? String(metric.targetValue), "目标值");
  const currentValue = formData.get("currentValue") !== null ? numberFromForm(formData.get("currentValue"), "当前值") : metric.currentValue;
  const unit = (formData.get("unit") as string)?.trim();
  const calculationType = formData.get("calculationType") as AnnualMetricCalculationType;
  const riskStatus = formData.get("riskStatus") as RiskStatus;

  if (!name || !unit) throw new Error("指标名称和单位为必填项");
  if (targetValue < 0 || currentValue < 0) throw new Error("数值不能小于 0");
  if (!calculationTypes.includes(calculationType as (typeof calculationTypes)[number])) throw new Error("计算方式不正确");
  if (!riskStatuses.includes(riskStatus as (typeof riskStatuses)[number])) throw new Error("风险状态不正确");

  const responsibleUserId = await resolveDepartmentResponsibleUserId((formData.get("responsibleUserId") as string) || null, {
    departmentOrgNodeId: metric.plan.departmentOrgNodeId,
    ownerOrgNodeId: metric.plan.departmentOrgNodeId,
  });

  await prisma.annualGoalMetric.update({
    where: { id },
    data: { name, description, targetValue, currentValue, unit, weight, calculationType, riskStatus, responsibleUserId, adjustedAt, updatedById: context.user.id },
  });

  await emitAnnualGoalTargetChanged({
    planId: metric.planId,
    planName: metric.plan.name,
    year: metric.plan.year,
    departmentOrgNodeId: metric.plan.departmentOrgNodeId,
    metricId: metric.id,
    metricName: name,
    metricCode: metric.metricCode,
    responsibleUserId,
    previousTargetValue: metric.targetValue,
    targetValue,
    unit,
    fieldScope: "metric",
  });
  await emitAnnualGoalRiskChanged({
    planId: metric.planId,
    planName: metric.plan.name,
    year: metric.plan.year,
    departmentOrgNodeId: metric.plan.departmentOrgNodeId,
    metricId: metric.id,
    metricName: name,
    metricCode: metric.metricCode,
    responsibleUserId,
    previousRiskStatus: metric.riskStatus,
    riskStatus,
    updaterId: context.user.id,
    fieldScope: "metric",
  });

  revalidateAnnualGoals();
}

export async function createAnnualGoalMetricSource(formData: FormData) {
  const parentMetricId = formData.get("parentMetricId") as string;
  if (!parentMetricId) throw new Error("缺少部门指标 ID");
  const context = await requireAnnualGoalDepartmentEditor();

  const parentMetric = await prisma.annualGoalMetric.findUnique({ where: { id: parentMetricId }, include: { plan: true } });
  if (!parentMetric || parentMetric.deletedAt || parentMetric.plan.deletedAt) {
    throw new Error("部门指标不存在");
  }
  if (parentMetric.plan.status === "CLOSED") throw new Error("年度方案已关闭");
  if (!canEditDepartmentScope(context, { departmentOrgNodeId: parentMetric.plan.departmentOrgNodeId, ownerOrgNodeId: parentMetric.plan.departmentOrgNodeId })) {
    throw new Error("无权维护该部门指标元数据");
  }

  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const targetValue = numberFromForm(formData.get("targetValue"), "目标值");
  const currentValue = numberFromForm(formData.get("currentValue") || "0", "当前值");
  const unit = parentMetric.unit;
  const calculationType = formData.get("calculationType") as AnnualMetricCalculationType;
  const riskStatus = formData.get("riskStatus") as RiskStatus;
  const responsibleUserId = await resolveDepartmentResponsibleUserId((formData.get("responsibleUserId") as string) || null, {
    departmentOrgNodeId: parentMetric.plan.departmentOrgNodeId,
    ownerOrgNodeId: parentMetric.plan.departmentOrgNodeId,
  });

  if (!name || !unit) throw new Error("指标名称和单位为必填项");
  if (targetValue < 0 || currentValue < 0) throw new Error("数值不能小于 0");
  if (!calculationTypes.includes(calculationType as (typeof calculationTypes)[number])) throw new Error("计算方式不正确");
  if (!riskStatuses.includes(riskStatus as (typeof riskStatuses)[number])) throw new Error("风险状态不正确");
  await assertSourceMetricTargetWithinLimit(parentMetricId, targetValue);

  const metricCode = await generateSourceMetricCode(parentMetric.plan.year);
  const updatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.annualGoalMetricSource.create({
      data: { parentMetricId, metricCode, name, description, targetValue, currentValue, unit, calculationType, riskStatus, responsibleUserId, createdById: context.user.id },
    });
    await syncParentMetricFromSources(tx, parentMetricId, updatedAt, context.user.id);
  });

  revalidateAnnualGoals();
}

export async function updateAnnualGoalMetricSource(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少元指标 ID");
  const context = await requireAnnualGoalDepartmentEditor();

  const sourceMetric = await prisma.annualGoalMetricSource.findUnique({ where: { id }, include: { parentMetric: { include: { plan: true } } } });
  if (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetric.deletedAt || sourceMetric.parentMetric.plan.deletedAt) {
    throw new Error("元指标不存在");
  }
  if (sourceMetric.parentMetric.plan.status === "CLOSED") throw new Error("年度方案已关闭");
  if (!canEditDepartmentScope(context, { departmentOrgNodeId: sourceMetric.parentMetric.plan.departmentOrgNodeId, ownerOrgNodeId: sourceMetric.parentMetric.plan.departmentOrgNodeId })) {
    throw new Error("无权维护该元指标");
  }

  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const targetValue = numberFromForm(formData.get("targetValue"), "目标值");
  const currentValue = numberFromForm(formData.get("currentValue") || "0", "当前值");
  const unit = (formData.get("unit") as string)?.trim() || sourceMetric.unit;
  const normalizedTargetValue = convertUnitAmount(targetValue, unit, sourceMetric.unit);
  const normalizedCurrentValue = convertUnitAmount(currentValue, unit, sourceMetric.unit);
  const calculationType = formData.get("calculationType") as AnnualMetricCalculationType;
  const riskStatus = formData.get("riskStatus") as RiskStatus;
  const responsibleUserId = await resolveDepartmentResponsibleUserId((formData.get("responsibleUserId") as string) || null, {
    departmentOrgNodeId: sourceMetric.parentMetric.plan.departmentOrgNodeId,
    ownerOrgNodeId: sourceMetric.parentMetric.plan.departmentOrgNodeId,
  });

  if (!name || !unit) throw new Error("元指标名称和单位为必填项");
  if (targetValue < 0 || currentValue < 0) throw new Error("数值不能小于 0");
  if (!calculationTypes.includes(calculationType as (typeof calculationTypes)[number])) throw new Error("计算方式不正确");
  if (!riskStatuses.includes(riskStatus as (typeof riskStatuses)[number])) throw new Error("风险状态不正确");
  await assertSourceMetricTargetWithinLimit(sourceMetric.parentMetricId, normalizedTargetValue, id);

  const adjustedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.annualGoalMetricSource.update({
      where: { id },
      data: { name, description, targetValue: normalizedTargetValue, currentValue: normalizedCurrentValue, unit: sourceMetric.unit, calculationType, riskStatus, responsibleUserId, adjustedAt, updatedById: context.user.id },
    });
    await syncParentMetricFromSources(tx, sourceMetric.parentMetricId, adjustedAt, context.user.id);
  });

  const plan = sourceMetric.parentMetric.plan;
  await emitAnnualGoalTargetChanged({
    planId: plan.id,
    planName: plan.name,
    year: plan.year,
    departmentOrgNodeId: plan.departmentOrgNodeId,
    metricId: sourceMetric.parentMetricId,
    metricName: name,
    metricCode: sourceMetric.metricCode,
    sourceMetricId: sourceMetric.id,
    responsibleUserId,
    previousTargetValue: sourceMetric.targetValue,
    targetValue: normalizedTargetValue,
    unit: sourceMetric.unit,
    fieldScope: "source",
  });
  await emitAnnualGoalRiskChanged({
    planId: plan.id,
    planName: plan.name,
    year: plan.year,
    departmentOrgNodeId: plan.departmentOrgNodeId,
    metricId: sourceMetric.parentMetricId,
    metricName: name,
    metricCode: sourceMetric.metricCode,
    sourceMetricId: sourceMetric.id,
    responsibleUserId,
    previousRiskStatus: sourceMetric.riskStatus,
    riskStatus,
    updaterId: context.user.id,
    fieldScope: "source",
  });

  revalidateAnnualGoals();
}

export async function deleteAnnualGoalMetricSource(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少元指标 ID");
  const context = await requireAnnualGoalDepartmentEditor();

  const sourceMetric = await prisma.annualGoalMetricSource.findUnique({ where: { id }, include: { parentMetric: { include: { plan: true } } } });
  if (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetric.deletedAt || sourceMetric.parentMetric.plan.deletedAt) {
    throw new Error("元指标不存在");
  }
  if (sourceMetric.parentMetric.plan.status === "CLOSED") throw new Error("年度方案已关闭");
  if (!canEditDepartmentScope(context, { departmentOrgNodeId: sourceMetric.parentMetric.plan.departmentOrgNodeId, ownerOrgNodeId: sourceMetric.parentMetric.plan.departmentOrgNodeId })) {
    throw new Error("无权删除该元指标");
  }

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.annualGoalMetricSource.update({ where: { id }, data: { deletedAt } });
    await tx.annualGoalMetricAssignment.updateMany({ where: { sourceMetricId: id, deletedAt: null }, data: { deletedAt, updatedById: context.user.id } });
    await tx.annualGoalQuarterTarget.updateMany({ where: { sourceMetricId: id, deletedAt: null }, data: { deletedAt } });
    await syncParentMetricFromSources(tx, sourceMetric.parentMetricId, deletedAt, context.user.id);
  });

  revalidateAnnualGoals();
}

export async function deleteAnnualGoalMetric(formData: FormData) {
  const assignmentId = (formData.get("assignmentId") as string) || null;
  if (assignmentId) {
    const context = await getAnnualGoalActionContext();
    const assignment = await prisma.annualGoalMetricAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        metric: { include: { plan: true } },
        sourceMetric: { include: { parentMetric: { include: { plan: true } } } },
      },
    });
    const plan = assignment?.sourceMetric?.parentMetric.plan ?? assignment?.metric?.plan;
    if (!assignment || assignment.deletedAt || !plan || plan.deletedAt) throw new Error("小组承接不存在");
    if (plan.status === "CLOSED") throw new Error("年度方案已关闭");
    const departmentOrgNodeId = plan.departmentOrgNodeId;
    if (!canEditTeamScope(context, { teamOrgNodeId: assignment.teamOrgNodeId, departmentOrgNodeId, ownerOrgNodeId: assignment.teamOrgNodeId })) {
      throw new Error("无权维护该小组承接");
    }
    await prisma.annualGoalMetricAssignment.update({
      where: { id: assignmentId },
      data: { deletedAt: new Date(), updatedById: context.user.id },
    });
    revalidateAnnualGoals();
    return;
  }

  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少指标 ID");

  const metric = await prisma.annualGoalMetric.findUnique({ where: { id }, include: { plan: true } });
  if (!metric || metric.deletedAt) throw new Error("指标不存在");
  const { context } = await assertPlanEditable(metric.planId);

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const sourceIds = (await tx.annualGoalMetricSource.findMany({ where: { parentMetricId: id, deletedAt: null }, select: { id: true } })).map((item) => item.id);
    await tx.annualGoalMetric.update({ where: { id }, data: { deletedAt } });
    await tx.annualGoalMetricSource.updateMany({ where: { parentMetricId: id, deletedAt: null }, data: { deletedAt } });
    await tx.annualGoalMetricAssignment.updateMany({
      where: { deletedAt: null, OR: [{ metricId: id }, ...(sourceIds.length ? [{ sourceMetricId: { in: sourceIds } }] : [])] },
      data: { deletedAt, updatedById: context.user.id },
    });
    await tx.annualGoalQuarterTarget.updateMany({
      where: { deletedAt: null, OR: [{ metricId: id }, ...(sourceIds.length ? [{ sourceMetricId: { in: sourceIds } }] : [])] },
      data: { deletedAt, updatedById: context.user.id },
    });
  });
  revalidateAnnualGoals();
}

export async function saveAnnualGoalQuarterTargets(formData: FormData) {
  const metricId = formData.get("metricId") as string;
  const sourceMetricId = (formData.get("sourceMetricId") as string) || null;
  const teamOrgNodeId = (formData.get("teamOrgNodeId") as string) || null;
  if (!metricId) throw new Error("请选择指标项");

  const { context, metric } = await assertQuarterTargetsManageable(metricId, sourceMetricId, teamOrgNodeId);

  const targets = [1, 2, 3, 4].flatMap((quarter) => {
    const targetRaw = formData.get(`q${quarter}Target`);
    if (targetRaw === null || String(targetRaw).trim() === "") return [];
    const targetValue = numberFromForm(targetRaw, `Q${quarter}目标值`);
    const currentRaw = formData.get(`q${quarter}Current`);
    const currentValue = currentRaw === null || String(currentRaw).trim() === "" ? 0 : numberFromForm(currentRaw, `Q${quarter}当前值`);
    if (targetValue < 0 || currentValue < 0) throw new Error("季度指标数值不能小于 0");
    return [{ quarter, targetValue, currentValue }];
  });
  await assertQuarterTargetsWithinLimit(metricId, sourceMetricId, targets.reduce((sum, target) => sum + target.targetValue, 0));

  const oldTargets = await prisma.annualGoalQuarterTarget.findMany({
    where: { ...authorityQuarterWhere(metricId, sourceMetricId), deletedAt: null },
    select: { quarter: true, targetValue: true },
  });
  const oldTargetByQuarter = new Map(oldTargets.map((target) => [target.quarter, target.targetValue]));
  const sourceMetric = sourceMetricId
    ? await prisma.annualGoalMetricSource.findUnique({ where: { id: sourceMetricId }, select: { name: true, metricCode: true, unit: true } })
    : null;
  const responsibleUserId = await resolveAnnualGoalResponsibleUserId({ metricId, sourceMetricId, teamOrgNodeId });

  const adjustedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.annualGoalQuarterTarget.updateMany({
      where: { ...authorityQuarterWhere(metricId, sourceMetricId), deletedAt: null },
      data: { deletedAt: adjustedAt },
    });
    if (targets.length > 0) {
      await tx.annualGoalQuarterTarget.createMany({
        data: targets.map((target) => ({
          metricId: sourceMetricId ? null : metricId,
          sourceMetricId,
          year: metric.plan.year,
          quarter: target.quarter,
          targetValue: target.targetValue,
          currentValue: target.currentValue,
          adjustedAt,
          createdById: context.user.id,
        })),
      });
    }
    await syncAnnualGoalCurrentValues(tx, metricId, sourceMetricId, adjustedAt, context.user.id);
  });

  for (const target of targets) {
    const previousTargetValue = oldTargetByQuarter.get(target.quarter);
    if (previousTargetValue === target.targetValue) continue;
    await emitAnnualGoalTargetChanged({
      planId: metric.planId,
      planName: metric.plan.name,
      year: metric.plan.year,
      departmentOrgNodeId: metric.plan.departmentOrgNodeId,
      metricId,
      metricName: sourceMetric?.name ?? metric.name,
      metricCode: sourceMetric?.metricCode ?? metric.metricCode,
      sourceMetricId,
      teamOrgNodeId,
      responsibleUserId,
      quarter: target.quarter,
      previousTargetValue: previousTargetValue ?? 0,
      targetValue: target.targetValue,
      unit: sourceMetric?.unit ?? metric.unit,
      fieldScope: "quarter",
    });
  }

  revalidateAnnualGoals();
}

export async function updateAnnualGoalQuarterProgress(formData: FormData) {
  const metricId = formData.get("metricId") as string;
  const sourceMetricId = (formData.get("sourceMetricId") as string) || null;
  const teamOrgNodeId = (formData.get("teamOrgNodeId") as string) || null;
  if (!metricId) throw new Error("缺少季度指标 ID");

  const { context, metric, sourceMetric } = await assertQuarterProgressUpdatable(metricId, sourceMetricId, teamOrgNodeId);

  const updates = [1, 2, 3, 4].flatMap((quarter) => {
    const targetId = formData.get(`q${quarter}Id`) as string | null;
    if (!targetId) return [];
    const targetValue = numberFromForm(formData.get(`q${quarter}Target`), `Q${quarter}目标值`);
    const currentValue = numberFromForm(formData.get(`q${quarter}Current`), `Q${quarter}当前值`);
    if (targetValue < 0 || currentValue < 0) throw new Error("季度指标数值不能小于 0");
    return [{ id: targetId, targetValue, currentValue }];
  });
  if (updates.length === 0) throw new Error("暂无可更新的季度指标");

  const existingTargets = await prisma.annualGoalQuarterTarget.findMany({
    where: { id: { in: updates.map((target) => target.id) }, ...authorityQuarterWhere(metricId, sourceMetricId), deletedAt: null },
    select: { id: true, currentValue: true, targetValue: true, quarter: true },
  });
  if (existingTargets.length !== updates.length) throw new Error("季度指标不存在");
  const existingById = new Map(existingTargets.map((target) => [target.id, target]));
  const responsibleUserId = await resolveAnnualGoalResponsibleUserId({ metricId, sourceMetricId, teamOrgNodeId });

  const progressUpdatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.annualGoalQuarterTarget.update({
        where: { id: update.id },
        data: { targetValue: update.targetValue, currentValue: update.currentValue, progressUpdatedAt, updatedById: context.user.id },
      });
      await tx.annualGoalProgress.create({
        data: {
          metricId,
          sourceMetricId,
          quarterTargetId: update.id,
          updaterId: context.user.id,
          progressDate: progressUpdatedAt,
          completedValue: roundValue(update.currentValue - (existingById.get(update.id)?.currentValue ?? 0)),
          cumulativeValue: update.currentValue,
        },
      });
    }
    await syncAnnualGoalCurrentValues(tx, metricId, sourceMetricId, progressUpdatedAt, context.user.id);
  });

  for (const update of updates) {
    const existing = existingById.get(update.id);
    if (!existing || existing.targetValue === update.targetValue) continue;
    await emitAnnualGoalTargetChanged({
      planId: metric.planId,
      planName: metric.plan.name,
      year: metric.plan.year,
      departmentOrgNodeId: metric.plan.departmentOrgNodeId,
      metricId,
      metricName: sourceMetric?.name ?? metric.name,
      metricCode: sourceMetric?.metricCode ?? metric.metricCode,
      sourceMetricId,
      teamOrgNodeId,
      responsibleUserId,
      quarter: existing.quarter,
      previousTargetValue: existing.targetValue,
      targetValue: update.targetValue,
      unit: sourceMetric?.unit ?? metric.unit,
      fieldScope: "quarter",
    });
  }

  revalidateAnnualGoals();
}

export async function updateAnnualGoalWeeklyProgress(formData: FormData) {
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
  const rowCount = numberFromForm(formData.get("rowCount") || "0", "更新数量");
  const updates = Array.from({ length: rowCount }, (_, index) => {
    const targetId = formData.get(`targetId_${index}`) as string | null;
    if (!targetId) return null;
    const metricId = formData.get(`metricId_${index}`) as string;
    const sourceMetricId = (formData.get(`sourceMetricId_${index}`) as string) || null;
    const teamOrgNodeId = (formData.get(`teamOrgNodeId_${index}`) as string) || null;
    const weeklyIncrement = numberFromForm(formData.get(`weeklyIncrement_${index}`), "本周新增");
    if (!metricId) throw new Error("缺少指标项 ID");
    if (weeklyIncrement < 0) throw new Error("更新数值不能小于 0");
    return { id: targetId, metricId, sourceMetricId, teamOrgNodeId, weeklyIncrement };
  }).filter((update): update is { id: string; metricId: string; sourceMetricId: string | null; teamOrgNodeId: string | null; weeklyIncrement: number } => Boolean(update));

  if (updates.length === 0) throw new Error("暂无可更新的季度指标");
  if (new Set(updates.map((update) => update.id)).size !== updates.length) throw new Error("季度指标重复");

  const pairs = new Map<string, { metricId: string; sourceMetricId: string | null; teamOrgNodeId: string | null; updatedById?: string }>();
  for (const update of updates) {
    pairs.set(`${update.metricId}:${update.sourceMetricId ?? ""}`, { metricId: update.metricId, sourceMetricId: update.sourceMetricId, teamOrgNodeId: update.teamOrgNodeId });
  }
  for (const pair of pairs.values()) {
    const { context } = await assertQuarterProgressUpdatable(pair.metricId, pair.sourceMetricId, pair.teamOrgNodeId);
    pairs.set(`${pair.metricId}:${pair.sourceMetricId ?? ""}`, { ...pair, updatedById: context.user.id });
  }

  const existingTargets = await prisma.annualGoalQuarterTarget.findMany({
    where: { id: { in: updates.map((target) => target.id) }, quarter: currentQuarter, deletedAt: null },
    select: { id: true, metricId: true, sourceMetricId: true, currentValue: true },
  });
  const targetById = new Map(existingTargets.map((target) => [target.id, target]));
  const normalizedUpdates = updates.map((update) => {
    const target = targetById.get(update.id);
    if (!target || target.sourceMetricId !== update.sourceMetricId || (update.sourceMetricId ? target.metricId !== null : target.metricId !== update.metricId)) {
      throw new Error("季度指标不存在");
    }
    return { ...update, currentValue: Math.round(((target.currentValue ?? 0) + update.weeklyIncrement + Number.EPSILON) * 100) / 100 };
  });

  const progressUpdatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const update of normalizedUpdates) {
      const updaterId = pairs.get(`${update.metricId}:${update.sourceMetricId ?? ""}`)?.updatedById;
      if (!updaterId) throw new Error("缺少进度更新人");
      await tx.annualGoalQuarterTarget.update({
        where: { id: update.id },
        data: { weeklyIncrement: update.weeklyIncrement, currentValue: update.currentValue, progressUpdatedAt, updatedById: updaterId },
      });
      await tx.annualGoalProgress.create({
        data: {
          metricId: update.metricId,
          sourceMetricId: update.sourceMetricId,
          quarterTargetId: update.id,
          updaterId,
          progressDate: progressUpdatedAt,
          completedValue: update.weeklyIncrement,
          cumulativeValue: update.currentValue,
        },
      });
    }
    for (const pair of pairs.values()) {
      await syncAnnualGoalCurrentValues(tx, pair.metricId, pair.sourceMetricId, progressUpdatedAt, pair.updatedById);
    }
  });

  revalidateAnnualGoals();
}

export async function deleteAnnualGoalQuarterTargets(formData: FormData) {
  const metricId = formData.get("metricId") as string;
  const sourceMetricId = (formData.get("sourceMetricId") as string) || null;
  const teamOrgNodeId = (formData.get("teamOrgNodeId") as string) || null;
  if (!metricId) throw new Error("缺少季度指标 ID");

  const { context } = await assertQuarterTargetsManageable(metricId, sourceMetricId, teamOrgNodeId);

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.annualGoalQuarterTarget.updateMany({
      where: { ...authorityQuarterWhere(metricId, sourceMetricId), deletedAt: null },
      data: { deletedAt, updatedById: context.user.id },
    });
    await syncAnnualGoalCurrentValues(tx, metricId, sourceMetricId, deletedAt, context.user.id);
  });

  revalidateAnnualGoals();
}
