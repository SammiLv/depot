import assert from "node:assert/strict"; import test from "node:test";
import { allocateSubjectScores, earnedAssessmentScore, isAssessmentPassed, resolveAssessmentPassingRequirement, summarizeAssessment } from "./assessment-engine";
import { addCalendarMonthsClamped, buildIncidentRestrictions, calculateIncidentPenalty, legacyRestrictionControlledTypes } from "./incident-engine";
import { companyCoinAwardAmounts, isControlledCompanyCoinAward } from "./reward-types";
import { decisionRestrictionTypes, hasBlockingQualification, isFeedbackEligibleForFormalResult } from "./decision-engine";
test("业务考核总分按6分摊分且尾科承担舍入差", () => { const scores = allocateSubjectScores(7); assert.equal(scores.reduce((sum, value) => sum + value, 0), 6); });
test("分数和等级两种评分均可判断及格", () => { assert.equal(isAssessmentPassed({ scoringType: "NUMERIC", rawValue: "80", passingNumericScore: 80 }), true); assert.equal(isAssessmentPassed({ scoringType: "GRADE", rawValue: "B级", requiredGradeCode: "A" }), false); });
test("首次及格满分、补考及格半分、最终不及格0分", () => { assert.deepEqual([earnedAssessmentScore(2,"INITIAL_PASS"), earnedAssessmentScore(2,"RETEST_PASS"), earnedAssessmentScore(2,"FINAL_FAIL")], [2,1,0]); const summary = summarizeAssessment([{ isPassed: true, earnedScore: 2 }, { isPassed: true, earnedScore: 1 }, { isPassed: false, earnedScore: 0 }]); assert.equal(summary.earnedScore - summary.maxScore, -3); });
test("考试结果按配置百分比代入固定公式", () => { const percentages = { INITIAL_PASS: 90, RETEST_PASS: 40, FINAL_FAIL: 10 }; assert.deepEqual([earnedAssessmentScore(2,"INITIAL_PASS", percentages), earnedAssessmentScore(2,"RETEST_PASS", percentages), earnedAssessmentScore(2,"FINAL_FAIL", percentages)], [1.8,0.8,0.2]); });
test("个人及格线优先于小组，小组优先于默认规则", () => {
  const standards = [
    { scopeType: "ORG_NODE" as const, scopeId: "team-a", scoringType: "NUMERIC" as const, passingNumericScore: 85, requiredGradeCode: null },
    { scopeType: "USER" as const, scopeId: "user-a", scoringType: "GRADE" as const, passingNumericScore: null, requiredGradeCode: "B" },
  ];
  const fallback = { scoringType: "NUMERIC" as const, passingNumericScore: 80, requiredGradeCode: null };
  assert.equal(resolveAssessmentPassingRequirement({ userId: "user-a", orgNodeId: "team-a", standards, fallback }).requiredGradeCode, "B");
  assert.equal(resolveAssessmentPassingRequirement({ userId: "user-b", orgNodeId: "team-a", standards, fallback }).passingNumericScore, 85);
  assert.equal(resolveAssessmentPassingRequirement({ userId: "user-c", orgNodeId: "team-b", standards, fallback }).passingNumericScore, 80);
});
test("事故C/D累加，任一S/A/B直接扣满110分", () => { assert.equal(calculateIncidentPenalty(["C","D","D"]).kpiPenalty, -60); assert.equal(calculateIncidentPenalty(["D","B"]).kpiPenalty, -110); });
test("人才决策限制按类型隔离并兼容旧合并限制", () => { assert.equal(decisionRestrictionTypes.PROMOTION.includes("NO_PROMOTION_RAISE"), true); assert.equal(decisionRestrictionTypes.PROMOTION.includes("NO_PROMOTION"), true); assert.equal(decisionRestrictionTypes.SALARY_ADJUSTMENT.includes("NO_SALARY_ADJUSTMENT"), true); assert.deepEqual(legacyRestrictionControlledTypes("NO_PROMOTION_RAISE"), ["PROMOTION", "SALARY_ADJUSTMENT"]); });

test("正式制度事故矩阵分别生成晋升、加薪和季度奖励限制", () => {
  const confirmedAt = new Date(2026, 0, 31, 10, 0, 0);
  const a = buildIncidentRestrictions("A", confirmedAt);
  assert.deepEqual(a.map((row) => row.controlledType), ["PROMOTION", "SALARY_ADJUSTMENT", "QUARTERLY_REWARD", "ANNUAL_REWARD"]);
  assert.equal(a.find((row) => row.controlledType === "PROMOTION")?.effectiveTo?.getFullYear(), 2027);
  assert.equal(a.find((row) => row.controlledType === "ANNUAL_REWARD")?.effectiveTo?.getMonth(), 11);
  assert.deepEqual(buildIncidentRestrictions("B", confirmedAt).map((row) => row.controlledType), ["PROMOTION", "SALARY_ADJUSTMENT", "QUARTERLY_REWARD"]);
  assert.deepEqual(buildIncidentRestrictions("C", confirmedAt).map((row) => row.controlledType), ["PROMOTION", "SALARY_ADJUSTMENT", "QUARTERLY_REWARD"]);
  assert.deepEqual(buildIncidentRestrictions("D", confirmedAt).map((row) => row.controlledType), ["QUARTERLY_REWARD"]);
  assert.deepEqual(buildIncidentRestrictions("S", confirmedAt).map((row) => row.controlledType), ["TERMINATION"]);
});

test("限制月份计算夹到目标月最后一天", () => {
  const result = addCalendarMonthsClamped(new Date(2025, 0, 31, 10, 20, 30), 1);
  assert.equal(result.getFullYear(), 2025);
  assert.equal(result.getMonth(), 1);
  assert.equal(result.getDate(), 28);
});

test("公司竞币季度和年度奖励使用固定金额标准", () => {
  assert.equal(isControlledCompanyCoinAward("COMPANY", "COIN", "QUARTERLY"), true);
  assert.equal(isControlledCompanyCoinAward("DEPARTMENT", "COIN", "QUARTERLY"), false);
  assert.deepEqual(companyCoinAwardAmounts("突出贡献奖", "QUARTERLY"), [1000]);
  assert.deepEqual(companyCoinAwardAmounts("突出贡献奖", "ANNUAL"), [2000]);
  assert.deepEqual(companyCoinAwardAmounts("最努力工作奖", "QUARTERLY"), [800, 500, 300]);
  assert.deepEqual(companyCoinAwardAmounts("最努力工作奖", "ANNUAL"), [1600, 1000, 600]);
});
test("阻断规则与公司采纳状态控制正式结果", () => { assert.equal(hasBlockingQualification([{ passed: false, blocking: true }]), true); assert.equal(isFeedbackEligibleForFormalResult("ADOPTED"), true); assert.equal(isFeedbackEligibleForFormalResult("REJECTED"), false); });
