import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateFirstVersionCompletion,
  calculateFirstVersionCompletion,
  type FirstVersionCompletionRequirement,
} from "@/server/quarterly-work/first-version-completion";
import { getValueTrackingTaskDates } from "@/server/quarterly-work/value-tracking-period";

function req(
  completedAt: Date | null,
  workloadPersonDay: number | null,
  overrides: Partial<FirstVersionCompletionRequirement> = {},
): FirstVersionCompletionRequirement {
  return {
    needsDevelopment: true,
    workloadPersonDay,
    completedAt,
    status: "IN_PROGRESS",
    deletedAt: null,
    ...overrides,
  };
}

test("上线当天完成的需求归入首版，上线次日完成的归入迭代", () => {
  const launchedAt = new Date(2026, 5, 30);
  const cutoff = getValueTrackingTaskDates(launchedAt, 2).checkpointAt;
  const result = calculateFirstVersionCompletion(launchedAt, [
    req(new Date(2026, 5, 30, 23, 59), 10), // 上线当天晚上完成仍算首版
    req(new Date(2026, 6, 1, 0, 1), 5), // 上线次日完成算迭代
    req(null, 3), // 尚未完成算迭代
  ], cutoff);

  assert.equal(result.firstVersionWorkloadPersonDay, 10);
  assert.equal(result.postLaunchIterationWorkloadPersonDay, 8);
  assert.equal(result.totalWorkloadPersonDay, 18);
  assert.ok(result.firstVersionCompletionPercent !== null);
  assert.ok(Math.abs(result.firstVersionCompletionPercent! - (10 / 18) * 100) < 1e-9);
});

test("非开发需求与软删除需求不纳入统计", () => {
  const launchedAt = new Date(2026, 5, 30);
  const cutoff = getValueTrackingTaskDates(launchedAt, 2).checkpointAt;
  const result = calculateFirstVersionCompletion(launchedAt, [
    req(new Date(2026, 5, 1), 80),
    req(new Date(2026, 5, 1), 999, { needsDevelopment: false }),
    req(new Date(2026, 5, 1), 999, { needsDevelopment: null }),
    req(new Date(2026, 5, 1), 999, { deletedAt: new Date(2026, 6, 1) }),
    req(new Date(2026, 7, 1), 20),
  ], cutoff);

  assert.equal(result.includedRequirementCount, 2);
  assert.equal(result.totalWorkloadPersonDay, 100);
  assert.ok(Math.abs(result.firstVersionCompletionPercent! - 80) < 1e-9);
});

test("CLOSED 需求表示取消未投入，不纳入统计", () => {
  const launchedAt = new Date(2026, 5, 30);
  const cutoff = getValueTrackingTaskDates(launchedAt, 2).checkpointAt;
  const result = calculateFirstVersionCompletion(launchedAt, [
    req(new Date(2026, 5, 1), 80),
    req(new Date(2026, 5, 1), 999, { status: "CLOSED" }),
    req(new Date(2026, 6, 1), 20, { status: "COMPLETED" }),
  ], cutoff);

  assert.equal(result.includedRequirementCount, 2);
  assert.equal(result.firstVersionWorkloadPersonDay, 80);
  assert.equal(result.totalWorkloadPersonDay, 100);
});

test("80 + 20 得出 80%", () => {
  const launchedAt = new Date(2026, 7, 15);
  const cutoff = getValueTrackingTaskDates(launchedAt, 2).checkpointAt;
  const result = calculateFirstVersionCompletion(launchedAt, [
    req(new Date(2026, 6, 1), 40),
    req(new Date(2026, 7, 15), 40),
    req(new Date(2026, 8, 1), 20),
  ], cutoff);

  assert.equal(result.firstVersionWorkloadPersonDay, 80);
  assert.equal(result.postLaunchIterationWorkloadPersonDay, 20);
  assert.equal(result.totalWorkloadPersonDay, 100);
  assert.ok(Math.abs(result.firstVersionCompletionPercent! - 80) < 1e-9);
  assert.equal(result.workloadComplete, true);
});

test("验收场景A：第 1 检查点 88.9%，第 2 检查点 80%", () => {
  const launchedAt = new Date(2026, 5, 30);
  const checkpoint1 = getValueTrackingTaskDates(launchedAt, 1).checkpointAt;
  const checkpoint2 = getValueTrackingTaskDates(launchedAt, 2).checkpointAt;

  const atCheckpoint1 = calculateFirstVersionCompletion(launchedAt, [
    req(new Date(2026, 5, 1), 80),
    req(new Date(2026, 8, 1), 10),
  ], checkpoint1);
  assert.ok(Math.abs(atCheckpoint1.firstVersionCompletionPercent! - (80 / 90) * 100) < 1e-9);

  const atCheckpoint2 = calculateFirstVersionCompletion(launchedAt, [
    req(new Date(2026, 5, 1), 80),
    req(new Date(2026, 8, 1), 10),
    req(new Date(2026, 11, 1), 10),
  ], checkpoint2);
  assert.ok(Math.abs(atCheckpoint2.firstVersionCompletionPercent! - 80) < 1e-9);
});

test("完成时间晚于统计截止的需求不计入对应检查点快照", () => {
  const launchedAt = new Date(2026, 5, 30);
  const checkpoint2 = getValueTrackingTaskDates(launchedAt, 2).checkpointAt; // 2026-12-30
  const result = calculateFirstVersionCompletion(launchedAt, [
    req(new Date(2026, 5, 1), 80),
    req(new Date(2026, 8, 1), 20),
    req(new Date(2027, 0, 3), 50), // 截止后才完成，不计入
  ], checkpoint2);

  assert.equal(result.totalWorkloadPersonDay, 100);
  assert.equal(result.excludedAfterCutoffCount, 1);
  assert.ok(Math.abs(result.firstVersionCompletionPercent! - 80) < 1e-9);
});

test("缺工作量返回不可计算，不按 0 处理", () => {
  const launchedAt = new Date(2026, 5, 30);
  const cutoff = getValueTrackingTaskDates(launchedAt, 2).checkpointAt;
  const result = calculateFirstVersionCompletion(launchedAt, [
    req(new Date(2026, 5, 1), 80),
    req(new Date(2026, 6, 1), null),
  ], cutoff);

  assert.equal(result.firstVersionCompletionPercent, null);
  assert.equal(result.workloadComplete, false);
  assert.equal(result.includedRequirementCount, 2);
  assert.equal(result.missingWorkloadRequirementCount, 1);
});

test("没有开发需求或总工作量为 0 返回不可计算", () => {
  const launchedAt = new Date(2026, 5, 30);
  const cutoff = getValueTrackingTaskDates(launchedAt, 2).checkpointAt;

  const noRequirements = calculateFirstVersionCompletion(launchedAt, [], cutoff);
  assert.equal(noRequirements.firstVersionCompletionPercent, null);
  assert.equal(noRequirements.includedRequirementCount, 0);

  const zeroWorkload = calculateFirstVersionCompletion(launchedAt, [req(new Date(2026, 5, 1), 0)], cutoff);
  assert.equal(zeroWorkload.firstVersionCompletionPercent, null);
});

test("未上线项目全部需求计入首版", () => {
  const result = calculateFirstVersionCompletion(null, [req(new Date(2026, 5, 1), 80)], new Date(2026, 11, 30));
  assert.equal(result.firstVersionCompletionPercent, 100);
  assert.equal(result.firstVersionWorkloadPersonDay, 80);
  assert.equal(result.postLaunchIterationWorkloadPersonDay, 0);
});

test("部门汇总使用工作量加权而非项目平均", () => {
  const aggregate = aggregateFirstVersionCompletion([
    { firstVersionCompletionPercent: 50, firstVersionWorkloadPersonDay: 50, postLaunchIterationWorkloadPersonDay: 50, totalWorkloadPersonDay: 100 },
    { firstVersionCompletionPercent: 100, firstVersionWorkloadPersonDay: 2, postLaunchIterationWorkloadPersonDay: 0, totalWorkloadPersonDay: 2 },
  ]);

  // 项目平均 = 75%，工作量加权 = 52/102 ≈ 50.98%
  assert.ok(Math.abs(aggregate.weightedFirstVersionCompletionPercent! - (52 / 102) * 100) < 1e-9);
  assert.equal(aggregate.projectCount, 2);
  assert.equal(aggregate.calculableProjectCount, 2);
  assert.equal(aggregate.incompleteProjectCount, 0);
});

test("汇总只统计可计算项目，并报告不完整项目数", () => {
  const aggregate = aggregateFirstVersionCompletion([
    { firstVersionCompletionPercent: 80, firstVersionWorkloadPersonDay: 80, postLaunchIterationWorkloadPersonDay: 20, totalWorkloadPersonDay: 100 },
    { firstVersionCompletionPercent: null, firstVersionWorkloadPersonDay: 0, postLaunchIterationWorkloadPersonDay: 0, totalWorkloadPersonDay: 0 },
  ]);

  assert.equal(aggregate.calculableProjectCount, 1);
  assert.equal(aggregate.incompleteProjectCount, 1);
  assert.ok(Math.abs(aggregate.weightedFirstVersionCompletionPercent! - 80) < 1e-9);
});

test("汇总无可计算项目时返回 null", () => {
  const aggregate = aggregateFirstVersionCompletion([]);
  assert.equal(aggregate.weightedFirstVersionCompletionPercent, null);
  assert.equal(aggregate.projectCount, 0);
});
