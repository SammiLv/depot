import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getWorkIncidentPageData(viewer: Viewer) {
  const [viewCoverage, manageCoverage] = await Promise.all([
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewWorkIncident),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.manageWorkIncident),
  ]);
  const orgNodeIds = await resolveAuthorizedOrgNodeIds(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewWorkIncident);
  const departments = await prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT", ...(orgNodeIds === null ? {} : { id: { in: orgNodeIds } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (!viewCoverage.hasPermission) return { departments: [], incidents: [], responsiblePeople: [], users: [], summaries: [], restrictions: [], canManage: manageCoverage.hasPermission };
  const incidents = await prisma.workIncident.findMany({ where: { departmentOrgNodeId: { in: departments.map((row) => row.id) } }, orderBy: { occurredAt: "desc" } });
  const responsiblePeople = await prisma.workIncidentResponsiblePerson.findMany({ where: { incidentId: { in: incidents.map((row) => row.id) } } });
  const users = await prisma.user.findMany({ where: { OR: [{ id: { in: responsiblePeople.map((row) => row.userId) } }, { orgNodeId: { in: orgNodeIds === null ? departments.map((row) => row.id) : orgNodeIds } }], isActive: true, deletedAt: null }, select: { id: true, name: true, orgNodeId: true }, orderBy: { name: "asc" } });
  const [summaries, restrictions] = await Promise.all([
    prisma.workIncidentQuarterSummary.findMany({ where: { userId: { in: responsiblePeople.map((row) => row.userId) } }, orderBy: [{ year: "desc" }, { quarter: "desc" }] }),
    prisma.incidentRestriction.findMany({ where: { incidentId: { in: incidents.map((row) => row.id) } }, orderBy: [{ effectiveFrom: "desc" }, { controlledType: "asc" }] }),
  ]);
  return { departments, incidents, responsiblePeople, users, summaries, restrictions, canManage: manageCoverage.hasPermission };
}
