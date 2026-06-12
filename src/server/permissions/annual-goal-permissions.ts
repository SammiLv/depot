import type { RoleType } from "@prisma/client";
import { getAnnualGoalPermissionMap, resolveAnnualGoalPermissionScope, type AnnualGoalPermissionCode } from "@/server/organization/annual-goal-permissions";

export async function getAnnualGoalPermissionsByRole(roleType: RoleType, departmentOrgNodeId?: string | null) {
  const scope = await resolveAnnualGoalPermissionScope({ roleType, orgNodeId: departmentOrgNodeId ?? null });
  const permissionMap = await getAnnualGoalPermissionMap(scope);
  return permissionMap.get(roleType) ?? new Set<AnnualGoalPermissionCode>();
}

export async function hasAnnualGoalPermission(
  roleType: RoleType,
  permissionCode: AnnualGoalPermissionCode,
  departmentOrgNodeId?: string | null,
) {
  const permissions = await getAnnualGoalPermissionsByRole(roleType, departmentOrgNodeId);
  return permissions.has(permissionCode);
}
