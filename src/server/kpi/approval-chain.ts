import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds } from "@/server/permissions/permission-resolver";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";
import { findNearestDepartmentOrgNodeId, getAncestorOrgNodes, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";

export type ApprovalStageKey = "LEADER" | "MANAGER" | "FINAL";

export type ApprovalStep = {
  stepOrder: number;
  stageKey: ApprovalStageKey;
  approverId: string;
};

type FinalApproverCandidate = {
  id: string;
  orgNodeId: string | null;
  roleType: "ADMIN" | "DEPARTMENT_MANAGER";
};

async function canApproveFinal(subjectOrgNodeId: string | null, candidate: FinalApproverCandidate) {
  const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(
    candidate,
    orgPermissionModuleKeys.kpi,
    kpiAbilityKeys.scoreFinal,
  );

  if (authorizedOrgNodeIds === null) {
    return true;
  }

  if (!subjectOrgNodeId) {
    return false;
  }

  return authorizedOrgNodeIds.includes(subjectOrgNodeId);
}

async function resolveLeader(subjectUserId: string, subjectOrgNodeId: string | null) {
  if (!subjectOrgNodeId) {
    return null;
  }

  const ancestorNodes = await getAncestorOrgNodes(subjectOrgNodeId);
  for (const node of ancestorNodes) {
    const leader = await prisma.user.findFirst({
      where: {
        orgNodeId: node.id,
        roleType: "TEAM_LEADER",
        isActive: true,
        deletedAt: null,
        id: { not: subjectUserId },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (leader) {
      return leader;
    }
  }

  return null;
}

async function resolveManager(subjectOrgNodeId: string | null) {
  const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(subjectOrgNodeId);
  if (!departmentOrgNodeId) {
    return null;
  }

  const descendantOrgNodeIds = await getDescendantOrgNodeIds(departmentOrgNodeId);
  const managerOrgNodeIds = [departmentOrgNodeId, ...descendantOrgNodeIds];
  return prisma.user.findFirst({
    where: {
      orgNodeId: { in: managerOrgNodeIds },
      roleType: "DEPARTMENT_MANAGER",
      isActive: true,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, orgNodeId: true },
  }).then((user) => user ? { ...user, roleType: "DEPARTMENT_MANAGER" as const } : null);
}

export async function resolveApprovalChain(
  subjectUserId: string,
  subjectOrgNodeId: string | null,
): Promise<ApprovalStep[]> {
  const steps: ApprovalStep[] = [];
  const seenUserIds = new Set<string>([subjectUserId]);

  const leader = await resolveLeader(subjectUserId, subjectOrgNodeId);
  if (leader && !seenUserIds.has(leader.id)) {
    seenUserIds.add(leader.id);
    steps.push({ stepOrder: steps.length + 1, stageKey: "LEADER", approverId: leader.id });
  }

  const manager = await resolveManager(subjectOrgNodeId);
  if (manager && !seenUserIds.has(manager.id)) {
    seenUserIds.add(manager.id);
    steps.push({ stepOrder: steps.length + 1, stageKey: "MANAGER", approverId: manager.id });
  }

  if (manager && manager.id !== subjectUserId && await canApproveFinal(subjectOrgNodeId, manager)) {
    steps.push({ stepOrder: steps.length + 1, stageKey: "FINAL", approverId: manager.id });
    return steps;
  }

  const admin = await prisma.user.findFirst({
    where: {
      roleType: "ADMIN",
      isActive: true,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, orgNodeId: true },
  }).then((user) => user ? { ...user, roleType: "ADMIN" as const } : null);

  if (admin && admin.id !== subjectUserId && await canApproveFinal(subjectOrgNodeId, admin)) {
    steps.push({ stepOrder: steps.length + 1, stageKey: "FINAL", approverId: admin.id });
  }

  return steps;
}
