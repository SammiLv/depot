import type { Prisma, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildUserWhereByPermission, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { getContractExpiryStatus, getRemainingPromotionOpportunityCount, serializeProfileBoolean } from "./employee-profile";
import { groupSuccessPromotionsByUserId, hasSuccessfulPromotionInCurrentContract } from "./formal-promotion-in-contract";
import { computeReviewCFacts, type ReviewPeriodGrade } from "./review-c-facts";

type TalentViewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getEmployeeProfileManagementData(viewer: TalentViewer) {
  const [userWhere, editCoverage, sensitiveCoverage] = await Promise.all([
    buildUserWhereByPermission(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.editProfile),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewSensitive),
  ]);

  // 人才档案包含所有人员（含离职）：这是查询全员信息的唯一入口
  const users = await prisma.user.findMany({
    where: { ...(userWhere as Prisma.UserWhereInput), deletedAt: null },
    select: { id: true, name: true, title: true, roleType: true, orgNodeId: true, joinedAt: true, contractRenewAt: true, resignedAt: true },
    orderBy: [{ orgNodeId: "asc" }, { name: "asc" }],
  });
  const userIds = users.map((item) => item.id);
  const orgNodeIds = users.map((item) => item.orgNodeId).filter((id): id is string => Boolean(id));
  const [profiles, orgNodes, levels, confirmedContractTerms, successPromotions] = await Promise.all([
    prisma.employeeTalentProfile.findMany({ where: { userId: { in: userIds }, deletedAt: null } }),
    prisma.orgNode.findMany({ where: { id: { in: orgNodeIds } }, select: { id: true, name: true } }),
    prisma.jobLevel.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, code: true, name: true }, orderBy: [{ displayOrder: "asc" }, { stepOrder: "asc" }] }),
    prisma.employmentContractTerm.findMany({
      where: { userId: { in: userIds }, resultStatus: "CONFIRMED", outcome: { in: ["RENEWED", "EXTENDED"] }, deletedAt: null },
      select: { userId: true, startDate: true, endDate: true, renewalSequence: true },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    }),
    userIds.length
      ? prisma.promotionRecord.findMany({
          where: { userId: { in: userIds }, deletedAt: null, resultStatus: "CONFIRMED", outcome: "SUCCESS" },
          select: { userId: true, effectiveDate: true, outcome: true, resultStatus: true },
        })
      : Promise.resolve([]),
  ]);
  const successPromotionsByUserId = groupSuccessPromotionsByUserId(successPromotions);
  const profileByUserId = new Map(profiles.map((item) => [item.userId, item]));
  const orgNameById = new Map(orgNodes.map((item) => [item.id, item.name]));

  // 「人才决策事实」三项从盘点历史自动计算（只取已确认结果），不再依赖档案手工维护
  const reviewParticipants = userIds.length
    ? await prisma.talentReviewParticipant.findMany({
        where: { userId: { in: userIds } },
        select: { id: true, userId: true, periodYear: true, periodHalfYear: true },
      })
    : [];
  const reviewResults = reviewParticipants.length
    ? await prisma.talentReviewResult.findMany({
        where: { participantId: { in: reviewParticipants.map((row) => row.id) }, confirmedAt: { not: null } },
        select: { participantId: true, gradeCode: true },
      })
    : [];
  const gradeByParticipantId = new Map(reviewResults.map((row) => [row.participantId, row.gradeCode]));
  const reviewGradesByUserId = new Map<string, ReviewPeriodGrade[]>();
  for (const participant of reviewParticipants) {
    const grade = gradeByParticipantId.get(participant.id);
    if (!grade) continue;
    const list = reviewGradesByUserId.get(participant.userId) ?? [];
    list.push({ year: participant.periodYear, half: participant.periodHalfYear, grade });
    reviewGradesByUserId.set(participant.userId, list);
  }
  const latestContractTermByUserId = new Map<string, (typeof confirmedContractTerms)[number]>();
  const referenceDate = new Date();
  for (const term of confirmedContractTerms) {
    if (!latestContractTermByUserId.has(term.userId)) latestContractTermByUserId.set(term.userId, term);
  }

  return {
    canEdit: editCoverage.hasPermission,
    canViewSensitive: sensitiveCoverage.hasPermission,
    viewerId: viewer.id,
    levels,
    employees: users.map((user) => {
      const profile = profileByUserId.get(user.id);
      const latestContractTerm = latestContractTermByUserId.get(user.id);
      const matchingContractTerm = profile && latestContractTerm
        && profile.currentContractSequence === latestContractTerm.renewalSequence
        && profile.currentContractEndAt?.toISOString().slice(0, 10) === latestContractTerm.endDate.toISOString().slice(0, 10)
        ? latestContractTerm
        : null;
      const currentContractEndAt = profile?.currentContractEndAt ?? user.contractRenewAt ?? null;
      const contractStartAt = profile?.currentContractStartAt ?? matchingContractTerm?.startDate ?? null;
      const promotedInCurrentContract = hasSuccessfulPromotionInCurrentContract(
        successPromotionsByUserId.get(user.id) ?? [],
        contractStartAt,
        currentContractEndAt,
      );
      const reviewCFacts = computeReviewCFacts(
        reviewGradesByUserId.get(user.id) ?? [],
        contractStartAt,
        currentContractEndAt,
      );
      return {
        id: user.id,
        hasProfile: Boolean(profile),
        name: user.name,
        isResigned: Boolean(user.resignedAt),
        organization: user.orgNodeId ? orgNameById.get(user.orgNodeId) ?? "未分配组织" : "未分配组织",
        systemRole: user.roleType,
        originalTitle: user.title,
        joinedAt: user.joinedAt?.toISOString().slice(0, 10) ?? "",
        currentContractStartAt: profile?.currentContractStartAt?.toISOString().slice(0, 10) ?? matchingContractTerm?.startDate.toISOString().slice(0, 10) ?? "",
        currentContractEndAt: currentContractEndAt?.toISOString().slice(0, 10) ?? "",
        contractExpiryStatus: getContractExpiryStatus(currentContractEndAt, referenceDate),
        // 离职人员不做晋升机会统计
        remainingPromotionOpportunityCount: user.resignedAt || promotedInCurrentContract
          ? null
          : getRemainingPromotionOpportunityCount(currentContractEndAt, referenceDate),
        currentContractSequence: profile?.currentContractSequence ?? null,
        entryJobLevelId: profile?.entryJobLevelId ?? "",
        jobLevelId: profile?.jobLevelId ?? "",
        startingSalary: sensitiveCoverage.hasPermission || user.id === viewer.id ? profile?.startingSalary ?? null : null,
        currentSalary: sensitiveCoverage.hasPermission || user.id === viewer.id ? profile?.currentSalary ?? null : null,
        hasTwoCReviewsInCurrentContract: serializeProfileBoolean(reviewCFacts.hasTwoC),
        hasConsecutiveTwoCReviewsInCurrentContract: serializeProfileBoolean(reviewCFacts.consecutiveTwoC),
        isLatestPreRenewalReviewC: serializeProfileBoolean(reviewCFacts.preRenewalC),
        hasFormalPromotionInCurrentContract: promotedInCurrentContract
          ? "YES"
          : serializeProfileBoolean(profile?.hasFormalPromotionInCurrentContract),
        decisionFactsUpdatedAt: profile?.decisionFactsUpdatedAt?.toISOString() ?? null,
        decisionFactsUpdateNote: profile?.decisionFactsUpdateNote ?? "",
        profileNote: profile?.profileNote ?? "",
      };
    }),
  };
}
