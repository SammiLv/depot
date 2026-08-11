import type {
  KpiApprovalResolverType,
  KpiApprovalNodeMode,
  OrgNodeType,
  PermissionScopeType,
  RoleType,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getKpiApprovalResolverTypeForNode } from "@/server/kpi/approval-policy-admin";

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
  nodeMode: KpiApprovalNodeMode | null;
  approvalOrgNodeId: string | null;
  approvalOrgNodeIds: string[];
  ancestorDepth: number | null;
  resolverType: KpiApprovalResolverType;
  resolverUserId: string | null;
  skipIfSelf: boolean;
  skipIfDuplicateApprover: boolean;
  allowSkipWhenNoApprover: boolean;
};

export type ApplicableKpiApprovalPolicy = PolicyRow & {
  scopeOrgNodeIds: string[];
  matchedScopeOrgNodeId: string | null;
  steps: KpiApprovalPolicyStepDefinition[];
};

export type KpiApprovalAncestorNode = {
  id: string;
  nodeType: OrgNodeType;
  depth: number;
  name?: string;
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
  nodeMode: KpiApprovalNodeMode | null;
  configuredOrgNodeId: string | null;
  ancestorDepth: number | null;
  resolverType: KpiApprovalResolverType;
  resolverUserId: string | null;
  orgNodeId: string | null;
  approverId: string;
};

export type ApprovalPolicyResolverDependencies = {
  getAncestorNodes(orgNodeId: string | null): Promise<KpiApprovalAncestorNode[]>;
  findOrgNodeById(orgNodeId: string): Promise<Omit<KpiApprovalAncestorNode, "depth"> | null>;
  findFirstActiveUserByRole(roleType: RoleType, orgNodeIds?: string[]): Promise<ApproverCandidate | null>;
  findActiveUsersByRole(roleType: RoleType, orgNodeIds?: string[]): Promise<ApproverCandidate[]>;
  findActiveUserById(userId: string): Promise<ApproverCandidate | null>;
};

export function selectApplicableKpiApprovalPolicy(
  policies: Array<PolicyRow & { scopeOrgNodeIds: string[] }>,
  ancestorNodes: KpiApprovalAncestorNode[],
): (PolicyRow & { scopeOrgNodeIds: string[]; matchedScopeOrgNodeId: string | null }) | null {
  const depthByNodeId = new Map(ancestorNodes.map((node) => [node.id, node.depth]));
  const scopedMatches = policies.flatMap((policy) => {
    if (!policy.isActive || policy.scopeType !== "DEPARTMENT") return [];
    const configuredScopeIds = policy.scopeOrgNodeIds.length > 0
      ? policy.scopeOrgNodeIds
      : [policy.departmentOrgNodeId].filter(Boolean);
    const matches = configuredScopeIds.flatMap((orgNodeId) => {
      const depth = depthByNodeId.get(orgNodeId);
      return depth === undefined ? [] : [{ orgNodeId, depth }];
    });
    if (matches.length === 0) return [];
    const match = matches.sort((left, right) => left.depth - right.depth)[0];
    return [{ policy, match }];
  });

  if (scopedMatches.length > 0) {
    const winningDepth = Math.min(...scopedMatches.map(({ match }) => match.depth));
    const winners = scopedMatches.filter(({ match }) => match.depth === winningDepth);
    if (winners.length > 1) {
      throw new Error(`组织节点 ${winners[0]?.match.orgNodeId ?? "未知"}存在多个同级启用的 KPI 审批策略`);
    }
    const winner = winners[0];
    return winner ? {
      ...winner.policy,
      matchedScopeOrgNodeId: winner.match.orgNodeId,
    } : null;
  }

  const systemPolicies = policies.filter((policy) =>
    policy.isActive
    && policy.scopeType === "SYSTEM"
    && policy.departmentOrgNodeId === ""
  );
  if (systemPolicies.length > 1) {
    throw new Error("系统存在多个启用中的 KPI 审批策略");
  }
  const systemPolicy = systemPolicies[0];
  return systemPolicy ? { ...systemPolicy, matchedScopeOrgNodeId: null } : null;
}

export async function findApplicableKpiApprovalPolicy(
  subjectOrgNodeId: string | null,
): Promise<ApplicableKpiApprovalPolicy | null> {
  const policies = await prisma.kpiApprovalPolicy.findMany({
    where: { isActive: true },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
  const scopeRows = policies.length > 0
    ? await prisma.kpiApprovalPolicyScope.findMany({
        where: { policyId: { in: policies.map((policy) => policy.id) } },
        select: { policyId: true, orgNodeId: true },
      })
    : [];
  const scopeIdsByPolicy = new Map<string, string[]>();
  for (const row of scopeRows) {
    const ids = scopeIdsByPolicy.get(row.policyId) ?? [];
    ids.push(row.orgNodeId);
    scopeIdsByPolicy.set(row.policyId, ids);
  }
  const ancestorNodes = await getAncestorNodes(subjectOrgNodeId);
  const selected = selectApplicableKpiApprovalPolicy(
    policies.map((policy) => ({
      ...policy,
      scopeOrgNodeIds: scopeIdsByPolicy.get(policy.id) ?? [],
    })),
    ancestorNodes,
  );
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
  const stepOrgNodeRows = steps.length > 0
    ? await prisma.kpiApprovalPolicyStepOrgNode.findMany({
        where: { policyStepId: { in: steps.map((step) => step.id) } },
        select: { policyStepId: true, orgNodeId: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const orgNodeIdsByStep = new Map<string, string[]>();
  for (const row of stepOrgNodeRows) {
    const ids = orgNodeIdsByStep.get(row.policyStepId) ?? [];
    ids.push(row.orgNodeId);
    orgNodeIdsByStep.set(row.policyStepId, ids);
  }

  return {
    ...selected,
    steps: steps.map((step) => ({
      ...step,
      approvalOrgNodeIds: orgNodeIdsByStep.get(step.id) ?? [],
    })),
  };
}

export async function resolveApplicableKpiApprovalPolicy(
  subjectOrgNodeId: string | null,
): Promise<ApplicableKpiApprovalPolicy | null> {
  return findApplicableKpiApprovalPolicy(subjectOrgNodeId);
}

async function getAncestorNodes(orgNodeId: string | null): Promise<KpiApprovalAncestorNode[]> {
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
      select: { id: true, nodeType: true, name: true },
    });
    return currentNode ? [{ ...currentNode, depth: 0 }] : [];
  }

  const nodes = await prisma.orgNode.findMany({
    where: { id: { in: closureRows.map((row) => row.ancestorId) } },
    select: { id: true, nodeType: true, name: true },
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return closureRows.flatMap((row) => {
    const node = nodeById.get(row.ancestorId);
    return node ? [{ ...node, depth: row.depth }] : [];
  });
}

const defaultResolverDependencies: ApprovalPolicyResolverDependencies = {
  getAncestorNodes,
  async findOrgNodeById(orgNodeId) {
    return prisma.orgNode.findUnique({
      where: { id: orgNodeId },
      select: { id: true, nodeType: true, name: true },
    });
  },
  async findFirstActiveUserByRole(roleType, orgNodeIds) {
    const users = await defaultResolverDependencies.findActiveUsersByRole(roleType, orgNodeIds);
    return users[0] ?? null;
  },
  async findActiveUsersByRole(roleType, orgNodeIds) {
    return prisma.user.findMany({
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

function findAncestorAtDepth(ancestorNodes: KpiApprovalAncestorNode[], ancestorDepth: number) {
  return ancestorNodes.find((node) => node.depth === ancestorDepth) ?? null;
}

async function resolveTeamLeader(
  step: KpiApprovalPolicyStepDefinition,
  ancestorNodes: KpiApprovalAncestorNode[],
  dependencies: ApprovalPolicyResolverDependencies,
) {
  const candidateNodes = step.ancestorDepth === null
    ? ancestorNodes
    : [findAncestorAtDepth(ancestorNodes, step.ancestorDepth)].filter((node): node is KpiApprovalAncestorNode => Boolean(node));

  for (const node of candidateNodes) {
    const approvers = await dependencies.findActiveUsersByRole("TEAM_LEADER", [node.id]);
    if (approvers.length) {
      return { approvers, resolvedOrgNodeId: node.id };
    }
  }

  return null;
}

async function resolveDepartmentManager(
  step: KpiApprovalPolicyStepDefinition,
  ancestorNodes: KpiApprovalAncestorNode[],
  dependencies: ApprovalPolicyResolverDependencies,
) {
  const targetNode = step.ancestorDepth === null
    ? ancestorNodes.find((node) => node.nodeType === "DEPARTMENT") ?? null
    : findAncestorAtDepth(ancestorNodes, step.ancestorDepth);
  if (!targetNode) {
    return null;
  }

  const approvers = await dependencies.findActiveUsersByRole("DEPARTMENT_MANAGER", [targetNode.id]);
  return approvers.length ? { approvers, resolvedOrgNodeId: targetNode.id } : null;
}

async function resolveApproversForNode(
  dependencies: ApprovalPolicyResolverDependencies,
  resolverType: KpiApprovalResolverType,
  targetNodeId: string | null,
  explicitUserId?: string | null,
) {
  if (explicitUserId) {
    const approver = await dependencies.findActiveUserById(explicitUserId);
    return approver ? [approver] : [];
  }
  if (resolverType === "ADMIN") {
    return dependencies.findActiveUsersByRole("ADMIN");
  }
  if (!targetNodeId) return [];
  return dependencies.findActiveUsersByRole(resolverType, [targetNodeId]);
}

async function resolveStepApprover(
  step: KpiApprovalPolicyStepDefinition,
  ancestorNodes: KpiApprovalAncestorNode[],
  dependencies: ApprovalPolicyResolverDependencies,
) {
  if (step.nodeMode != null) {
    let targetNode: Omit<KpiApprovalAncestorNode, "depth"> | null = null;
    if (step.nodeMode === "CURRENT_TEAM") {
      targetNode = ancestorNodes.find((node) => node.nodeType === "TEAM") ?? null;
    } else if (step.nodeMode === "CURRENT_DEPARTMENT") {
      targetNode = ancestorNodes.find((node) => node.nodeType === "DEPARTMENT") ?? null;
    } else if (step.nodeMode === "FIXED_NODE" && step.approvalOrgNodeId) {
      targetNode = await dependencies.findOrgNodeById(step.approvalOrgNodeId);
    }

    if (step.resolverUserId) {
      const approvers = await resolveApproversForNode(
        dependencies,
        targetNode ? getKpiApprovalResolverTypeForNode(targetNode.nodeType) : "EXPLICIT_USER",
        targetNode?.id ?? null,
        step.resolverUserId,
      );
      return approvers.length ? {
        approvers,
        resolvedOrgNodeId: targetNode?.id ?? null,
        resolverType: targetNode
          ? getKpiApprovalResolverTypeForNode(targetNode.nodeType)
          : "EXPLICIT_USER" as const,
      } : null;
    }
    if (!targetNode) return null;

    const resolverType = getKpiApprovalResolverTypeForNode(targetNode.nodeType);
    const approvers = await resolveApproversForNode(dependencies, resolverType, targetNode.id);
    return approvers.length ? { approvers, resolvedOrgNodeId: targetNode.id, resolverType } : null;
  }

  if (step.resolverType === "TEAM_LEADER") {
    const resolution = await resolveTeamLeader(step, ancestorNodes, dependencies);
    return resolution ? { ...resolution, resolverType: step.resolverType } : null;
  }
  if (step.resolverType === "DEPARTMENT_MANAGER") {
    const resolution = await resolveDepartmentManager(step, ancestorNodes, dependencies);
    return resolution ? { ...resolution, resolverType: step.resolverType } : null;
  }
  if (step.resolverType === "ADMIN") {
    const approvers = await dependencies.findActiveUsersByRole("ADMIN");
    return approvers.length ? {
      approvers,
      resolvedOrgNodeId: approvers[0]?.orgNodeId ?? null,
      resolverType: step.resolverType,
    } : null;
  }
  if (!step.resolverUserId) {
    return null;
  }

  const approvers = await resolveApproversForNode(
    dependencies,
    step.resolverType,
    null,
    step.resolverUserId,
  );
  return approvers.length ? {
    approvers,
    resolvedOrgNodeId: approvers[0]?.orgNodeId ?? null,
    resolverType: step.resolverType,
  } : null;
}

type StepResolution = {
  approvers: ApproverCandidate[];
  resolvedOrgNodeId: string | null;
  configuredOrgNodeId: string | null;
  resolverType: KpiApprovalResolverType;
  stepLabel: string;
};

async function resolveNodeOwnerStep(
  step: KpiApprovalPolicyStepDefinition,
  ancestorNodes: KpiApprovalAncestorNode[],
  dependencies: ApprovalPolicyResolverDependencies,
): Promise<StepResolution[]> {
  const configuredNodeIds = new Set(step.approvalOrgNodeIds);
  const matchingNodes = ancestorNodes.filter((node) => configuredNodeIds.has(node.id));
  if (matchingNodes.length > 1) {
    throw new Error(`KPI 审批步骤“${step.label}”在员工组织路径上命中了多个节点`);
  }
  const targetNode = matchingNodes[0];
  if (!targetNode) {
    // 该步骤不适用于当前员工，不视为“找不到审批人”。
    return [];
  }

  const resolverType = getKpiApprovalResolverTypeForNode(targetNode.nodeType);
  const approvers = await resolveApproversForNode(
    dependencies,
    resolverType,
    targetNode.id,
    step.resolverUserId,
  );
  if (!approvers.length) return [];
  return [{
    approvers,
    resolvedOrgNodeId: targetNode.id,
    configuredOrgNodeId: targetNode.id,
    resolverType,
    stepLabel: step.label,
  }];
}

async function resolveCascadeStep(
  step: KpiApprovalPolicyStepDefinition,
  ancestorNodes: KpiApprovalAncestorNode[],
  dependencies: ApprovalPolicyResolverDependencies,
): Promise<StepResolution[]> {
  const orderedNodes = [...ancestorNodes].sort((left, right) => left.depth - right.depth);
  const departmentIndex = orderedNodes.findIndex((node) => node.nodeType === "DEPARTMENT");
  if (departmentIndex < 0) return [];
  const targetNodes = orderedNodes
    .slice(0, departmentIndex + 1)
    .filter((node) => node.nodeType !== "ROOT");

  const resolutions: StepResolution[] = [];
  for (const targetNode of targetNodes) {
    const resolverType = getKpiApprovalResolverTypeForNode(targetNode.nodeType);
    const approvers = await resolveApproversForNode(dependencies, resolverType, targetNode.id);
    if (!approvers.length) {
      if (step.allowSkipWhenNoApprover) continue;
      throw new Error(`KPI 审批步骤“${step.label}”的组织节点“${targetNode.name ?? targetNode.id}”未找到有效负责人`);
    }
    resolutions.push({
      approvers,
      resolvedOrgNodeId: targetNode.id,
      configuredOrgNodeId: null,
      resolverType,
      stepLabel: targetNode.name ? `${step.label}（${targetNode.name}）` : step.label,
    });
  }
  return resolutions;
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
    if (step.nodeMode === "FIXED_NODE" && !step.approvalOrgNodeId) {
      throw new Error(`KPI 审批步骤“${step.label}”没有配置固定审批节点`);
    }
    if (step.nodeMode === "NONE" && !step.resolverUserId) {
      throw new Error(`KPI 审批步骤“${step.label}”没有配置指定审批人`);
    }
    if (step.nodeMode === "ORG_NODE_OWNER" && step.approvalOrgNodeIds.length === 0) {
      throw new Error(`KPI 审批步骤“${step.label}”没有配置组织节点`);
    }
    if (step.nodeMode === "CASCADE_TO_DEPARTMENT" && step.resolverUserId) {
      throw new Error(`KPI 审批步骤“${step.label}”为逐级审批时不允许指定审批人`);
    }
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
    let resolutions: StepResolution[];
    if (step.nodeMode === "ORG_NODE_OWNER") {
      resolutions = await resolveNodeOwnerStep(step, ancestorNodes, dependencies);
      // 没有命中组织节点表示步骤不适用，直接省略。
      if (resolutions.length === 0 && !ancestorNodes.some((node) => step.approvalOrgNodeIds.includes(node.id))) {
        continue;
      }
    } else if (step.nodeMode === "CASCADE_TO_DEPARTMENT") {
      resolutions = await resolveCascadeStep(step, ancestorNodes, dependencies);
    } else {
      const legacyResolution = await resolveStepApprover(step, ancestorNodes, dependencies);
      resolutions = legacyResolution ? [{
        ...legacyResolution,
        configuredOrgNodeId: step.approvalOrgNodeId,
        stepLabel: step.label,
      }] : [];
    }

    if (resolutions.length === 0) {
      if (step.allowSkipWhenNoApprover) {
        continue;
      }
      throw new Error(`KPI 审批步骤“${step.label}”未找到有效审批人`);
    }

    for (const resolution of resolutions) {
      const eligibleApprovers = resolution.approvers.filter((approver) => {
        if (step.skipIfSelf && approver.id === input.subjectUserId) return false;
        if (step.skipIfDuplicateApprover && seenApproverIds.has(approver.id)) return false;
        return true;
      });
      if (!eligibleApprovers.length) continue;

      const stepOrder = resolvedSteps.length > 0
        ? Math.max(...resolvedSteps.map((item) => item.stepOrder)) + 1
        : 1;

      for (const approver of eligibleApprovers) {
        seenApproverIds.add(approver.id);
        resolvedSteps.push({
          stepOrder,
          policyStepOrder: step.stepOrder,
          policyStepId: step.id,
          stepLabel: resolution.stepLabel,
          nodeMode: step.nodeMode ?? null,
          configuredOrgNodeId: resolution.configuredOrgNodeId,
          ancestorDepth: step.ancestorDepth,
          resolverType: resolution.resolverType,
          resolverUserId: step.resolverUserId,
          orgNodeId: resolution.resolvedOrgNodeId,
          approverId: approver.id,
        });
      }
    }
  }

  if (resolvedSteps.length === 0) {
    throw new Error(`KPI 审批策略“${input.policy.name}”没有生成有效审批步骤`);
  }

  return resolvedSteps;
}
