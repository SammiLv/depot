import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

function getQuarterFromDate(date: Date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

export async function getWorkIncidentPageData(
  viewer: Viewer,
  options?: { selectedYear?: number; selectedQuarter?: number },
) {
  const manageCoverage = await resolvePermissionCoverage(viewer, orgPermissionModuleKeys.kpi, kpiAbilityKeys.manageWorkIncident);
  const viewerDepartmentOrgNodeId = await findNearestDepartmentOrgNodeId(viewer.orgNodeId);
  const now = new Date();
  const filterYear = options?.selectedYear ?? now.getFullYear();
  const filterAllQuarters = options?.selectedQuarter === 0;
  const filterQuarter = filterAllQuarters ? null : (options?.selectedQuarter ?? getQuarterFromDate(now));
  const departments = await (viewer.roleType === "ADMIN" || viewerDepartmentOrgNodeId === null
    ? prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT", id: viewerDepartmentOrgNodeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }));
  if (departments.length === 0) return { departments: [], incidents: [], responsiblePeople: [], users: [], summaries: [], restrictions: [], canManage: manageCoverage.hasPermission };
  const visibleOrgNodeIds = [...new Set((await Promise.all(departments.map((row) => getDescendantOrgNodeIds(row.id)))).flat())];
  const incidents = await prisma.workIncident.findMany({
    where: {
      departmentOrgNodeId: { in: departments.map((row) => row.id) },
      occurredAt: {
        gte: new Date(filterYear, 0, 1),
        lt: new Date(filterYear + 1, 0, 1),
      },
    },
    orderBy: { occurredAt: "desc" },
  });
  const filteredIncidents = filterAllQuarters
    ? incidents
    : incidents.filter((incident) => getQuarterFromDate(incident.occurredAt) === filterQuarter);
  const incidentIds = filteredIncidents.map((row) => row.id);
  const responsiblePeople = await prisma.workIncidentResponsiblePerson.findMany({ where: { incidentId: { in: incidentIds } } });
  const users = await prisma.user.findMany({ where: { OR: [{ id: { in: responsiblePeople.map((row) => row.userId) } }, { orgNodeId: { in: visibleOrgNodeIds } }], isActive: true, deletedAt: null }, select: { id: true, name: true, orgNodeId: true }, orderBy: { name: "asc" } });
  const summaryWhere = filterAllQuarters
    ? { userId: { in: responsiblePeople.map((row) => row.userId) }, year: filterYear }
    : { userId: { in: responsiblePeople.map((row) => row.userId) }, year: filterYear, quarter: filterQuarter! };
  const [summaries, restrictions] = await Promise.all([
    prisma.workIncidentQuarterSummary.findMany({
      where: summaryWhere,
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
    }),
    prisma.incidentRestriction.findMany({ where: { incidentId: { in: incidentIds } }, orderBy: [{ effectiveFrom: "desc" }, { controlledType: "asc" }] }),
  ]);
  return { departments, incidents: filteredIncidents, responsiblePeople, users, summaries, restrictions, canManage: manageCoverage.hasPermission };
}
