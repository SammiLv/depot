import type { RoleType } from "@prisma/client";
import type { AnnualGoalCapabilities } from "@/server/organization/annual-goal-permissions";
import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

// ---- Where builders ----

export async function getUserWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (user.roleType === "DEPARTMENT_MANAGER" || user.roleType === "TEAM_LEADER") {
    if (!user.orgNodeId) {
      return { id: "__no_user__", deletedAt: null };
    }
    const ids = await getDescendantOrgNodeIds(user.orgNodeId);
    if (ids.length === 0) return { id: "__no_user__", deletedAt: null };
    return { orgNodeId: { in: ids }, deletedAt: null };
  }

  return { id: user.id, deletedAt: null };
}

export async function getTeamWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return {};
  }

  if (!user.orgNodeId || (user.roleType !== "DEPARTMENT_MANAGER" && user.roleType !== "TEAM_LEADER")) {
    return { id: "__no_team__" };
  }

  const teamIds = await getDescendantOrgNodeIds(user.orgNodeId);
  if (teamIds.length === 0) {
    return { id: "__no_team__" };
  }

  return {
    id: { in: teamIds },
  };
}

export async function getAnnualPlanWhereByScope(
  user: DataScopeInput,
  capabilities?: Pick<AnnualGoalCapabilities, "canViewDepartmentPlans">,
) {
  if (user.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (!user.orgNodeId) {
    return { id: "__no_annual_plan__", deletedAt: null };
  }

  if (user.roleType === "DEPARTMENT_MANAGER") {
    const ids = await getDescendantOrgNodeIds(user.orgNodeId);
    return ids.length > 0
      ? { ownerOrgNodeId: { in: ids }, deletedAt: null }
      : { id: "__no_annual_plan__", deletedAt: null };
  }

  const canViewDepartmentPlans = capabilities?.canViewDepartmentPlans ?? false;

  if (canViewDepartmentPlans) {
    const ancestorRows = await prisma.orgClosure.findMany({
      where: { descendantId: user.orgNodeId },
      orderBy: { depth: "desc" },
      select: { ancestorId: true },
    });
    const ancestorIds = ancestorRows.map((r) => r.ancestorId);
    let scopeId = user.orgNodeId;
    if (ancestorIds.length > 0) {
      const deptNodes = await prisma.orgNode.findMany({
        where: { id: { in: ancestorIds }, nodeType: "DEPARTMENT" },
        select: { id: true },
      });
      const deptIdSet = new Set(deptNodes.map((n) => n.id));
      const nearestDept = ancestorRows.find((r) => deptIdSet.has(r.ancestorId));
      if (nearestDept) scopeId = nearestDept.ancestorId;
    }
    const ids = await getDescendantOrgNodeIds(scopeId);
    return ids.length > 0
      ? { ownerOrgNodeId: { in: ids }, deletedAt: null }
      : { id: "__no_annual_plan__", deletedAt: null };
  }

  const ids = await getDescendantOrgNodeIds(user.orgNodeId);
  return ids.length > 0
    ? { ownerOrgNodeId: { in: ids }, deletedAt: null }
    : { id: "__no_annual_plan__", deletedAt: null };
}

export async function getOwnerWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (user.roleType === "DEPARTMENT_MANAGER" || user.roleType === "TEAM_LEADER") {
    if (!user.orgNodeId) {
      return { ownerId: "__no_owner__", deletedAt: null };
    }
    const ids = await getDescendantOrgNodeIds(user.orgNodeId);
    if (ids.length === 0) return { ownerId: "__no_owner__", deletedAt: null };
    return { orgNodeId: { in: ids }, deletedAt: null };
  }

  return { ownerId: user.id, deletedAt: null };
}

export async function getKpiWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (user.roleType === "DEPARTMENT_MANAGER") {
    if (!user.orgNodeId) return { id: "__no_kpi__", deletedAt: null };
    const ids = await getDescendantOrgNodeIds(user.orgNodeId);
    return ids.length > 0
      ? { orgNodeId: { in: ids }, deletedAt: null }
      : { id: "__no_kpi__", deletedAt: null };
  }

  if (user.roleType === "TEAM_LEADER") {
    if (!user.orgNodeId) return { id: "__no_kpi__", deletedAt: null };
    return { orgNodeId: user.orgNodeId, deletedAt: null };
  }

  return { userId: user.id, deletedAt: null };
}
