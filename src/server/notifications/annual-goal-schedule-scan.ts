import { prisma } from "@/server/db/prisma";
import { emitNotificationEvent } from "@/server/notifications/emit";
import { getCurrentYearQuarter } from "@/server/notifications/annual-goal-notifications";

const REQUIRED_QUARTERS = [1, 2, 3, 4] as const;

function roundValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function daysSince(date: Date | null | undefined, now: Date) {
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function isQuarterTargetCoverageMissing(
  quarterTargets: Array<{ quarter: number; targetValue: number }>,
  annualTargetValue: number,
) {
  const byQuarter = new Map(quarterTargets.map((target) => [target.quarter, target.targetValue]));
  const missingQuarters = REQUIRED_QUARTERS.filter((quarter) => !byQuarter.has(quarter));
  if (missingQuarters.length > 0) return { missing: true, missingQuarters };
  const sum = roundValue(REQUIRED_QUARTERS.reduce((total, quarter) => total + (byQuarter.get(quarter) ?? 0), 0));
  if (sum + 0.001 < roundValue(annualTargetValue)) {
    return { missing: true, missingQuarters: [...REQUIRED_QUARTERS] };
  }
  return { missing: false, missingQuarters: [] as number[] };
}

type AssignmentRow = {
  id: string;
  teamOrgNodeId: string;
  metricId: string | null;
  sourceMetricId: string | null;
  responsibleUserId: string | null;
  metric: {
    id: string;
    name: string;
    metricCode: string;
    targetValue: number;
    responsibleUserId: string | null;
    plan: { id: string; name: string; year: number; departmentOrgNodeId: string; status: string };
  } | null;
  sourceMetric: {
    id: string;
    name: string;
    metricCode: string;
    targetValue: number;
    responsibleUserId: string | null;
    parentMetric: {
      id: string;
      name: string;
      metricCode: string;
      plan: { id: string; name: string; year: number; departmentOrgNodeId: string; status: string };
    };
  } | null;
};

function resolveAssignmentSubject(assignment: AssignmentRow) {
  if (assignment.sourceMetric) {
    return {
      metricId: assignment.sourceMetric.parentMetric.id,
      metricName: assignment.sourceMetric.parentMetric.name,
      metricCode: assignment.sourceMetric.parentMetric.metricCode,
      sourceMetricId: assignment.sourceMetric.id,
      sourceMetricName: assignment.sourceMetric.name,
      annualTargetValue: assignment.sourceMetric.targetValue,
      plan: assignment.sourceMetric.parentMetric.plan,
      defaultResponsibleUserId: assignment.responsibleUserId ?? assignment.sourceMetric.responsibleUserId,
    };
  }
  if (assignment.metric) {
    return {
      metricId: assignment.metric.id,
      metricName: assignment.metric.name,
      metricCode: assignment.metric.metricCode,
      sourceMetricId: null,
      sourceMetricName: null,
      annualTargetValue: assignment.metric.targetValue,
      plan: assignment.metric.plan,
      defaultResponsibleUserId: assignment.responsibleUserId ?? assignment.metric.responsibleUserId,
    };
  }
  return null;
}

async function loadActiveAssignments(year: number) {
  return prisma.annualGoalMetricAssignment.findMany({
    where: {
      deletedAt: null,
      OR: [
        { metric: { deletedAt: null, plan: { year, status: "ACTIVE", deletedAt: null } } },
        {
          sourceMetric: {
            deletedAt: null,
            parentMetric: { deletedAt: null, plan: { year, status: "ACTIVE", deletedAt: null } },
          },
        },
      ],
    },
    select: {
      id: true,
      teamOrgNodeId: true,
      metricId: true,
      sourceMetricId: true,
      responsibleUserId: true,
      metric: {
        select: {
          id: true,
          name: true,
          metricCode: true,
          targetValue: true,
          responsibleUserId: true,
          plan: { select: { id: true, name: true, year: true, departmentOrgNodeId: true, status: true } },
        },
      },
      sourceMetric: {
        select: {
          id: true,
          name: true,
          metricCode: true,
          targetValue: true,
          responsibleUserId: true,
          parentMetric: {
            select: {
              id: true,
              name: true,
              metricCode: true,
              plan: { select: { id: true, name: true, year: true, departmentOrgNodeId: true, status: true } },
            },
          },
        },
      },
    },
  });
}

export async function runAnnualGoalWeeklyProgressPendingScan(
  scenarioId: string,
  daysBefore: number,
  options?: { testRunId?: number | string; scheduleSlot?: string },
) {
  const now = new Date();
  const { year, quarter } = getCurrentYearQuarter(now);
  const staleDays = daysBefore > 0 ? daysBefore : 1;
  const assignments = await loadActiveAssignments(year);

  const departmentIds = [...new Set(assignments.map((assignment) => {
    const subject = resolveAssignmentSubject(assignment);
    return subject?.plan.departmentOrgNodeId;
  }).filter((id): id is string => Boolean(id)))];
  const departments = departmentIds.length
    ? await prisma.orgNode.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } })
    : [];
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name]));

  const teamIds = [...new Set(assignments.map((assignment) => assignment.teamOrgNodeId))];
  const teams = teamIds.length
    ? await prisma.orgNode.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
    : [];
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  for (const assignment of assignments) {
    const subject = resolveAssignmentSubject(assignment);
    if (!subject || !subject.defaultResponsibleUserId) continue;

    const quarterTarget = await prisma.annualGoalQuarterTarget.findFirst({
      where: {
        year,
        quarter,
        deletedAt: null,
        ...(subject.sourceMetricId
          ? { sourceMetricId: subject.sourceMetricId, metricId: null }
          : { metricId: subject.metricId, sourceMetricId: null }),
      },
      select: { progressUpdatedAt: true },
    });
    if (!quarterTarget) continue;

    const daysSinceUpdate = daysSince(quarterTarget.progressUpdatedAt, now);
    if (daysSinceUpdate < staleDays) continue;

    const responsibleUser = await prisma.user.findFirst({
      where: { id: subject.defaultResponsibleUserId, deletedAt: null },
      select: { name: true },
    });

    await emitNotificationEvent("annual_goal.progress.weekly_pending", {
      planId: subject.plan.id,
      planName: subject.plan.name,
      year,
      quarter,
      departmentOrgNodeId: subject.plan.departmentOrgNodeId,
      departmentName: departmentNameById.get(subject.plan.departmentOrgNodeId) ?? "",
      metricId: subject.metricId,
      metricName: subject.sourceMetricName ?? subject.metricName,
      metricCode: subject.metricCode,
      sourceMetricId: subject.sourceMetricId ?? undefined,
      assignmentId: assignment.id,
      teamOrgNodeId: assignment.teamOrgNodeId,
      teamName: teamNameById.get(assignment.teamOrgNodeId) ?? "",
      responsibleUserId: subject.defaultResponsibleUserId,
      userId: subject.defaultResponsibleUserId,
      responsibleUserName: responsibleUser?.name ?? "",
      daysSinceUpdate: Number.isFinite(daysSinceUpdate) ? daysSinceUpdate : staleDays,
      targetType: "AnnualGoalPlan",
      targetId: subject.plan.id,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}

export async function runAnnualGoalQuarterTargetMissingScan(
  scenarioId: string,
  options?: { testRunId?: number | string; scheduleSlot?: string },
) {
  const { year } = getCurrentYearQuarter();
  const assignments = await loadActiveAssignments(year);

  const authorityKeys = new Map<string, {
    assignment: AssignmentRow;
    subject: NonNullable<ReturnType<typeof resolveAssignmentSubject>>;
  }>();

  for (const assignment of assignments) {
    const subject = resolveAssignmentSubject(assignment);
    if (!subject) continue;
    const key = `${subject.sourceMetricId ?? ""}:${subject.metricId}:${assignment.teamOrgNodeId}`;
    authorityKeys.set(key, { assignment, subject });
  }

  const departmentIds = [...new Set([...authorityKeys.values()].map(({ subject }) => subject.plan.departmentOrgNodeId))];
  const departments = departmentIds.length
    ? await prisma.orgNode.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } })
    : [];
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name]));

  const teamIds = [...new Set([...authorityKeys.values()].map(({ assignment }) => assignment.teamOrgNodeId))];
  const teams = teamIds.length
    ? await prisma.orgNode.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
    : [];
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  for (const { assignment, subject } of authorityKeys.values()) {
    const quarterTargets = await prisma.annualGoalQuarterTarget.findMany({
      where: {
        year,
        deletedAt: null,
        ...(subject.sourceMetricId
          ? { sourceMetricId: subject.sourceMetricId, metricId: null }
          : { metricId: subject.metricId, sourceMetricId: null }),
      },
      select: { quarter: true, targetValue: true },
    });

    const coverage = isQuarterTargetCoverageMissing(quarterTargets, subject.annualTargetValue);
    if (!coverage.missing) continue;

    await emitNotificationEvent("annual_goal.quarter_target.missing", {
      planId: subject.plan.id,
      planName: subject.plan.name,
      year,
      departmentOrgNodeId: subject.plan.departmentOrgNodeId,
      departmentName: departmentNameById.get(subject.plan.departmentOrgNodeId) ?? "",
      metricId: subject.metricId,
      metricName: subject.sourceMetricName ?? subject.metricName,
      metricCode: subject.metricCode,
      sourceMetricId: subject.sourceMetricId ?? undefined,
      assignmentId: assignment.id,
      teamOrgNodeId: assignment.teamOrgNodeId,
      teamName: teamNameById.get(assignment.teamOrgNodeId) ?? "",
      responsibleUserId: subject.defaultResponsibleUserId ?? undefined,
      userId: subject.defaultResponsibleUserId ?? undefined,
      missingQuarters: coverage.missingQuarters.join(","),
      targetType: "AnnualGoalPlan",
      targetId: subject.plan.id,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}
