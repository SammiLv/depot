import { prisma } from "@/server/db/prisma";
import type { NotificationEventPayload } from "@/server/notifications/types";
import { VALUE_JUDGEMENT_BELOW_EXPECTATION, VALUE_TRACK_STATUS_NOT_OBSERVED } from "@/server/quarterly-work/value-track-constants";

type TestPayloadBase = {
  appUrl: string;
  testRunId: number;
  year: number;
  quarter: number;
};

async function findSampleWork() {
  return prisma.quarterlyWork.findFirst({
    where: { deletedAt: null },
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
  });
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
      valueJudgement: true,
      valueTrackStatus: true,
    },
  });
}

async function findSampleOwnerName(ownerId: string) {
  const owner = await prisma.user.findFirst({
    where: { id: ownerId, deletedAt: null },
    select: { name: true },
  });
  return owner?.name ?? "测试用户";
}

export async function buildQuarterlyWorkTestEventPayload(
  triggerEvent: string,
  base: TestPayloadBase,
): Promise<NotificationEventPayload | null> {
  if (triggerEvent.startsWith("quarterly_work.")) {
    const work = await findSampleWork();
    if (!work) return null;
    const ownerName = await findSampleOwnerName(work.ownerId);
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
      overdueDays: 3,
      daysUntilDue: 5,
      projectTitle: work.project.title,
      targetType: "QuarterlyWork",
      targetId: work.id,
    };
  }

  if (!triggerEvent.startsWith("project.")) return null;

  const project = await findSampleProject();
  if (!project) return null;
  const ownerName = await findSampleOwnerName(project.ownerId);
  return {
    ...base,
    title: project.title,
    ownerId: project.ownerId,
    ownerName,
    userId: project.ownerId,
    userName: ownerName,
    endQuarter: project.endQuarter,
    overdueDays: 5,
    daysUntilDue: 10,
    valueJudgement: project.valueJudgement ?? VALUE_JUDGEMENT_BELOW_EXPECTATION,
    previousValueJudgement: "已达预期",
    valueTrackStatus: project.valueTrackStatus ?? VALUE_TRACK_STATUS_NOT_OBSERVED,
    daysUntilQuarterEnd: 4,
    targetType: "Project",
    targetId: project.id,
  };
}
