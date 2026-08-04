import test from "node:test";
import assert from "node:assert/strict";
import {
  getApprovalStepDisplayLabel,
  getEditableStageFromApprovalStep,
  getInitialApprovalStepStatus,
  getKpiStatusForApprovalStep,
  hasCompletedKpiProgressStage,
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

test("approval step display label uses user-facing stage names", () => {
  assert.equal(getApprovalStepDisplayLabel("LEADER"), "组长评");
  assert.equal(getApprovalStepDisplayLabel("MANAGER"), "主管评");
  assert.equal(getApprovalStepDisplayLabel("FINAL"), "终审");
  assert.equal(getApprovalStepDisplayLabel("UNKNOWN"), null);
});

test("progress stage completion counts finished stages instead of current stage", () => {
  assert.equal(hasCompletedKpiProgressStage({ status: "COMPLETED" }, "INIT"), true);
  assert.equal(hasCompletedKpiProgressStage({ status: "COMPLETED" }, "SELF_REVIEW"), true);
  assert.equal(hasCompletedKpiProgressStage({ status: "PENDING_SELF_REVIEW" }, "SELF_REVIEW"), false);
  assert.equal(hasCompletedKpiProgressStage({
    status: "COMPLETED",
    approvalSteps: [
      { stageKey: "LEADER", status: "COMPLETED" },
      { stageKey: "MANAGER", status: "COMPLETED" },
      { stageKey: "FINAL", status: "COMPLETED" },
    ],
  }, "LEADER"), true);
  assert.equal(hasCompletedKpiProgressStage({
    status: "PENDING_MANAGER_SCORE",
    approvalSteps: [
      { stageKey: "LEADER", status: "COMPLETED" },
      { stageKey: "MANAGER", status: "PENDING" },
      { stageKey: "FINAL", status: "WAITING" },
    ],
  }, "LEADER"), true);
  assert.equal(hasCompletedKpiProgressStage({
    status: "PENDING_MANAGER_SCORE",
    approvalSteps: [
      { stageKey: "LEADER", status: "COMPLETED" },
      { stageKey: "MANAGER", status: "PENDING" },
      { stageKey: "FINAL", status: "WAITING" },
    ],
  }, "MANAGER"), false);
});

test("self review status remains independent from approval steps", () => {
  assert.equal(isSelfReviewStatus("DRAFT"), true);
  assert.equal(isSelfReviewStatus("PENDING_SELF_REVIEW"), true);
  assert.equal(isSelfReviewStatus("PENDING_LEADER_SCORE"), false);
});
