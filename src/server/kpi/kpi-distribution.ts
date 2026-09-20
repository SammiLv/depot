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
  /** 当前有效统计分列表：终审完成取 finalScore，主管评完成未终审取 managerScore（见 resolveEffectiveKpiScore） */
  scores: number[];
};

export type KpiDistributionEvaluation = {
  status: "inactive" | "not_initialized" | "below_headcount" | "no_scores" | "pass" | "fail";
  /** 应考核全员人数（已按规则排除主管） */
  headcount: number;
  /** 已纳入统计的有效评分数（主管评完成及以上） */
  effectiveCount: number;
  /** 最高分与最低分之差；有效评分不足 2 人时为 null（暂不判定） */
  gap: number | null;
  gapPass: boolean | null;
  /** 低于低分线的人数（仅统计有效评分） */
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
    effectiveCount: input.scores.length,
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

  const scores = input.scores.filter((score) => Number.isFinite(score));
  if (scores.length === 0) {
    return { ...base, status: "no_scores" };
  }

  const gap = scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : null;
  const gapPass = gap === null ? null : gap >= rule.minGap;
  const belowCount = scores.filter((score) => score < rule.belowScore).length;
  const belowPercent = input.headcount > 0 ? (belowCount / input.headcount) * 100 : 0;
  const belowPass = belowPercent >= rule.belowMinPercent;

  // 分差在有效评分不足 2 人时暂不判定；其余任一不达标即未达标
  const status = belowPass && gapPass !== false ? "pass" : "fail";
  return { status, headcount: input.headcount, effectiveCount: scores.length, gap, gapPass, belowCount, belowPercent, belowPass };
}

// ---- 当前有效统计分（实时预警用） ----

import { hasCompletedKpiProgressStage } from "@/server/kpi/approval-workflow";
import type { KpiStatus } from "@prisma/client";

/**
 * 每位员工的当前有效统计分（优先级从高到低）：
 * 1. 终审完成（status=COMPLETED）：取 finalScore（含历史无审批链数据）。
 * 2. 主管评完成但未终审：取 managerScore —— 依据审批流程事实判定（MANAGER 步骤已完成），
 *    不凭汇总字段非空推断过程阶段。
 * 3. 其他：不纳入统计（返回 null）。
 */
export function resolveEffectiveKpiScore(input: {
  status: KpiStatus;
  finalScore: number | null;
  managerScore: number | null;
  approvalSteps?: Array<{ stageKey: string; status: string }>;
}): number | null {
  if (input.status === "COMPLETED") {
    return input.finalScore;
  }
  const managerStageCompleted = hasCompletedKpiProgressStage(
    { status: input.status, approvalSteps: input.approvalSteps },
    "MANAGER",
  );
  if (managerStageCompleted) {
    return input.managerScore;
  }
  return null;
}
