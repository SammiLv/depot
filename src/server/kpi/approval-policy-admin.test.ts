import test from "node:test";
import assert from "node:assert/strict";
import {
  getKpiApprovalPolicyActiveScopeKey,
  parseKpiApprovalPolicySteps,
} from "@/server/kpi/approval-policy-admin";

test("only the active system default policy keeps the legacy unique scope key", () => {
  assert.equal(getKpiApprovalPolicyActiveScopeKey("SYSTEM", "", true), "SYSTEM:");
  assert.equal(
    getKpiApprovalPolicyActiveScopeKey("DEPARTMENT", "department-1", true),
    null,
  );
  assert.equal(getKpiApprovalPolicyActiveScopeKey("SYSTEM", "", false), null);
});

test("policy step input is normalized with safe defaults", () => {
  const rows = parseKpiApprovalPolicySteps(JSON.stringify([{
    label: " 直属组长 ",
    ancestorDepth: "1",
    resolverType: "TEAM_LEADER",
  }]));
  assert.deepEqual(rows[0], {
    label: "直属组长",
    nodeMode: null,
    approvalOrgNodeId: null,
    approvalOrgNodeIds: [],
    ancestorDepth: 1,
    resolverType: "TEAM_LEADER",
    resolverUserId: null,
    skipIfSelf: true,
    skipIfDuplicateApprover: true,
    allowSkipWhenNoApprover: false,
  });
});

test("empty steps and explicit resolver without user are rejected", () => {
  assert.throws(() => parseKpiApprovalPolicySteps("[]"), /至少需要一个步骤/);
  assert.throws(() => parseKpiApprovalPolicySteps(JSON.stringify([{
    label: "指定审批",
    resolverType: "EXPLICIT_USER",
  }])), /缺少指定审批人/);
});

test("node-based steps derive resolver types and keep optional user overrides", () => {
  const rows = parseKpiApprovalPolicySteps(JSON.stringify([
    {
      label: "直属组长审批",
      nodeMode: "CURRENT_TEAM",
      resolverUserId: "leader-override",
      ancestorDepth: 3,
    },
    {
      label: "部门主管审批",
      nodeMode: "CURRENT_DEPARTMENT",
    },
    {
      label: "指定终审人",
      nodeMode: "NONE",
      resolverUserId: "reviewer",
    },
  ]));

  assert.deepEqual(rows.map((row) => ({
    nodeMode: row.nodeMode,
    approvalOrgNodeId: row.approvalOrgNodeId,
    ancestorDepth: row.ancestorDepth,
    resolverType: row.resolverType,
    resolverUserId: row.resolverUserId,
  })), [
    {
      nodeMode: "CURRENT_TEAM",
      approvalOrgNodeId: null,
      ancestorDepth: null,
      resolverType: "TEAM_LEADER",
      resolverUserId: "leader-override",
    },
    {
      nodeMode: "CURRENT_DEPARTMENT",
      approvalOrgNodeId: null,
      ancestorDepth: null,
      resolverType: "DEPARTMENT_MANAGER",
      resolverUserId: null,
    },
    {
      nodeMode: "NONE",
      approvalOrgNodeId: null,
      ancestorDepth: null,
      resolverType: "EXPLICIT_USER",
      resolverUserId: "reviewer",
    },
  ]);
});

test("fixed and no-node modes enforce their required fields", () => {
  assert.throws(() => parseKpiApprovalPolicySteps(JSON.stringify([{
    label: "固定节点",
    nodeMode: "FIXED_NODE",
    resolverType: "TEAM_LEADER",
  }])), /缺少固定审批节点/);

  assert.throws(() => parseKpiApprovalPolicySteps(JSON.stringify([{
    label: "指定用户",
    nodeMode: "NONE",
  }])), /缺少指定审批人/);
});

test("new dual modes normalize selected organization nodes", () => {
  const rows = parseKpiApprovalPolicySteps(JSON.stringify([
    {
      label: "选定节点负责人",
      nodeMode: "ORG_NODE_OWNER",
      approvalOrgNodeIds: ["team-a", "team-b", "team-a"],
    },
    {
      label: "逐级审批至部门",
      nodeMode: "CASCADE_TO_DEPARTMENT",
    },
  ]));

  assert.deepEqual(rows.map((row) => ({
    nodeMode: row.nodeMode,
    approvalOrgNodeIds: row.approvalOrgNodeIds,
  })), [
    { nodeMode: "ORG_NODE_OWNER", approvalOrgNodeIds: ["team-a", "team-b"] },
    { nodeMode: "CASCADE_TO_DEPARTMENT", approvalOrgNodeIds: [] },
  ]);
  assert.throws(() => parseKpiApprovalPolicySteps(JSON.stringify([{
    label: "未选节点",
    nodeMode: "ORG_NODE_OWNER",
  }])), /至少需要选择一个组织节点/);
  assert.throws(() => parseKpiApprovalPolicySteps(JSON.stringify([{
    label: "逐级审批不允许指定人",
    nodeMode: "CASCADE_TO_DEPARTMENT",
    resolverUserId: "reviewer",
  }])), /逐级审批时不允许指定审批人/);
});
