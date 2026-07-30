import type { KpiApprovalResolverType, PermissionScopeType } from "@prisma/client";
import { resolveApprovalChain } from "@/server/kpi/approval-chain";
import {
  resolveApplicableKpiApprovalPolicy,
  resolveKpiApprovalPolicySteps,
  type ApplicableKpiApprovalPolicy,
  type ResolvedKpiApprovalStep,
} from "@/server/kpi/approval-policy";
import { getInitialApprovalStepStatus } from "@/server/kpi/approval-workflow";

export type KpiApprovalSnapshotStep = {
  stepOrder: number;
  stageKey: "LEADER" | "MANAGER" | "FINAL";
  approverId: string;
  policyStepId: string | null;
  stepLabel: string | null;
  ancestorDepth: number | null;
  resolverType: KpiApprovalResolverType | null;
  resolverUserId: string | null;
  orgNodeId: string | null;
};

export type KpiApprovalSnapshot = {
  policyId: string | null;
  policyName: string | null;
  policyScopeType: PermissionScopeType | null;
  policyDepartmentOrgNodeId: string | null;
  steps: KpiApprovalSnapshotStep[];
};

type ApprovalSnapshotDependencies = {
  resolvePolicy(subjectOrgNodeId: string | null): Promise<ApplicableKpiApprovalPolicy | null>;
  resolvePolicySteps(input: {
    subjectUserId: string;
    subjectOrgNodeId: string | null;
    policy: ApplicableKpiApprovalPolicy;
  }): Promise<ResolvedKpiApprovalStep[]>;
  resolveLegacyChain(subjectUserId: string, subjectOrgNodeId: string | null): Promise<Array<{
    stepOrder: number;
    stageKey: "LEADER" | "MANAGER" | "FINAL";
    approverId: string;
  }>>;
};

const defaultDependencies: ApprovalSnapshotDependencies = {
  resolvePolicy: resolveApplicableKpiApprovalPolicy,
  resolvePolicySteps: resolveKpiApprovalPolicySteps,
  resolveLegacyChain: resolveApprovalChain,
};

export function getCompatibilityStageKey(resolverType: KpiApprovalResolverType) {
  if (resolverType === "TEAM_LEADER") return "LEADER" as const;
  if (resolverType === "DEPARTMENT_MANAGER") return "MANAGER" as const;
  return "FINAL" as const;
}

export function buildConfiguredKpiApprovalSnapshot(
  policy: ApplicableKpiApprovalPolicy,
  steps: ResolvedKpiApprovalStep[],
): KpiApprovalSnapshot {
  return {
    policyId: policy.id,
    policyName: policy.name,
    policyScopeType: policy.scopeType,
    policyDepartmentOrgNodeId: policy.departmentOrgNodeId,
    steps: steps.map((step) => ({
      stepOrder: step.stepOrder,
      stageKey: getCompatibilityStageKey(step.resolverType),
      approverId: step.approverId,
      policyStepId: step.policyStepId,
      stepLabel: step.stepLabel,
      ancestorDepth: step.ancestorDepth,
      resolverType: step.resolverType,
      resolverUserId: step.resolverUserId,
      orgNodeId: step.orgNodeId,
    })),
  };
}

export function buildPersonalKpiApprovalPolicyData(snapshot: KpiApprovalSnapshot) {
  return {
    approvalPolicyId: snapshot.policyId,
    approvalPolicyName: snapshot.policyName,
    approvalPolicyScopeType: snapshot.policyScopeType,
    approvalPolicyDepartmentOrgNodeId: snapshot.policyDepartmentOrgNodeId,
  };
}

export function buildPersonalKpiApprovalStepData(
  personalKpiId: string,
  snapshot: KpiApprovalSnapshot,
) {
  return snapshot.steps.map((step, index) => ({
    personalKpiId,
    policyStepId: step.policyStepId,
    stepOrder: step.stepOrder,
    stageKey: step.stageKey,
    stepLabel: step.stepLabel,
    ancestorDepth: step.ancestorDepth,
    resolverType: step.resolverType,
    resolverUserId: step.resolverUserId,
    orgNodeId: step.orgNodeId,
    approverId: step.approverId,
    status: getInitialApprovalStepStatus(index),
  }));
}

export async function resolveKpiApprovalSnapshot(
  input: {
    subjectUserId: string;
    subjectOrgNodeId: string | null;
  },
  dependencies: ApprovalSnapshotDependencies = defaultDependencies,
): Promise<KpiApprovalSnapshot> {
  const policy = await dependencies.resolvePolicy(input.subjectOrgNodeId);
  if (policy) {
    const steps = await dependencies.resolvePolicySteps({
      ...input,
      policy,
    });
    return buildConfiguredKpiApprovalSnapshot(policy, steps);
  }

  const legacySteps = await dependencies.resolveLegacyChain(input.subjectUserId, input.subjectOrgNodeId);
  return {
    policyId: null,
    policyName: null,
    policyScopeType: null,
    policyDepartmentOrgNodeId: null,
    steps: legacySteps.map((step) => ({
      ...step,
      policyStepId: null,
      stepLabel: null,
      ancestorDepth: null,
      resolverType: null,
      resolverUserId: null,
      orgNodeId: null,
    })),
  };
}
