"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import type { AnnualGoalOwnerType, AnnualMetricCalculationType, Prisma, RiskStatus } from "@prisma/client";

const editableRoles = ["ADMIN", "DEPARTMENT_MANAGER"] as const;
const calculationTypes = ["RATIO", "BOOLEAN", "MANUAL_SCORE"] as const;
const riskStatuses = ["NORMAL", "SLIGHT_DELAY", "RISK", "COMPLETED"] as const;

function revalidateAnnualGoals() {
  revalidatePath("/annual-goals");
  revalidatePath("/dashboard");
}

async function requireAnnualGoalEditor() {
  const user = await requireCurrentUser();
  if (!editableRoles.includes(user.roleType as (typeof editableRoles)[number])) {
    throw new Error("仅管理员或部门主管可维护年度指标");
  }
  return user;
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

async function resolveResponsibleUserId(
  responsibleUserId: string | null,
  scope: { departmentId: string | null; teamId?: string | null },
  emptyMessage: string
) {
  if (!responsibleUserId) return null;

  const user = await prisma.user.findFirst({
    where: {
      id: responsibleUserId,
      isActive: true,
      deletedAt: null,
      departmentId: scope.departmentId,
      ...(scope.teamId ? { teamId: scope.teamId } : {}),
    },
    select: { id: true },
  });

  if (!user) throw new Error(emptyMessage);
  return user.id;
}

async function resolveDepartmentResponsibleUserId(responsibleUserId: string | null, departmentId: string | null) {
  return resolveResponsibleUserId(responsibleUserId, { departmentId }, "负责人必须为本部门成员");
}

async function resolveTeamResponsibleUserId(responsibleUserId: string | null, departmentId: string | null, teamId: string | null) {
  return resolveResponsibleUserId(responsibleUserId, { departmentId, teamId }, "负责人必须为本小组成员");
}

async function resolveOwner(user: Awaited<ReturnType<typeof requireCurrentUser>>, formData: FormData) {
  const ownerType = formData.get("ownerType") as AnnualGoalOwnerType;
  const requestedDepartmentId = (formData.get("departmentId") as string) || null;
  const requestedTeamId = (formData.get("teamId") as string) || null;

  if (ownerType !== "DEPARTMENT" && ownerType !== "TEAM") throw new Error("请选择方案归属");

  if (ownerType === "DEPARTMENT") {
    const departmentId = user.roleType === "ADMIN" ? requestedDepartmentId : user.departmentId;
    if (!departmentId) throw new Error("请选择所属部门");
    if (user.roleType === "DEPARTMENT_MANAGER" && departmentId !== user.departmentId) throw new Error("无权维护其他部门方案");
    return { ownerType, departmentId, teamId: null };
  }

  const teamId = requestedTeamId;
  if (!teamId) throw new Error("请选择所属小组");
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new Error("小组不存在");
  if (user.roleType === "DEPARTMENT_MANAGER" && team.departmentId !== user.departmentId) throw new Error("无权维护其他部门小组方案");
  return { ownerType, departmentId: team.departmentId, teamId };
}

async function assertPlanEditable(planId: string) {
  const user = await requireAnnualGoalEditor();
  const plan = await prisma.annualGoalPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.deletedAt) throw new Error("年度方案不存在");
  if (user.roleType === "DEPARTMENT_MANAGER" && plan.departmentId !== user.departmentId) {
    throw new Error("无权维护该年度方案");
  }
  return { user, plan };
}

async function assertQuarterProgressUpdatable(metricId: string, sourceMetricId: string | null) {
  const user = await requireCurrentUser();
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

  const isManagerScope = user.roleType === "ADMIN" || (user.roleType === "DEPARTMENT_MANAGER" && departmentPlan.departmentId === user.departmentId);
  if (isManagerScope) return { metric, sourceMetric };

  if (user.teamId) {
    const teamPlan = await prisma.annualGoalPlan.findFirst({
      where: {
        ownerType: "TEAM",
        teamId: user.teamId,
        departmentId: departmentPlan.departmentId,
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
    if (teamPlan) return { metric, sourceMetric };
  }

  throw new Error("无权更新该季度指标");
}

async function syncAnnualGoalCurrentValues(tx: Prisma.TransactionClient, metricId: string, sourceMetricId: string | null, updatedAt: Date) {
  if (sourceMetricId) {
    const sourceCurrent = await tx.annualGoalQuarterTarget.aggregate({
      where: { metricId, sourceMetricId, deletedAt: null },
      _sum: { currentValue: true },
    });
    await tx.annualGoalMetricSource.update({
      where: { id: sourceMetricId },
      data: { currentValue: Math.round(((sourceCurrent._sum.currentValue ?? 0) + Number.EPSILON) * 100) / 100, progressUpdatedAt: updatedAt },
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
      data: { currentValue: Math.round(((metricCurrent._sum.currentValue ?? 0) + Number.EPSILON) * 100) / 100, progressUpdatedAt: updatedAt },
    });
    return;
  }

  const sources = await tx.annualGoalMetricSource.findMany({
    where: { parentMetricId: metricId, deletedAt: null },
    select: { currentValue: true },
  });
  if (sources.length > 0) {
    const currentValue = Math.round((sources.reduce((sum, source) => sum + source.currentValue, 0) + Number.EPSILON) * 100) / 100;
    await tx.annualGoalMetric.update({ where: { id: metricId }, data: { currentValue, progressUpdatedAt: updatedAt } });
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

async function assertSourceMetricAvailable(sourceMetricId: string, departmentId: string | null) {
  const sourceMetric = await prisma.annualGoalMetricSource.findUnique({
    where: { id: sourceMetricId },
    include: { parentMetric: { include: { plan: true } } },
  });
  if (!sourceMetric || sourceMetric.deletedAt) throw new Error("指标元数据不存在");
  if (sourceMetric.parentMetric.deletedAt || sourceMetric.parentMetric.plan.deletedAt) throw new Error("指标元数据不可用");
  if (sourceMetric.parentMetric.plan.ownerType !== "DEPARTMENT" || sourceMetric.parentMetric.plan.departmentId !== departmentId) {
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

export async function createAnnualGoalPlan(formData: FormData) {
  const user = await requireAnnualGoalEditor();
  const year = numberFromForm(formData.get("year"), "年份");
  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const { ownerType, departmentId, teamId } = await resolveOwner(user, formData);

  if (!year || year < 2000 || year > 2100) throw new Error("年份不正确");
  if (!name) throw new Error("方案名称为必填项");

  await prisma.annualGoalPlan.create({
    data: {
      year,
      name,
      description,
      ownerType,
      departmentId,
      teamId,
      createdById: user.id,
    },
  });

  revalidateAnnualGoals();
}

export async function updateAnnualGoalPlan(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少方案 ID");
  const { user } = await assertPlanEditable(id);
  const year = numberFromForm(formData.get("year"), "年份");
  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const { ownerType, departmentId, teamId } = await resolveOwner(user, formData);

  if (!year || year < 2000 || year > 2100) throw new Error("年份不正确");
  if (!name) throw new Error("方案名称为必填项");

  await prisma.annualGoalPlan.update({
    where: { id },
    data: { year, name, description, ownerType, departmentId, teamId },
  });

  revalidateAnnualGoals();
}

export async function archiveAnnualGoalPlan(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少方案 ID");
  await assertPlanEditable(id);

  await prisma.annualGoalPlan.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  revalidateAnnualGoals();
}

export async function restoreAnnualGoalPlan(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少方案 ID");
  const user = await requireAnnualGoalEditor();
  const plan = await prisma.annualGoalPlan.findUnique({ where: { id } });
  if (!plan || !plan.deletedAt) throw new Error("历史方案不存在");
  if (user.roleType === "DEPARTMENT_MANAGER" && plan.departmentId !== user.departmentId) {
    throw new Error("无权恢复该年度方案");
  }

  await prisma.annualGoalPlan.update({
    where: { id },
    data: { deletedAt: null },
  });

  revalidateAnnualGoals();
}

export async function createAnnualGoalMetric(formData: FormData) {
  const planId = formData.get("planId") as string;
  if (!planId) throw new Error("缺少方案 ID");
  const { plan } = await assertPlanEditable(planId);

  const sourceMetricId = (formData.get("sourceMetricId") as string) || null;
  const parentMetricId = (formData.get("parentMetricId") as string) || null;
  const responsibleUserIdInput = (formData.get("responsibleUserId") as string) || null;
  const weight = numberFromForm(formData.get("weight"), "权重");

  if (weight < 0) throw new Error("数值不能小于 0");
  await assertWeightWithinLimit(planId, weight);

  if (plan.ownerType === "TEAM") {
    if (!!sourceMetricId === !!parentMetricId) throw new Error("请选择一个指标项或元指标");
    const responsibleUserId = await resolveTeamResponsibleUserId(responsibleUserIdInput, plan.departmentId, plan.teamId);

    if (sourceMetricId) {
      const sourceMetric = await assertSourceMetricAvailable(sourceMetricId, plan.departmentId);
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
        },
      });
      revalidateAnnualGoals();
      return;
    }

    if (!parentMetricId) throw new Error("请选择指标项或元指标");
    const parentMetric = await prisma.annualGoalMetric.findUnique({ where: { id: parentMetricId }, include: { plan: true } });
    if (!parentMetric || parentMetric.deletedAt || parentMetric.plan.deletedAt) throw new Error("指标项不存在");
    if (parentMetric.plan.ownerType !== "DEPARTMENT" || parentMetric.plan.departmentId !== plan.departmentId) throw new Error("只能选择本部门指标项");

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
    data: { planId, metricCode, name, description, targetValue, currentValue, unit, weight, calculationType, riskStatus },
  });

  revalidateAnnualGoals();
}

export async function updateAnnualGoalMetric(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少指标 ID");

  const metric = await prisma.annualGoalMetric.findUnique({ where: { id }, include: { plan: true } });
  if (!metric || metric.deletedAt) throw new Error("指标不存在");
  await assertPlanEditable(metric.planId);

  const responsibleUserIdInput = (formData.get("responsibleUserId") as string) || null;
  const weight = numberFromForm(formData.get("weight"), "权重");
  if (weight < 0) throw new Error("数值不能小于 0");
  await assertWeightWithinLimit(metric.planId, weight, id);

  const adjustedAt = new Date();

  if (metric.plan.ownerType === "TEAM") {
    const responsibleUserId = await resolveTeamResponsibleUserId(responsibleUserIdInput, metric.plan.departmentId, metric.plan.teamId);
    await prisma.annualGoalMetric.update({ where: { id }, data: { responsibleUserId, weight, adjustedAt } });
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

  await prisma.$transaction(async (tx) => {
    await tx.annualGoalMetric.update({
      where: { id },
      data: { name, description, targetValue, currentValue, unit, weight, calculationType, riskStatus, adjustedAt },
    });
    if (metric.sourceMetricId) {
      await tx.annualGoalMetricSource.update({
        where: { id: metric.sourceMetricId },
        data: { name, description, targetValue, currentValue, unit, calculationType, riskStatus },
      });
      await tx.annualGoalMetric.updateMany({
        where: { sourceMetricId: metric.sourceMetricId, id: { not: id } },
        data: { name, description, targetValue, currentValue, unit, calculationType, riskStatus },
      });
    }
  });

  revalidateAnnualGoals();
}

export async function createAnnualGoalMetricSource(formData: FormData) {
  const parentMetricId = formData.get("parentMetricId") as string;
  if (!parentMetricId) throw new Error("缺少部门指标 ID");
  const user = await requireAnnualGoalEditor();

  const parentMetric = await prisma.annualGoalMetric.findUnique({ where: { id: parentMetricId }, include: { plan: true } });
  if (!parentMetric || parentMetric.deletedAt || parentMetric.plan.deletedAt || parentMetric.plan.ownerType !== "DEPARTMENT") {
    throw new Error("部门指标不存在");
  }
  if (user.roleType === "DEPARTMENT_MANAGER" && parentMetric.plan.departmentId !== user.departmentId) {
    throw new Error("无权维护该部门指标元数据");
  }

  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const targetValue = numberFromForm(formData.get("targetValue"), "目标值");
  const currentValue = numberFromForm(formData.get("currentValue") || "0", "当前值");
  const unit = (formData.get("unit") as string)?.trim();
  const calculationType = formData.get("calculationType") as AnnualMetricCalculationType;
  const riskStatus = formData.get("riskStatus") as RiskStatus;
  const responsibleUserId = await resolveDepartmentResponsibleUserId((formData.get("responsibleUserId") as string) || null, parentMetric.plan.departmentId);

  if (!name || !unit) throw new Error("指标名称和单位为必填项");
  if (targetValue < 0 || currentValue < 0) throw new Error("数值不能小于 0");
  if (!calculationTypes.includes(calculationType as (typeof calculationTypes)[number])) throw new Error("计算方式不正确");
  if (!riskStatuses.includes(riskStatus as (typeof riskStatuses)[number])) throw new Error("风险状态不正确");
  await assertSourceMetricTargetWithinLimit(parentMetricId, targetValue);

  const metricCode = await generateSourceMetricCode(parentMetric.plan.year);
  await prisma.annualGoalMetricSource.create({
    data: { parentMetricId, metricCode, name, description, targetValue, currentValue, unit, calculationType, riskStatus, responsibleUserId, createdById: user.id },
  });

  revalidateAnnualGoals();
}

export async function updateAnnualGoalMetricSource(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少元指标 ID");
  const user = await requireAnnualGoalEditor();

  const sourceMetric = await prisma.annualGoalMetricSource.findUnique({ where: { id }, include: { parentMetric: { include: { plan: true } } } });
  if (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetric.deletedAt || sourceMetric.parentMetric.plan.deletedAt) {
    throw new Error("元指标不存在");
  }
  if (user.roleType === "DEPARTMENT_MANAGER" && sourceMetric.parentMetric.plan.departmentId !== user.departmentId) {
    throw new Error("无权维护该元指标");
  }

  const name = (formData.get("name") as string)?.trim();
  const description = optionalString(formData.get("description"));
  const targetValue = numberFromForm(formData.get("targetValue"), "目标值");
  const currentValue = numberFromForm(formData.get("currentValue") || "0", "当前值");
  const unit = (formData.get("unit") as string)?.trim();
  const calculationType = formData.get("calculationType") as AnnualMetricCalculationType;
  const riskStatus = formData.get("riskStatus") as RiskStatus;
  const responsibleUserId = await resolveDepartmentResponsibleUserId((formData.get("responsibleUserId") as string) || null, sourceMetric.parentMetric.plan.departmentId);

  if (!name || !unit) throw new Error("元指标名称和单位为必填项");
  if (targetValue < 0 || currentValue < 0) throw new Error("数值不能小于 0");
  if (!calculationTypes.includes(calculationType as (typeof calculationTypes)[number])) throw new Error("计算方式不正确");
  if (!riskStatuses.includes(riskStatus as (typeof riskStatuses)[number])) throw new Error("风险状态不正确");
  await assertSourceMetricTargetWithinLimit(sourceMetric.parentMetricId, targetValue, id);

  const adjustedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.annualGoalMetricSource.update({
      where: { id },
      data: { name, description, targetValue, currentValue, unit, calculationType, riskStatus, responsibleUserId, adjustedAt },
    });
    await tx.annualGoalMetric.updateMany({
      where: { sourceMetricId: id, deletedAt: null },
      data: { name, description, targetValue, currentValue, unit, calculationType, riskStatus, adjustedAt },
    });
  });

  revalidateAnnualGoals();
}

export async function deleteAnnualGoalMetricSource(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少元指标 ID");
  const user = await requireAnnualGoalEditor();

  const sourceMetric = await prisma.annualGoalMetricSource.findUnique({ where: { id }, include: { parentMetric: { include: { plan: true } } } });
  if (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetric.deletedAt || sourceMetric.parentMetric.plan.deletedAt) {
    throw new Error("元指标不存在");
  }
  if (user.roleType === "DEPARTMENT_MANAGER" && sourceMetric.parentMetric.plan.departmentId !== user.departmentId) {
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
  await assertPlanEditable(metric.planId);

  if (metric.plan.ownerType === "TEAM") {
    await prisma.annualGoalMetric.update({ where: { id }, data: { deletedAt: new Date() } });
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
  await assertPlanEditable(metric.planId);

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

  await assertQuarterProgressUpdatable(metricId, sourceMetricId);

  const updates = [1, 2, 3, 4].flatMap((quarter) => {
    const targetId = formData.get(`q${quarter}Id`) as string | null;
    if (!targetId) return [];
    const currentValue = numberFromForm(formData.get(`q${quarter}Current`), `Q${quarter}当前值`);
    if (currentValue < 0) throw new Error("季度指标当前值不能小于 0");
    return [{ id: targetId, currentValue }];
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
        data: { currentValue: update.currentValue, progressUpdatedAt },
      });
    }
    await syncAnnualGoalCurrentValues(tx, metricId, sourceMetricId, progressUpdatedAt);
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

  const pairs = new Map<string, { metricId: string; sourceMetricId: string | null }>();
  for (const update of updates) {
    pairs.set(`${update.metricId}:${update.sourceMetricId ?? ""}`, { metricId: update.metricId, sourceMetricId: update.sourceMetricId });
  }
  for (const pair of pairs.values()) {
    await assertQuarterProgressUpdatable(pair.metricId, pair.sourceMetricId);
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
        data: { weeklyIncrement: update.weeklyIncrement, currentValue: update.currentValue, progressUpdatedAt },
      });
    }
    for (const pair of pairs.values()) {
      await syncAnnualGoalCurrentValues(tx, pair.metricId, pair.sourceMetricId, progressUpdatedAt);
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
  await assertPlanEditable(metric.planId);

  if (sourceMetricId) {
    const sourceMetric = await prisma.annualGoalMetricSource.findUnique({ where: { id: sourceMetricId } });
    if (!sourceMetric || sourceMetric.deletedAt || sourceMetric.parentMetricId !== metricId) throw new Error("元指标不存在");
  }

  await prisma.annualGoalQuarterTarget.updateMany({
    where: { metricId, sourceMetricId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  revalidateAnnualGoals();
}
