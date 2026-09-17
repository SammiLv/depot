// KPI 列表「自评/组长评/主管评/最终绩效总分」四列展示
// 规则：阶段未完成一律「—」；阶段完成但汇总字段为 null 也显示「—」（不 fallback 到 0 或满分）

export type KpiListStageCompletion = {
  selfReview: boolean;
  leader: boolean;
  manager: boolean;
  final: boolean;
};

export type KpiListScoreDisplay = {
  self: string;
  leader: string;
  manager: string;
  final: string;
};

export const KPI_LIST_SCORE_EMPTY = "—";

/** 与详情页 formatScore 一致：整数原样，小数保留两位（去掉多余的 0） */
export function formatKpiListStageScore(value: number | null | undefined, stageCompleted: boolean): string {
  if (!stageCompleted || value === null || value === undefined) {
    return KPI_LIST_SCORE_EMPTY;
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Math.round(value * 100) / 100);
}

export function buildKpiListScoreDisplay(input: {
  selfScore: number | null;
  leaderScore: number | null;
  managerScore: number | null;
  finalScore: number | null;
  completedProgressStages: KpiListStageCompletion;
}): KpiListScoreDisplay {
  const { completedProgressStages } = input;
  return {
    self: formatKpiListStageScore(input.selfScore, completedProgressStages.selfReview),
    leader: formatKpiListStageScore(input.leaderScore, completedProgressStages.leader),
    manager: formatKpiListStageScore(input.managerScore, completedProgressStages.manager),
    final: formatKpiListStageScore(input.finalScore, completedProgressStages.final),
  };
}
