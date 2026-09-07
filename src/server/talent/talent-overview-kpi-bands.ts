import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

/** 人才总览只需 KPI 等级区间，不拉完整决策规则配置 */
export async function getOverviewKpiRatingBands(currentUser: Viewer) {
  const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(currentUser, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile);
  const departments = await prisma.orgNode.findMany({
    where: authorizedOrgNodeIds === null ? { nodeType: "DEPARTMENT" } : { nodeType: "DEPARTMENT", id: { in: authorizedOrgNodeIds } },
    select: { id: true },
  });
  const departmentIds = departments.map((row) => row.id);
  if (departmentIds.length === 0) {
    return { kpiRuleVersions: [], kpiBands: [] };
  }

  const kpiRuleVersions = await prisma.kpiRatingRuleVersion.findMany({
    where: { departmentOrgNodeId: { in: departmentIds }, status: "ACTIVE", deletedAt: null },
    select: { id: true, departmentOrgNodeId: true, publishedAt: true, updatedAt: true },
    orderBy: { publishedAt: "desc" },
  });
  const kpiBands = kpiRuleVersions.length
    ? await prisma.kpiRatingBand.findMany({
        where: { ruleVersionId: { in: kpiRuleVersions.map((row) => row.id) } },
        select: { ruleVersionId: true, name: true, minScore: true, maxScore: true, isUnbounded: true, sortOrder: true },
        orderBy: [{ ruleVersionId: "asc" }, { sortOrder: "asc" }],
      })
    : [];

  return { kpiRuleVersions, kpiBands };
}
