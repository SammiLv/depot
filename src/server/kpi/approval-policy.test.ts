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
    scopeOrgNodeIds: scopeType === "DEPARTMENT" ? [departmentOrgNodeId] : [],
    matchedScopeOrgNodeId: scopeType === "DEPARTMENT" ? departmentOrgNodeId : null,
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
    nodeMode: null,
    approvalOrgNodeId: null,
    approvalOrgNodeIds: [],
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
        { id: "team", name: "采购1组", nodeType: "TEAM", depth: 0 },
        { id: "parent-team", name: "采购组", nodeType: "TEAM", depth: 1 },
        { id: "department", name: "产品部", nodeType: "DEPARTMENT", depth: 2 },
        { id: "root", name: "公司", nodeType: "ROOT", depth: 3 },
      ];
    },
    async findOrgNodeById(orgNodeId) {
      const nodes = {
        team: { id: "team", nodeType: "TEAM" as const },
        "parent-team": { id: "parent-team", nodeType: "TEAM" as const },
        department: { id: "department", nodeType: "DEPARTMENT" as const },
        root: { id: "root", nodeType: "ROOT" as const },
      };
      return nodes[orgNodeId as keyof typeof nodes] ?? null;
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
  ], [{ id: "dept-1", nodeType: "DEPARTMENT", depth: 0 }]);

  assert.equal(selected?.id, "department");
});

test("system policy is used when department policy is absent", () => {
  const selected = selectApplicableKpiApprovalPolicy([
    policy("system", "SYSTEM", ""),
    policy("other-department", "DEPARTMENT", "dept-2"),
  ], [{ id: "dept-1", nodeType: "DEPARTMENT", depth: 0 }]);

  assert.equal(selected?.id, "system");
});

test("multiple active policies in the preferred scope are rejected", () => {
  assert.throws(
    () => selectApplicableKpiApprovalPolicy([
      policy("department-a", "DEPARTMENT", "dept-1"),
      policy("department-b", "DEPARTMENT", "dept-1"),
      policy("system", "SYSTEM", ""),
    ], [{ id: "dept-1", nodeType: "DEPARTMENT", depth: 0 }]),
    /存在多个同级启用的 KPI 审批策略/,
  );
});

test("multiple active system policies are rejected during fallback", () => {
  assert.throws(
    () => selectApplicableKpiApprovalPolicy([
      policy("system-a", "SYSTEM", ""),
      policy("system-b", "SYSTEM", ""),
    ], [{ id: "dept-1", nodeType: "DEPARTMENT", depth: 0 }]),
    /系统存在多个启用中的 KPI 审批策略/,
  );
});

test("the deepest matching organization scope wins without merging policies", () => {
  const selected = selectApplicableKpiApprovalPolicy([
    policy("system", "SYSTEM", ""),
    policy("department-policy", "DEPARTMENT", "department", {
      scopeOrgNodeIds: ["department"],
    }),
    policy("team-policy", "DEPARTMENT", "department", {
      scopeOrgNodeIds: ["parent-team"],
    }),
  ], [
    { id: "team", nodeType: "TEAM", depth: 0 },
    { id: "parent-team", nodeType: "TEAM", depth: 1 },
    { id: "department", nodeType: "DEPARTMENT", depth: 2 },
  ]);

  assert.equal(selected?.id, "team-policy");
  assert.equal(selected?.matchedScopeOrgNodeId, "parent-team");
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

test("dynamic and fixed nodes resolve their exact management roles", async () => {
  const selectedPolicy = policy("node-policy", "SYSTEM", "", {
    steps: [
      step("current-team", 1, "TEAM_LEADER", { nodeMode: "CURRENT_TEAM" }),
      step("current-department", 2, "DEPARTMENT_MANAGER", { nodeMode: "CURRENT_DEPARTMENT" }),
      step("fixed-parent-team", 3, "TEAM_LEADER", {
        nodeMode: "FIXED_NODE",
        approvalOrgNodeId: "parent-team",
      }),
      step("fixed-root", 4, "ADMIN", {
        nodeMode: "FIXED_NODE",
        approvalOrgNodeId: "root",
      }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies());

  assert.deepEqual(result.map((item) => item.approverId), ["leader", "manager", "parent-leader", "admin"]);
  assert.deepEqual(result.map((item) => item.orgNodeId), ["team", "department", "parent-team", "root"]);
  assert.deepEqual(result.map((item) => item.nodeMode), [
    "CURRENT_TEAM",
    "CURRENT_DEPARTMENT",
    "FIXED_NODE",
    "FIXED_NODE",
  ]);
});

test("an explicit user overrides the node role without changing the approval stage", async () => {
  const selectedPolicy = policy("override-policy", "DEPARTMENT", "department", {
    steps: [
      step("team-override", 1, "TEAM_LEADER", {
        nodeMode: "CURRENT_TEAM",
        resolverUserId: "explicit",
      }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies());

  assert.equal(result[0]?.approverId, "explicit");
  assert.equal(result[0]?.orgNodeId, "team");
  assert.equal(result[0]?.resolverType, "TEAM_LEADER");
});

test("no-node mode requires and resolves an explicit user", async () => {
  const selectedPolicy = policy("explicit-policy", "SYSTEM", "", {
    steps: [
      step("explicit", 1, "EXPLICIT_USER", {
        nodeMode: "NONE",
        resolverUserId: "explicit",
      }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies());

  assert.equal(result[0]?.approverId, "explicit");
  assert.equal(result[0]?.orgNodeId, null);
  assert.equal(result[0]?.resolverType, "EXPLICIT_USER");
});

test("organization-node owner applies only to the selected node on the employee path", async () => {
  const selectedPolicy = policy("node-owner-policy", "DEPARTMENT", "department", {
    steps: [
      step("selected-owner", 1, "TEAM_LEADER", {
        nodeMode: "ORG_NODE_OWNER",
        approvalOrgNodeIds: ["parent-team", "other-team"],
      }),
      step("not-applicable", 2, "TEAM_LEADER", {
        nodeMode: "ORG_NODE_OWNER",
        approvalOrgNodeIds: ["other-team"],
      }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies());

  assert.deepEqual(result.map((item) => item.approverId), ["parent-leader"]);
  assert.equal(result[0]?.configuredOrgNodeId, "parent-team");
});

test("cascade mode expands every responsible node through the department and excludes company", async () => {
  const selectedPolicy = policy("cascade-policy", "DEPARTMENT", "department", {
    steps: [
      step("逐级审批", 1, "TEAM_LEADER", {
        nodeMode: "CASCADE_TO_DEPARTMENT",
      }),
    ],
  });

  const result = await resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies());

  assert.deepEqual(result.map((item) => item.approverId), ["leader", "parent-leader", "manager"]);
  assert.deepEqual(result.map((item) => item.orgNodeId), ["team", "parent-team", "department"]);
  assert.deepEqual(result.map((item) => item.stepLabel), [
    "逐级审批（采购1组）",
    "逐级审批（采购组）",
    "逐级审批（产品部）",
  ]);
});

test("cascade mode rejects an explicit approver override", async () => {
  const selectedPolicy = policy("invalid-cascade-policy", "DEPARTMENT", "department", {
    steps: [
      step("逐级审批", 1, "TEAM_LEADER", {
        nodeMode: "CASCADE_TO_DEPARTMENT",
        resolverUserId: "explicit",
      }),
    ],
  });

  await assert.rejects(resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies()), /逐级审批时不允许指定审批人/);
});

test("organization-node owner rejects multiple matches on one employee path", async () => {
  const selectedPolicy = policy("invalid-node-owner-policy", "DEPARTMENT", "department", {
    steps: [
      step("duplicate-path", 1, "TEAM_LEADER", {
        nodeMode: "ORG_NODE_OWNER",
        approvalOrgNodeIds: ["team", "parent-team"],
      }),
    ],
  });

  await assert.rejects(resolveKpiApprovalPolicySteps({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
    policy: selectedPolicy,
  }, dependencies()), /命中了多个节点/);
});
