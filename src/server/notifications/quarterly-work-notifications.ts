import { prisma } from "@/server/db/prisma";
import { emitNotificationEvent } from "@/server/notifications/emit";
import type { NotificationEventPayload } from "@/server/notifications/types";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";
import { VALUE_TRACK_STATUS_NOT_OBSERVED } from "@/server/quarterly-work/value-track-constants";

const workStatusLabels: Record<string, string> = {
  NOT_STARTED: "未启动",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  DELAYED_COMPLETED: "延期完成",
  CLOSED: "关闭",
};

async function loadUser(userId: string | null | undefined) {
  if (!userId) return null;
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true, orgNodeId: true },
  });
}

async function loadDepartment(orgNodeId: string | null | undefined) {
  const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(orgNodeId);
  if (!departmentOrgNodeId) return { departmentOrgNodeId: "", departmentName: "" };
  const department = await prisma.orgNode.findUnique({
    where: { id: departmentOrgNodeId },
    select: { name: true },
  });
  return { departmentOrgNodeId, departmentName: department?.name ?? "" };
}

function workStatusLabel(status: string | null | undefined) {
  if (!status) return "";
  return workStatusLabels[status] ?? status;
}

async function buildOwnerPayload(ownerId: string) {
  const owner = await loadUser(ownerId);
  const department = await loadDepartment(owner?.orgNodeId);
  return {
    ownerId,
    ownerName: owner?.name ?? "",
    userId: ownerId,
    subjectUserId: ownerId,
    userName: owner?.name ?? "",
    ...department,
  };
}

export async function emitQuarterlyWorkAssigned(workId: string) {
  const work = await prisma.quarterlyWork.findFirst({
    where: { id: workId, deletedAt: null },
    select: {
      id: true,
      title: true,
      ownerId: true,
      year: true,
      quarter: true,
      startMonth: true,
      endMonth: true,
      status: true,
      project: { select: { id: true, title: true } },
    },
  });
  if (!work) return;

  await emitNotificationEvent("quarterly_work.assigned", {
    ...(await buildOwnerPayload(work.ownerId)),
    title: work.title,
    year: work.year,
    quarter: work.quarter,
    startMonth: work.startMonth,
    endMonth: work.endMonth,
    status: workStatusLabel(work.status),
    projectId: work.project.id,
    projectTitle: work.project.title,
    targetType: "QuarterlyWork",
    targetId: work.id,
    eventAt: new Date().toISOString(),
  } satisfies NotificationEventPayload);
}

export async function emitQuarterlyWorkStatusChanged(workId: string, previousStatus: string) {
  const work = await prisma.quarterlyWork.findFirst({
    where: { id: workId, deletedAt: null },
    select: {
      id: true,
      title: true,
      ownerId: true,
      year: true,
      quarter: true,
      status: true,
      project: { select: { title: true } },
    },
  });
  if (!work || work.status === previousStatus) return;

  await emitNotificationEvent("quarterly_work.status.changed", {
    ...(await buildOwnerPayload(work.ownerId)),
    title: work.title,
    year: work.year,
    quarter: work.quarter,
    status: workStatusLabel(work.status),
    previousStatus: workStatusLabel(previousStatus),
    projectTitle: work.project.title,
    targetType: "QuarterlyWork",
    targetId: work.id,
    eventAt: new Date().toISOString(),
  });
}

export async function emitProjectAssigned(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, title: true, ownerId: true, endQuarter: true, status: true },
  });
  if (!project) return;

  await emitNotificationEvent("project.assigned", {
    ...(await buildOwnerPayload(project.ownerId)),
    title: project.title,
    endQuarter: project.endQuarter,
    status: project.status,
    targetType: "Project",
    targetId: project.id,
    eventAt: new Date().toISOString(),
  });
}

export async function emitProjectLaunched(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      title: true,
      ownerId: true,
      endQuarter: true,
      launchedAt: true,
      valueTrackStatus: true,
    },
  });
  if (!project) return;

  const launchedAt = project.launchedAt ?? new Date();
  await emitNotificationEvent("project.launched", {
    ...(await buildOwnerPayload(project.ownerId)),
    title: project.title,
    endQuarter: project.endQuarter,
    valueTrackStatus: project.valueTrackStatus ?? VALUE_TRACK_STATUS_NOT_OBSERVED,
    year: launchedAt.getFullYear(),
    quarter: Math.floor(launchedAt.getMonth() / 3) + 1,
    targetType: "Project",
    targetId: project.id,
    eventAt: launchedAt.toISOString(),
  });
}

export async function emitProjectCompleted(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      title: true,
      ownerId: true,
      endQuarter: true,
      completedAt: true,
      valueTrackStatus: true,
    },
  });
  if (!project) return;

  const completedAt = project.completedAt ?? new Date();
  await emitNotificationEvent("project.completed", {
    ...(await buildOwnerPayload(project.ownerId)),
    title: project.title,
    endQuarter: project.endQuarter,
    valueTrackStatus: project.valueTrackStatus ?? VALUE_TRACK_STATUS_NOT_OBSERVED,
    year: completedAt.getFullYear(),
    quarter: Math.floor(completedAt.getMonth() / 3) + 1,
    targetType: "Project",
    targetId: project.id,
    eventAt: completedAt.toISOString(),
  });
}

export async function emitProjectValueChanged(
  projectId: string,
  previous: { valueJudgement?: string | null; valueTrackStatus?: string | null },
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      title: true,
      ownerId: true,
      valueJudgement: true,
      valueTrackStatus: true,
    },
  });
  if (!project) return;
  if ((previous.valueJudgement ?? "") === (project.valueJudgement ?? "")) return;

  await emitNotificationEvent("project.value_judgement.changed", {
    ...(await buildOwnerPayload(project.ownerId)),
    title: project.title,
    valueJudgement: project.valueJudgement,
    previousValueJudgement: previous.valueJudgement ?? "",
    valueTrackStatus: project.valueTrackStatus ?? VALUE_TRACK_STATUS_NOT_OBSERVED,
    previousValueTrackStatus: previous.valueTrackStatus ?? VALUE_TRACK_STATUS_NOT_OBSERVED,
    targetType: "Project",
    targetId: project.id,
    eventAt: new Date().toISOString(),
  });
}
