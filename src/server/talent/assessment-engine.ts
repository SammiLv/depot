export const BUSINESS_ASSESSMENT_TOTAL_SCORE = 6;
export const DEFAULT_BUSINESS_ASSESSMENT_PERCENTAGES = {
  INITIAL_PASS: 100,
  RETEST_PASS: 50,
  FINAL_FAIL: 0,
} as const;
const gradeOrder = ["S", "A", "B", "C", "D"];
export type AssessmentPassingStandard = {
  scopeType: "ORG_NODE" | "USER";
  scopeId: string;
  scoringType: "NUMERIC" | "GRADE";
  passingNumericScore: number | null;
  requiredGradeCode: string | null;
};
export type AssessmentPassingRequirement = {
  scoringType: "NUMERIC" | "GRADE";
  passingNumericScore: number | null;
  requiredGradeCode: string | null;
};

export function resolveAssessmentPassingRequirement(input: {
  userId: string;
  orgNodeId: string | null;
  standards: AssessmentPassingStandard[];
  fallback: AssessmentPassingRequirement;
}) {
  return input.standards.find((row) => row.scopeType === "USER" && row.scopeId === input.userId)
    ?? input.standards.find((row) => row.scopeType === "ORG_NODE" && row.scopeId === input.orgNodeId)
    ?? input.fallback;
}
export function allocateSubjectScores(subjectCount: number, total = BUSINESS_ASSESSMENT_TOTAL_SCORE) { if (!Number.isInteger(subjectCount) || subjectCount < 1) throw new Error("考试科目数必须大于 0"); const base = Math.floor((total / subjectCount) * 10000) / 10000; const scores = Array.from({ length: subjectCount }, () => base); scores[scores.length - 1] = Number((total - base * (subjectCount - 1)).toFixed(4)); return scores; }
export function isAssessmentPassed(input: { scoringType: "NUMERIC" | "GRADE"; rawValue: string; passingNumericScore?: number | null; requiredGradeCode?: string | null }) { if (input.scoringType === "NUMERIC") { const score = Number(input.rawValue); if (!Number.isFinite(score) || input.passingNumericScore == null) throw new Error("分数结果或及格线无效"); return score >= input.passingNumericScore; } const actual = input.rawValue.trim().toUpperCase().replace("级", ""); const required = input.requiredGradeCode?.toUpperCase(); const actualIndex = gradeOrder.indexOf(actual); const requiredIndex = required ? gradeOrder.indexOf(required) : -1; if (actualIndex < 0 || requiredIndex < 0) throw new Error("等级结果或要求等级无效"); return actualIndex <= requiredIndex; }
export function earnedAssessmentScore(
  subjectMax: number,
  attemptResult: "INITIAL_PASS" | "RETEST_PASS" | "FINAL_FAIL",
  percentages: Record<"INITIAL_PASS" | "RETEST_PASS" | "FINAL_FAIL", number> = DEFAULT_BUSINESS_ASSESSMENT_PERCENTAGES,
) {
  return Number((subjectMax * percentages[attemptResult] / 100).toFixed(4));
}
export function summarizeAssessment(results: Array<{ isPassed: boolean; earnedScore: number }>, total = BUSINESS_ASSESSMENT_TOTAL_SCORE) { const earnedScore = Number(results.reduce((sum, row) => sum + row.earnedScore, 0).toFixed(4)); return { subjectCount: results.length, passedSubjectCount: results.filter((row) => row.isPassed).length, earnedScore, maxScore: total, isOverallPassed: results.length > 0 && results.every((row) => row.isPassed) }; }
