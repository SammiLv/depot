import { prisma } from "@/server/db/prisma";
import { emitNotificationEvent } from "@/server/notifications/emit";
import type { NotificationEventPayload } from "@/server/notifications/types";

const elevatedRiskStatuses = new Set(["SLIGHT_DELAY", "RISK"]);

export function getCurrentYearQuarter(date = new Date()) {
  return {
    year: date.getFullYear(),
    quarter: Math.floor(date.getMonth() / 3) + 1,
  };
}

export function isElevatedRiskTransition(previousRiskStatus: string | null | undefined, nextRiskStatus: string) {
  if (!elevatedRiskStatuses.has(nextRiskStatus)) return false;
  return previousRiskStatus !== nextRiskStatus;
}

async function loadDepartmentName(departmentOrgNodeId: string) {
  const department = await prisma.orgNode.findUnique({
    where: { id: departmentOrgNodeId },
    select: { name: true },
  });
  return department?.name ?? "";
}

async function loadTeamName(teamOrgNodeId: string | null | undefined) {
  if (!teamOrgNodeId) return "";
  const team = await prisma.orgNode.findUnique({
    where: { id: teamOrgNodeId },
    select: { name: true },
  });
  return team?.name ?? "";
}

async function loadUserName(userId: string | null | undefined) {
  if (!userId) return "";
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { name: true },
  });
  return user?.name ?? "";
}

type AnnualGoalNotificationContext = {
  planId: string;
  planName: string;
  year: number;
  departmentOrgNodeId: string;
  metricId?: string | null;
  metricName?: string;
  metricCode?: string;
  sourceMetricId?: string | null;
  assignmentId?: string | null;
  teamOrgNodeId?: string | null;
  responsibleUserId?: string | null;
  quarter?: number;
  fieldScope?: string;
};

async function buildBasePayload(context: AnnualGoalNotificationContext): Promise<NotificationEventPayload> {
  const [departmentName, teamName, responsibleUserName] = await Promise.all([
    loadDepartmentName(context.departmentOrgNodeId),
    loadTeamName(context.teamOrgNodeId),
    loadUserName(context.responsibleUserId),
  ]);

  return {
    planId: context.planId,
    planName: context.planName,
    year: context.year,
    departmentOrgNodeId: context.departmentOrgNodeId,
    departmentName,
    metricId: context.metricId ?? undefined,
    metricName: context.metricName ?? undefined,
    metricCode: context.metricCode ?? undefined,
    sourceMetricId: context.sourceMetricId ?? undefined,
    assignmentId: context.assignmentId ?? undefined,
    teamOrgNodeId: context.teamOrgNodeId ?? undefined,
    teamName,
    responsibleUserId: context.responsibleUserId ?? undefined,
    userId: context.responsibleUserId ?? undefined,
    userName: responsibleUserName,
    quarter: context.quarter,
    fieldScope: context.fieldScope,
    targetType: "AnnualGoalPlan",
    targetId: context.planId,
  };
}

export async function emitAnnualGoalTargetChanged(
  context: AnnualGoalNotificationContext & {
    previousTargetValue: number;
    targetValue: number;
    unit?: string;
  },
) {
  if (context.previousTargetValue === context.targetValue) return;

  await emitNotificationEvent("annual_goal.target.changed", {
    ...(await buildBasePayload(context)),
    previousTargetValue: context.previousTargetValue,
    targetValue: context.targetValue,
    unit: context.unit,
  });
}

export async function emitAnnualGoalTeamResponsiblePending(context: AnnualGoalNotificationContext & {
  assignmentCount?: number;
  metricNames?: string[];
}) {
  await emitNotificationEvent("annual_goal.team.responsible_pending", {
    ...(await buildBasePayload(context)),
    assignmentCount: context.assignmentCount ?? 1,
    metricNames: context.metricNames?.join("、") ?? context.metricName ?? "",
  });
}

export async function emitAnnualGoalRiskChanged(
  context: AnnualGoalNotificationContext & {
    previousRiskStatus: string;
    riskStatus: string;
    updaterId: string;
  },
) {
  if (!isElevatedRiskTransition(context.previousRiskStatus, context.riskStatus)) return;

  const updaterName = await loadUserName(context.updaterId);
  await emitNotificationEvent("annual_goal.risk.changed", {
    ...(await buildBasePayload(context)),
    previousRiskStatus: context.previousRiskStatus,
    riskStatus: context.riskStatus,
    updaterId: context.updaterId,
    updaterName,
  });
}

export async function resolveAnnualGoalResponsibleUserId(input: {
  metricId: string;
  sourceMetricId?: string | null;
  teamOrgNodeId?: string | null;
}) {
  if (input.teamOrgNodeId) {
    const assignment = await prisma.annualGoalMetricAssignment.findFirst({
      where: {
        teamOrgNodeId: input.teamOrgNodeId,
        deletedAt: null,
        ...(input.sourceMetricId
          ? { sourceMetricId: input.sourceMetricId, metricId: null }
          : { metricId: input.metricId, sourceMetricId: null }),
      },
      select: { responsibleUserId: true },
    });
    if (assignment?.responsibleUserId) return assignment.responsibleUserId;
  }
  if (input.sourceMetricId) {
    const source = await prisma.annualGoalMetricSource.findUnique({
      where: { id: input.sourceMetricId },
      select: { responsibleUserId: true },
    });
    if (source?.responsibleUserId) return source.responsibleUserId;
  }
  const metric = await prisma.annualGoalMetric.findUnique({
    where: { id: input.metricId },
    select: { responsibleUserId: true },
  });
  return metric?.responsibleUserId ?? null;
}
