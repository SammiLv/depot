import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getBusinessAssessmentPageData(
  viewer: Viewer,
  options?: { selectedYear?: number; selectedQuarter?: number },
) {
  const manageCoverage = await resolvePermissionCoverage(viewer, orgPermissionModuleKeys.kpi, kpiAbilityKeys.manageBusinessAssessment);
  const viewerDepartmentOrgNodeId = await findNearestDepartmentOrgNodeId(viewer.orgNodeId);
  const now = new Date();
  const filterYear = options?.selectedYear ?? now.getFullYear();
  const filterAllQuarters = options?.selectedQuarter === 0;
  const filterQuarter = filterAllQuarters ? null : (options?.selectedQuarter ?? Math.floor(now.getMonth() / 3) + 1);
  const departments = viewer.roleType === "ADMIN" || viewerDepartmentOrgNodeId === null
    ? await prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : await prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT", id: viewerDepartmentOrgNodeId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (departments.length === 0) return { departments: [], teams: [], cycles: [], subjects: [], results: [], summaries: [], users: [], imports: [], canManage: manageCoverage.hasPermission };
  const coveredOrgNodeIds = [...new Set((await Promise.all(departments.map((row) => getDescendantOrgNodeIds(row.id)))).flat())];
  const [teams, configUsers] = await Promise.all([
    prisma.orgNode.findMany({
      where: { id: { in: coveredOrgNodeIds }, nodeType: "TEAM" },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { orgNodeId: { in: coveredOrgNodeIds }, roleType: { in: ["TEAM_LEADER", "MEMBER"] }, isActive: true, deletedAt: null },
      select: { id: true, name: true, orgNodeId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const periodWhere = { year: filterYear, ...(filterQuarter == null ? {} : { quarter: filterQuarter }) };
  const cycles = await prisma.businessAssessmentCycle.findMany({
    where: { departmentOrgNodeId: { in: departments.map((row) => row.id) }, ...periodWhere, deletedAt: null },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  const cycleIds = cycles.map((row) => row.id);
  const [subjects, results, summaries, imports] = await Promise.all([
    prisma.businessAssessmentSubject.findMany({ where: { cycleId: { in: cycleIds } }, orderBy: [{ cycleId: "asc" }, { sortOrder: "asc" }] }),
    prisma.businessAssessmentResult.findMany({ where: { cycleId: { in: cycleIds } }, orderBy: [{ cycleId: "asc" }, { userId: "asc" }, { createdAt: "asc" }] }),
    prisma.businessAssessmentSummary.findMany({ where: { cycleId: { in: cycleIds } }, orderBy: { earnedScore: "desc" } }),
    prisma.talentImportBatch.findMany({ where: { importType: "BUSINESS_ASSESSMENT", departmentOrgNodeId: { in: departments.map((row) => row.id) }, ...periodWhere, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return { departments, teams, cycles, subjects, results, summaries, users: configUsers, imports, canManage: manageCoverage.hasPermission };
}
