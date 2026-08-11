import { prisma } from "@/server/db/prisma";
import type { NotificationEventPayload } from "@/server/notifications/types";

type TestPayloadBase = {
  appUrl: string;
  testRunId: number;
};

async function findTeamWithLeader() {
  const leader = await prisma.user.findFirst({
    where: {
      roleType: "TEAM_LEADER",
      isActive: true,
      deletedAt: null,
      orgNodeId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { orgNodeId: true },
  });
  if (!leader?.orgNodeId) return null;

  return prisma.orgNode.findFirst({
    where: { id: leader.orgNodeId, nodeType: "TEAM" },
    select: { id: true, name: true, parentId: true },
  });
}

async function findActiveDepartmentPlan(departmentOrgNodeId: string | null | undefined) {
  if (!departmentOrgNodeId) return null;
  return prisma.annualGoalPlan.findFirst({
    where: {
      deletedAt: null,
      departmentOrgNodeId,
      status: "ACTIVE",
    },
    orderBy: { year: "desc" },
    select: { id: true, name: true, year: true, departmentOrgNodeId: true },
  });
}

async function buildTeamResponsiblePendingTestPayload(base: TestPayloadBase): Promise<NotificationEventPayload | null> {
  const team = await findTeamWithLeader();
  if (!team) return null;

  const assignment = await prisma.annualGoalMetricAssignment.findFirst({
    where: {
      deletedAt: null,
      teamOrgNodeId: team.id,
      responsibleUserId: null,
    },
    include: {
      sourceMetric: {
        include: {
          parentMetric: {
            include: { plan: true },
          },
        },
      },
      metric: {
        include: { plan: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const authorityPlan = assignment?.sourceMetric?.parentMetric.plan
    ?? assignment?.metric?.plan
    ?? await findActiveDepartmentPlan(team.parentId);
  if (!authorityPlan) return null;

  const metricNames = assignment?.sourceMetric?.name
    ?? assignment?.metric?.name
    ?? "测试指标";

  return {
    ...base,
    planId: authorityPlan.id,
    planName: authorityPlan.name,
    year: authorityPlan.year,
    departmentOrgNodeId: authorityPlan.departmentOrgNodeId,
    teamOrgNodeId: team.id,
    teamName: team.name,
    metricNames,
    assignmentCount: 1,
    targetType: "AnnualGoalPlan",
    targetId: authorityPlan.id,
    title: "测试通知：小组指标待配置负责人",
  };
}

async function buildQuarterTargetMissingTestPayload(base: TestPayloadBase): Promise<NotificationEventPayload | null> {
  const team = await findTeamWithLeader();
  if (!team) return null;

  const assignment = await prisma.annualGoalMetricAssignment.findFirst({
    where: { deletedAt: null, teamOrgNodeId: team.id },
    include: {
      sourceMetric: {
        include: {
          parentMetric: {
            include: { plan: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const authorityPlan = assignment?.sourceMetric?.parentMetric.plan
    ?? await findActiveDepartmentPlan(team.parentId);
  if (!authorityPlan) return null;

  return {
    ...base,
    planId: authorityPlan.id,
    planName: authorityPlan.name,
    year: authorityPlan.year,
    departmentOrgNodeId: authorityPlan.departmentOrgNodeId,
    teamOrgNodeId: team.id,
    teamName: team.name,
    metricName: assignment?.sourceMetric?.name ?? "测试指标",
    missingQuarters: "Q1、Q2",
    responsibleUserId: assignment?.responsibleUserId ?? undefined,
    targetType: "AnnualGoalPlan",
    targetId: authorityPlan.id,
    title: "测试通知：季度目标未拆解",
  };
}

async function buildWeeklyPendingTestPayload(base: TestPayloadBase): Promise<NotificationEventPayload | null> {
  const assignment = await prisma.annualGoalMetricAssignment.findFirst({
    where: {
      deletedAt: null,
      responsibleUserId: { not: null },
    },
    include: {
      sourceMetric: {
        include: {
          parentMetric: {
            include: { plan: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const plan = assignment?.sourceMetric?.parentMetric.plan
    ?? await prisma.annualGoalPlan.findFirst({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: { year: "desc" },
      select: { id: true, name: true, year: true, departmentOrgNodeId: true },
    });
  if (!plan) return null;

  const responsibleUserId = assignment?.responsibleUserId
    ?? (await prisma.user.findFirst({
      where: { isActive: true, deletedAt: null, roleType: "MEMBER" },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }))?.id;

  if (!responsibleUserId) return null;

  return {
    ...base,
    planId: plan.id,
    planName: plan.name,
    year: plan.year,
    departmentOrgNodeId: plan.departmentOrgNodeId,
    metricName: assignment?.sourceMetric?.name ?? "测试指标",
    responsibleUserId,
    userId: responsibleUserId,
    daysSinceUpdate: 7,
    quarter: Math.floor(new Date().getMonth() / 3) + 1,
    targetType: "AnnualGoalPlan",
    targetId: plan.id,
    title: "测试通知：周进度未更新",
  };
}

async function buildTargetChangedTestPayload(base: TestPayloadBase): Promise<NotificationEventPayload | null> {
  const metric = await prisma.annualGoalMetric.findFirst({
    where: { deletedAt: null },
    include: { plan: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!metric?.plan) return null;

  return {
    ...base,
    planId: metric.plan.id,
    planName: metric.plan.name,
    year: metric.plan.year,
    departmentOrgNodeId: metric.plan.departmentOrgNodeId,
    metricName: metric.name,
    previousTargetValue: metric.targetValue,
    targetValue: metric.targetValue + 1,
    unit: metric.unit,
    fieldScope: "annual",
    responsibleUserId: metric.responsibleUserId ?? undefined,
    targetType: "AnnualGoalPlan",
    targetId: metric.plan.id,
    title: "测试通知：指标目标值变更",
  };
}

async function buildRiskChangedTestPayload(base: TestPayloadBase): Promise<NotificationEventPayload | null> {
  const metric = await prisma.annualGoalMetric.findFirst({
    where: { deletedAt: null },
    include: { plan: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!metric?.plan) return null;

  const updater = await prisma.user.findFirst({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    ...base,
    planId: metric.plan.id,
    planName: metric.plan.name,
    year: metric.plan.year,
    departmentOrgNodeId: metric.plan.departmentOrgNodeId,
    metricName: metric.name,
    previousRiskStatus: "NORMAL",
    riskStatus: "RISK",
    responsibleUserId: metric.responsibleUserId ?? undefined,
    updaterId: updater?.id ?? undefined,
    updaterName: updater?.name ?? "测试用户",
    targetType: "AnnualGoalPlan",
    targetId: metric.plan.id,
    title: "测试通知：指标风险状态变更",
  };
}

export async function buildAnnualGoalTestEventPayload(
  triggerEvent: string,
  base: TestPayloadBase,
): Promise<NotificationEventPayload | null> {
  switch (triggerEvent) {
    case "annual_goal.team.responsible_pending":
      return buildTeamResponsiblePendingTestPayload(base);
    case "annual_goal.quarter_target.missing":
      return buildQuarterTargetMissingTestPayload(base);
    case "annual_goal.progress.weekly_pending":
      return buildWeeklyPendingTestPayload(base);
    case "annual_goal.target.changed":
      return buildTargetChangedTestPayload(base);
    case "annual_goal.risk.changed":
      return buildRiskChangedTestPayload(base);
    default:
      return null;
  }
}
