// 部门绩效分布规则判定（KPI 管理页预警条）
// 规则随人才发展「KPI 绩效等级规则」版本冻结；统计从季度 KPI 初始化后开始。
// 分母口径：部门应考核全员（可按规则排除 DEPARTMENT_MANAGER 主管），含未完成考核的人。

export type KpiDistributionRuleConfig = {
  enabled: boolean;
  minHeadcount: number;
  minGap: number;
  belowScore: number;
  belowMinPercent: number;
};

export type KpiDistributionInput = {
  /** 当前季度该部门是否已有 KPI 单据（初始化后才统计） */
  initialized: boolean;
  /** 应考核全员人数（已按规则排除主管） */
  headcount: number;
  /** 终审完成员工的最终绩效总分列表 */
  completedScores: number[];
};

export type KpiDistributionEvaluation = {
  status: "inactive" | "not_initialized" | "below_headcount" | "no_completed_scores" | "pass" | "fail";
  /** 应考核全员人数（已按规则排除主管） */
  headcount: number;
  /** 已终审人数 */
  completedCount: number;
  /** 最高分与最低分之差；不足 2 人终审完成时为 null（暂不判定） */
  gap: number | null;
  gapPass: boolean | null;
  /** 低于低分线的人数（仅统计已终审） */
  belowCount: number;
  /** 低分占比（%）：belowCount / headcount */
  belowPercent: number;
  belowPass: boolean;
};

export function evaluateKpiDistribution(
  rule: KpiDistributionRuleConfig,
  input: KpiDistributionInput,
): KpiDistributionEvaluation {
  const base = {
    headcount: input.headcount,
    completedCount: input.completedScores.length,
    gap: null,
    gapPass: null,
    belowCount: 0,
    belowPercent: 0,
    belowPass: false,
  } satisfies Partial<KpiDistributionEvaluation>;

  if (!rule.enabled) {
    return { ...base, status: "inactive" };
  }
  if (!input.initialized) {
    return { ...base, status: "not_initialized" };
  }
  if (input.headcount < rule.minHeadcount) {
    return { ...base, status: "below_headcount" };
  }

  const scores = input.completedScores.filter((score) => Number.isFinite(score));
  if (scores.length === 0) {
    return { ...base, status: "no_completed_scores" };
  }

  const gap = scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : null;
  const gapPass = gap === null ? null : gap >= rule.minGap;
  const belowCount = scores.filter((score) => score < rule.belowScore).length;
  const belowPercent = input.headcount > 0 ? (belowCount / input.headcount) * 100 : 0;
  const belowPass = belowPercent >= rule.belowMinPercent;

  // 分差在不足 2 人终审时暂不判定；其余任一不达标即未达标
  const status = belowPass && gapPass !== false ? "pass" : "fail";
  return { status, headcount: input.headcount, completedCount: scores.length, gap, gapPass, belowCount, belowPercent, belowPass };
}
