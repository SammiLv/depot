export type KpiRatingBandInput = {
  name: string;
  minScore: number;
  maxScore: number | null;
  isUnbounded: boolean;
  sortOrder: number;
};

export function validateKpiRatingBands(inputs: KpiRatingBandInput[]) {
  if (inputs.length === 0) throw new Error("请至少配置一个绩效等级");
  const names = inputs.map((band) => band.name.trim());
  if (names.some((name) => !name)) throw new Error("绩效等级名称不能为空");
  if (new Set(names).size !== names.length) throw new Error("同一版本中的绩效等级名称不能重复");
  if (new Set(inputs.map((band) => band.sortOrder)).size !== inputs.length) throw new Error("绩效等级顺序不能重复");
  if (inputs.some((band) => !Number.isInteger(band.minScore) || (band.maxScore !== null && !Number.isInteger(band.maxScore)))) {
    throw new Error("绩效等级边界必须是整数");
  }

  const unbounded = inputs.filter((band) => band.isUnbounded);
  if (unbounded.length !== 1) throw new Error("只能有一个不设上限的最高等级");
  if (unbounded[0].maxScore !== null) throw new Error("不设上限的等级不能填写最高分");
  if (inputs.some((band) => !band.isUnbounded && band.maxScore === null)) throw new Error("非最高等级必须填写最高分");
  if (inputs.some((band) => band.maxScore !== null && band.minScore > band.maxScore)) throw new Error("最低分不能高于最高分");

  const ascending = [...inputs].sort((a, b) => a.minScore - b.minScore);
  if (ascending[0].minScore !== 0) throw new Error("绩效等级区间必须从 0 分开始");
  for (let index = 1; index < ascending.length; index += 1) {
    const previous = ascending[index - 1];
    const current = ascending[index];
    if (previous.isUnbounded) throw new Error("不设上限的等级必须是最高等级");
    if (current.minScore <= (previous.maxScore as number)) throw new Error("绩效等级区间不能重叠");
    if (current.minScore !== (previous.maxScore as number) + 1) throw new Error("绩效等级区间不能断档");
  }
  if (!ascending.at(-1)?.isUnbounded) throw new Error("最高等级必须不设上限");
  return ascending;
}

export function resolveKpiRating(score: number, inputs: KpiRatingBandInput[]) {
  if (!Number.isFinite(score)) throw new Error("KPI 分数无效");
  return validateKpiRatingBands(inputs).reverse().find((band) => score >= band.minScore) ?? null;
}
