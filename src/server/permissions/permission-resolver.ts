import type { OrgPermissionAbilityKey, OrgPermissionGrantScopeType, OrgPermissionModuleKey, RoleType } from "@prisma/client";
import { getAncestorOrgNodeIds, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { getPermissionGrantsByAbility, type PermissionGrantRow } from "@/server/permissions/permission-query";
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

type MatchedPermissionGrant = PermissionGrantRow & {
  effectiveOrgNodeId: string | null;
};

export type ResolvedPermissionCoverage = {
  hasPermission: boolean;
  hasAllAccess: boolean;
  includesSelf: boolean;
  orgNodeIds: string[];
};

function getNoUserWhere() {
  return { id: "__no_user__", deletedAt: null };
}

function getNoKpiWhere() {
  return { id: "__no_kpi__", deletedAt: null };
}

function matchesRoleGrant(
  grant: Extract<PermissionGrantRow, { subjectType: "ROLE" }>,
  currentUser: DataScopeInput,
  ancestorOrgNodeIdSet: Set<string>,
  descendantOrgNodeIdSet: Set<string>,
) {
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
}

function matchesPermissionGrant(
  grant: PermissionGrantRow,
  currentUser: DataScopeInput,
  ancestorOrgNodeIdSet: Set<string>,
  descendantOrgNodeIdSet: Set<string>,
) {
  if (grant.subjectType === "USER") {
    return grant.userId === currentUser.id;
  }

  return matchesRoleGrant(grant, currentUser, ancestorOrgNodeIdSet, descendantOrgNodeIdSet);
}

function getGrantPriority(grant: MatchedPermissionGrant, currentUser: DataScopeInput) {
  return {
    scopePriority: orgPermissionScopePriority[grant.scopeType],
    subjectPriority: grant.subjectType === "USER" ? 1 : 0,
    currentNodePriority: grant.effectiveOrgNodeId === (currentUser.orgNodeId ?? null) ? 1 : 0,
    explicitNodePriority: grant.orgNodeId ? 1 : 0,
  };
}

function isBetterGrant(next: MatchedPermissionGrant, best: MatchedPermissionGrant, currentUser: DataScopeInput) {
  const nextPriority = getGrantPriority(next, currentUser);
  const bestPriority = getGrantPriority(best, currentUser);

  if (nextPriority.scopePriority !== bestPriority.scopePriority) {
    return nextPriority.scopePriority > bestPriority.scopePriority;
  }
  if (nextPriority.subjectPriority !== bestPriority.subjectPriority) {
    return nextPriority.subjectPriority > bestPriority.subjectPriority;
  }
  if (nextPriority.currentNodePriority !== bestPriority.currentNodePriority) {
    return nextPriority.currentNodePriority > bestPriority.currentNodePriority;
  }
  if (nextPriority.explicitNodePriority !== bestPriority.explicitNodePriority) {
    return nextPriority.explicitNodePriority > bestPriority.explicitNodePriority;
  }

  return false;
}

async function resolveMatchedPermissionGrants(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
): Promise<MatchedPermissionGrant[]> {
  const grants = await getPermissionGrantsByAbility(moduleKey, abilityKey, currentUser);
  const [ancestorOrgNodeIds, descendantOrgNodeIds] = await Promise.all([
    getAncestorOrgNodeIds(currentUser.orgNodeId ?? null),
    getDescendantOrgNodeIds(currentUser.orgNodeId ?? null),
  ]);
  const ancestorOrgNodeIdSet = new Set(ancestorOrgNodeIds);
  const descendantOrgNodeIdSet = new Set(descendantOrgNodeIds);

  return grants
    .filter((grant) => matchesPermissionGrant(grant, currentUser, ancestorOrgNodeIdSet, descendantOrgNodeIdSet))
    .map((grant) => ({
      ...grant,
      effectiveOrgNodeId: grant.orgNodeId ?? currentUser.orgNodeId ?? null,
    }));
}

export async function resolvePermissionScope(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
): Promise<ResolvedPermissionScope | null> {
  const matched = await resolveMatchedPermissionGrants(currentUser, moduleKey, abilityKey);
  if (matched.length === 0) {
    return null;
  }

  const best = matched.reduce((currentBest, grant) => {
    if (!currentBest) {
      return grant;
    }
    return isBetterGrant(grant, currentBest, currentUser) ? grant : currentBest;
  }, null as MatchedPermissionGrant | null);

  if (!best) {
    return null;
  }

  return {
    scopeType: best.scopeType,
    orgNodeId: best.effectiveOrgNodeId,
  };
}

export async function resolvePermissionCoverage(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
): Promise<ResolvedPermissionCoverage> {
  const matched = await resolveMatchedPermissionGrants(currentUser, moduleKey, abilityKey);
  if (matched.length === 0) {
    return {
      hasPermission: false,
      hasAllAccess: false,
      includesSelf: false,
      orgNodeIds: [],
    };
  }

  if (matched.some((grant) => grant.scopeType === "ALL")) {
    return {
      hasPermission: true,
      hasAllAccess: true,
      includesSelf: true,
      orgNodeIds: [],
    };
  }

  const includesSelf = matched.some((grant) => grant.scopeType === "SELF");
  const directOrgNodeIds = new Set<string>();
  const subtreeRootOrgNodeIds = [...new Set(
    matched
      .filter((grant) => grant.scopeType === "SUBTREE")
      .map((grant) => grant.effectiveOrgNodeId)
      .filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId))
  )];

  matched
    .filter((grant) => grant.scopeType === "SELF" || grant.scopeType === "NODE")
    .map((grant) => grant.effectiveOrgNodeId)
    .filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId))
    .forEach((orgNodeId) => directOrgNodeIds.add(orgNodeId));

  const subtreeOrgNodeIds = await Promise.all(subtreeRootOrgNodeIds.map((orgNodeId) => getDescendantOrgNodeIds(orgNodeId)));
  subtreeOrgNodeIds.flat().forEach((orgNodeId) => directOrgNodeIds.add(orgNodeId));

  return {
    hasPermission: true,
    hasAllAccess: false,
    includesSelf,
    orgNodeIds: [...directOrgNodeIds],
  };
}

export async function resolveAuthorizedOrgNodeIds(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
) {
  const coverage = await resolvePermissionCoverage(currentUser, moduleKey, abilityKey);
  if (!coverage.hasPermission) {
    return [];
  }
  if (coverage.hasAllAccess) {
    return null;
  }
  return coverage.orgNodeIds;
}

export async function buildUserWhereByPermission(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
) {
  const coverage = await resolvePermissionCoverage(currentUser, moduleKey, abilityKey);
  if (!coverage.hasPermission) {
    return getNoUserWhere();
  }
  if (coverage.hasAllAccess) {
    return { deletedAt: null };
  }

  const conditions: Array<Record<string, unknown>> = [];
  if (coverage.includesSelf) {
    conditions.push({ id: currentUser.id });
  }
  if (coverage.orgNodeIds.length > 0) {
    conditions.push({ orgNodeId: { in: coverage.orgNodeIds } });
  }
  if (conditions.length === 0) {
    return getNoUserWhere();
  }
  if (conditions.length === 1) {
    return { ...conditions[0], deletedAt: null };
  }
  return { OR: conditions, deletedAt: null };
}

export async function buildKpiWhereByPermission(
  currentUser: DataScopeInput,
  moduleKey: OrgPermissionModuleKey,
  abilityKey: OrgPermissionAbilityKey,
) {
  const coverage = await resolvePermissionCoverage(currentUser, moduleKey, abilityKey);
  if (!coverage.hasPermission) {
    return getNoKpiWhere();
  }
  if (coverage.hasAllAccess) {
    return { deletedAt: null };
  }

  const conditions: Array<Record<string, unknown>> = [];
  if (coverage.includesSelf) {
    conditions.push({ userId: currentUser.id });
  }
  if (coverage.orgNodeIds.length > 0) {
    conditions.push({ orgNodeId: { in: coverage.orgNodeIds } });
  }
  if (conditions.length === 0) {
    return getNoKpiWhere();
  }
  if (conditions.length === 1) {
    return { ...conditions[0], deletedAt: null };
  }
  return { OR: conditions, deletedAt: null };
}
