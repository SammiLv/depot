import test from "node:test";
import assert from "node:assert/strict";
import type { PermissionScopeType } from "@prisma/client";
import {
  resolveKpiApprovalPolicySteps,
  selectApplicableKpiApprovalPolicy,
  type ApplicableKpiApprovalPolicy,
  type ApprovalPolicyResolverDependencies,
  type KpiApprovalPolicyStepDefinition,
} from "@/server/kpi/approval-policy";

function policy(
  id: string,
  scopeType: PermissionScopeType,
  departmentOrgNodeId: string,
  overrides: Partial<ApplicableKpiApprovalPolicy> = {},
): ApplicableKpiApprovalPolicy {
  return {
    id,
    scopeType,
    departmentOrgNodeId,
    name: id,
    description: null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    steps: [],
    ...overrides,
  };
}

function step(
  id: string,
  stepOrder: number,
  resolverType: KpiApprovalPolicyStepDefinition["resolverType"],
  overrides: Partial<KpiApprovalPolicyStepDefinition> = {},
): KpiApprovalPolicyStepDefinition {
  return {
    id,
    policyId: "policy",
    stepOrder,
    label: id,
    ancestorDepth: null,
    resolverType,
    resolverUserId: null,
    skipIfSelf: true,
    skipIfDuplicateApprover: true,
    allowSkipWhenNoApprover: false,
    ...overrides,
  };
}

function dependencies(): ApprovalPolicyResolverDependencies {
  const users = {
    leader: { id: "leader", orgNodeId: "team" },
    parentLeader: { id: "parent-leader", orgNodeId: "parent-team" },
    manager: { id: "manager", orgNodeId: "department" },
    admin: { id: "admin", orgNodeId: null },
    explicit: { id: "explicit", orgNodeId: "other-team" },
  };

  return {
    async getAncestorNodes() {
      return [
        { id: "team", nodeType: "TEAM", depth: 0 },
        { id: "parent-team", nodeType: "TEAM", depth: 1 },
        { id: "department", nodeType: "DEPARTMENT", depth: 2 },
        { id: "root", nodeType: "ROOT", depth: 3 },
      ];
    },
    async findFirstActiveUserByRole(roleType, orgNodeIds) {
      if (roleType === "ADMIN") return users.admin;
      if (roleType === "DEPARTMENT_MANAGER" && orgNodeIds?.includes("department")) return users.manager;
      if (roleType === "TEAM_LEADER" && orgNodeIds?.includes("team")) return users.leader;
      if (roleType === "TEAM_LEADER" && orgNodeIds?.includes("parent-team")) return users.parentLeader;
      return null;
    },
    async findActiveUserById(userId) {
      return userId === users.explicit.id ? users.explicit : null;
    },
  };
}

test("department policy takes priority over system policy", () => {
  const selected = selectApplicableKpiApprovalPolicy([
    policy("system", "SYSTEM", ""),
    policy("department", "DEPARTMENT", "dept-1"),
  ], "dept-1");

  assert.equal(selected?.id, "department");
});

test("system policy is used when department policy is absent", () => {
  const selected = selectApplicableKpiApprovalPolicy([
    policy("system", "SYSTEM", ""),
    policy("other-department", "DEPARTMENT", "dept-2"),
  ], "dept-1");

  assert.equal(selected?.id, "system");
});

test("multiple active policies in the preferred scope are rejected", () => {
  assert.throws(
    () => selectApplicableKpiApprovalPolicy([
      policy("department-a", "DEPARTMENT", "dept-1"),
      policy("department-b", "DEPARTMENT", "dept-1"),
      policy("system", "SYSTEM", ""),
    ], "dept-1"),
    /存在多个启用中的 KPI 审批策略/,
  );
});

test("multiple active system policies are rejected during fallback", () => {
  assert.throws(
    () => selectApplicableKpiApprovalPolicy([
      policy("system-a", "SYSTEM", ""),
      policy("system-b", "SYSTEM", ""),
    ], "dept-1"),
    /系统存在多个启用中的 KPI 审批策略/,
  );
});

test("all four resolver types generate ordered approval steps", async () => {
  const selectedPolicy = policy("policy", "DEPARTMENT", "department", {
    steps: [
      step("leader-step", 1, "TEAM_LEADER"),
      step("manager-step", 2, "DEPARTMENT_MANAGER"),
      step("admin-step", 3, "ADMIN"),
      step("explicit-step", 4, "EXPLICIT_USER", { resolverUserId: "explicit" }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies());

  assert.deepEqual(result.map((item) => item.approverId), ["leader", "manager", "admin", "explicit"]);
  assert.deepEqual(result.map((item) => item.stepOrder), [1, 2, 3, 4]);
});

test("ancestorDepth selects the exact ancestor node", async () => {
  const selectedPolicy = policy("policy", "DEPARTMENT", "department", {
    steps: [
      step("parent-leader-step", 1, "TEAM_LEADER", { ancestorDepth: 1 }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies());

  assert.equal(result[0]?.approverId, "parent-leader");
  assert.equal(result[0]?.orgNodeId, "parent-team");
});

test("department manager resolver searches only the target department node", async () => {
  const selectedPolicy = policy("policy", "DEPARTMENT", "department", {
    steps: [step("manager-step", 1, "DEPARTMENT_MANAGER")],
  });
  const resolverDependencies = dependencies();
  const searchedOrgNodeIds: string[][] = [];
  resolverDependencies.findFirstActiveUserByRole = async (roleType, orgNodeIds) => {
    if (roleType === "DEPARTMENT_MANAGER" && orgNodeIds) {
      searchedOrgNodeIds.push(orgNodeIds);
      return { id: "manager", orgNodeId: "department" };
    }
    return null;
  };

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, resolverDependencies);

  assert.deepEqual(searchedOrgNodeIds, [["department"]]);
  assert.equal(result[0]?.approverId, "manager");
});

test("self and duplicate approvers are skipped and output order is compacted", async () => {
  const resolverDependencies = dependencies();
  resolverDependencies.findActiveUserById = async (userId) => {
    if (userId === "member") return { id: "member", orgNodeId: "team" };
    if (userId === "leader") return { id: "leader", orgNodeId: "team" };
    return null;
  };
  const selectedPolicy = policy("policy", "DEPARTMENT", "department", {
    steps: [
      step("self-step", 1, "EXPLICIT_USER", { resolverUserId: "member" }),
      step("leader-step", 2, "TEAM_LEADER"),
      step("duplicate-step", 3, "EXPLICIT_USER", { resolverUserId: "leader" }),
      step("manager-step", 4, "DEPARTMENT_MANAGER"),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, resolverDependencies);

  assert.deepEqual(result.map((item) => item.approverId), ["leader", "manager"]);
  assert.deepEqual(result.map((item) => item.stepOrder), [1, 2]);
  assert.deepEqual(result.map((item) => item.policyStepOrder), [2, 4]);
});

test("self and duplicate approvers remain when their skip flags are disabled", async () => {
  const resolverDependencies = dependencies();
  resolverDependencies.findActiveUserById = async (userId) => ({
    id: userId,
    orgNodeId: "team",
  });
  const selectedPolicy = policy("policy", "DEPARTMENT", "department", {
    steps: [
      step("self-step", 1, "EXPLICIT_USER", {
        resolverUserId: "member",
        skipIfSelf: false,
      }),
      step("first-review-step", 2, "EXPLICIT_USER", {
        resolverUserId: "reviewer",
      }),
      step("duplicate-review-step", 3, "EXPLICIT_USER", {
        resolverUserId: "reviewer",
        skipIfDuplicateApprover: false,
      }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, resolverDependencies);

  assert.deepEqual(result.map((item) => item.approverId), ["member", "reviewer", "reviewer"]);
});

test("missing approver can be skipped only when the step allows it", async () => {
  const skippablePolicy = policy("skippable", "SYSTEM", "", {
    steps: [
      step("missing-step", 1, "EXPLICIT_USER", {
        resolverUserId: "missing",
        allowSkipWhenNoApprover: true,
      }),
      step("admin-step", 2, "ADMIN"),
    ],
  });
  const strictPolicy = policy("strict", "SYSTEM", "", {
    steps: [
      step("missing-step", 1, "EXPLICIT_USER", { resolverUserId: "missing" }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: skippablePolicy,
  }, dependencies());
  assert.deepEqual(result.map((item) => item.approverId), ["admin"]);

  await assert.rejects(
    resolveKpiApprovalPolicySteps({
      subjectUserId: "member",
      subjectOrgNodeId: "team",
      policy: strictPolicy,
    }, dependencies()),
    /未找到有效审批人/,
  );
});

test("invalid and empty policies fail before initialization can consume them", async () => {
  await assert.rejects(
    resolveKpiApprovalPolicySteps({
      subjectUserId: "member",
      subjectOrgNodeId: "team",
      policy: policy("empty", "SYSTEM", ""),
    }, dependencies()),
    /没有配置审批步骤/,
  );

  await assert.rejects(
    resolveKpiApprovalPolicySteps({
      subjectUserId: "member",
      subjectOrgNodeId: "team",
      policy: policy("invalid", "SYSTEM", "", {
        steps: [step("explicit", 1, "EXPLICIT_USER")],
      }),
    }, dependencies()),
    /没有配置指定审批人/,
  );
});

test("inactive explicit user is handled as a missing approver", async () => {
  const selectedPolicy = policy("inactive-user", "SYSTEM", "", {
    steps: [
      step("inactive-user-step", 1, "EXPLICIT_USER", {
        resolverUserId: "inactive-user",
      }),
    ],
  });
  const resolverDependencies = dependencies();
  resolverDependencies.findActiveUserById = async () => null;

  await assert.rejects(
    resolveKpiApprovalPolicySteps({
      subjectUserId: "member",
      subjectOrgNodeId: "team",
      policy: selectedPolicy,
    }, resolverDependencies),
    /未找到有效审批人/,
  );
});
