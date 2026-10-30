/**
 * 指标管理（年度/季度指标）操作日志 Helper
 *
 * 封装 writeOperationLog，限制 targetType 为 ANNUAL_GOAL_* 系列，
 * 并提供各实体的字段变化备注构建函数。Server Actions 内只调本文件，
 * 不直接依赖 quarterly-work 的日志实现细节。
 *
 * 事务约定：凡业务写在 prisma.$transaction 内的，调用方传入同一 tx；
 * 单次写无事务的，调用方需用 $transaction 包裹「业务写 + 日志写」。
 */

import { prisma } from "@/server/db/prisma";
import {
  buildFieldChangeRemark,
  resolveUserNames,
  writeOperationLog,
  type FieldChange,
} from "@/server/quarterly-work/operation-log";

export const ANNUAL_GOAL_LOG_TARGET_TYPES = [
  "ANNUAL_GOAL_PLAN",
  "ANNUAL_GOAL_METRIC",
  "ANNUAL_GOAL_METRIC_SOURCE",
  "ANNUAL_GOAL_METRIC_ASSIGNMENT",
  "ANNUAL_GOAL_QUARTER",
] as const;

export type AnnualGoalLogTargetType = (typeof ANNUAL_GOAL_LOG_TARGET_TYPES)[number];

export {
  OPERATION_LOG_ACTION_CREATE,
  OPERATION_LOG_ACTION_DELETE,
  OPERATION_LOG_ACTION_UPDATE,
} from "@/server/quarterly-work/operation-log-constants";

type OperationLogClient = Pick<typeof prisma, "operationLog">;

export async function writeAnnualGoalOperationLog(
  client: OperationLogClient,
  entry: {
    targetType: AnnualGoalLogTargetType;
    targetId: string;
    targetTitle: string;
    action: string;
    operatorId: string;
    remark: string;
  },
) {
  await writeOperationLog(client, entry);
}

export const ANNUAL_GOAL_CALCULATION_TYPE_LABELS: Record<string, string> = {
  RATIO: "比例完成",
  BOOLEAN: "是否完成",
  MANUAL_SCORE: "人工评分",
};

export const ANNUAL_GOAL_RISK_STATUS_LABELS: Record<string, string> = {
  NORMAL: "正常",
  SLIGHT_DELAY: "轻微滞后",
  RISK: "风险",
  COMPLETED: "已完成",
};

export function formatCalculationType(value: string | null | undefined) {
  return (value && ANNUAL_GOAL_CALCULATION_TYPE_LABELS[value]) || value || null;
}

export function formatRiskStatus(value: string | null | undefined) {
  return (value && ANNUAL_GOAL_RISK_STATUS_LABELS[value]) || value || null;
}

/**
 * 解析负责人用户 ID 对应姓名（用于备注展示，避免写原始 ID）。
 */
export async function resolveResponsibleUserNameMap(userIds: Array<string | null | undefined>) {
  return resolveUserNames(userIds);
}

export type MetricChangeSnapshot = {
  name: string;
  description: string | null;
  targetValue: number;
  currentValue: number;
  unit: string;
  weight: number;
  calculationType: string;
  riskStatus: string;
  responsibleUserName: string | null;
};

/**
 * 构建部门指标/元指标的编辑备注字段变化列表。
 * responsibleUserName 需先用 resolveResponsibleUserNameMap 解析。
 */
export function buildMetricFieldChanges(
  previous: MetricChangeSnapshot,
  next: MetricChangeSnapshot,
): FieldChange[] {
  return [
    { label: "名称", previous: previous.name, next: next.name },
    { label: "说明", previous: previous.description, next: next.description },
    { label: "目标值", previous: previous.targetValue, next: next.targetValue },
    { label: "当前值", previous: previous.currentValue, next: next.currentValue },
    { label: "单位", previous: previous.unit, next: next.unit },
    { label: "权重", previous: `${previous.weight}%`, next: `${next.weight}%` },
    { label: "计算方式", previous: formatCalculationType(previous.calculationType), next: formatCalculationType(next.calculationType) },
    { label: "风险状态", previous: formatRiskStatus(previous.riskStatus), next: formatRiskStatus(next.riskStatus) },
    { label: "负责人", previous: previous.responsibleUserName, next: next.responsibleUserName },
  ];
}

/**
 * 由字段变化列表生成备注；无实际变化时返回空字符串（调用方应跳过写日志）。
 */
export function buildAnnualGoalChangeRemark(changes: FieldChange[]) {
  return buildFieldChangeRemark(changes);
}

/**
 * 季度进度批量更新的汇总备注，例如：
 * 更新 2026 Q4 季度进度：指标 A 当前值从『10』改为『20』；指标 B …
 */
export function buildQuarterProgressSummaryRemark(options: {
  year: number;
  quarter: number;
  unit?: string | null;
  entries: Array<{ name: string; previous: number; next: number }>;
}) {
  const suffix = options.unit ? `（${options.unit}）` : "";
  const details = options.entries
    .filter((entry) => entry.previous !== entry.next)
    .map((entry) => `${entry.name} 当前值从『${entry.previous}』改为『${entry.next}』`)
    .join("；");
  if (!details) return "";
  return `更新 ${options.year} Q${options.quarter} 季度进度${suffix}：${details}`;
}

/**
 * 周进度批量更新的汇总备注，例如：
 * 更新 2026 Q4 周进度：指标 A 本周 +10；指标 B 本周 +5
 */
export function buildWeeklyProgressSummaryRemark(options: {
  year: number;
  quarter: number;
  unit?: string | null;
  entries: Array<{ name: string; weeklyIncrement: number }>;
}) {
  const suffix = options.unit ? `（${options.unit}）` : "";
  const details = options.entries
    .filter((entry) => entry.weeklyIncrement !== 0)
    .map((entry) => `${entry.name} 本周 +${entry.weeklyIncrement}`)
    .join("；");
  if (!details) return "";
  return `更新 ${options.year} Q${options.quarter} 周进度${suffix}：${details}`;
}
