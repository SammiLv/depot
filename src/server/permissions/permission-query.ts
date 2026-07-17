import type { OrgPermissionAbilityKey, OrgPermissionGrantScopeType, OrgPermissionModuleKey, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { manageableRoleTypes } from "@/server/permissions/permission-constants";

export type RolePermissionGrantRow = {
  id: string;
  moduleKey: OrgPermissionModuleKey;
  abilityKey: OrgPermissionAbilityKey;
  scopeType: OrgPermissionGrantScopeType;
  subjectType: "ROLE";
  roleType: RoleType;
  userId: null;
  orgNodeId: string | null;
  isActive: boolean;
};

export type UserPermissionGrantRow = {
  id: string;
  moduleKey: OrgPermissionModuleKey;
  abilityKey: OrgPermissionAbilityKey;
  scopeType: OrgPermissionGrantScopeType;
  subjectType: "USER";
  roleType: null;
  userId: string;
  orgNodeId: string | null;
  isActive: boolean;
};

export type PermissionGrantRow = RolePermissionGrantRow | UserPermissionGrantRow;

type PermissionGrantSubject = {
  id: string;
  roleType: RoleType;
};

type RawPermissionGrantRow = NonNullable<Awaited<ReturnType<typeof prisma.orgPermissionGrant.findFirst>>>;

function toPermissionGrantRow(row: RawPermissionGrantRow): PermissionGrantRow {
  if (row.subjectType === "ROLE" && row.roleType) {
    return {
      id: row.id,
      moduleKey: row.moduleKey,
      abilityKey: row.abilityKey,
      scopeType: row.scopeType,
      subjectType: "ROLE",
      roleType: row.roleType,
      userId: null,
      orgNodeId: row.orgNodeId,
      isActive: row.isActive,
    };
  }

  if (row.subjectType === "USER" && row.userId) {
    return {
      id: row.id,
      moduleKey: row.moduleKey,
      abilityKey: row.abilityKey,
      scopeType: row.scopeType,
      subjectType: "USER",
      roleType: null,
      userId: row.userId,
      orgNodeId: row.orgNodeId,
      isActive: row.isActive,
    };
  }

  throw new Error("权限记录主体信息不完整");
}

export async function getActivePermissionGrants(
  moduleKey: OrgPermissionModuleKey,
  abilityKeys?: OrgPermissionAbilityKey[],
  roleTypes: RoleType[] = manageableRoleTypes,
) {
  const rows = await prisma.orgPermissionGrant.findMany({
    where: {
      moduleKey,
      subjectType: "ROLE",
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

  return rows.map(toPermissionGrantRow).filter((row): row is RolePermissionGrantRow => row.subjectType === "ROLE");
}

export async function getPermissionGrantsByAbility(
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
  subject: PermissionGrantSubject,
) {
  const rows = await prisma.orgPermissionGrant.findMany({
    where: {
      moduleKey,
      abilityKey,
      isActive: true,
      OR: [
        {
          subjectType: "ROLE",
          roleType: subject.roleType,
        },
        {
          subjectType: "USER",
          userId: subject.id,
        },
      ],
    },
    orderBy: [{ createdAt: "asc" }],
  });

  return rows.map(toPermissionGrantRow);
}
