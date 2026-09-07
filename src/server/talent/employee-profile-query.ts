import type { Prisma, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildUserWhereByPermission, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { getContractExpiryStatus, getRemainingPromotionOpportunityCount, serializeProfileBoolean } from "./employee-profile";

type TalentViewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getEmployeeProfileManagementData(viewer: TalentViewer) {
  const [userWhere, editCoverage, sensitiveCoverage] = await Promise.all([
    buildUserWhereByPermission(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.editProfile),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewSensitive),
  ]);

  const users = await prisma.user.findMany({
    where: { ...(userWhere as Prisma.UserWhereInput), isActive: true, deletedAt: null },
    select: { id: true, name: true, title: true, roleType: true, orgNodeId: true, joinedAt: true, contractRenewAt: true },
    orderBy: [{ orgNodeId: "asc" }, { name: "asc" }],
  });
  const userIds = users.map((item) => item.id);
  const orgNodeIds = users.map((item) => item.orgNodeId).filter((id): id is string => Boolean(id));
  const [profiles, orgNodes, levels, confirmedContractTerms] = await Promise.all([
    prisma.employeeTalentProfile.findMany({ where: { userId: { in: userIds }, deletedAt: null } }),
    prisma.orgNode.findMany({ where: { id: { in: orgNodeIds } }, select: { id: true, name: true } }),
    prisma.jobLevel.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, code: true, name: true }, orderBy: [{ displayOrder: "asc" }, { stepOrder: "asc" }] }),
    prisma.employmentContractTerm.findMany({
      where: { userId: { in: userIds }, resultStatus: "CONFIRMED", outcome: { in: ["RENEWED", "EXTENDED"] }, deletedAt: null },
      select: { userId: true, startDate: true, endDate: true, renewalSequence: true },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const profileByUserId = new Map(profiles.map((item) => [item.userId, item]));
  const orgNameById = new Map(orgNodes.map((item) => [item.id, item.name]));
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
      return {
        id: user.id,
        hasProfile: Boolean(profile),
        name: user.name,
        organization: user.orgNodeId ? orgNameById.get(user.orgNodeId) ?? "未分配组织" : "未分配组织",
        systemRole: user.roleType,
        originalTitle: user.title,
        joinedAt: user.joinedAt?.toISOString().slice(0, 10) ?? "",
        currentContractStartAt: profile?.currentContractStartAt?.toISOString().slice(0, 10) ?? matchingContractTerm?.startDate.toISOString().slice(0, 10) ?? "",
        currentContractEndAt: currentContractEndAt?.toISOString().slice(0, 10) ?? "",
        contractExpiryStatus: getContractExpiryStatus(currentContractEndAt, referenceDate),
        remainingPromotionOpportunityCount: getRemainingPromotionOpportunityCount(currentContractEndAt, referenceDate),
        currentContractSequence: profile?.currentContractSequence ?? null,
        entryJobLevelId: profile?.entryJobLevelId ?? "",
        jobLevelId: profile?.jobLevelId ?? "",
        startingSalary: sensitiveCoverage.hasPermission || user.id === viewer.id ? profile?.startingSalary ?? null : null,
        currentSalary: sensitiveCoverage.hasPermission || user.id === viewer.id ? profile?.currentSalary ?? null : null,
        hasTwoCReviewsInCurrentContract: serializeProfileBoolean(profile?.hasTwoCReviewsInCurrentContract),
        hasConsecutiveTwoCReviewsInCurrentContract: serializeProfileBoolean(profile?.hasConsecutiveTwoCReviewsInCurrentContract),
        isLatestPreRenewalReviewC: serializeProfileBoolean(profile?.isLatestPreRenewalReviewC),
        hasFormalPromotionInCurrentContract: serializeProfileBoolean(profile?.hasFormalPromotionInCurrentContract),
        decisionFactsUpdatedAt: profile?.decisionFactsUpdatedAt?.toISOString() ?? null,
        decisionFactsUpdateNote: profile?.decisionFactsUpdateNote ?? "",
        profileNote: profile?.profileNote ?? "",
      };
    }),
  };
}
