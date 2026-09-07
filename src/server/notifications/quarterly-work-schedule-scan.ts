import { prisma } from "@/server/db/prisma";
import { emitNotificationEvent } from "@/server/notifications/emit";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";
import {
  getProjectDaysUntilDue,
  getProjectOverdueDays,
  getQuarterEndDate,
  getWorkDaysUntilDue,
  getWorkOverdueDays,
  parseQuarterCode,
} from "@/server/quarterly-work/overdue-utils";
import { VALUE_TRACK_STATUS_COMPLETED, VALUE_TRACK_STATUS_NOT_OBSERVED } from "@/server/quarterly-work/value-track-constants";

function daysUntil(endDate: Date, now: Date) {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startOfDay(endDate).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000));
}

function getCurrentQuarterEndDate(now: Date) {
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return new Date(now.getFullYear(), quarter * 3, 0, 23, 59, 59, 999);
}

async function loadOwnerMaps(ownerIds: string[]) {
  const uniqueIds = [...new Set(ownerIds)];
  const owners = uniqueIds.length
    ? await prisma.user.findMany({
        where: { id: { in: uniqueIds }, deletedAt: null },
        select: { id: true, name: true, orgNodeId: true },
      })
    : [];
  const nameById = new Map(owners.map((owner) => [owner.id, owner.name]));
  const departmentByOwnerId = new Map<string, { departmentOrgNodeId: string; departmentName: string }>();

  for (const owner of owners) {
    const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(owner.orgNodeId);
    if (!departmentOrgNodeId) {
      departmentByOwnerId.set(owner.id, { departmentOrgNodeId: "", departmentName: "" });
      continue;
    }
    const department = await prisma.orgNode.findUnique({
      where: { id: departmentOrgNodeId },
      select: { name: true },
    });
    departmentByOwnerId.set(owner.id, {
      departmentOrgNodeId,
      departmentName: department?.name ?? "",
    });
  }

  return { nameById, departmentByOwnerId };
}

type ScanEmitOptions = { testRunId?: number | string; scheduleSlot?: string };

export async function runQuarterlyWorkOverdueScan(scenarioId: string, options?: ScanEmitOptions) {
  const now = new Date();
  const works = await prisma.quarterlyWork.findMany({
    where: {
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      endMonth: { not: null },
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      year: true,
      quarter: true,
      endMonth: true,
      status: true,
      project: { select: { title: true } },
    },
    take: 500,
  });
  const { nameById, departmentByOwnerId } = await loadOwnerMaps(works.map((work) => work.ownerId));

  for (const work of works) {
    const overdueDays = getWorkOverdueDays(work, now);
    if (overdueDays == null) continue;

    const department = departmentByOwnerId.get(work.ownerId);
    await emitNotificationEvent("quarterly_work.overdue", {
      title: work.title,
      ownerId: work.ownerId,
      ownerName: nameById.get(work.ownerId) ?? "",
      userId: work.ownerId,
      subjectUserId: work.ownerId,
      userName: nameById.get(work.ownerId) ?? "",
      year: work.year,
      quarter: work.quarter,
      endMonth: work.endMonth,
      overdueDays,
      projectTitle: work.project.title,
      departmentOrgNodeId: department?.departmentOrgNodeId,
      departmentName: department?.departmentName,
      targetType: "QuarterlyWork",
      targetId: work.id,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}

export async function runQuarterlyWorkDueSoonScan(scenarioId: string, daysBefore: number, options?: ScanEmitOptions) {
  const now = new Date();
  const windowDays = daysBefore > 0 ? daysBefore : 7;
  const works = await prisma.quarterlyWork.findMany({
    where: {
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      endMonth: { not: null },
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      year: true,
      quarter: true,
      endMonth: true,
      status: true,
      project: { select: { title: true } },
    },
    take: 500,
  });
  const { nameById, departmentByOwnerId } = await loadOwnerMaps(works.map((work) => work.ownerId));

  for (const work of works) {
    const daysUntilDue = getWorkDaysUntilDue(work, windowDays, now);
    if (daysUntilDue == null) continue;

    const department = departmentByOwnerId.get(work.ownerId);
    await emitNotificationEvent("quarterly_work.due_soon", {
      title: work.title,
      ownerId: work.ownerId,
      ownerName: nameById.get(work.ownerId) ?? "",
      userId: work.ownerId,
      subjectUserId: work.ownerId,
      userName: nameById.get(work.ownerId) ?? "",
      year: work.year,
      quarter: work.quarter,
      endMonth: work.endMonth,
      daysUntilDue,
      projectTitle: work.project.title,
      departmentOrgNodeId: department?.departmentOrgNodeId,
      departmentName: department?.departmentName,
      targetType: "QuarterlyWork",
      targetId: work.id,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}

export async function runProjectOverdueScan(scenarioId: string, options?: ScanEmitOptions) {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      endQuarter: { not: null },
    },
    select: { id: true, title: true, ownerId: true, endQuarter: true, status: true },
    take: 500,
  });
  const { nameById, departmentByOwnerId } = await loadOwnerMaps(projects.map((project) => project.ownerId));

  for (const project of projects) {
    const overdueDays = getProjectOverdueDays(project, now);
    if (overdueDays == null) continue;

    const parsed = parseQuarterCode(project.endQuarter);
    const department = departmentByOwnerId.get(project.ownerId);
    await emitNotificationEvent("project.overdue", {
      title: project.title,
      ownerId: project.ownerId,
      ownerName: nameById.get(project.ownerId) ?? "",
      userId: project.ownerId,
      subjectUserId: project.ownerId,
      userName: nameById.get(project.ownerId) ?? "",
      endQuarter: project.endQuarter,
      overdueDays,
      year: parsed?.year,
      quarter: parsed?.quarter,
      departmentOrgNodeId: department?.departmentOrgNodeId,
      departmentName: department?.departmentName,
      targetType: "Project",
      targetId: project.id,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}

export async function runProjectDueSoonScan(scenarioId: string, daysBefore: number, options?: ScanEmitOptions) {
  const now = new Date();
  const windowDays = daysBefore > 0 ? daysBefore : 14;
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      endQuarter: { not: null },
    },
    select: { id: true, title: true, ownerId: true, endQuarter: true, status: true },
    take: 500,
  });
  const { nameById, departmentByOwnerId } = await loadOwnerMaps(projects.map((project) => project.ownerId));

  for (const project of projects) {
    const daysUntilDue = getProjectDaysUntilDue(project, windowDays, now);
    if (daysUntilDue == null) continue;

    const parsed = parseQuarterCode(project.endQuarter);
    const department = departmentByOwnerId.get(project.ownerId);
    await emitNotificationEvent("project.due_soon", {
      title: project.title,
      ownerId: project.ownerId,
      ownerName: nameById.get(project.ownerId) ?? "",
      userId: project.ownerId,
      subjectUserId: project.ownerId,
      userName: nameById.get(project.ownerId) ?? "",
      endQuarter: project.endQuarter,
      daysUntilDue,
      year: parsed?.year,
      quarter: parsed?.quarter,
      departmentOrgNodeId: department?.departmentOrgNodeId,
      departmentName: department?.departmentName,
      targetType: "Project",
      targetId: project.id,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}

export async function runProjectValueTrackPendingScan(scenarioId: string, daysBefore: number, options?: ScanEmitOptions) {
  const now = new Date();
  const windowDays = daysBefore > 0 ? daysBefore : 7;
  const quarterEnd = getCurrentQuarterEndDate(now);
  const remainingDays = daysUntil(quarterEnd, now);
  if (remainingDays < 0 || remainingDays > windowDays) return;

  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: "LAUNCHED",
      OR: [
        { valueTrackStatus: null },
        { valueTrackStatus: { not: VALUE_TRACK_STATUS_COMPLETED } },
      ],
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      valueTrackStatus: true,
      valueJudgement: true,
      launchedAt: true,
    },
    take: 500,
  });
  const { nameById, departmentByOwnerId } = await loadOwnerMaps(projects.map((project) => project.ownerId));
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;

  for (const project of projects) {
    const department = departmentByOwnerId.get(project.ownerId);
    await emitNotificationEvent("project.value_track.pending", {
      title: project.title,
      ownerId: project.ownerId,
      ownerName: nameById.get(project.ownerId) ?? "",
      userId: project.ownerId,
      subjectUserId: project.ownerId,
      userName: nameById.get(project.ownerId) ?? "",
      valueTrackStatus: project.valueTrackStatus ?? VALUE_TRACK_STATUS_NOT_OBSERVED,
      valueJudgement: project.valueJudgement,
      daysUntilQuarterEnd: remainingDays,
      year,
      quarter,
      departmentOrgNodeId: department?.departmentOrgNodeId,
      departmentName: department?.departmentName,
      targetType: "Project",
      targetId: project.id,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}
