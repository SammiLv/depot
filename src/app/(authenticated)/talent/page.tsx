import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { buildUserWhereByPermission, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { getBusinessAssessmentPageData } from "@/server/talent/assessment-query";
import { getTalentHistoryData, getTalentRecommendationData } from "@/server/talent/decision-history-query";
import { getWorkIncidentPageData } from "@/server/talent/incident-query";
import { getEmployeeProfileManagementData } from "@/server/talent/employee-profile-query";
import { getRemainingPromotionOpportunityCount } from "@/server/talent/employee-profile";
import { getCareerConfiguration, getCompetencyConfiguration } from "@/server/talent/config-query";
import { getTalentReviewConfig, getTalentReviewCycleDetail, getTalentReviewCycles } from "@/server/talent/review-query";
import { getTalentDecisionRuleConfiguration } from "@/server/talent/decision-rule-query";
import { getProfileOverviewExtras } from "@/server/talent/profile-overview-query";
import TalentPageContent from "./content";
import type { TalentOperationWorkspaceData } from "./operation-workspace-types";
import type { ReviewWorkspaceData } from "./review-workspace-types";

function startOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
}

function endOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
}

export default async function TalentPage() {
  const user = await requireCurrentUser();
  const [profileCoverage, reviewCoverage, recommendationCoverage, historyCoverage, configCoverage] = await Promise.all([
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewReview),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewRecommendation),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewHistory),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewConfig),
  ]);
  const visibleSections = ([
    ["overview", profileCoverage],
    ["review", reviewCoverage],
    ["decision", recommendationCoverage],
    ["history", historyCoverage],
    ["config", configCoverage],
  ] as const).filter(([, coverage]) => coverage.hasPermission).map(([key]) => key);
  const [config, cycles, assessment, incident, decision, history, employeeProfiles, career, competency, decisionRules] = await Promise.all([
    getTalentReviewConfig(user),
    getTalentReviewCycles(user),
    getBusinessAssessmentPageData(user),
    getWorkIncidentPageData(user),
    getTalentRecommendationData(user),
    getTalentHistoryData(user),
    getEmployeeProfileManagementData(user),
    getCareerConfiguration(user),
    getCompetencyConfiguration(user),
    getTalentDecisionRuleConfiguration(user),
  ]);
  // 总览收口：盘点参与人再按 VIEW_TALENT_PROFILE 的可见用户范围过滤，下游统计/列表共用同一份 details。
  // 无画像权限时过滤为空集，不能放行全量；结果/维度结果同步收口，避免九宫格计数等聚合数据越权。
  const profileVisibleUserIds = profileCoverage.hasPermission
    ? new Set(
        (await prisma.user.findMany({
          where: await buildUserWhereByPermission(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile),
          select: { id: true },
        })).map((row) => row.id),
      )
    : new Set<string>();
  const details = (await Promise.all(cycles.cycles.map((cycle) => getTalentReviewCycleDetail(user, cycle.id))))
    .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
    .map((detail) => {
      const participants = detail.participants.filter((participant) => profileVisibleUserIds.has(participant.userId));
      const participantIds = new Set(participants.map((participant) => participant.id));
      return {
        ...detail,
        cycleId: detail.cycle.id,
        cycleStatus: detail.cycle.status,
        participants,
        results: detail.results.filter((result) => participantIds.has(result.participantId)),
        dimensionResults: detail.dimensionResults.filter((result) => participantIds.has(result.participantId)),
      };
    });

  // 人才画像以全部可见员工为底表，关联数据（KPI/业务考核/合同/晋升/奖励）需覆盖全部可见员工，而非仅盘点参与人
  const participantUserIds = [...new Set([
    ...details.flatMap((detail) => detail.participants.map((participant) => participant.userId)),
    ...profileVisibleUserIds,
  ])].filter(Boolean);
  const now = new Date();
  const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  const quarterStart = startOfQuarter(now);
  const quarterEnd = endOfQuarter(now);

  const [latestKpis, latestAssessmentSummaries, assessmentCycles, contractsExpiringSoonProfiles, recentPromotionRecords, currentQuarterRewardRecords, employeeProfilesForPromotion] = await Promise.all([
    prisma.personalKpi.findMany({
      where: { userId: { in: participantUserIds }, status: "COMPLETED", deletedAt: null },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
      select: { userId: true, year: true, quarter: true, finalScore: true, finalRatingName: true },
    }),
    prisma.businessAssessmentSummary.findMany({
      where: { userId: { in: participantUserIds } },
      select: { id: true, userId: true, cycleId: true, earnedScore: true, maxScore: true, isOverallPassed: true },
    }),
    prisma.businessAssessmentCycle.findMany({
      where: { deletedAt: null },
      select: { id: true, year: true, quarter: true },
    }),
    prisma.employeeTalentProfile.findMany({
      where: {
        userId: { in: participantUserIds },
        deletedAt: null,
        currentContractEndAt: { gte: now, lte: ninetyDaysLater },
      },
      select: { userId: true },
    }),
    prisma.promotionRecord.findMany({
      where: {
        userId: { in: participantUserIds },
        deletedAt: null,
        outcome: "SUCCESS",
        resultStatus: "CONFIRMED",
        effectiveDate: { gte: yearStart, lte: yearEnd },
      },
      select: { userId: true, effectiveDate: true },
    }),
    prisma.rewardRecord.findMany({
      where: {
        userId: { in: participantUserIds },
        deletedAt: null,
        resultStatus: "CONFIRMED",
        effectiveDate: { gte: quarterStart, lte: quarterEnd },
      },
      select: { userId: true },
    }),
    prisma.employeeTalentProfile.findMany({
      where: { userId: { in: participantUserIds }, deletedAt: null },
      select: { userId: true, currentContractEndAt: true, hasFormalPromotionInCurrentContract: true },
    }),
  ]);

  const cycleById = new Map(assessmentCycles.map((cycle) => [cycle.id, cycle]));

  const overviewCycle = cycles.cycles[0];
  const overviewDepartmentOrgNodeId = overviewCycle?.departmentOrgNodeId;
  const overviewTemplateVersionId = overviewCycle?.templateVersionId;

  const [activeKpiRule, reviewDimensions] = await Promise.all([
    overviewDepartmentOrgNodeId
      ? prisma.kpiRatingRuleVersion.findFirst({
          where: { departmentOrgNodeId: overviewDepartmentOrgNodeId, status: "ACTIVE", deletedAt: null },
          orderBy: { publishedAt: "desc" },
          select: { quarterlyKpiTotalScore: true },
        })
      : Promise.resolve(null),
    overviewTemplateVersionId
      ? prisma.talentReviewDimension.findMany({
          where: { templateVersionId: overviewTemplateVersionId },
          select: { maxScore: true },
        })
      : Promise.resolve([]),
  ]);
  const kpiTotalScore = activeKpiRule?.quarterlyKpiTotalScore ?? 110;
  const reviewTotalScore = reviewDimensions.reduce((sum, dimension) => sum + (dimension.maxScore ?? 0), 0) || 30;

  const profileExtrasByUserId: Record<string, Awaited<ReturnType<typeof getProfileOverviewExtras>>> = {};
  if (participantUserIds.length > 0) {
    const extrasList = await Promise.all(
      participantUserIds.map((userId) => getProfileOverviewExtras(userId, { kpiTotalScore, reviewTotalScore }).catch(() => null)),
    );
    participantUserIds.forEach((userId, index) => {
      const extras = extrasList[index];
      if (extras) profileExtrasByUserId[userId] = extras;
    });
  }

  const lowPromotionOpportunityProfiles = employeeProfilesForPromotion.filter((profile) => {
    if (!profile.currentContractEndAt) return false;
    if (profile.hasFormalPromotionInCurrentContract === true) return false;
    const count = getRemainingPromotionOpportunityCount(profile.currentContractEndAt, now);
    return count !== null && count <= 2;
  });
  const lowPromotionOpportunityCount = lowPromotionOpportunityProfiles.length;

  const latestPromotionRecord = recentPromotionRecords.length > 0
    ? recentPromotionRecords.reduce((latest, record) => (record.effectiveDate > latest.effectiveDate ? record : latest))
    : null;
  const recentPromotionHalfYear = latestPromotionRecord
    ? (latestPromotionRecord.effectiveDate.getMonth() < 6 ? "first" : "second")
    : "first";
  const recentPromotionUserIds = [...new Set(
    recentPromotionRecords
      .filter((record) => {
        const month = record.effectiveDate.getMonth();
        const halfYear = month < 6 ? "first" : "second";
        return halfYear === recentPromotionHalfYear;
      })
      .map((record) => record.userId),
  )];

  const contractsExpiringSoonUserIds = contractsExpiringSoonProfiles.map((profile) => profile.userId);
  const currentQuarterRewardUserIds = [...new Set(currentQuarterRewardRecords.map((record) => record.userId))];

  const statUserIds = [...new Set([
    ...contractsExpiringSoonUserIds,
    ...lowPromotionOpportunityProfiles.map((profile) => profile.userId),
    ...recentPromotionUserIds,
    ...currentQuarterRewardUserIds,
  ])];
  const statUsers = statUserIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: statUserIds } }, select: { id: true, name: true } })
    : [];
  const userNameById = new Map(statUsers.map((row) => [row.id, row.name]));

  const contractsExpiringSoonNames = contractsExpiringSoonUserIds.map((id) => userNameById.get(id) ?? id);
  const lowPromotionOpportunityNames = lowPromotionOpportunityProfiles.map((profile) => userNameById.get(profile.userId) ?? profile.userId);
  const recentPromotionNames = recentPromotionUserIds.map((id) => userNameById.get(id) ?? id);
  const currentQuarterRewardNames = currentQuarterRewardUserIds.map((id) => userNameById.get(id) ?? id);

  const latestKpiByUserId: Record<string, (typeof latestKpis)[number]> = {};
  for (const kpi of latestKpis) {
    if (!latestKpiByUserId[kpi.userId]) {
      latestKpiByUserId[kpi.userId] = kpi;
    }
  }

  const latestAssessmentByUserId: Record<string, (typeof latestAssessmentSummaries)[number] & { cycle: { year: number; quarter: number } | null }> = {};
  const sortedSummaries = [...latestAssessmentSummaries]
    .map((summary) => ({ ...summary, cycle: cycleById.get(summary.cycleId) ?? null }))
    .sort((left, right) => {
      const leftYear = left.cycle?.year ?? 0;
      const rightYear = right.cycle?.year ?? 0;
      if (leftYear !== rightYear) return rightYear - leftYear;
      return (right.cycle?.quarter ?? 0) - (left.cycle?.quarter ?? 0);
    });
  for (const summary of sortedSummaries) {
    if (!latestAssessmentByUserId[summary.userId]) {
      latestAssessmentByUserId[summary.userId] = summary;
    }
  }

  const reviewWorkspace = JSON.parse(JSON.stringify({ config, cycles, details })) as ReviewWorkspaceData;
  const operationWorkspace = JSON.parse(JSON.stringify({ assessment, incident, decision, history, employeeProfiles, career, competency, decisionRules })) as TalentOperationWorkspaceData;
  return (
    <TalentPageContent
      reviewWorkspace={reviewWorkspace}
      operationWorkspace={operationWorkspace}
      latestKpiByUserId={latestKpiByUserId}
      latestAssessmentByUserId={latestAssessmentByUserId}
      statCards={{
        contractsExpiringSoon: contractsExpiringSoonProfiles.length,
        contractsExpiringSoonNames,
        recentPromotions: recentPromotionUserIds.length,
        recentPromotionHalfYear,
        recentPromotionNames,
        lowPromotionOpportunityCount,
        lowPromotionOpportunityNames,
        currentQuarterRewards: currentQuarterRewardRecords.length,
        currentQuarterRewardNames,
      }}
      profileExtrasByUserId={profileExtrasByUserId}
      visibleSections={visibleSections}
    />
  );
}
