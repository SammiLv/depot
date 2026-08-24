import type { Prisma, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildUserWhereByPermission, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";

type TalentViewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getTalentWorkbenchData(currentUser: TalentViewer) {
  const [userWhere, sensitiveCoverage, configCoverage] = await Promise.all([
    buildUserWhereByPermission(currentUser, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile),
    resolvePermissionCoverage(currentUser, orgPermissionModuleKeys.talent, talentAbilityKeys.viewSensitive),
    resolvePermissionCoverage(currentUser, orgPermissionModuleKeys.talent, talentAbilityKeys.manageConfig),
  ]);

  const users = await prisma.user.findMany({
    where: { ...(userWhere as Prisma.UserWhereInput), isActive: true },
    select: { id: true, name: true, title: true, orgNodeId: true, joinedAt: true, contractRenewAt: true },
    orderBy: [{ orgNodeId: "asc" }, { name: "asc" }],
  });
  const userIds = users.map((user) => user.id);
  const orgNodeIds = [...new Set(users.map((user) => user.orgNodeId).filter((id): id is string => Boolean(id)))];

  const [profiles, contracts, orgNodes] = await Promise.all([
    prisma.employeeTalentProfile.findMany({ where: { userId: { in: userIds }, deletedAt: null } }),
    prisma.employmentContractTerm.findMany({
      where: { userId: { in: userIds }, deletedAt: null, resultStatus: { not: "VOIDED" } },
      orderBy: [{ userId: "asc" }, { endDate: "desc" }],
    }),
    prisma.orgNode.findMany({ where: { id: { in: orgNodeIds } }, select: { id: true, name: true } }),
  ]);

  const jobLevelIds = profiles.map((profile) => profile.jobLevelId).filter((id): id is string => Boolean(id));
  const jobLevels = await prisma.jobLevel.findMany({ where: { id: { in: jobLevelIds }, deletedAt: null }, select: { id: true, code: true, name: true } });

  const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
  const contractByUserId = new Map<string, (typeof contracts)[number]>();
  for (const contract of contracts) if (!contractByUserId.has(contract.userId)) contractByUserId.set(contract.userId, contract);
  const orgNameById = new Map(orgNodes.map((node) => [node.id, node.name]));
  const levelById = new Map(jobLevels.map((level) => [level.id, level]));

  return {
    permissions: { canViewSensitive: sensitiveCoverage.hasPermission, canManageConfig: configCoverage.hasPermission },
    people: users.map((user) => {
      const profile = profileByUserId.get(user.id);
      const level = profile?.jobLevelId ? levelById.get(profile.jobLevelId) : null;
      return {
        id: user.id,
        name: user.name,
        team: user.orgNodeId ? orgNameById.get(user.orgNodeId) ?? "未分配" : "未分配",
        title: user.title ?? "未配置",
        level: level?.code ?? level?.name ?? "未配置",
        joinedAt: user.joinedAt?.toISOString() ?? null,
        contractEndAt: contractByUserId.get(user.id)?.endDate.toISOString() ?? user.contractRenewAt?.toISOString() ?? null,
        currentSalary: sensitiveCoverage.hasPermission || user.id === currentUser.id ? profile?.currentSalary ?? null : null,
      };
    }),
  };
}
