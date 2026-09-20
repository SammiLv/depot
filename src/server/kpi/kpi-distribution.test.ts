import test from "node:test";
import assert from "node:assert/strict";
import { evaluateKpiDistribution, resolveEffectiveKpiScore } from "@/server/kpi/kpi-distribution";

const rule = {
  enabled: true,
  minHeadcount: 5,
  minGap: 10,
  belowScore: 100,
  belowMinPercent: 10,
};

test("规则未启用 → inactive", () => {
  const result = evaluateKpiDistribution({ ...rule, enabled: false }, { initialized: true, headcount: 10, scores: [90, 110] });
  assert.equal(result.status, "inactive");
});

test("季度 KPI 未初始化 → not_initialized", () => {
  const result = evaluateKpiDistribution(rule, { initialized: false, headcount: 10, scores: [] });
  assert.equal(result.status, "not_initialized");
});

test("人数不足门槛 → below_headcount", () => {
  const result = evaluateKpiDistribution(rule, { initialized: true, headcount: 4, scores: [90, 110] });
  assert.equal(result.status, "below_headcount");
});

test("尚无有效评分 → no_scores，不误判为分布未达标", () => {
  const result = evaluateKpiDistribution(rule, { initialized: true, headcount: 10, scores: [] });
  assert.equal(result.status, "no_scores");
  assert.equal(result.effectiveCount, 0);
});

test("分母含未完成考核的人：5 人部门仅 1 人终审且 <100 → 占比 20% 达标", () => {
  const result = evaluateKpiDistribution(rule, { initialized: true, headcount: 5, scores: [90] });
  assert.equal(result.belowCount, 1);
  assert.equal(result.belowPercent, 20);
  assert.equal(result.belowPass, true);
  // 仅 1 人终审，分差暂不判定
  assert.equal(result.gap, null);
  assert.equal(result.gapPass, null);
  assert.equal(result.status, "pass");
});

test("分差不足 → fail；分差达标 → pass", () => {
  const fail = evaluateKpiDistribution(rule, { initialized: true, headcount: 5, scores: [95, 100, 100] });
  assert.equal(fail.gap, 5);
  assert.equal(fail.gapPass, false);
  assert.equal(fail.status, "fail");

  const pass = evaluateKpiDistribution(rule, { initialized: true, headcount: 5, scores: [90, 100, 100] });
  assert.equal(pass.gap, 10);
  assert.equal(pass.gapPass, true);
  assert.equal(pass.belowPercent, 20);
  assert.equal(pass.status, "pass");
});

test("低分占比不足 → fail（含边界：恰好等于阈值视为达标）", () => {
  const fail = evaluateKpiDistribution(rule, { initialized: true, headcount: 20, scores: [100, 105, 110] });
  assert.equal(fail.belowPercent, 0);
  assert.equal(fail.status, "fail");

  const edge = evaluateKpiDistribution(rule, { initialized: true, headcount: 10, scores: [90, 120] });
  assert.equal(edge.belowPercent, 10);
  assert.equal(edge.belowPass, true);
  assert.equal(edge.status, "pass");
});

// ---- resolveEffectiveKpiScore：当前有效统计分 ----

test("终审完成：取 finalScore（含历史无审批链数据）", () => {
  assert.equal(resolveEffectiveKpiScore({ status: "COMPLETED", finalScore: 96.4, managerScore: 98 }), 96.4);
  // 历史已完成 KPI 可能残留 PENDING/WAITING 步骤，COMPLETED 是最终事实
  assert.equal(
    resolveEffectiveKpiScore({
      status: "COMPLETED",
      finalScore: 100,
      managerScore: null,
      approvalSteps: [{ stageKey: "MANAGER", status: "WAITING" }],
    }),
    100,
  );
});

test("主管评完成未终审：取 managerScore", () => {
  assert.equal(
    resolveEffectiveKpiScore({
      status: "PENDING_FINAL_REVIEW",
      finalScore: 110,
      managerScore: 92,
      approvalSteps: [
        { stageKey: "LEADER", status: "COMPLETED" },
        { stageKey: "MANAGER", status: "COMPLETED" },
        { stageKey: "FINAL", status: "PENDING" },
      ],
    }),
    92,
  );
});

test("主管步骤未完成时，即使汇总字段已有值也不纳入（以审批流程事实为准）", () => {
  assert.equal(
    resolveEffectiveKpiScore({
      status: "PENDING_LEADER_SCORE",
      finalScore: 95,
      managerScore: 95,
      approvalSteps: [
        { stageKey: "LEADER", status: "PENDING" },
        { stageKey: "MANAGER", status: "WAITING" },
      ],
    }),
    null,
  );
});

test("自评阶段/进行中：不纳入统计", () => {
  assert.equal(resolveEffectiveKpiScore({ status: "PENDING_SELF_REVIEW", finalScore: null, managerScore: null }), null);
  assert.equal(
    resolveEffectiveKpiScore({
      status: "PENDING_MANAGER_SCORE",
      finalScore: null,
      managerScore: null,
      approvalSteps: [
        { stageKey: "LEADER", status: "COMPLETED" },
        { stageKey: "MANAGER", status: "PENDING" },
      ],
    }),
    null,
  );
});

test("legacy 无审批链：主管评完成（状态越过主管评）取 managerScore", () => {
  assert.equal(resolveEffectiveKpiScore({ status: "PENDING_FINAL_REVIEW", finalScore: null, managerScore: 88 }), 88);
  assert.equal(resolveEffectiveKpiScore({ status: "PENDING_MANAGER_SCORE", finalScore: null, managerScore: 88 }), null);
});
