import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { findMissingHalfYearEvidence, isRestrictionActiveAt, resolveDecisionPeriod } from "./decision-cycle-engine";

export async function calculateDecisionCycleEvidence(cycleId: string, actorId: string) {
  const cycle = await prisma.talentDecisionCycle.findFirst({ where: { id: cycleId, deletedAt: null } });
  if (!cycle) throw new Error("决策批次不存在");
  if (cycle.status === "CONFIRMED") throw new Error("已确认批次的证据快照不可重新计算");

  const period = resolveDecisionPeriod(cycle.year, cycle.decisionMonth);
  const orgNodeIds = await getDescendantOrgNodeIds(cycle.departmentOrgNodeId);
  const users = await prisma.user.findMany({
    where: { orgNodeId: { in: orgNodeIds }, roleType: { in: ["TEAM_LEADER", "MEMBER"] }, isActive: true, deletedAt: null },
    select: { id: true, name: true, orgNodeId: true, title: true },
    orderBy: { name: "asc" },
  });
  const userIds = users.map((row) => row.id);
  const quarterWhere = period.quarters.map((row) => ({ year: row.year, quarter: row.quarter }));
  const [profiles, kpis, participants, assessmentCycles, restrictions, promotions, salaries, contracts, rewards] = await Promise.all([
    prisma.employeeTalentProfile.findMany({ where: { userId: { in: userIds }, deletedAt: null } }),
    prisma.personalKpi.findMany({ where: { userId: { in: userIds }, status: "COMPLETED", deletedAt: null, OR: quarterWhere }, orderBy: [{ year: "asc" }, { quarter: "asc" }] }),
    prisma.talentReviewParticipant.findMany({ where: { userId: { in: userIds }, periodYear: period.reviewYear, periodHalfYear: period.reviewHalfYear, status: "CONFIRMED" } }),
    prisma.businessAssessmentCycle.findMany({ where: { departmentOrgNodeId: cycle.departmentOrgNodeId, status: "CONFIRMED", deletedAt: null, OR: quarterWhere } }),
    prisma.incidentRestriction.findMany({ where: { userId: { in: userIds }, effectiveFrom: { lte: period.decisionDate } } }),
    prisma.promotionRecord.findMany({ where: { userId: { in: userIds }, resultStatus: "CONFIRMED", deletedAt: null, effectiveDate: { lte: period.observationEndDate } }, orderBy: { effectiveDate: "asc" } }),
    prisma.salaryAdjustmentRecord.findMany({ where: { userId: { in: userIds }, resultStatus: "CONFIRMED", deletedAt: null, effectiveDate: { lte: period.observationEndDate } }, orderBy: { effectiveDate: "asc" } }),
    prisma.employmentContractTerm.findMany({ where: { userId: { in: userIds }, resultStatus: "CONFIRMED", deletedAt: null, startDate: { lte: period.observationEndDate } }, orderBy: { startDate: "asc" } }),
    prisma.rewardRecord.findMany({ where: { userId: { in: userIds }, resultStatus: "CONFIRMED", deletedAt: null, effectiveDate: { lte: period.observationEndDate } }, orderBy: { effectiveDate: "asc" } }),
  ]);
  const reviewResults = await prisma.talentReviewResult.findMany({ where: { participantId: { in: participants.map((row) => row.id) } } });
  const assessmentSummaries = await prisma.businessAssessmentSummary.findMany({ where: { cycleId: { in: assessmentCycles.map((row) => row.id) }, userId: { in: userIds } } });
  const profileByUser = new Map(profiles.map((row) => [row.userId, row]));
  const resultByParticipant = new Map(reviewResults.map((row) => [row.participantId, row]));
  const now = new Date();

  for (const user of users) {
    const profile = profileByUser.get(user.id) ?? null;
    const userKpis = kpis.filter((row) => row.userId === user.id);
    const participant = participants.find((row) => row.userId === user.id) ?? null;
    const review = participant ? resultByParticipant.get(participant.id) ?? null : null;
    const userAssessmentRows = assessmentCycles.map((assessmentCycle) => ({
      cycle: assessmentCycle,
      summary: assessmentSummaries.find((row) => row.cycleId === assessmentCycle.id && row.userId === user.id) ?? null,
    }));
    const activeRestrictions = restrictions.filter((row) => row.userId === user.id && isRestrictionActiveAt(row, period.decisionDate));
    const missingItems = findMissingHalfYearEvidence({
      quarters: period.quarters,
      kpis: userKpis,
      hasTalentReview: Boolean(review),
      assessments: userAssessmentRows.map(({ cycle: row, summary }) => ({ year: row.year, quarter: row.quarter, hasSummary: Boolean(summary) })),
    });
    const evidence = {
      schemaVersion: 1,
      capturedAt: now.toISOString(),
      period: {
        year: period.year,
        decisionMonth: period.decisionMonth,
        observationStartDate: period.observationStartDate,
        observationEndDate: period.observationEndDate,
        decisionDate: period.decisionDate,
        dataCutoffDate: period.dataCutoffDate,
        quarters: period.quarters,
        reviewYear: period.reviewYear,
        reviewHalfYear: period.reviewHalfYear,
      },
      employee: { id: user.id, name: user.name, title: user.title, orgNodeId: user.orgNodeId, profile },
      kpis: userKpis.map((row) => ({ id: row.id, year: row.year, quarter: row.quarter, finalScore: row.finalScore, finalRatingName: row.finalRatingName, ratingRuleVersionId: row.ratingRuleVersionId, ratingSnapshotJson: row.ratingSnapshotJson })),
      talentReview: participant && review ? { participant, result: review } : null,
      businessAssessments: userAssessmentRows.map(({ cycle: row, summary }) => ({ cycleId: row.id, year: row.year, quarter: row.quarter, status: row.status, summary })),
      activeRestrictions,
      formalHistory: {
        promotions: promotions.filter((row) => row.userId === user.id),
        salaryAdjustments: salaries.filter((row) => row.userId === user.id),
        contracts: contracts.filter((row) => row.userId === user.id),
        rewards: rewards.filter((row) => row.userId === user.id),
      },
    };
    await prisma.talentDecisionEmployeeResult.upsert({
      where: { cycleId_userId: { cycleId, userId: user.id } },
      create: {
        cycleId,
        userId: user.id,
        orgNodeIdSnapshot: user.orgNodeId,
        jobRoleIdSnapshot: profile?.jobRoleId,
        jobLevelIdSnapshot: profile?.jobLevelId,
        evidenceStatus: missingItems.length ? "INCOMPLETE" : "READY",
        missingItemsJson: JSON.stringify(missingItems),
        kpiCount: userKpis.length,
        assessmentCount: userAssessmentRows.filter((row) => row.summary).length,
        activeRestrictionCount: activeRestrictions.length,
        evidenceSnapshotJson: JSON.stringify(evidence),
        ruleSnapshotJson: cycle.ruleSnapshotJson,
        calculatedById: actorId,
        calculatedAt: now,
      },
      update: {
        orgNodeIdSnapshot: user.orgNodeId,
        jobRoleIdSnapshot: profile?.jobRoleId,
        jobLevelIdSnapshot: profile?.jobLevelId,
        evidenceStatus: missingItems.length ? "INCOMPLETE" : "READY",
        missingItemsJson: JSON.stringify(missingItems),
        kpiCount: userKpis.length,
        assessmentCount: userAssessmentRows.filter((row) => row.summary).length,
        activeRestrictionCount: activeRestrictions.length,
        evidenceSnapshotJson: JSON.stringify(evidence),
        ruleSnapshotJson: cycle.ruleSnapshotJson,
        calculatedById: actorId,
        calculatedAt: now,
        frozenAt: null,
      },
    });
  }
  await prisma.talentDecisionCycle.update({ where: { id: cycleId }, data: { status: "PENDING_CONFIRMATION", calculatedById: actorId, calculatedAt: now } });
  return { candidateCount: users.length };
}
