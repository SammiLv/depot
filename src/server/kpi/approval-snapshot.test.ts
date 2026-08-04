import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfiguredKpiApprovalSnapshot,
  buildPersonalKpiApprovalPolicyData,
  buildPersonalKpiApprovalStepData,
  resolveKpiApprovalSnapshot,
} from "@/server/kpi/approval-snapshot";
import type {
  ApplicableKpiApprovalPolicy,
  ResolvedKpiApprovalStep,
} from "@/server/kpi/approval-policy";

const configuredPolicy: ApplicableKpiApprovalPolicy = {
  id: "policy-1",
  scopeType: "DEPARTMENT",
  departmentOrgNodeId: "department-1",
  name: "部门审批策略",
  description: null,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  scopeOrgNodeIds: ["department-1"],
  matchedScopeOrgNodeId: "department-1",
  steps: [],
};

const resolvedSteps: ResolvedKpiApprovalStep[] = [
  {
    stepOrder: 1,
    policyStepOrder: 1,
    policyStepId: "policy-step-1",
    stepLabel: "直属组长",
    nodeMode: "CURRENT_TEAM",
    configuredOrgNodeId: null,
    ancestorDepth: 0,
    resolverType: "TEAM_LEADER",
    resolverUserId: null,
    orgNodeId: "team-1",
    approverId: "leader-1",
  },
  {
    stepOrder: 2,
    policyStepOrder: 2,
    policyStepId: "policy-step-2",
    stepLabel: "部门负责人",
    nodeMode: "FIXED_NODE",
    configuredOrgNodeId: "department-1",
    ancestorDepth: null,
    resolverType: "DEPARTMENT_MANAGER",
    resolverUserId: null,
    orgNodeId: "department-1",
    approverId: "manager-1",
  },
  {
    stepOrder: 3,
    policyStepOrder: 3,
    policyStepId: "policy-step-3",
    stepLabel: "指定终审人",
    nodeMode: "NONE",
    configuredOrgNodeId: null,
    ancestorDepth: null,
    resolverType: "EXPLICIT_USER",
    resolverUserId: "reviewer-1",
    orgNodeId: "department-2",
    approverId: "reviewer-1",
  },
];

test("configured strategy is mapped to a complete persisted snapshot", () => {
  const snapshot = buildConfiguredKpiApprovalSnapshot(configuredPolicy, resolvedSteps);

  assert.deepEqual({
    policyId: snapshot.policyId,
    policyName: snapshot.policyName,
    policyScopeType: snapshot.policyScopeType,
    policyDepartmentOrgNodeId: snapshot.policyDepartmentOrgNodeId,
    policyScopeOrgNodeId: snapshot.policyScopeOrgNodeId,
  }, {
    policyId: "policy-1",
    policyName: "部门审批策略",
    policyScopeType: "DEPARTMENT",
    policyDepartmentOrgNodeId: "department-1",
    policyScopeOrgNodeId: "department-1",
  });
  assert.deepEqual(snapshot.steps.map((step) => step.stageKey), ["LEADER", "MANAGER", "FINAL"]);
  assert.equal(snapshot.steps[2]?.policyStepId, "policy-step-3");
  assert.equal(snapshot.steps[2]?.resolverUserId, "reviewer-1");
  assert.equal(snapshot.steps[2]?.orgNodeId, "department-2");
});

test("configured snapshot maps every policy and step field to persistence data", () => {
  const snapshot = buildConfiguredKpiApprovalSnapshot(configuredPolicy, resolvedSteps);
  const policyData = buildPersonalKpiApprovalPolicyData(snapshot);
  const stepData = buildPersonalKpiApprovalStepData("personal-kpi-1", snapshot);

  assert.deepEqual(policyData, {
    approvalPolicyId: "policy-1",
    approvalPolicyName: "部门审批策略",
    approvalPolicyScopeType: "DEPARTMENT",
    approvalPolicyDepartmentOrgNodeId: "department-1",
    approvalPolicyScopeOrgNodeId: "department-1",
  });
  assert.deepEqual(stepData[0], {
    personalKpiId: "personal-kpi-1",
    policyStepId: "policy-step-1",
    stepOrder: 1,
    stageKey: "LEADER",
    stepLabel: "直属组长",
    nodeMode: "CURRENT_TEAM",
    configuredOrgNodeId: null,
    ancestorDepth: 0,
    resolverType: "TEAM_LEADER",
    resolverUserId: null,
    orgNodeId: "team-1",
    approverId: "leader-1",
    status: "PENDING",
  });
  assert.equal(stepData[1]?.status, "WAITING");
});

test("configured strategy is used without invoking the legacy chain", async () => {
  let legacyInvoked = false;
  const snapshot = await resolveKpiApprovalSnapshot({
    subjectUserId: "member-1",
    subjectOrgNodeId: "team-1",
  }, {
    async resolvePolicy() {
      return configuredPolicy;
    },
    async resolvePolicySteps() {
      return resolvedSteps;
    },
    async resolveLegacyChain() {
      legacyInvoked = true;
      return [];
    },
  });

  assert.equal(snapshot.policyId, "policy-1");
  assert.equal(legacyInvoked, false);
});

test("missing configured strategy falls back to the legacy chain", async () => {
  const snapshot = await resolveKpiApprovalSnapshot({
    subjectUserId: "member-1",
    subjectOrgNodeId: "team-1",
  }, {
    async resolvePolicy() {
      return null;
    },
    async resolvePolicySteps() {
      throw new Error("不应调用策略步骤解析");
    },
    async resolveLegacyChain() {
      return [
        { stepOrder: 1, stageKey: "LEADER", approverId: "leader-1" },
        { stepOrder: 2, stageKey: "FINAL", approverId: "admin-1" },
      ];
    },
  });

  assert.equal(snapshot.policyId, null);
  assert.deepEqual(snapshot.steps.map((step) => step.approverId), ["leader-1", "admin-1"]);
  assert.equal(snapshot.steps[0]?.policyStepId, null);
  assert.equal(snapshot.steps[0]?.resolverType, null);
});
