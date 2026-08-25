import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { buildUserWhereByPermission, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { getEmployeeProfileManagementData } from "@/server/talent/employee-profile-query";
import { getRemainingPromotionOpportunityCount } from "@/server/talent/employee-profile";
import { getTalentDecisionRuleConfiguration } from "@/server/talent/decision-rule-query";
import { getProfileOverviewExtrasForUsers } from "@/server/talent/profile-overview-query";
import { TalentOverviewContent } from "./content";
import { loadTalentOverviewReviewDetails } from "./load-review-workspace";
import { resolveTalentVisibleSections } from "./resolve-visible-sections";
import { resolveLegacyTalentSectionRedirect } from "./talent-sections";
import { TalentSectionPage } from "./talent-section-page";
import type { TalentOperationWorkspaceData } from "./operation-workspace-types";

function startOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
}

function endOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
}

type PageProps = {
  searchParams?: Promise<{ section?: string; tab?: string }>;
};

export default async function TalentPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const legacySection = params?.section ?? params?.tab;
  const legacyRedirect = resolveLegacyTalentSectionRedirect(legacySection, new URLSearchParams());
  if (legacyRedirect) redirect(legacyRedirect);

  const user = await requireCurrentUser();
  const visibleSections = await resolveTalentVisibleSections(user);
  if (!visibleSections.includes("overview")) {
    redirect(visibleSections[0] === "review" ? "/talent/review"
      : visibleSections[0] === "decision" ? "/talent/decision"
      : visibleSections[0] === "history" ? "/talent/history"
      : visibleSections[0] === "config" ? "/talent/config"
      : "/");
  }

  const profileCoverage = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile);
  const [reviewWorkspace, employeeProfiles, decisionRules] = await Promise.all([
    loadTalentOverviewReviewDetails(user),
    getEmployeeProfileManagementData(user),
    getTalentDecisionRuleConfiguration(user),
  ]);

  const profileVisibleUserIds = profileCoverage.hasPermission
    ? new Set(
        (await prisma.user.findMany({
          where: await buildUserWhereByPermission(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile),
          select: { id: true },
        })).map((row) => row.id),
      )
    : new Set<string>();

  const participantUserIds = [...new Set([
    ...reviewWorkspace.details.flatMap((detail) => detail.participants.map((participant) => participant.userId)),
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
  const overviewCycle = reviewWorkspace.cycles.cycles[0];
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

  const profileExtrasByUserId: Record<string, Awaited<ReturnType<typeof import("@/server/talent/profile-overview-query").getProfileOverviewExtras>>> = {};
  if (participantUserIds.length > 0) {
    try {
      Object.assign(
        profileExtrasByUserId,
        await getProfileOverviewExtrasForUsers(participantUserIds, { kpiTotalScore, reviewTotalScore }),
      );
    } catch {
      // 批量查询失败时降级为空
    }
  }

  const lowPromotionOpportunityProfiles = employeeProfilesForPromotion.filter((profile) => {
    if (!profile.currentContractEndAt) return false;
    if (profile.hasFormalPromotionInCurrentContract === true) return false;
    const count = getRemainingPromotionOpportunityCount(profile.currentContractEndAt, now);
    return count !== null && count <= 2;
  });

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

  const statUserIds = [...new Set([
    ...contractsExpiringSoonProfiles.map((profile) => profile.userId),
    ...lowPromotionOpportunityProfiles.map((profile) => profile.userId),
    ...recentPromotionUserIds,
    ...[...new Set(currentQuarterRewardRecords.map((record) => record.userId))],
  ])];
  const statUsers = statUserIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: statUserIds } }, select: { id: true, name: true } })
    : [];
  const userNameById = new Map(statUsers.map((row) => [row.id, row.name]));

  const latestKpiByUserId: Record<string, (typeof latestKpis)[number]> = {};
  for (const kpi of latestKpis) {
    if (!latestKpiByUserId[kpi.userId]) latestKpiByUserId[kpi.userId] = kpi;
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
    if (!latestAssessmentByUserId[summary.userId]) latestAssessmentByUserId[summary.userId] = summary;
  }

  const operationWorkspace = JSON.parse(JSON.stringify({ employeeProfiles, decisionRules })) as TalentOperationWorkspaceData;

  return (
    <TalentSectionPage visibleSections={visibleSections} activeSection="overview">
      <TalentOverviewContent
        reviewWorkspace={JSON.parse(JSON.stringify(reviewWorkspace))}
        operationWorkspace={operationWorkspace}
        latestKpiByUserId={latestKpiByUserId}
        latestAssessmentByUserId={latestAssessmentByUserId}
        statCards={{
          contractsExpiringSoon: contractsExpiringSoonProfiles.length,
          contractsExpiringSoonNames: contractsExpiringSoonProfiles.map((profile) => userNameById.get(profile.userId) ?? profile.userId),
          recentPromotions: recentPromotionUserIds.length,
          recentPromotionHalfYear,
          recentPromotionNames: recentPromotionUserIds.map((id) => userNameById.get(id) ?? id),
          lowPromotionOpportunityCount: lowPromotionOpportunityProfiles.length,
          lowPromotionOpportunityNames: lowPromotionOpportunityProfiles.map((profile) => userNameById.get(profile.userId) ?? profile.userId),
          currentQuarterRewards: currentQuarterRewardRecords.length,
          currentQuarterRewardNames: [...new Set(currentQuarterRewardRecords.map((record) => record.userId))].map((id) => userNameById.get(id) ?? id),
        }}
        profileExtrasByUserId={profileExtrasByUserId}
      />
    </TalentSectionPage>
  );
}
