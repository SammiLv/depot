import test from "node:test";
import assert from "node:assert/strict";
import {
  getEditableStageFromApprovalStep,
  getInitialApprovalStepStatus,
  getKpiStatusForApprovalStep,
  isSelfReviewStatus,
} from "@/server/kpi/approval-workflow";

test("approval step stage drives the compatible KPI status", () => {
  assert.equal(getKpiStatusForApprovalStep("LEADER"), "PENDING_LEADER_SCORE");
  assert.equal(getKpiStatusForApprovalStep("MANAGER"), "PENDING_MANAGER_SCORE");
  assert.equal(getKpiStatusForApprovalStep("FINAL"), "PENDING_FINAL_REVIEW");
  assert.throws(() => getKpiStatusForApprovalStep("UNKNOWN"), /不支持的 KPI 审批步骤类型/);
});

test("only the first snapshot step starts pending", () => {
  assert.equal(getInitialApprovalStepStatus(0), "PENDING");
  assert.equal(getInitialApprovalStepStatus(1), "WAITING");
  assert.equal(getInitialApprovalStepStatus(5), "WAITING");
});

test("editable approval stage comes from the current snapshot step", () => {
  assert.equal(getEditableStageFromApprovalStep("LEADER"), "LEADER");
  assert.equal(getEditableStageFromApprovalStep("FINAL"), "FINAL");
  assert.equal(getEditableStageFromApprovalStep("UNKNOWN"), null);
});

test("self review status remains independent from approval steps", () => {
  assert.equal(isSelfReviewStatus("DRAFT"), true);
  assert.equal(isSelfReviewStatus("PENDING_SELF_REVIEW"), true);
  assert.equal(isSelfReviewStatus("PENDING_LEADER_SCORE"), false);
});
