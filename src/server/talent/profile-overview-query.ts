import { prisma } from "@/server/db/prisma";

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
};

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

export async function getProfileOverviewExtras(
  userId: string,
  options: { kpiTotalScore: number; reviewTotalScore: number },
): Promise<ProfileOverviewExtras> {
  const now = new Date();

  const [employeeProfile, earliestContract, responsiblePeople, kpiRecords, reviewParticipants] = await Promise.all([
    prisma.employeeTalentProfile.findFirst({
      where: { userId, deletedAt: null },
      select: {
        currentContractStartAt: true,
        currentContractEndAt: true,
        hasTwoCReviewsInCurrentContract: true,
        hasConsecutiveTwoCReviewsInCurrentContract: true,
        isLatestPreRenewalReviewC: true,
        hasFormalPromotionInCurrentContract: true,
      },
    }),
    prisma.employmentContractTerm.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { startDate: "asc" },
      select: { startDate: true },
    }),
    prisma.workIncidentResponsiblePerson.findMany({
      where: { userId },
      select: { incidentId: true },
    }),
    prisma.personalKpi.findMany({
      where: { userId, status: "COMPLETED", deletedAt: null },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
      select: { year: true, quarter: true, finalScore: true, finalRatingName: true },
    }),
    prisma.talentReviewParticipant.findMany({
      where: { userId, status: { in: ["EVALUATED", "CONFIRMED"] } },
      orderBy: [{ periodYear: "desc" }, { periodHalfYear: "desc" }],
      select: { id: true, periodYear: true, periodHalfYear: true },
    }),
  ]);

  const incidentIds = responsiblePeople.map((row) => row.incidentId);
  const latestIncident = incidentIds.length > 0
    ? await prisma.workIncident.findFirst({
        where: { id: { in: incidentIds }, status: "CONFIRMED" },
        orderBy: { occurredAt: "desc" },
        select: { level: true },
      })
    : null;

  const participantIds = reviewParticipants.map((row) => row.id);
  const reviewResults = participantIds.length > 0
    ? await prisma.talentReviewResult.findMany({
        where: { participantId: { in: participantIds } },
        select: { participantId: true, totalScore: true, gradeCode: true },
      })
    : [];
  const reviewResultByParticipantId = new Map(reviewResults.map((row) => [row.participantId, row]));

  const yearsOfService = earliestContract
    ? calculateYearsOfService(earliestContract.startDate, now)
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

  // 能力模型匹配度：当前聘期内 KPI 均值/kpiTotalScore*60% + 当前聘期内人才盘点均值/reviewTotalScore*40%
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
      const kpiRatio = kpiInContract.length > 0 ? (kpiMean / options.kpiTotalScore) * 0.6 : 0;
      const reviewRatio = reviewsInContract.length > 0 ? (reviewMean / options.reviewTotalScore) * 0.4 : 0;
      abilityMatchScore = Math.round((kpiRatio + reviewRatio) * 100);
    }
  }

  return {
    yearsOfService,
    contractEndAt: contractEndAt?.toISOString().slice(0, 10) ?? null,
    latestIncidentLevel: latestIncident?.level ?? null,
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
  };
}
