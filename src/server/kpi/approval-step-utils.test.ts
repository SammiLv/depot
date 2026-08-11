import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupedApprovalStepDisplays,
  formatParallelApproverNames,
  getGroupedApprovalStepProgress,
} from "@/server/kpi/approval-step-utils";

test("parallel approver names are joined with 或", () => {
  assert.equal(formatParallelApproverNames(["B端组组长", "王俊秀"]), "B端组组长 或 王俊秀");
  assert.equal(formatParallelApproverNames(["B端组组长"]), "B端组组长");
  assert.equal(formatParallelApproverNames([]), "—");
});

test("same step order is merged into one progress node", () => {
  const groups = buildGroupedApprovalStepDisplays([
    { stepOrder: 1, stageKey: "LEADER", status: "PENDING", approverId: "leader-a" },
    { stepOrder: 1, stageKey: "LEADER", status: "PENDING", approverId: "leader-b" },
    { stepOrder: 2, stageKey: "MANAGER", status: "WAITING", approverId: "manager-a" },
  ], (step) => ({
    "leader-a": "B端组组长",
    "leader-b": "王俊秀",
    "manager-a": "吕夏苗",
  }[step.approverId] ?? "—"));

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.approverName, "B端组组长 或 王俊秀");
  assert.equal(groups[0]?.active, true);
  assert.equal(groups[0]?.completed, false);
  assert.equal(groups[1]?.approverName, "吕夏苗");
  assert.equal(groups[1]?.active, false);
});

test("group is completed when any parallel approver completes", () => {
  const progress = getGroupedApprovalStepProgress([
    { stepOrder: 1, status: "COMPLETED", approverId: "leader-a" },
    { stepOrder: 1, status: "SKIPPED", approverId: "leader-b" },
  ]);
  assert.equal(progress.completed, true);
  assert.equal(progress.active, false);
  assert.equal(progress.status, "COMPLETED");
});
