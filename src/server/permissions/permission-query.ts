import type { OrgPermissionAbilityKey, OrgPermissionGrantScopeType, OrgPermissionModuleKey, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { manageableRoleTypes } from "@/server/permissions/permission-constants";

export type PermissionGrantRow = {
  id: string;
  moduleKey: OrgPermissionModuleKey;
  abilityKey: OrgPermissionAbilityKey;
  scopeType: OrgPermissionGrantScopeType;
  roleType: RoleType;
  orgNodeId: string | null;
  isActive: boolean;
};

export async function getActivePermissionGrants(
  moduleKey: OrgPermissionModuleKey,
  abilityKeys?: OrgPermissionAbilityKey[],
  roleTypes: RoleType[] = manageableRoleTypes,
) {
  return prisma.orgPermissionGrant.findMany({
    where: {
      moduleKey,
      isActive: true,
      roleType: { in: roleTypes },
      ...(abilityKeys?.length ? { abilityKey: { in: abilityKeys } } : {}),
    },
    orderBy: [
      { moduleKey: "asc" },
      { abilityKey: "asc" },
      { roleType: "asc" },
      { scopeType: "asc" },
      { createdAt: "asc" },
    ],
  });
}

export async function getPermissionGrantsByAbility(
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
  roleType: RoleType,
) {
  return prisma.orgPermissionGrant.findMany({
    where: {
      moduleKey,
      abilityKey,
      roleType,
      isActive: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });
}
