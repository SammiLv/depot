import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";

export type ProfileOverviewExtras = {
  yearsOfService: number;
  contractEndAt: string | null;
  latestIncidentLevel: string | null;
  hasTwoCReviews: boolean;
  hasConsecutiveTwoCReviews: boolean;
  isLatestReviewC: boolean;
  hasPromotionInCurrentContract: boolean;
  kpiHistory: { period: string; score: number; rating: string | null }[];
  reviewHistory: { period: string; score: number; grade: string | null }[];
  abilityMatchScore: number | null;
  kpiTotalScore: number;
  reviewTotalScore: number;
  kpiWeight: number;
  reviewWeight: number;
};

type ProfileExtrasOptions = { kpiTotalScore: number; reviewTotalScore: number };

function formatKpiPeriod(year: number, quarter: number) {
  return `${year}年Q${quarter}`;
}

function calculateYearsOfService(startDate: Date, referenceDate: Date) {
  let years = referenceDate.getFullYear() - startDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - startDate.getMonth();
  const dayDiff = referenceDate.getDate() - startDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return Math.max(0, years);
}

type KpiRecordRow = { year: number; quarter: number; finalScore: number | null; finalRatingName: string | null };
type ReviewParticipantRow = { id: string; periodYear: number; periodHalfYear: number };
type EmployeeProfileRow = {
  currentContractStartAt: Date | null;
  currentContractEndAt: Date | null;
  hasTwoCReviewsInCurrentContract: boolean | null;
  hasConsecutiveTwoCReviewsInCurrentContract: boolean | null;
  isLatestPreRenewalReviewC: boolean | null;
  hasFormalPromotionInCurrentContract: boolean | null;
};

function buildExtrasForUser(input: {
  employeeProfile: EmployeeProfileRow | null;
  earliestContractStart: Date | null;
  latestIncidentLevel: string | null;
  kpiRecords: KpiRecordRow[];
  reviewParticipants: ReviewParticipantRow[];
  reviewResultByParticipantId: Map<string, { totalScore: number | null; gradeCode: string | null }>;
  kpiWeight: number;
  reviewWeight: number;
  options: ProfileExtrasOptions;
  now: Date;
}): ProfileOverviewExtras {
  const { employeeProfile, earliestContractStart, latestIncidentLevel, kpiRecords, reviewParticipants, reviewResultByParticipantId, kpiWeight, reviewWeight, options, now } = input;

  const yearsOfService = earliestContractStart
    ? calculateYearsOfService(earliestContractStart, now)
    : 0;

  const contractStartAt = employeeProfile?.currentContractStartAt;
  const contractEndAt = employeeProfile?.currentContractEndAt;

  const reviewHistory = reviewParticipants
    .map((participant) => {
      const result = reviewResultByParticipantId.get(participant.id);
      return {
        period: `${participant.periodYear}年${participant.periodHalfYear === 1 ? "上半年" : "下半年"}`,
        score: result?.totalScore ?? 0,
        grade: result?.gradeCode ?? null,
      };
    })
    .filter((item) => item.score > 0 || item.grade);

  // 能力模型匹配度：当前聘期内 KPI 均值/kpiTotalScore*kpiWeight + 当前聘期内人才盘点均值/reviewTotalScore*reviewWeight
  let abilityMatchScore: number | null = null;
  if (contractStartAt && contractEndAt) {
    const kpiInContract = kpiRecords.filter((record) => {
      // 季度结果以季度末作为生效时点（Q2 -> 6月30日），确保季度完整结束后才计入当前聘期
      const recordDate = new Date(Date.UTC(record.year, record.quarter * 3, 0, 12, 0, 0));
      return recordDate >= contractStartAt && recordDate <= contractEndAt;
    });
    const reviewsInContract = reviewParticipants.filter((participant) => {
      // 半年度盘点以上半年末/下半年末作为生效时点（上半年 -> 6月30日）
      const month = participant.periodHalfYear === 1 ? 6 : 12;
      const resultDate = new Date(Date.UTC(participant.periodYear, month, 0, 12, 0, 0));
      return resultDate >= contractStartAt && resultDate <= contractEndAt;
    });

    const kpiMean = kpiInContract.length > 0
      ? kpiInContract.reduce((sum, record) => sum + (record.finalScore ?? 0), 0) / kpiInContract.length
      : 0;
    const reviewMean = reviewsInContract.length > 0
      ? reviewsInContract.reduce((sum, participant) => {
          const result = reviewResultByParticipantId.get(participant.id);
          return sum + (result?.totalScore ?? 0);
        }, 0) / reviewsInContract.length
      : 0;

    if (options.kpiTotalScore > 0 && options.reviewTotalScore > 0 && (kpiInContract.length > 0 || reviewsInContract.length > 0)) {
      const kpiRatio = kpiInContract.length > 0 ? (kpiMean / options.kpiTotalScore) * kpiWeight : 0;
      const reviewRatio = reviewsInContract.length > 0 ? (reviewMean / options.reviewTotalScore) * reviewWeight : 0;
      abilityMatchScore = Math.round((kpiRatio + reviewRatio) * 100);
    }
  }

  return {
    yearsOfService,
    contractEndAt: contractEndAt?.toISOString().slice(0, 10) ?? null,
    latestIncidentLevel,
    hasTwoCReviews: employeeProfile?.hasTwoCReviewsInCurrentContract === true,
    hasConsecutiveTwoCReviews: employeeProfile?.hasConsecutiveTwoCReviewsInCurrentContract === true,
    isLatestReviewC: employeeProfile?.isLatestPreRenewalReviewC === true,
    hasPromotionInCurrentContract: employeeProfile?.hasFormalPromotionInCurrentContract === true,
    kpiHistory: kpiRecords.map((record) => ({
      period: formatKpiPeriod(record.year, record.quarter),
      score: record.finalScore ?? 0,
      rating: record.finalRatingName,
    })),
    reviewHistory,
    abilityMatchScore,
    kpiTotalScore: options.kpiTotalScore,
    reviewTotalScore: options.reviewTotalScore,
    kpiWeight,
    reviewWeight,
  };
}

/**
 * 批量获取多个用户的画像补充数据。
 * 原来按人循环调用会产生 ~7×N 次 DB 往返（N+1），这里合并为固定次数的批量查询后在内存中按人组装。
 */
export async function getProfileOverviewExtrasForUsers(
  userIds: string[],
  options: ProfileExtrasOptions,
): Promise<Record<string, ProfileOverviewExtras>> {
  const result: Record<string, ProfileOverviewExtras> = {};
  if (userIds.length === 0) return result;
  const now = new Date();

  const [users, employeeProfiles, contracts, responsiblePeople, kpiRecords, reviewParticipants] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, orgNodeId: true } }),
    prisma.employeeTalentProfile.findMany({
      where: { userId: { in: userIds }, deletedAt: null },
      select: {
        userId: true,
        currentContractStartAt: true,
        currentContractEndAt: true,
        hasTwoCReviewsInCurrentContract: true,
        hasConsecutiveTwoCReviewsInCurrentContract: true,
        isLatestPreRenewalReviewC: true,
        hasFormalPromotionInCurrentContract: true,
      },
    }),
    prisma.employmentContractTerm.findMany({
      where: { userId: { in: userIds }, deletedAt: null },
      orderBy: { startDate: "asc" },
      select: { userId: true, startDate: true },
    }),
    prisma.workIncidentResponsiblePerson.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, incidentId: true },
    }),
    prisma.personalKpi.findMany({
      where: { userId: { in: userIds }, status: "COMPLETED", deletedAt: null },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
      select: { userId: true, year: true, quarter: true, finalScore: true, finalRatingName: true },
    }),
    prisma.talentReviewParticipant.findMany({
      where: { userId: { in: userIds }, status: { in: ["EVALUATED", "CONFIRMED"] } },
      orderBy: [{ periodYear: "desc" }, { periodHalfYear: "desc" }],
      select: { id: true, userId: true, periodYear: true, periodHalfYear: true },
    }),
  ]);

  // 部门归属按人去重后批量解析：闭包表一次查全，部门节点一次查全，按最大 depth 取最近部门
  const distinctOrgNodeIds = [...new Set(users.map((row) => row.orgNodeId).filter((id): id is string => Boolean(id)))];
  const departmentByOrgNodeId = new Map<string, string>();
  if (distinctOrgNodeIds.length > 0) {
    const closureRows = await prisma.orgClosure.findMany({
      where: { descendantId: { in: distinctOrgNodeIds } },
      select: { ancestorId: true, descendantId: true, depth: true },
    });
    const departmentNodes = await prisma.orgNode.findMany({
      where: { id: { in: [...new Set(closureRows.map((row) => row.ancestorId))] }, nodeType: "DEPARTMENT" },
      select: { id: true },
    });
    const departmentIdSet = new Set(departmentNodes.map((row) => row.id));
    // depth 越小离自己越近（depth 1 = 父节点），最近部门取部门祖先中 depth 最小者
    const bestDepthByOrgNodeId = new Map<string, number>();
    for (const row of closureRows) {
      if (!departmentIdSet.has(row.ancestorId)) continue;
      const currentDepth = bestDepthByOrgNodeId.get(row.descendantId);
      if (currentDepth === undefined || row.depth < currentDepth) {
        bestDepthByOrgNodeId.set(row.descendantId, row.depth);
        departmentByOrgNodeId.set(row.descendantId, row.ancestorId);
      }
    }
  }

  const distinctDepartmentIds = [...new Set(departmentByOrgNodeId.values())];
  const activeTemplates = distinctDepartmentIds.length > 0
    ? await prisma.talentReviewTemplateVersion.findMany({
        where: { departmentOrgNodeId: { in: distinctDepartmentIds }, status: "ACTIVE", deletedAt: null },
        orderBy: { publishedAt: "desc" },
        select: { departmentOrgNodeId: true, kpiWeight: true, reviewWeight: true },
      })
    : [];
  const activeTemplateByDepartmentId = new Map<string, (typeof activeTemplates)[number]>();
  for (const template of activeTemplates) {
    if (!activeTemplateByDepartmentId.has(template.departmentOrgNodeId)) {
      activeTemplateByDepartmentId.set(template.departmentOrgNodeId, template);
    }
  }

  // 事故按人取最新一条已确认记录
  const incidentIdsByUserId = new Map<string, string[]>();
  for (const row of responsiblePeople) {
    const list = incidentIdsByUserId.get(row.userId) ?? [];
    list.push(row.incidentId);
    incidentIdsByUserId.set(row.userId, list);
  }
  const allIncidentIds = [...new Set(responsiblePeople.map((row) => row.incidentId))];
  const incidents = allIncidentIds.length > 0
    ? await prisma.workIncident.findMany({
        where: { id: { in: allIncidentIds }, status: "CONFIRMED" },
        select: { id: true, level: true, occurredAt: true },
      })
    : [];
  const incidentById = new Map(incidents.map((row) => [row.id, row]));

  const participantIds = reviewParticipants.map((row) => row.id);
  const reviewResults = participantIds.length > 0
    ? await prisma.talentReviewResult.findMany({
        where: { participantId: { in: participantIds } },
        select: { participantId: true, totalScore: true, gradeCode: true },
      })
    : [];
  const reviewResultByParticipantId = new Map(reviewResults.map((row) => [row.participantId, row]));

  const profileByUserId = new Map(employeeProfiles.map((row) => [row.userId, row]));
  const earliestContractByUserId = new Map<string, Date>();
  for (const contract of contracts) {
    if (!earliestContractByUserId.has(contract.userId)) earliestContractByUserId.set(contract.userId, contract.startDate);
  }
  const kpiByUserId = new Map<string, KpiRecordRow[]>();
  for (const record of kpiRecords) {
    const list = kpiByUserId.get(record.userId) ?? [];
    list.push(record);
    kpiByUserId.set(record.userId, list);
  }
  const participantsByUserId = new Map<string, ReviewParticipantRow[]>();
  for (const participant of reviewParticipants) {
    const list = participantsByUserId.get(participant.userId) ?? [];
    list.push(participant);
    participantsByUserId.set(participant.userId, list);
  }
  const orgNodeIdByUserId = new Map(users.map((row) => [row.id, row.orgNodeId]));

  for (const userId of userIds) {
    const orgNodeId = orgNodeIdByUserId.get(userId) ?? null;
    const departmentOrgNodeId = orgNodeId ? departmentByOrgNodeId.get(orgNodeId) ?? null : null;
    const activeTemplate = departmentOrgNodeId ? activeTemplateByDepartmentId.get(departmentOrgNodeId) ?? null : null;
    const kpiWeight = activeTemplate?.kpiWeight ?? 0.6;
    const reviewWeight = activeTemplate?.reviewWeight ?? 0.4;

    const incidentIds = incidentIdsByUserId.get(userId) ?? [];
    let latestIncidentLevel: string | null = null;
    let latestIncidentOccurredAt: Date | null = null;
    for (const incidentId of incidentIds) {
      const incident = incidentById.get(incidentId);
      if (!incident) continue;
      if (!latestIncidentOccurredAt || incident.occurredAt > latestIncidentOccurredAt) {
        latestIncidentOccurredAt = incident.occurredAt;
        latestIncidentLevel = incident.level;
      }
    }

    result[userId] = buildExtrasForUser({
      employeeProfile: profileByUserId.get(userId) ?? null,
      earliestContractStart: earliestContractByUserId.get(userId) ?? null,
      latestIncidentLevel,
      kpiRecords: kpiByUserId.get(userId) ?? [],
      reviewParticipants: participantsByUserId.get(userId) ?? [],
      reviewResultByParticipantId,
      kpiWeight,
      reviewWeight,
      options,
      now,
    });
  }

  return result;
}

export async function getProfileOverviewExtras(
  userId: string,
  options: ProfileExtrasOptions,
): Promise<ProfileOverviewExtras> {
  const extrasByUserId = await getProfileOverviewExtrasForUsers([userId], options);
  const extras = extrasByUserId[userId];
  if (extras) return extras;
  // 用户不存在等异常场景：返回与批量组装一致的默认值
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { orgNodeId: true } });
  const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(user?.orgNodeId);
  const activeReviewTemplate = departmentOrgNodeId
    ? await prisma.talentReviewTemplateVersion.findFirst({
        where: { departmentOrgNodeId, status: "ACTIVE", deletedAt: null },
        orderBy: { publishedAt: "desc" },
        select: { kpiWeight: true, reviewWeight: true },
      })
    : null;
  return buildExtrasForUser({
    employeeProfile: null,
    earliestContractStart: null,
    latestIncidentLevel: null,
    kpiRecords: [],
    reviewParticipants: [],
    reviewResultByParticipantId: new Map(),
    kpiWeight: activeReviewTemplate?.kpiWeight ?? 0.6,
    reviewWeight: activeReviewTemplate?.reviewWeight ?? 0.4,
    options,
    now: new Date(),
  });
}
