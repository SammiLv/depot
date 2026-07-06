import type { OrgPermissionAbilityKey, OrgPermissionGrantScopeType, OrgPermissionModuleKey, RoleType } from "@prisma/client";
import { getAncestorOrgNodeIds, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { getPermissionGrantsByAbility } from "@/server/permissions/permission-query";
import { orgPermissionScopePriority } from "@/server/permissions/permission-constants";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

type ResolvedPermissionScope = {
  scopeType: OrgPermissionGrantScopeType;
  orgNodeId: string | null;
};

function getNoUserWhere() {
  return { id: "__no_user__", deletedAt: null };
}

function getNoKpiWhere() {
  return { id: "__no_kpi__", deletedAt: null };
}

export async function resolvePermissionScope(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
): Promise<ResolvedPermissionScope | null> {
  const grants = await getPermissionGrantsByAbility(moduleKey, abilityKey, currentUser.roleType);
  const [ancestorOrgNodeIds, descendantOrgNodeIds] = await Promise.all([
    getAncestorOrgNodeIds(currentUser.orgNodeId ?? null),
    getDescendantOrgNodeIds(currentUser.orgNodeId ?? null),
  ]);
  const ancestorOrgNodeIdSet = new Set(ancestorOrgNodeIds);
  const descendantOrgNodeIdSet = new Set(descendantOrgNodeIds);
  const matched = grants.filter((grant) => {
    if (grant.scopeType === "ALL" || grant.scopeType === "SELF") {
      return true;
    }
    if (!grant.orgNodeId) {
      return true;
    }
    if (!currentUser.orgNodeId) {
      return false;
    }
    if (grant.scopeType === "NODE") {
      return grant.orgNodeId === currentUser.orgNodeId
        || ancestorOrgNodeIdSet.has(grant.orgNodeId)
        || descendantOrgNodeIdSet.has(grant.orgNodeId);
    }
    return ancestorOrgNodeIdSet.has(grant.orgNodeId);
  });

  if (matched.length === 0) {
    return null;
  }

  return matched.reduce<ResolvedPermissionScope | null>((best, grant) => {
    if (!best) {
      return { scopeType: grant.scopeType, orgNodeId: grant.orgNodeId };
    }
    if (orgPermissionScopePriority[grant.scopeType] !== orgPermissionScopePriority[best.scopeType]) {
      return orgPermissionScopePriority[grant.scopeType] > orgPermissionScopePriority[best.scopeType]
        ? { scopeType: grant.scopeType, orgNodeId: grant.orgNodeId }
        : best;
    }
    if (!best.orgNodeId) {
      return { scopeType: grant.scopeType, orgNodeId: grant.orgNodeId };
    }
    if (!grant.orgNodeId) {
      return best;
    }
    return grant.orgNodeId === currentUser.orgNodeId
      ? { scopeType: grant.scopeType, orgNodeId: grant.orgNodeId }
      : best;
  }, null);
}

export async function resolveAuthorizedOrgNodeIds(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
) {
  const resolved = await resolvePermissionScope(currentUser, moduleKey, abilityKey);
  if (!resolved) {
    return [];
  }
  if (resolved.scopeType === "ALL") {
    return null;
  }
  if (resolved.scopeType === "SELF") {
    return currentUser.orgNodeId ? [currentUser.orgNodeId] : [];
  }
  const effectiveOrgNodeId = resolved.orgNodeId ?? currentUser.orgNodeId ?? null;
  if (!effectiveOrgNodeId) {
    return [];
  }
  if (resolved.scopeType === "NODE") {
    return [effectiveOrgNodeId];
  }
  return getDescendantOrgNodeIds(effectiveOrgNodeId);
}

export async function buildUserWhereByPermission(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
) {
  const resolved = await resolvePermissionScope(currentUser, moduleKey, abilityKey);
  if (!resolved) {
    return getNoUserWhere();
  }
  if (resolved.scopeType === "ALL") {
    return { deletedAt: null };
  }
  if (resolved.scopeType === "SELF") {
    return { id: currentUser.id, deletedAt: null };
  }
  const orgNodeIds = await resolveAuthorizedOrgNodeIds(currentUser, moduleKey, abilityKey);
  if (!orgNodeIds || orgNodeIds.length === 0) {
    return getNoUserWhere();
  }
  return { orgNodeId: { in: orgNodeIds }, deletedAt: null };
}

export async function buildKpiWhereByPermission(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
) {
  const resolved = await resolvePermissionScope(currentUser, moduleKey, abilityKey);
  if (!resolved) {
    return getNoKpiWhere();
  }
  if (resolved.scopeType === "ALL") {
    return { deletedAt: null };
  }
  if (resolved.scopeType === "SELF") {
    return { userId: currentUser.id, deletedAt: null };
  }
  const orgNodeIds = await resolveAuthorizedOrgNodeIds(currentUser, moduleKey, abilityKey);
  if (!orgNodeIds || orgNodeIds.length === 0) {
    return getNoKpiWhere();
  }
  return { orgNodeId: { in: orgNodeIds }, deletedAt: null };
}
