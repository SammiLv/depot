import type {
  KpiApprovalResolverType,
  OrgNodeType,
  PermissionScopeType,
  RoleType,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";

type PolicyRow = {
  id: string;
  scopeType: PermissionScopeType;
  departmentOrgNodeId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type KpiApprovalPolicyStepDefinition = {
  id: string;
  policyId: string;
  stepOrder: number;
  label: string;
  ancestorDepth: number | null;
  resolverType: KpiApprovalResolverType;
  resolverUserId: string | null;
  skipIfSelf: boolean;
  skipIfDuplicateApprover: boolean;
  allowSkipWhenNoApprover: boolean;
};

export type ApplicableKpiApprovalPolicy = PolicyRow & {
  steps: KpiApprovalPolicyStepDefinition[];
};

type AncestorNode = {
  id: string;
  nodeType: OrgNodeType;
  depth: number;
};

type ApproverCandidate = {
  id: string;
  orgNodeId: string | null;
};

export type ResolvedKpiApprovalStep = {
  stepOrder: number;
  policyStepOrder: number;
  policyStepId: string;
  stepLabel: string;
  ancestorDepth: number | null;
  resolverType: KpiApprovalResolverType;
  resolverUserId: string | null;
  orgNodeId: string | null;
  approverId: string;
};

export type ApprovalPolicyResolverDependencies = {
  getAncestorNodes(orgNodeId: string | null): Promise<AncestorNode[]>;
  findFirstActiveUserByRole(roleType: RoleType, orgNodeIds?: string[]): Promise<ApproverCandidate | null>;
  findActiveUserById(userId: string): Promise<ApproverCandidate | null>;
};

function describePolicyScope(scopeType: PermissionScopeType, departmentOrgNodeId: string | null) {
  return scopeType === "DEPARTMENT" ? `部门 ${departmentOrgNodeId ?? "未知"}` : "系统";
}

export function selectApplicableKpiApprovalPolicy(
  policies: PolicyRow[],
  departmentOrgNodeId: string | null,
): PolicyRow | null {
  const departmentPolicies = departmentOrgNodeId
    ? policies.filter((policy) =>
      policy.isActive
      && policy.scopeType === "DEPARTMENT"
      && policy.departmentOrgNodeId === departmentOrgNodeId
    )
    : [];
  const systemPolicies = policies.filter((policy) =>
    policy.isActive
    && policy.scopeType === "SYSTEM"
    && policy.departmentOrgNodeId === ""
  );
  const preferredPolicies = departmentPolicies.length > 0 ? departmentPolicies : systemPolicies;

  if (preferredPolicies.length > 1) {
    const scopeType: PermissionScopeType = departmentPolicies.length > 0 ? "DEPARTMENT" : "SYSTEM";
    throw new Error(`${describePolicyScope(scopeType, departmentOrgNodeId)}存在多个启用中的 KPI 审批策略`);
  }

  return preferredPolicies[0] ?? null;
}

export async function findApplicableKpiApprovalPolicy(
  departmentOrgNodeId: string | null,
): Promise<ApplicableKpiApprovalPolicy | null> {
  const policies = await prisma.kpiApprovalPolicy.findMany({
    where: {
      isActive: true,
      OR: [
        { scopeType: "SYSTEM", departmentOrgNodeId: "" },
        ...(departmentOrgNodeId
          ? [{ scopeType: "DEPARTMENT" as const, departmentOrgNodeId }]
          : []),
      ],
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
  const selected = selectApplicableKpiApprovalPolicy(policies, departmentOrgNodeId);
  if (!selected) {
    return null;
  }

  const steps = await prisma.kpiApprovalPolicyStep.findMany({
    where: { policyId: selected.id },
    orderBy: [
      { stepOrder: "asc" },
      { id: "asc" },
    ],
  });

  return {
    ...selected,
    steps,
  };
}

export async function resolveApplicableKpiApprovalPolicy(
  subjectOrgNodeId: string | null,
): Promise<ApplicableKpiApprovalPolicy | null> {
  const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(subjectOrgNodeId);
  return findApplicableKpiApprovalPolicy(departmentOrgNodeId);
}

async function getAncestorNodes(orgNodeId: string | null): Promise<AncestorNode[]> {
  if (!orgNodeId) {
    return [];
  }

  const closureRows = await prisma.orgClosure.findMany({
    where: { descendantId: orgNodeId },
    orderBy: { depth: "asc" },
    select: {
      ancestorId: true,
      depth: true,
    },
  });
  if (closureRows.length === 0) {
    const currentNode = await prisma.orgNode.findUnique({
      where: { id: orgNodeId },
      select: { id: true, nodeType: true },
    });
    return currentNode ? [{ ...currentNode, depth: 0 }] : [];
  }

  const nodes = await prisma.orgNode.findMany({
    where: { id: { in: closureRows.map((row) => row.ancestorId) } },
    select: { id: true, nodeType: true },
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return closureRows.flatMap((row) => {
    const node = nodeById.get(row.ancestorId);
    return node ? [{ ...node, depth: row.depth }] : [];
  });
}

const defaultResolverDependencies: ApprovalPolicyResolverDependencies = {
  getAncestorNodes,
  async findFirstActiveUserByRole(roleType, orgNodeIds) {
    return prisma.user.findFirst({
      where: {
        roleType,
        isActive: true,
        deletedAt: null,
        ...(orgNodeIds ? { orgNodeId: { in: orgNodeIds } } : {}),
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        orgNodeId: true,
      },
    });
  },
  async findActiveUserById(userId) {
    return prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        orgNodeId: true,
      },
    });
  },
};

function findAncestorAtDepth(ancestorNodes: AncestorNode[], ancestorDepth: number) {
  return ancestorNodes.find((node) => node.depth === ancestorDepth) ?? null;
}

async function resolveTeamLeader(
  step: KpiApprovalPolicyStepDefinition,
  ancestorNodes: AncestorNode[],
  dependencies: ApprovalPolicyResolverDependencies,
) {
  const candidateNodes = step.ancestorDepth === null
    ? ancestorNodes
    : [findAncestorAtDepth(ancestorNodes, step.ancestorDepth)].filter((node): node is AncestorNode => Boolean(node));

  for (const node of candidateNodes) {
    const approver = await dependencies.findFirstActiveUserByRole("TEAM_LEADER", [node.id]);
    if (approver) {
      return { approver, resolvedOrgNodeId: node.id };
    }
  }

  return null;
}

async function resolveDepartmentManager(
  step: KpiApprovalPolicyStepDefinition,
  ancestorNodes: AncestorNode[],
  dependencies: ApprovalPolicyResolverDependencies,
) {
  const targetNode = step.ancestorDepth === null
    ? ancestorNodes.find((node) => node.nodeType === "DEPARTMENT") ?? null
    : findAncestorAtDepth(ancestorNodes, step.ancestorDepth);
  if (!targetNode) {
    return null;
  }

  const approver = await dependencies.findFirstActiveUserByRole("DEPARTMENT_MANAGER", [targetNode.id]);
  return approver ? { approver, resolvedOrgNodeId: targetNode.id } : null;
}

async function resolveStepApprover(
  step: KpiApprovalPolicyStepDefinition,
  ancestorNodes: AncestorNode[],
  dependencies: ApprovalPolicyResolverDependencies,
) {
  if (step.resolverType === "TEAM_LEADER") {
    return resolveTeamLeader(step, ancestorNodes, dependencies);
  }
  if (step.resolverType === "DEPARTMENT_MANAGER") {
    return resolveDepartmentManager(step, ancestorNodes, dependencies);
  }
  if (step.resolverType === "ADMIN") {
    const approver = await dependencies.findFirstActiveUserByRole("ADMIN");
    return approver ? { approver, resolvedOrgNodeId: approver.orgNodeId } : null;
  }
  if (!step.resolverUserId) {
    return null;
  }

  const approver = await dependencies.findActiveUserById(step.resolverUserId);
  return approver ? { approver, resolvedOrgNodeId: approver.orgNodeId } : null;
}

function validatePolicySteps(policy: ApplicableKpiApprovalPolicy) {
  if (policy.steps.length === 0) {
    throw new Error(`KPI 审批策略“${policy.name}”没有配置审批步骤`);
  }

  const seenOrders = new Set<number>();
  for (const step of policy.steps) {
    if (!Number.isInteger(step.stepOrder) || step.stepOrder <= 0) {
      throw new Error(`KPI 审批策略“${policy.name}”存在无效的步骤顺序`);
    }
    if (seenOrders.has(step.stepOrder)) {
      throw new Error(`KPI 审批策略“${policy.name}”存在重复的步骤顺序 ${step.stepOrder}`);
    }
    seenOrders.add(step.stepOrder);
    if (step.ancestorDepth !== null && (!Number.isInteger(step.ancestorDepth) || step.ancestorDepth < 0)) {
      throw new Error(`KPI 审批步骤“${step.label}”的祖先层级无效`);
    }
    if (step.resolverType === "EXPLICIT_USER" && !step.resolverUserId) {
      throw new Error(`KPI 审批步骤“${step.label}”没有配置指定审批人`);
    }
  }
}

export async function resolveKpiApprovalPolicySteps(
  input: {
    subjectUserId: string;
    subjectOrgNodeId: string | null;
    policy: ApplicableKpiApprovalPolicy;
  },
  dependencies: ApprovalPolicyResolverDependencies = defaultResolverDependencies,
): Promise<ResolvedKpiApprovalStep[]> {
  validatePolicySteps(input.policy);

  const ancestorNodes = await dependencies.getAncestorNodes(input.subjectOrgNodeId);
  const seenApproverIds = new Set<string>();
  const resolvedSteps: ResolvedKpiApprovalStep[] = [];
  const orderedSteps = [...input.policy.steps].sort((left, right) =>
    left.stepOrder - right.stepOrder || left.id.localeCompare(right.id)
  );

  for (const step of orderedSteps) {
    const resolution = await resolveStepApprover(step, ancestorNodes, dependencies);
    if (!resolution) {
      if (step.allowSkipWhenNoApprover) {
        continue;
      }
      throw new Error(`KPI 审批步骤“${step.label}”未找到有效审批人`);
    }

    if (step.skipIfSelf && resolution.approver.id === input.subjectUserId) {
      continue;
    }
    if (step.skipIfDuplicateApprover && seenApproverIds.has(resolution.approver.id)) {
      continue;
    }

    seenApproverIds.add(resolution.approver.id);
    resolvedSteps.push({
      stepOrder: resolvedSteps.length + 1,
      policyStepOrder: step.stepOrder,
      policyStepId: step.id,
      stepLabel: step.label,
      ancestorDepth: step.ancestorDepth,
      resolverType: step.resolverType,
      resolverUserId: step.resolverUserId,
      orgNodeId: resolution.resolvedOrgNodeId,
      approverId: resolution.approver.id,
    });
  }

  if (resolvedSteps.length === 0) {
    throw new Error(`KPI 审批策略“${input.policy.name}”没有生成有效审批步骤`);
  }

  return resolvedSteps;
}
