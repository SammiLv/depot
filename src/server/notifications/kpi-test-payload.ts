import { prisma } from "@/server/db/prisma";
import type { NotificationEventPayload } from "@/server/notifications/types";
import { findKpiInitializationPendingSample, getCurrentYearQuarter } from "@/server/notifications/kpi-initialization-scan";
import { findKpiDistributionAlertSample } from "@/server/notifications/kpi-distribution-scan";

type TestPayloadBase = {
  appUrl: string;
  testRunId: number;
};

async function findSampleMember() {
  return prisma.user.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      roleType: { in: ["MEMBER", "TEAM_LEADER"] },
      orgNodeId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, orgNodeId: true },
  });
}

export async function buildKpiInitializationPendingTestPayload(
  base: TestPayloadBase,
): Promise<NotificationEventPayload | null> {
  const sample = await findKpiInitializationPendingSample();
  if (!sample) return null;

  return {
    ...base,
    year: sample.year,
    quarter: sample.quarter,
    userId: sample.subjectUser.id,
    subjectUserId: sample.subjectUser.id,
    userName: sample.subjectUser.name,
    pendingCount: sample.pendingCount,
    departmentOrgNodeId: sample.departmentOrgNodeId,
    departmentName: sample.departmentName,
    targetType: "OrgNode",
    targetId: sample.departmentOrgNodeId,
    title: "测试通知：KPI 待初始化",
  };
}

export async function buildKpiSelfReviewPendingTestPayload(
  base: TestPayloadBase,
): Promise<NotificationEventPayload | null> {
  const { year, quarter } = getCurrentYearQuarter();
  const sampleKpi = await prisma.personalKpi.findFirst({
    where: {
      deletedAt: null,
      year,
      quarter,
      status: "PENDING_SELF_REVIEW",
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, userId: true, year: true, quarter: true, status: true },
  });

  if (sampleKpi) {
    const subjectUser = await prisma.user.findFirst({
      where: { id: sampleKpi.userId, deletedAt: null },
      select: { name: true },
    });
    return {
      ...base,
      userId: sampleKpi.userId,
      subjectUserId: sampleKpi.userId,
      userName: subjectUser?.name ?? "测试用户",
      kpiId: sampleKpi.id,
      year: sampleKpi.year,
      quarter: sampleKpi.quarter,
      status: sampleKpi.status,
      targetType: "PersonalKpi",
      targetId: sampleKpi.id,
      title: "测试通知：KPI 待自评",
    };
  }

  const member = await findSampleMember();
  if (!member) return null;

  return {
    ...base,
    year,
    quarter,
    userId: member.id,
    subjectUserId: member.id,
    userName: member.name,
    kpiId: "test-kpi",
    status: "PENDING_SELF_REVIEW",
    targetType: "PersonalKpi",
    targetId: "test-kpi",
    title: "测试通知：KPI 待自评",
  };
}

export async function buildKpiTestEventPayload(
  triggerEvent: string,
  base: TestPayloadBase,
): Promise<NotificationEventPayload | null> {
  switch (triggerEvent) {
    case "kpi.initialization.pending":
      return buildKpiInitializationPendingTestPayload(base);
    case "kpi.self_review.pending":
      return buildKpiSelfReviewPendingTestPayload(base);
    case "kpi.distribution.alert":
      return buildKpiDistributionAlertTestPayload(base);
    default:
      return null;
  }
}

async function buildKpiDistributionAlertTestPayload(
  base: TestPayloadBase,
): Promise<NotificationEventPayload | null> {
  const sample = await findKpiDistributionAlertSample();
  if (!sample) return null;
  const { rule, evaluation } = sample;
  const formatNum = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  const failReasons = [
    evaluation.gapPass === false
      ? `最高最低分差距 ${formatNum(evaluation.gap!)} 分（要求 ≥ ${rule.distributionMinGap} 分）`
      : null,
    evaluation.belowPass
      ? null
      : `低于 ${rule.distributionBelowScore} 分员工占比 ${formatNum(evaluation.belowPercent)}%（要求 ≥ ${rule.distributionBelowMinPercent}%）`,
  ].filter(Boolean).join("；");
  return {
    ...base,
    year: sample.year,
    quarter: sample.quarter,
    userId: sample.subjectUser.id,
    subjectUserId: sample.subjectUser.id,
    userName: sample.subjectUser.name,
    departmentOrgNodeId: sample.department.id,
    departmentName: sample.department.name,
    gap: evaluation.gap,
    belowPercent: evaluation.belowPercent,
    belowCount: evaluation.belowCount,
    headcount: evaluation.headcount,
    failReasons,
    targetType: "OrgNode",
    targetId: sample.department.id,
    title: "测试通知：KPI 绩效分布预警",
  };
}
