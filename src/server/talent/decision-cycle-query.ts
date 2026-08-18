import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function getTalentDecisionCycleData(viewer: Viewer, selectedCycleId?: string) {
  const [viewIds, manage] = await Promise.all([
    resolveAuthorizedOrgNodeIds(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewRecommendation),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.manageRecommendation),
  ]);
  const departments = await prisma.orgNode.findMany({
    where: viewIds === null ? { nodeType: "DEPARTMENT" } : { nodeType: "DEPARTMENT", id: { in: viewIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const departmentIds = departments.map((row) => row.id);
  const cycles = await prisma.talentDecisionCycle.findMany({ where: { departmentOrgNodeId: { in: departmentIds }, deletedAt: null }, orderBy: [{ year: "desc" }, { decisionMonth: "desc" }, { createdAt: "desc" }] });
  const selectedCycle = cycles.find((row) => row.id === selectedCycleId) ?? cycles[0] ?? null;
  const results = selectedCycle ? await prisma.talentDecisionEmployeeResult.findMany({ where: { cycleId: selectedCycle.id }, orderBy: [{ evidenceStatus: "asc" }, { calculatedAt: "desc" }] }) : [];
  const users = await prisma.user.findMany({ where: { id: { in: results.map((row) => row.userId) } }, select: { id: true, name: true, title: true } });
  return {
    departments,
    cycles,
    selectedCycle,
    canManage: manage.hasPermission,
    users,
    results: results.map((row) => ({ ...row, missingItems: parseStringArray(row.missingItemsJson) })),
  };
}
