import { toBusinessDate } from "@/server/quarterly-work/value-tracking-period";

/**
 * 首版完成度计算（纯函数）。
 *
 * 口径：
 * - 统计对象：项目下 needsDevelopment = true、未软删除、且状态不为 CLOSED 的需求；
 *   CLOSED 表示取消且未投入，不纳入统计；
 * - 首版需求：完成的业务日期 <= 上线日期；上线后完成或尚未完成的需求计入迭代；
 * - 上线后迭代需求：创建的业务日期晚于上线日期，且不晚于统计截止（检查点）；
 *   检查点后 7 天填报宽限期内新增的需求不计入该检查点快照；
 * - 首版完成度 = 首版工作量 / 项目总工作量 × 100（0~100，页面展示时保留 1 位小数）；
 * - 项目未上线时全部需求计入首版（迭代为 0）；
 * - 没有开发需求、任一纳入需求缺工作量、总工作量为 0 时不可计算（返回 null）。
 */

export type FirstVersionCompletionRequirement = {
  needsDevelopment: boolean | null;
  workloadPersonDay: number | null;
  /** 完成时间；null 表示尚未完成（计入迭代） */
  completedAt: Date | null;
  status: string;
  deletedAt: Date | null;
};

export type FirstVersionCompletionResult = {
  firstVersionWorkloadPersonDay: number;
  postLaunchIterationWorkloadPersonDay: number;
  totalWorkloadPersonDay: number;
  /** 0~100 百分数；不可计算时为 null */
  firstVersionCompletionPercent: number | null;
  /** 纳入统计的开发需求是否全部填写了工作量 */
  workloadComplete: boolean;
  /** 纳入统计的开发需求数 */
  includedRequirementCount: number;
  /** 缺少工作量的纳入需求数 */
  missingWorkloadRequirementCount: number;
  /** 需求创建时间晚于统计截止、未纳入本次计算的需求数 */
  excludedAfterCutoffCount: number;
};

function isCalculable(
  includedCount: number,
  missingCount: number,
  totalWorkload: number,
): boolean {
  return includedCount > 0 && missingCount === 0 && totalWorkload > 0;
}

/**
 * @param launchedAt 项目首版上线时间；为空表示尚未上线，全部需求计入首版
 * @param requirements 项目下全部需求（函数内部过滤）
 * @param cutoffAt 统计截止时间（检查点）；晚于该时间创建的需求不纳入
 */
export function calculateFirstVersionCompletion(
  launchedAt: Date | null,
  requirements: FirstVersionCompletionRequirement[],
  cutoffAt: Date,
): FirstVersionCompletionResult {
  const empty: FirstVersionCompletionResult = {
    firstVersionWorkloadPersonDay: 0,
    postLaunchIterationWorkloadPersonDay: 0,
    totalWorkloadPersonDay: 0,
    firstVersionCompletionPercent: null,
    workloadComplete: false,
    includedRequirementCount: 0,
    missingWorkloadRequirementCount: 0,
    excludedAfterCutoffCount: 0,
  };
  // 未上线：全部计入首版
  const launchDay = launchedAt ? toBusinessDate(launchedAt) : null;
  const cutoffDay = toBusinessDate(cutoffAt);

  let firstVersionWorkload = 0;
  let postLaunchWorkload = 0;
  let includedCount = 0;
  let missingCount = 0;
  let excludedAfterCutoff = 0;

  for (const requirement of requirements) {
    if (requirement.deletedAt) continue;
    if (requirement.needsDevelopment !== true) continue;
    // CLOSED 表示取消且未投入，不纳入统计
    if (requirement.status === "CLOSED") continue;

    // 完成时间晚于统计截止的不计入本次快照；尚未完成的不适用截止排除
    const completedDay = requirement.completedAt ? toBusinessDate(requirement.completedAt) : null;
    if (completedDay && completedDay > cutoffDay) {
      excludedAfterCutoff += 1;
      continue;
    }

    includedCount += 1;
    if (requirement.workloadPersonDay === null || requirement.workloadPersonDay === undefined) {
      missingCount += 1;
      continue;
    }
    if (!launchDay || (completedDay && completedDay <= launchDay)) {
      firstVersionWorkload += requirement.workloadPersonDay;
    } else {
      postLaunchWorkload += requirement.workloadPersonDay;
    }
  }

  // 人天保留 1 位小数，避免 Float 求和长尾（完成度中间计算不提前取整）
  const round1 = (value: number) => Math.round(value * 10) / 10;
  const firstRounded = round1(firstVersionWorkload);
  const postRounded = round1(postLaunchWorkload);
  const totalWorkload = round1(firstVersionWorkload + postLaunchWorkload);
  const calculable = isCalculable(includedCount, missingCount, totalWorkload);

  return {
    firstVersionWorkloadPersonDay: firstRounded,
    postLaunchIterationWorkloadPersonDay: postRounded,
    totalWorkloadPersonDay: totalWorkload,
    firstVersionCompletionPercent: calculable ? (firstVersionWorkload / totalWorkload) * 100 : null,
    workloadComplete: includedCount > 0 && missingCount === 0,
    includedRequirementCount: includedCount,
    missingWorkloadRequirementCount: missingCount,
    excludedAfterCutoffCount: excludedAfterCutoff,
  };
}

export type FirstVersionCompletionAggregateInput = {
  firstVersionCompletionPercent: number | null;
  firstVersionWorkloadPersonDay: number;
  postLaunchIterationWorkloadPersonDay: number;
  totalWorkloadPersonDay: number;
};

export type FirstVersionCompletionAggregate = {
  /** 纳入项目数 */
  projectCount: number;
  /** 可计算项目数 */
  calculableProjectCount: number;
  /** 数据不完整项目数 */
  incompleteProjectCount: number;
  firstVersionWorkloadPersonDay: number;
  postLaunchIterationWorkloadPersonDay: number;
  totalWorkloadPersonDay: number;
  /** 部门/小组加权首版完成度 = 汇总首版工作量 / 汇总总工作量 × 100；无可计算项目时为 null */
  weightedFirstVersionCompletionPercent: number | null;
};

/** 部门/小组/负责人维度汇总：按工作量加权，不能直接平均各项目完成度 */
export function aggregateFirstVersionCompletion(
  items: FirstVersionCompletionAggregateInput[],
): FirstVersionCompletionAggregate {
  let firstVersionWorkload = 0;
  let postLaunchWorkload = 0;
  let calculableCount = 0;

  for (const item of items) {
    if (item.firstVersionCompletionPercent === null) continue;
    calculableCount += 1;
    firstVersionWorkload += item.firstVersionWorkloadPersonDay;
    postLaunchWorkload += item.postLaunchIterationWorkloadPersonDay;
  }

  const totalWorkload = firstVersionWorkload + postLaunchWorkload;

  return {
    projectCount: items.length,
    calculableProjectCount: calculableCount,
    incompleteProjectCount: items.length - calculableCount,
    firstVersionWorkloadPersonDay: firstVersionWorkload,
    postLaunchIterationWorkloadPersonDay: postLaunchWorkload,
    totalWorkloadPersonDay: totalWorkload,
    weightedFirstVersionCompletionPercent:
      calculableCount > 0 && totalWorkload > 0 ? (firstVersionWorkload / totalWorkload) * 100 : null,
  };
}
