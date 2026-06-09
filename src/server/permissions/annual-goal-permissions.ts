import type { RoleType } from "@prisma/client";
import { getAnnualGoalPermissionMap, type AnnualGoalPermissionCode } from "@/server/organization/annual-goal-permissions";

export async function getAnnualGoalPermissionsByRole(roleType: RoleType) {
  const permissionMap = await getAnnualGoalPermissionMap();
  return permissionMap.get(roleType) ?? new Set<AnnualGoalPermissionCode>();
}

export async function hasAnnualGoalPermission(roleType: RoleType, permissionCode: AnnualGoalPermissionCode) {
  const permissions = await getAnnualGoalPermissionsByRole(roleType);
  return permissions.has(permissionCode);
}
