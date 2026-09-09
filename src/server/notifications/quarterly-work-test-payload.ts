import { prisma } from "@/server/db/prisma";
import type { NotificationEventPayload } from "@/server/notifications/types";
import {
  getProjectDaysUntilDue,
  getProjectOverdueDays,
  getWorkDaysUntilDue,
  getWorkOverdueDays,
  parseQuarterCode,
} from "@/server/quarterly-work/overdue-utils";
import { VALUE_JUDGEMENT_BELOW_EXPECTATION, VALUE_TRACK_STATUS_NOT_OBSERVED } from "@/server/quarterly-work/value-track-constants";

type TestPayloadBase = {
  appUrl: string;
  testRunId: number;
  year: number;
  quarter: number;
};

async function findSampleOwnerName(ownerId: string) {
  const owner = await prisma.user.findFirst({
    where: { id: ownerId, deletedAt: null },
    select: { name: true },
  });
  return owner?.name ?? "测试用户";
}

async function findOverdueWork() {
  const works = await prisma.quarterlyWork.findMany({
    where: {
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      endMonth: { not: null },
    },
    orderBy: { updatedAt: "desc" },
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
  const now = new Date();
  return works.find((work) => getWorkOverdueDays(work, now) != null) ?? null;
}

async function findDueSoonWork(windowDays = 7) {
  const works = await prisma.quarterlyWork.findMany({
    where: {
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      endMonth: { not: null },
    },
    orderBy: { updatedAt: "desc" },
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
  const now = new Date();
  return works.find((work) => getWorkDaysUntilDue(work, windowDays, now) != null) ?? null;
}

async function findOverdueProject() {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      endQuarter: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      ownerId: true,
      endQuarter: true,
      status: true,
      valueJudgement: true,
      valueTrackStatus: true,
    },
    take: 500,
  });
  const now = new Date();
  return projects.find((project) => getProjectOverdueDays(project, now) != null) ?? null;
}

async function findDueSoonProject(windowDays = 14) {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      endQuarter: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      ownerId: true,
      endQuarter: true,
      status: true,
      valueJudgement: true,
      valueTrackStatus: true,
    },
    take: 500,
  });
  const now = new Date();
  return projects.find((project) => getProjectDaysUntilDue(project, windowDays, now) != null) ?? null;
}

async function findSampleProject() {
  return prisma.project.findFirst({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      ownerId: true,
      endQuarter: true,
      status: true,
      valueJudgement: true,
      valueTrackStatus: true,
    },
  });
}

function buildWorkPayload(work: NonNullable<Awaited<ReturnType<typeof findOverdueWork>>>, base: TestPayloadBase, ownerName: string, extra: Record<string, unknown>) {
  return {
    ...base,
    title: work.title,
    ownerId: work.ownerId,
    ownerName,
    userId: work.ownerId,
    userName: ownerName,
    year: work.year,
    quarter: work.quarter,
    endMonth: work.endMonth,
    status: "进行中",
    previousStatus: "未启动",
    projectTitle: work.project.title,
    targetType: "QuarterlyWork",
    targetId: work.id,
    ...extra,
  } satisfies NotificationEventPayload;
}

function buildProjectPayload(
  project: NonNullable<Awaited<ReturnType<typeof findSampleProject>>>,
  base: TestPayloadBase,
  ownerName: string,
  extra: Record<string, unknown>,
) {
  const parsed = parseQuarterCode(project.endQuarter);
  return {
    ...base,
    title: project.title,
    ownerId: project.ownerId,
    ownerName,
    userId: project.ownerId,
    userName: ownerName,
    endQuarter: project.endQuarter,
    year: parsed?.year ?? base.year,
    quarter: parsed?.quarter ?? base.quarter,
    valueJudgement: project.valueJudgement ?? VALUE_JUDGEMENT_BELOW_EXPECTATION,
    previousValueJudgement: "已达预期",
    valueTrackStatus: project.valueTrackStatus ?? VALUE_TRACK_STATUS_NOT_OBSERVED,
    targetType: "Project",
    targetId: project.id,
    ...extra,
  } satisfies NotificationEventPayload;
}

export async function buildQuarterlyWorkTestEventPayload(
  triggerEvent: string,
  base: TestPayloadBase,
): Promise<NotificationEventPayload | null> {
  const now = new Date();

  if (triggerEvent === "quarterly_work.overdue") {
    const work = await findOverdueWork();
    if (!work) {
      throw new Error("当前没有已延期的需求，无法发送示例测试通知（需求延期按需求 endMonth 判断）。");
    }
    const ownerName = await findSampleOwnerName(work.ownerId);
    return buildWorkPayload(work, base, ownerName, { overdueDays: getWorkOverdueDays(work, now) });
  }

  if (triggerEvent === "quarterly_work.due_soon") {
    const work = await findDueSoonWork();
    if (!work) {
      throw new Error("当前没有即将延期的需求，无法发送示例测试通知。");
    }
    const ownerName = await findSampleOwnerName(work.ownerId);
    return buildWorkPayload(work, base, ownerName, { daysUntilDue: getWorkDaysUntilDue(work, 7, now) });
  }

  if (triggerEvent.startsWith("quarterly_work.")) {
    const work = await findOverdueWork() ?? await findDueSoonWork();
    if (!work) return null;
    const ownerName = await findSampleOwnerName(work.ownerId);
    return buildWorkPayload(work, base, ownerName, {
      overdueDays: getWorkOverdueDays(work, now) ?? undefined,
      daysUntilDue: getWorkDaysUntilDue(work, 7, now) ?? undefined,
    });
  }

  if (triggerEvent === "project.overdue") {
    const project = await findOverdueProject();
    if (!project) {
      throw new Error("当前没有已延期的项目，无法发送示例测试通知（项目延期仅看项目 endQuarter，不含下属需求）。");
    }
    const ownerName = await findSampleOwnerName(project.ownerId);
    return buildProjectPayload(project, base, ownerName, { overdueDays: getProjectOverdueDays(project, now) });
  }

  if (triggerEvent === "project.due_soon") {
    const project = await findDueSoonProject();
    if (!project) {
      throw new Error("当前没有即将延期的项目，无法发送示例测试通知。");
    }
    const ownerName = await findSampleOwnerName(project.ownerId);
    return buildProjectPayload(project, base, ownerName, { daysUntilDue: getProjectDaysUntilDue(project, 14, now) });
  }

  if (!triggerEvent.startsWith("project.")) return null;

  const project = await findSampleProject();
  if (!project) return null;
  const ownerName = await findSampleOwnerName(project.ownerId);
  return buildProjectPayload(project, base, ownerName, {
    overdueDays: getProjectOverdueDays(project, now) ?? undefined,
    daysUntilDue: getProjectDaysUntilDue(project, 14, now) ?? undefined,
    daysUntilQuarterEnd: 4,
  });
}
