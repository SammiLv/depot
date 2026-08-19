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

async function resolveLeaders(subjectUserId: string, subjectOrgNodeId: string | null) {
  if (!subjectOrgNodeId) {
    return [] as Array<{ id: string }>;
  }

  const ancestorNodes = await getAncestorOrgNodes(subjectOrgNodeId);
  for (const node of ancestorNodes) {
    const leaders = await prisma.user.findMany({
      where: {
        orgNodeId: node.id,
        roleType: "TEAM_LEADER",
        isActive: true,
        deletedAt: null,
        id: { not: subjectUserId },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    if (leaders.length) {
      return leaders;
    }
  }

  return [];
}

async function resolveManagers(subjectOrgNodeId: string | null) {
  const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(subjectOrgNodeId);
  if (!departmentOrgNodeId) {
    return [] as Array<{ id: string; orgNodeId: string | null; roleType: "DEPARTMENT_MANAGER" }>;
  }

  const descendantOrgNodeIds = await getDescendantOrgNodeIds(departmentOrgNodeId);
  const managerOrgNodeIds = [departmentOrgNodeId, ...descendantOrgNodeIds];
  return prisma.user.findMany({
    where: {
      orgNodeId: { in: managerOrgNodeIds },
      roleType: "DEPARTMENT_MANAGER",
      isActive: true,
      deletedAt: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, orgNodeId: true },
  }).then((users) => users.map((user) => ({ ...user, roleType: "DEPARTMENT_MANAGER" as const })));
}

export async function resolveApprovalChain(
  subjectUserId: string,
  subjectOrgNodeId: string | null,
): Promise<ApprovalStep[]> {
  const steps: ApprovalStep[] = [];
  const seenUserIds = new Set<string>([subjectUserId]);
  let stepOrder = 0;

  const leaders = await resolveLeaders(subjectUserId, subjectOrgNodeId);
  const leaderIds = leaders.map((leader) => leader.id).filter((id) => !seenUserIds.has(id));
  if (leaderIds.length) {
    stepOrder += 1;
    for (const leaderId of leaderIds) {
      seenUserIds.add(leaderId);
      steps.push({ stepOrder, stageKey: "LEADER", approverId: leaderId });
    }
  }

  const managers = await resolveManagers(subjectOrgNodeId);
  const managerIds = managers
    .map((manager) => manager.id)
    .filter((id) => !seenUserIds.has(id));
  if (managerIds.length) {
    stepOrder += 1;
    for (const managerId of managerIds) {
      seenUserIds.add(managerId);
      steps.push({ stepOrder, stageKey: "MANAGER", approverId: managerId });
    }
  }

  const primaryManager = managers[0];
  if (primaryManager && primaryManager.id !== subjectUserId && await canApproveFinal(subjectOrgNodeId, primaryManager)) {
    if (!seenUserIds.has(primaryManager.id)) {
      stepOrder += 1;
      seenUserIds.add(primaryManager.id);
      steps.push({ stepOrder, stageKey: "FINAL", approverId: primaryManager.id });
    }
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
    stepOrder += 1;
    steps.push({ stepOrder, stageKey: "FINAL", approverId: admin.id });
  }

  return steps;
}
