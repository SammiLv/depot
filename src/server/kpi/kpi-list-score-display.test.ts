import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKpiListScoreDisplay,
  formatKpiListStageScore,
} from "@/server/kpi/kpi-list-score-display";

test("stage not completed shows — regardless of stored value", () => {
  assert.equal(formatKpiListStageScore(110, false), "—");
  assert.equal(formatKpiListStageScore(0, false), "—");
  assert.equal(formatKpiListStageScore(null, false), "—");
  assert.equal(formatKpiListStageScore(undefined, false), "—");
});

test("completed stage with null value shows — (no fallback to 0 or 110)", () => {
  assert.equal(formatKpiListStageScore(null, true), "—");
  assert.equal(formatKpiListStageScore(undefined, true), "—");
});

test("completed stage with value formats like detail page", () => {
  assert.equal(formatKpiListStageScore(110, true), "110");
  assert.equal(formatKpiListStageScore(0, true), "0");
  assert.equal(formatKpiListStageScore(95.5, true), "95.5");
  assert.equal(formatKpiListStageScore(96.666, true), "96.67");
});

test("only self review completed: self has value, other three show —", () => {
  const display = buildKpiListScoreDisplay({
    selfScore: 98,
    leaderScore: 110, // 历史脏数据：未完成阶段被预写 110，也不得展示
    managerScore: 110,
    finalScore: 110,
    completedProgressStages: { selfReview: true, leader: false, manager: false, final: false },
  });
  assert.deepEqual(display, { self: "98", leader: "—", manager: "—", final: "—" });
});

test("all stages completed: four columns all show values", () => {
  const display = buildKpiListScoreDisplay({
    selfScore: 100,
    leaderScore: 98,
    managerScore: 96,
    finalScore: 101.5,
    completedProgressStages: { selfReview: true, leader: true, manager: true, final: true },
  });
  assert.deepEqual(display, { self: "100", leader: "98", manager: "96", final: "101.5" });
});

test("manager done but final review pending: final shows —", () => {
  const display = buildKpiListScoreDisplay({
    selfScore: 100,
    leaderScore: 98,
    managerScore: 96,
    finalScore: null,
    completedProgressStages: { selfReview: true, leader: true, manager: true, final: false },
  });
  assert.deepEqual(display, { self: "100", leader: "98", manager: "96", final: "—" });
});
