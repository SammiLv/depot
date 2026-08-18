export type ReviewDimensionInput = { id: string; code?: string; name?: string; category: string; weight: number; maxScore: number; isRequired: boolean };
export type ReviewRatingInput = { dimensionId: string; ratingCode: string; numericScore: number };
export type GradeThresholdInput = { gradeCode: string; minScore: number; maxScore: number };
export type NineBoxRuleInput = { code: string; potentialMin: number; potentialMax: number; performanceMin: number; performanceMax: number };

export type TalentNineBoxAxis = "POTENTIAL" | "PERFORMANCE";

const potentialDimensionCodes = new Set(["LOYALTY", "FIT", "GROWTH"]);
const performanceDimensionCodes = new Set(["ATTITUDE", "CAPABILITY", "OUTPUT"]);
const potentialDimensionNames = new Set(["忠诚度", "匹配度", "成长性", "成长度"]);
const performanceDimensionNames = new Set(["工作态度", "能力度", "产出度"]);

export function resolveTalentNineBoxAxis(dimension: Pick<ReviewDimensionInput, "code" | "name" | "category">): TalentNineBoxAxis | null {
  const code = dimension.code?.trim().toUpperCase();
  const name = dimension.name?.trim();
  if ((code && potentialDimensionCodes.has(code)) || (name && potentialDimensionNames.has(name))) return "POTENTIAL";
  if ((code && performanceDimensionCodes.has(code)) || (name && performanceDimensionNames.has(name))) return "PERFORMANCE";
  return dimension.category === "POTENTIAL" || dimension.category === "PERFORMANCE" ? dimension.category : null;
}

export function validateGradeThresholds(rows: GradeThresholdInput[], modelMaxScore = 30) {
  if (rows.length === 0) throw new Error("至少配置一个等级区间");
  const sorted = [...rows].sort((a, b) => a.minScore - b.minScore);
  if (sorted[0].minScore !== 0 || sorted.at(-1)?.maxScore !== modelMaxScore) throw new Error(`等级区间必须覆盖 0 至 ${modelMaxScore} 分`);
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    if (row.minScore > row.maxScore) throw new Error(`${row.gradeCode} 等级区间无效`);
    const next = sorted[index + 1];
    if (next && next.minScore !== row.maxScore + 1) throw new Error("等级区间不能重叠或留空");
  }
}

export function calculateTalentReview(
  dimensions: ReviewDimensionInput[],
  ratings: ReviewRatingInput[],
  thresholds: GradeThresholdInput[],
  nineBoxRules: NineBoxRuleInput[],
  ratingMaxScore = 5,
) {
  const ratingByDimensionId = new Map(ratings.map((rating) => [rating.dimensionId, rating]));
  const missingRequired = dimensions.filter((dimension) => dimension.isRequired && !ratingByDimensionId.has(dimension.id));
  if (missingRequired.length > 0) throw new Error("必填维度尚未完成，不能计算人才盘点结果");

  const scoreByAxis = new Map<TalentNineBoxAxis, number>();
  let totalScore = 0;
  for (const dimension of dimensions) {
    const rating = ratingByDimensionId.get(dimension.id);
    if (!rating) continue;
    const score = ratingMaxScore > 0 ? (rating.numericScore / ratingMaxScore) * dimension.maxScore * dimension.weight : 0;
    totalScore += score;
    const axis = resolveTalentNineBoxAxis(dimension);
    if (axis) scoreByAxis.set(axis, (scoreByAxis.get(axis) ?? 0) + score);
  }
  totalScore = Number(totalScore.toFixed(4));
  const threshold = thresholds.find((row) => totalScore >= row.minScore && totalScore <= row.maxScore);
  if (!threshold) throw new Error("总分未命中任何等级区间");

  const potentialScore = Number((scoreByAxis.get("POTENTIAL") ?? 0).toFixed(4));
  const performanceScore = Number((scoreByAxis.get("PERFORMANCE") ?? 0).toFixed(4));
  const nineBox = nineBoxRules.find((rule) => potentialScore >= rule.potentialMin && potentialScore <= rule.potentialMax && performanceScore >= rule.performanceMin && performanceScore <= rule.performanceMax);
  return { totalScore, gradeCode: threshold.gradeCode, potentialScore, performanceScore, nineBoxCode: nineBox?.code ?? null };
}
