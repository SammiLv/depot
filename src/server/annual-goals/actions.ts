"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getAnnualGoalCapabilities, getAnnualGoalPermissionMapForUser, getAnnualGoalPlanPermissions, buildOrgScopeContext } from "@/server/organization/annual-goal-permissions";
import {
  findNearestDepartmentOrgNodeId,
  getDescendantOrgNodeIds,
  findOrgNodeById,
} from "@/server/organization/org-tree-utils";
import type { AnnualGoalOwnerType, AnnualMetricCalculationType, Prisma, RiskStatus } from "@prisma/client";

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
    departmentOrgNodeId: teamNode.parentId,
  };
}

function revalidateAnnualGoals() {
  revalidatePath("/annual-goals");
  revalidatePath("/dashboard");
}

async function getAnnualGoalActionContext() {
  const user = await requireCurrentUser();
  const permissionMap = await getAnnualGoalPermissionMapForUser(user);
  const capabilities = getAnnualGoalCapabilities(user.roleType, permissionMap);
  const orgScopeContext = await buildOrgScopeContext(user, capabilities);

  return {
    user,
    capabilities,
    orgScopeContext,
  };
}

function getScopedPlanPermissions(
  context: Awaited<ReturnType<typeof getAnnualGoalActionContext>>,
  plan: { ownerType: AnnualGoalOwnerType; departmentOrgNodeId: string | null; teamOrgNodeId: string | null; ownerOrgNodeId?: string | null; deletedAt?: Date | null }
) {
  return getAnnualGoalPlanPermissions(context.user, context.capabilities, {
    ownerType: plan.ownerType,
    ownerOrgNodeId: plan.ownerOrgNodeId ?? null,
    deletedAt: plan.deletedAt ?? null,
  }, context.orgScopeContext);
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

  if (context.user.roleType === "ADMIN") {
    if (!context.capabilities.canEditDepartmentPlans) {
      throw new Error("无权维护部门年度指标");
    }
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

  const orgScopeIds = scope.ownerOrgNodeId ? await getDescendantOrgNodeIds(scope.ownerOrgNodeId) : [];
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

async function resolveScopedTeams(ownerOrgNodeId: string | null) {
  if (!ownerOrgNodeId) return [];

  const scopedOrgNodeIds = new Set(await getDescendantOrgNodeIds(ownerOrgNodeId));
  if (scopedOrgNodeIds.size === 0) return [];

  const teams = await Promise.all(Array.from(scopedOrgNodeIds).map((orgNodeId) => findTeamRecordByOrgNodeId(orgNodeId)));
  return teams.filter((team): team is { id: string; name: string; departmentOrgNodeId: string | null; orgNodeId: string } => Boolean(team && team.departmentOrgNodeId));
}

async function resolveScopedTeamPlanIds(scope: {
  ownerOrgNodeId?: string | null;
  year: number;
  includeDeleted?: boolean;
}) {
  const ownerOrgScopeIds = scope.ownerOrgNodeId
    ? await getDescendantOrgNodeIds(scope.ownerOrgNodeId)
    : [];

  if (ownerOrgScopeIds.length === 0) {
    return [];
  }

  return prisma.annualGoalPlan.findMany({
    where: {
      ownerType: "TEAM",
      year: scope.year,
      ...(scope.includeDeleted ? {} : { deletedAt: null }),
      ownerOrgNodeId: { in: ownerOrgScopeIds },
    },
    select: { id: true, ownerOrgNodeId: true },
  });
}

function isSameDepartmentScope(
  left: { ownerOrgNodeId?: string | null },
  right: { ownerOrgNodeId?: string | null },
) {
  return left.ownerOrgNodeId === right.ownerOrgNodeId;
}

function buildAnnualGoalPlanName(ownerName: string, year: number) {
  return `${ownerName} ${year} 年度业绩指标`;
}

async function resolveOwner(
  context: Awaited<ReturnType<typeof getAnnualGoalActionContext>>,
  formData: FormData
) {
  const ownerType = formData.get("ownerType") as AnnualGoalOwnerType;
  const requestedDepartmentOrgNodeId = (formData.get("departmentOrgNodeId") as string) || null;
  const requestedTeamOrgNodeId = (formData.get("teamOrgNodeId") as string) || null;

  if (ownerType !== "DEPARTMENT" && ownerType !== "TEAM") throw new Error("请选择方案归属");

  if (ownerType === "DEPARTMENT") {
    const ownerOrgNodeId = requestedDepartmentOrgNodeId || await findNearestDepartmentOrgNodeId(context.user.orgNodeId);
    if (!ownerOrgNodeId) throw new Error("请选择所属部门");
    const departmentNode = await findOrgNodeById(ownerOrgNodeId);
    if (!departmentNode || departmentNode.nodeType !== "DEPARTMENT") throw new Error("所属部门无效");
    if (!canEditDepartmentScope(context, { departmentOrgNodeId: ownerOrgNodeId, ownerOrgNodeId })) throw new Error("无权维护该部门方案");
    return { ownerType, departmentOrgNodeId: ownerOrgNodeId, teamOrgNodeId: null, ownerOrgNodeId, ownerName: departmentNode.name };
  }

  const ownerOrgNodeId = requestedTeamOrgNodeId;
  if (!ownerOrgNodeId) throw new Error("请选择所属小组");
  const team = await findTeamRecordByOrgNodeId(ownerOrgNodeId);
  if (!team || !team.departmentOrgNodeId) throw new Error("小组不存在");
  if (!canEditTeamScope(context, { teamOrgNodeId: ownerOrgNodeId, departmentOrgNodeId: team.departmentOrgNodeId, ownerOrgNodeId })) throw new Error("无权维护该部门小组方案");
  return { ownerType, departmentOrgNodeId: team.departmentOrgNodeId, teamOrgNodeId: ownerOrgNodeId, ownerOrgNodeId, ownerName: team.name };
}

async function assertPlanEditable(planId: string) {
  const context = await getAnnualGoalActionContext();
  const plan = await prisma.annualGoalPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.deletedAt) throw new Error("年度方案不存在");

  if (plan.ownerType === "DEPARTMENT" && canEditDepartmentScope(context, { departmentOrgNodeId: plan.ownerOrgNodeId, ownerOrgNodeId: plan.ownerOrgNodeId })) {
    return { context, plan };
  }

  if (plan.ownerType === "TEAM" && canEditTeamScope(context, { teamOrgNodeId: plan.ownerOrgNodeId, departmentOrgNodeId: plan.ownerOrgNodeId ? await findNearestDepartmentOrgNodeId(plan.ownerOrgNodeId) : null, ownerOrgNodeId: plan.ownerOrgNodeId })) {
    return { context, plan };
  }

  throw new Error("无权维护该年度方案");
}

async function assertQuarterProgressUpdatable(metricId: string, sourceMetricId: string | null) {
  const context = await getAnnualGoalActionContext();
  const metric = await prisma.annualGoalMetric.findUnique({ where: { id: metricId }, include: { plan: true } });
  if (!metric || metric.deletedAt || metric.plan.deletedAt) throw new Error("指标项不存在");

  const sourceMetric = sourceMetricId
    ? await prisma.annualGoalMetricSource.findUnique({ where: { id: sourceMetricId }, include: { parentMetric: { include: { plan: true } } } })
    : null;
  if (sourceMetricId && (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetric.deletedAt || sourceMetric.parentMetric.plan.deletedAt)) {
    throw new Error("元指标不存在");
  }

  const departmentPlan = sourceMetric?.parentMetric.plan ?? metric.plan;
  if (sourceMetric && sourceMetric.parentMetricId !== metricId) {
    const selectedTeamMetric = await prisma.annualGoalMetric.findFirst({
      where: { id: metricId, sourceMetricId, deletedAt: null, plan: { deletedAt: null } },
      include: { plan: true },
    });
    if (!selectedTeamMetric) throw new Error("元指标不存在");
  }

  if (canUpdateDepartmentProgressScope(context, {
    departmentOrgNodeId: departmentPlan.ownerOrgNodeId,
    ownerOrgNodeId: departmentPlan.ownerOrgNodeId,
  })) {
    return { context, metric, sourceMetric };
  }

  if (!context.capabilities.canUpdateProgress) {
    throw new Error("无权更新该季度指标");
  }

  if (metric.plan.ownerType === "TEAM" && canUpdateTeamProgressScope(context, {
    teamOrgNodeId: metric.plan.ownerOrgNodeId,
    departmentOrgNodeId: metric.plan.ownerOrgNodeId ? await findNearestDepartmentOrgNodeId(metric.plan.ownerOrgNodeId) : null,
    ownerOrgNodeId: metric.plan.ownerOrgNodeId,
  })) {
    return { context, metric, sourceMetric };
  }

  if (metric.plan.ownerType === "DEPARTMENT") {
    throw new Error("无权更新该季度指标");
  }

  const currentUserOrgNode = await findOrgNodeById(context.user.orgNodeId);
  const currentUserTeamId = currentUserOrgNode?.nodeType === "TEAM" ? currentUserOrgNode.id : null;
  if (currentUserTeamId) {
    const teamPlan = await prisma.annualGoalPlan.findFirst({
      where: {
        ownerType: "TEAM",
        ownerOrgNodeId: currentUserTeamId,
        year: departmentPlan.year,
        deletedAt: null,
        metrics: {
          some: sourceMetricId
            ? { sourceMetricId, deletedAt: null }
            : { sourceMetricId: null, metricCode: metric.metricCode, deletedAt: null },
        },
      },
      select: { id: true },
    });
    if (teamPlan) return { context, metric, sourceMetric };
  }

  throw new Error("无权更新该季度指标");
}

async function syncAnnualGoalCurrentValues(tx: Prisma.TransactionClient, metricId: string, sourceMetricId: string | null, updatedAt: Date, updatedById?: string) {
  if (sourceMetricId) {
    const sourceCurrent = await tx.annualGoalQuarterTarget.aggregate({
      where: { metricId, sourceMetricId, deletedAt: null },
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

  const sources = await tx.annualGoalMetricSource.findMany({
    where: { parentMetricId: metricId, deletedAt: null },
    select: { currentValue: true },
  });
  if (sources.length > 0) {
    const currentValue = Math.round((sources.reduce((sum, source) => sum + source.currentValue, 0) + Number.EPSILON) * 100) / 100;
    await tx.annualGoalMetric.update({ where: { id: metricId }, data: { currentValue, progressUpdatedAt: updatedAt, ...(updatedById ? { updatedById } : {}) } });
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
  if (
    sourceMetric.parentMetric.plan.ownerType !== "DEPARTMENT"
    || !isSameDepartmentScope(sourceMetric.parentMetric.plan, scope)
  ) {
    throw new Error("只能选择本部门指标下的最细指标项");
  }

  return sourceMetric;
}

const sourceMetricTargetLimitMessage = "同一指标项下的所有元指标的目标数额总额不得大于指标项的目标总额，请重新填写。";
const quarterTargetLimitMessage = "季度指标的目标数额总额不得大于对应指标项/元指标的目标总额，请重新填写。";

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
  const count = await prisma.annualGoalMetric.count({ where: { sourceMetricId: null } });
  return `AG-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function generateSourceMetricCode(year: number) {
  const count = await prisma.annualGoalMetricSource.count();
  return `AGM-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function assertAnnualGoalPlanYearUnique(ownerOrgNodeId: string, year: number, excludePlanId?: string) {
  const existingPlan = await prisma.annualGoalPlan.findFirst({
    where: {
      ownerOrgNodeId,
      year,
      deletedAt: null,
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
  const ownerType = formData.get("ownerType") as AnnualGoalOwnerType;

  if (ownerType !== "DEPARTMENT" && ownerType !== "TEAM") throw new Error("请选择方案归属");

  if (!year || year < 2000 || year > 2100) throw new Error("年份不正确");

  const { departmentOrgNodeId, teamOrgNodeId, ownerOrgNodeId, ownerName } = await resolveOwner(context, formData);
  const name = buildAnnualGoalPlanName(ownerName, year);

  await assertAnnualGoalPlanYearUnique(ownerOrgNodeId, year);

  const teamOrgNodeIds = ownerType === "DEPARTMENT"
    ? (await resolveScopedTeams(ownerOrgNodeId)).map((team) => team.orgNodeId)
    : [];
  const uniqueTeamOrgNodeIds = Array.from(new Set(teamOrgNodeIds));

  if (ownerType === "DEPARTMENT" && uniqueTeamOrgNodeIds.length > 0) {
    await Promise.all(uniqueTeamOrgNodeIds.map((teamOrgNodeId) => assertAnnualGoalPlanYearUnique(teamOrgNodeId, year)));
  }

  await prisma.annualGoalPlan.create({
    data: {
      year,
      name,
      description,
      ownerType,
      createdById: context.user.id,
      ownerOrgNodeId,
    },
  });

  if (ownerType === "DEPARTMENT") {
    if (uniqueTeamOrgNodeIds.length > 0) {
      const teams = await resolveScopedTeams(ownerOrgNodeId);

      if (teams.length > 0) {
        await prisma.$transaction(
          teams.map((team) =>
            prisma.annualGoalPlan.create({
              data: {
                year,
                name: buildAnnualGoalPlanName(team.name, year),
                description: null,
                ownerType: "TEAM",
                createdById: context.user.id,
                ownerOrgNodeId: team.orgNodeId,
              },
            })
          )
        );
      }
    }
  }

  revalidateAnnualGoals();
}

export async function updateAnnualGoalPlan(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少方案 ID");
  const { context } = await assertPlanEditable(id);
  const year = numberFromForm(formData.get("year"), "年份");
  const description = optionalString(formData.get("description"));
  const { ownerType, departmentOrgNodeId, teamOrgNodeId, ownerOrgNodeId, ownerName } = await resolveOwner(context, formData);
  const name = buildAnnualGoalPlanName(ownerName, year);

  await assertAnnualGoalPlanYearUnique(ownerOrgNodeId, year, id);

  if (!year || year < 2000 || year > 2100) throw new Error("年份不正确");

  await prisma.annualGoalPlan.update({
    where: { id },
    data: { year, name, description, ownerType, ownerOrgNodeId },
  });

  if (ownerType === "DEPARTMENT") {
    const teams = await resolveScopedTeams(ownerOrgNodeId);
    const teamOrgNodeIds = teams.map((team) => team.orgNodeId);
    const existingTeamPlans = await resolveScopedTeamPlanIds({
      ownerOrgNodeId,
      year,
    });

    const existingTeamOrgNodeIds = new Set(existingTeamPlans.map((p) => p.ownerOrgNodeId).filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId)));
    const toRemove = existingTeamPlans.filter((p) => p.ownerOrgNodeId && !teamOrgNodeIds.includes(p.ownerOrgNodeId));
    if (toRemove.length > 0) {
      await prisma.annualGoalPlan.deleteMany({
        where: { id: { in: toRemove.map((p) => p.id) } },
      });
    }

    const toAdd = teams.filter((team) => !existingTeamOrgNodeIds.has(team.orgNodeId));
    if (toAdd.length > 0) {
      await Promise.all(toAdd.map((team) => assertAnnualGoalPlanYearUnique(team.orgNodeId, year)));
      await prisma.$transaction(
        toAdd.map((team) =>
          prisma.annualGoalPlan.create({
            data: {
              year,
              name: buildAnnualGoalPlanName(team.name, year),
              description: null,
              ownerType: "TEAM",
              createdById: context.user.id,
              ownerOrgNodeId: team.orgNodeId,
            },
          })
        )
      );
    }
  }

  revalidateAnnualGoals();
}

export async function deleteAnnualGoalPlan(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少方案 ID");

  const { plan } = await assertPlanEditable(id);
  if (plan.ownerType !== "DEPARTMENT") throw new Error("仅部门方案支持删除");

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.annualGoalPlan.update({
      where: { id },
      data: { isActive: false, deletedAt },
    });

    const metrics = await tx.annualGoalMetric.findMany({
      where: { planId: id, deletedAt: null },
      select: { id: true, metricCode: true },
    });

    if (metrics.length === 0) return;

    const metricIds = metrics.map((metric) => metric.id);
    const metricCodes = Array.from(new Set(metrics.map((metric) => metric.metricCode)));
    const teamPlanIds = (await resolveScopedTeamPlanIds({
      ownerOrgNodeId: plan.ownerOrgNodeId,
      year: plan.year,
    })).map((teamPlan) => teamPlan.id);
    const teamMetrics = teamPlanIds.length > 0
      ? await tx.annualGoalMetric.findMany({
          where: {
            deletedAt: null,
            planId: { in: teamPlanIds },
            OR: [
              { sourceMetric: { parentMetricId: { in: metricIds } } },
              { sourceMetricId: null, metricCode: { in: metricCodes } },
            ],
          },
          select: { id: true },
        })
      : [];
    const teamMetricIds = teamMetrics.map((metric) => metric.id);

    await tx.annualGoalMetric.updateMany({ where: { id: { in: metricIds }, deletedAt: null }, data: { deletedAt } });
    if (teamMetricIds.length > 0) {
      await tx.annualGoalMetric.updateMany({ where: { id: { in: teamMetricIds }, deletedAt: null }, data: { deletedAt } });
    }

    const sourceMetricIds = (await tx.annualGoalMetricSource.findMany({
      where: { parentMetricId: { in: metricIds }, deletedAt: null },
      select: { id: true },
    })).map((s) => s.id);

    await tx.annualGoalMetricSource.updateMany({ where: { parentMetricId: { in: metricIds }, deletedAt: null }, data: { deletedAt } });
    await tx.annualGoalQuarterTarget.updateMany({ where: { metricId: { in: metricIds }, deletedAt: null }, data: { deletedAt } });
    if (sourceMetricIds.length > 0) {
      await tx.annualGoalQuarterTarget.updateMany({ where: { sourceMetricId: { in: sourceMetricIds }, deletedAt: null }, data: { deletedAt } });
    }
    if (teamMetricIds.length > 0) {
      await tx.annualGoalQuarterTarget.updateMany({ where: { metricId: { in: teamMetricIds }, deletedAt: null }, data: { deletedAt } });
    }
  });

  revalidateAnnualGoals();
}

export async function createAnnualGoalMetric(formData: FormData) {
  const planId = formData.get("planId") as string;
  if (!planId) throw new Error("缺少方案 ID");
  const { context, plan } = await assertPlanEditable(planId);

  const sourceMetricId = (formData.get("sourceMetricId") as string) || null;
  const parentMetricId = (formData.get("parentMetricId") as string) || null;
  const responsibleUserIdInput = (formData.get("responsibleUserId") as string) || null;
  const weight = numberFromForm(formData.get("weight"), "权重");

  if (weight < 0) throw new Error("数值不能小于 0");
  await assertWeightWithinLimit(planId, weight);

  if (plan.ownerType === "TEAM") {
    if (!!sourceMetricId === !!parentMetricId) throw new Error("请选择一个指标项或元指标");
    const responsibleUserId = await resolveTeamResponsibleUserId(responsibleUserIdInput, {
      departmentOrgNodeId: plan.ownerOrgNodeId,
      teamOrgNodeId: plan.ownerOrgNodeId,
      ownerOrgNodeId: plan.ownerOrgNodeId,
    });

    if (sourceMetricId) {
      const sourceMetric = await assertSourceMetricAvailable(sourceMetricId, {
        departmentOrgNodeId: plan.ownerOrgNodeId,
        ownerOrgNodeId: plan.ownerOrgNodeId,
      });
      await prisma.annualGoalMetric.create({
        data: {
          planId,
          sourceMetricId,
          metricCode: sourceMetric.metricCode,
          name: sourceMetric.name,
          description: sourceMetric.description,
          targetValue: sourceMetric.targetValue,
          currentValue: sourceMetric.currentValue,
          unit: sourceMetric.unit,
          weight,
          calculationType: sourceMetric.calculationType,
          riskStatus: sourceMetric.riskStatus,
          responsibleUserId,
          createdById: plan.createdById,
          updatedById: context.user.id,
        },
      });
      revalidateAnnualGoals();
      return;
    }

    if (!parentMetricId) throw new Error("请选择指标项或元指标");
    const parentMetric = await prisma.annualGoalMetric.findUnique({ where: { id: parentMetricId }, include: { plan: true } });
    if (!parentMetric || parentMetric.deletedAt || parentMetric.plan.deletedAt) throw new Error("指标项不存在");
    if (
      parentMetric.plan.ownerType !== "DEPARTMENT"
      || !isSameDepartmentScope(parentMetric.plan, plan)
    ) throw new Error("只能选择本部门指标项");

    await prisma.annualGoalMetric.create({
      data: {
        planId,
        metricCode: parentMetric.metricCode,
        name: parentMetric.name,
        description: parentMetric.description,
        targetValue: parentMetric.targetValue,
        currentValue: parentMetric.currentValue,
        unit: parentMetric.unit,
        weight,
        calculationType: parentMetric.calculationType,
        riskStatus: parentMetric.riskStatus,
        responsibleUserId,
        createdById: parentMetric.createdById,
        updatedById: context.user.id,
      },
    });
    revalidateAnnualGoals();
    return;
  }

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

  const metricCode = await generateMetricCode(plan.year);
  await prisma.annualGoalMetric.create({
    data: { planId, metricCode, name, description, targetValue, currentValue, unit, weight, calculationType, riskStatus, createdById: context.user.id },
  });

  revalidateAnnualGoals();
}

export async function updateAnnualGoalMetric(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少指标 ID");

  const metric = await prisma.annualGoalMetric.findUnique({ where: { id }, include: { plan: true } });
  if (!metric || metric.deletedAt) throw new Error("指标不存在");
  const { context } = await assertPlanEditable(metric.planId);

  const responsibleUserIdInput = (formData.get("responsibleUserId") as string) || null;
  const weight = numberFromForm(formData.get("weight"), "权重");
  if (weight < 0) throw new Error("数值不能小于 0");
  await assertWeightWithinLimit(metric.planId, weight, id);

  const adjustedAt = new Date();

  if (metric.plan.ownerType === "TEAM") {
    const responsibleUserId = await resolveTeamResponsibleUserId(responsibleUserIdInput, {
      departmentOrgNodeId: metric.plan.ownerOrgNodeId ? await findNearestDepartmentOrgNodeId(metric.plan.ownerOrgNodeId) : null,
      teamOrgNodeId: metric.plan.ownerOrgNodeId,
      ownerOrgNodeId: metric.plan.ownerOrgNodeId,
    });
    await prisma.annualGoalMetric.update({ where: { id }, data: { responsibleUserId, weight, adjustedAt, updatedById: context.user.id } });
    revalidateAnnualGoals();
    return;
  }

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

  await prisma.$transaction(async (tx) => {
    await tx.annualGoalMetric.update({
      where: { id },
      data: { name, description, targetValue, currentValue, unit, weight, calculationType, riskStatus, adjustedAt, updatedById: context.user.id },
    });
    if (metric.sourceMetricId) {
      await tx.annualGoalMetricSource.update({
        where: { id: metric.sourceMetricId },
        data: { name, description, targetValue, currentValue, unit, calculationType, riskStatus, updatedById: context.user.id },
      });
      const siblingMetrics = await tx.annualGoalMetric.findMany({
        where: { sourceMetricId: metric.sourceMetricId, id: { not: id } },
        select: { id: true },
      });
      await tx.annualGoalMetric.updateMany({
        where: { sourceMetricId: metric.sourceMetricId, id: { not: id } },
        data: { name, description, targetValue, currentValue, unit, calculationType, riskStatus, updatedById: context.user.id },
      });
      await tx.annualGoalQuarterTarget.updateMany({
        where: { metricId: { in: [id, ...siblingMetrics.map((item) => item.id)] }, deletedAt: null },
        data: { updatedById: context.user.id },
      });
      return;
    }

    const childSources = await tx.annualGoalMetricSource.findMany({
      where: { parentMetricId: id, deletedAt: null },
      select: { id: true },
    });
    if (childSources.length === 0) return;

    const childSourceIds = childSources.map((source) => source.id);
    const linkedMetrics = await tx.annualGoalMetric.findMany({
      where: { sourceMetricId: { in: childSourceIds }, deletedAt: null },
      select: { id: true },
    });

    await tx.annualGoalMetricSource.updateMany({
      where: { parentMetricId: id, deletedAt: null },
      data: { unit, updatedById: context.user.id },
    });
    await tx.annualGoalMetric.updateMany({
      where: { sourceMetricId: { in: childSourceIds }, deletedAt: null },
      data: { unit, updatedById: context.user.id },
    });
    await tx.annualGoalQuarterTarget.updateMany({
      where: {
        OR: [
          { metricId: { in: linkedMetrics.map((item) => item.id) } },
          { sourceMetricId: { in: childSourceIds } },
        ],
        deletedAt: null,
      },
      data: { updatedById: context.user.id },
    });
  });

  revalidateAnnualGoals();
}

export async function createAnnualGoalMetricSource(formData: FormData) {
  const parentMetricId = formData.get("parentMetricId") as string;
  if (!parentMetricId) throw new Error("缺少部门指标 ID");
  const context = await requireAnnualGoalDepartmentEditor();

  const parentMetric = await prisma.annualGoalMetric.findUnique({ where: { id: parentMetricId }, include: { plan: true } });
  if (!parentMetric || parentMetric.deletedAt || parentMetric.plan.deletedAt || parentMetric.plan.ownerType !== "DEPARTMENT") {
    throw new Error("部门指标不存在");
  }
  if (!canEditDepartmentScope(context, { departmentOrgNodeId: parentMetric.plan.ownerOrgNodeId, ownerOrgNodeId: parentMetric.plan.ownerOrgNodeId })) {
    throw new Error("无权维护该部门指标元数据");
  }

  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const targetValue = numberFromForm(formData.get("targetValue"), "目标值");
  const currentValue = numberFromForm(formData.get("currentValue") || "0", "当前值");
  const unit = (formData.get("unit") as string)?.trim() || parentMetric.unit;
  const calculationType = formData.get("calculationType") as AnnualMetricCalculationType;
  const riskStatus = formData.get("riskStatus") as RiskStatus;
  const responsibleUserId = await resolveDepartmentResponsibleUserId((formData.get("responsibleUserId") as string) || null, {
    departmentOrgNodeId: parentMetric.plan.ownerOrgNodeId,
    ownerOrgNodeId: parentMetric.plan.ownerOrgNodeId,
  });

  if (!name || !unit) throw new Error("指标名称和单位为必填项");
  if (targetValue < 0 || currentValue < 0) throw new Error("数值不能小于 0");
  if (!calculationTypes.includes(calculationType as (typeof calculationTypes)[number])) throw new Error("计算方式不正确");
  if (!riskStatuses.includes(riskStatus as (typeof riskStatuses)[number])) throw new Error("风险状态不正确");
  await assertSourceMetricTargetWithinLimit(parentMetricId, targetValue);

  const metricCode = await generateSourceMetricCode(parentMetric.plan.year);
  await prisma.annualGoalMetricSource.create({
    data: { parentMetricId, metricCode, name, description, targetValue, currentValue, unit, calculationType, riskStatus, responsibleUserId, createdById: context.user.id },
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
  if (!canEditDepartmentScope(context, { departmentOrgNodeId: sourceMetric.parentMetric.plan.ownerOrgNodeId, ownerOrgNodeId: sourceMetric.parentMetric.plan.ownerOrgNodeId })) {
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
    departmentOrgNodeId: sourceMetric.parentMetric.plan.ownerOrgNodeId,
    ownerOrgNodeId: sourceMetric.parentMetric.plan.ownerOrgNodeId,
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
      data: { name, description, targetValue, currentValue, unit, calculationType, riskStatus, responsibleUserId, adjustedAt, updatedById: context.user.id },
    });
    await tx.annualGoalMetric.updateMany({
      where: { sourceMetricId: id, deletedAt: null },
      data: {
        name,
        description,
        targetValue: normalizedTargetValue,
        currentValue: normalizedCurrentValue,
        unit,
        calculationType,
        riskStatus,
        adjustedAt,
        updatedById: context.user.id,
      },
    });
    await tx.annualGoalQuarterTarget.updateMany({
      where: { sourceMetricId: id, deletedAt: null },
      data: { updatedById: context.user.id },
    });
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
  if (!canEditDepartmentScope(context, { departmentOrgNodeId: sourceMetric.parentMetric.plan.ownerOrgNodeId, ownerOrgNodeId: sourceMetric.parentMetric.plan.ownerOrgNodeId })) {
    throw new Error("无权删除该元指标");
  }

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.annualGoalMetricSource.update({ where: { id }, data: { deletedAt } });
    await tx.annualGoalMetric.updateMany({ where: { sourceMetricId: id, deletedAt: null }, data: { deletedAt } });
    await tx.annualGoalQuarterTarget.updateMany({ where: { sourceMetricId: id, deletedAt: null }, data: { deletedAt } });
  });

  revalidateAnnualGoals();
}

export async function deleteAnnualGoalMetric(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少指标 ID");

  const metric = await prisma.annualGoalMetric.findUnique({ where: { id }, include: { plan: true } });
  if (!metric || metric.deletedAt) throw new Error("指标不存在");
  const { context } = await assertPlanEditable(metric.planId);

  if (metric.plan.ownerType === "TEAM") {
    await prisma.annualGoalMetric.update({ where: { id }, data: { deletedAt: new Date(), updatedById: context.user.id } });
    revalidateAnnualGoals();
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.annualGoalMetric.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.annualGoalMetricSource.updateMany({ where: { parentMetricId: id }, data: { deletedAt: new Date() } });
    await tx.annualGoalMetric.updateMany({
      where: { sourceMetric: { parentMetricId: id }, id: { not: id } },
      data: { deletedAt: new Date() },
    });
  });
  revalidateAnnualGoals();
}

export async function saveAnnualGoalQuarterTargets(formData: FormData) {
  const metricId = formData.get("metricId") as string;
  const sourceMetricId = (formData.get("sourceMetricId") as string) || null;
  if (!metricId) throw new Error("请选择指标项");

  const metric = await prisma.annualGoalMetric.findUnique({ where: { id: metricId }, include: { plan: true } });
  if (!metric || metric.deletedAt || metric.plan.deletedAt) throw new Error("指标项不存在");
  const { context } = await assertPlanEditable(metric.planId);

  if (sourceMetricId) {
    const sourceMetric = await prisma.annualGoalMetricSource.findUnique({ where: { id: sourceMetricId } });
    if (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetricId !== metricId) throw new Error("元指标不存在");
  }

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

  const adjustedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.annualGoalQuarterTarget.updateMany({
      where: { metricId, sourceMetricId, deletedAt: null },
      data: { deletedAt: adjustedAt },
    });
    if (targets.length > 0) {
      await tx.annualGoalQuarterTarget.createMany({
        data: targets.map((target) => ({
          metricId,
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
  });

  revalidateAnnualGoals();
}

export async function updateAnnualGoalQuarterProgress(formData: FormData) {
  const metricId = formData.get("metricId") as string;
  const sourceMetricId = (formData.get("sourceMetricId") as string) || null;
  if (!metricId) throw new Error("缺少季度指标 ID");

  const { context, metric } = await assertQuarterProgressUpdatable(metricId, sourceMetricId);

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
    where: { id: { in: updates.map((target) => target.id) }, metricId, sourceMetricId, deletedAt: null },
    select: { id: true },
  });
  if (existingTargets.length !== updates.length) throw new Error("季度指标不存在");

  const progressUpdatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.annualGoalQuarterTarget.update({
        where: { id: update.id },
        data: { targetValue: update.targetValue, currentValue: update.currentValue, progressUpdatedAt, updatedById: context.user.id },
      });
    }
    await syncAnnualGoalCurrentValues(tx, metricId, sourceMetricId, progressUpdatedAt, context.user.id);
  });

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
    const weeklyIncrement = numberFromForm(formData.get(`weeklyIncrement_${index}`), "本周新增");
    const currentValue = numberFromForm(formData.get(`currentValue_${index}`), "本季度当前值");
    if (!metricId) throw new Error("缺少指标项 ID");
    if (weeklyIncrement < 0 || currentValue < 0) throw new Error("更新数值不能小于 0");
    return { id: targetId, metricId, sourceMetricId, weeklyIncrement, currentValue };
  }).filter((update): update is { id: string; metricId: string; sourceMetricId: string | null; weeklyIncrement: number; currentValue: number } => Boolean(update));

  if (updates.length === 0) throw new Error("暂无可更新的季度指标");
  if (new Set(updates.map((update) => update.id)).size !== updates.length) throw new Error("季度指标重复");

  const pairs = new Map<string, { metricId: string; sourceMetricId: string | null; updatedById?: string }>();
  for (const update of updates) {
    pairs.set(`${update.metricId}:${update.sourceMetricId ?? ""}`, { metricId: update.metricId, sourceMetricId: update.sourceMetricId });
  }
  for (const pair of pairs.values()) {
    const { context } = await assertQuarterProgressUpdatable(pair.metricId, pair.sourceMetricId);
    pairs.set(`${pair.metricId}:${pair.sourceMetricId ?? ""}`, { metricId: pair.metricId, sourceMetricId: pair.sourceMetricId, updatedById: context.user.id });
  }

  const existingTargets = await prisma.annualGoalQuarterTarget.findMany({
    where: { id: { in: updates.map((target) => target.id) }, quarter: currentQuarter, deletedAt: null },
    select: { id: true, metricId: true, sourceMetricId: true },
  });
  const targetById = new Map(existingTargets.map((target) => [target.id, target]));
  for (const update of updates) {
    const target = targetById.get(update.id);
    if (!target || target.metricId !== update.metricId || target.sourceMetricId !== update.sourceMetricId) {
      throw new Error("季度指标不存在");
    }
  }

  const progressUpdatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.annualGoalQuarterTarget.update({
        where: { id: update.id },
        data: { weeklyIncrement: update.weeklyIncrement, currentValue: update.currentValue, progressUpdatedAt, updatedById: pairs.get(`${update.metricId}:${update.sourceMetricId ?? ""}`)?.updatedById },
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
  if (!metricId) throw new Error("缺少季度指标 ID");

  const metric = await prisma.annualGoalMetric.findUnique({ where: { id: metricId }, include: { plan: true } });
  if (!metric || metric.deletedAt || metric.plan.deletedAt) throw new Error("指标项不存在");
  const { context } = await assertPlanEditable(metric.planId);

  if (sourceMetricId) {
    const sourceMetric = await prisma.annualGoalMetricSource.findUnique({ where: { id: sourceMetricId } });
    if (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetricId !== metricId) throw new Error("元指标不存在");
  }

  await prisma.annualGoalQuarterTarget.updateMany({
    where: { metricId, sourceMetricId, deletedAt: null },
    data: { deletedAt: new Date(), updatedById: context.user.id },
  });

  revalidateAnnualGoals();
}
