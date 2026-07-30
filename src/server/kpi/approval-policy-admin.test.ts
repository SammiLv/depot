import test from "node:test";
import assert from "node:assert/strict";
import {
  getKpiApprovalPolicyActiveScopeKey,
  parseKpiApprovalPolicySteps,
} from "@/server/kpi/approval-policy-admin";

test("active policy scope key is unique per scope and absent for inactive policies", () => {
  assert.equal(getKpiApprovalPolicyActiveScopeKey("SYSTEM", "", true), "SYSTEM:");
  assert.equal(
    getKpiApprovalPolicyActiveScopeKey("DEPARTMENT", "department-1", true),
    "DEPARTMENT:department-1",
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
