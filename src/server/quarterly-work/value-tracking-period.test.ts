import test from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarDays,
  addCalendarMonthsClamped,
  doesCalendarQuarterOverlapTrackingWindow,
  doesYearOverlapTrackingWindow,
  getValueTrackingDeadline,
  getValueTrackingSequence,
  getValueTrackingTaskDates,
  getValueTrackingWindow,
  getValueTrackTaskState,
  isValueTrackingOverdue,
  toBusinessDate,
} from "@/server/quarterly-work/value-tracking-period";

test("addCalendarMonthsClamped 月末日期钳制到目标月末", () => {
  assert.deepEqual(addCalendarMonthsClamped(new Date(2026, 0, 31), 3), new Date(2026, 3, 30));
  assert.deepEqual(addCalendarMonthsClamped(new Date(2026, 0, 31), 1), new Date(2026, 1, 28));
  assert.deepEqual(addCalendarMonthsClamped(new Date(2026, 0, 31), 6), new Date(2026, 6, 31));
  assert.deepEqual(addCalendarMonthsClamped(new Date(2026, 5, 30), 3), new Date(2026, 8, 30));
});

test("2026-06-30 上线，第 2 检查点为 2026-12-30", () => {
  const launchedAt = new Date(2026, 5, 30);
  assert.deepEqual(getValueTrackingTaskDates(launchedAt, 1).checkpointAt, new Date(2026, 8, 30));
  assert.deepEqual(getValueTrackingTaskDates(launchedAt, 2).checkpointAt, new Date(2026, 11, 30));
});

test("2026-11-15 上线，第 2 检查点跨年为 2027-05-15", () => {
  const launchedAt = new Date(2026, 10, 15);
  assert.deepEqual(getValueTrackingTaskDates(launchedAt, 1).checkpointAt, new Date(2027, 1, 15));
  assert.deepEqual(getValueTrackingTaskDates(launchedAt, 2).checkpointAt, new Date(2027, 4, 15));
});

test("2026-06-30 上线，两条任务截止日期分别为 2026-10-07、2027-01-06", () => {
  const launchedAt = new Date(2026, 5, 30);
  assert.deepEqual(getValueTrackingTaskDates(launchedAt, 1).deadlineAt, new Date(2026, 9, 7));
  assert.deepEqual(getValueTrackingTaskDates(launchedAt, 2).deadlineAt, new Date(2027, 0, 6));
  assert.deepEqual(getValueTrackingDeadline(launchedAt), new Date(2027, 0, 6));
});

test("2026-11-15 上线，第 2 次任务截止日期为 2027-05-22", () => {
  const launchedAt = new Date(2026, 10, 15);
  assert.deepEqual(getValueTrackingTaskDates(launchedAt, 2).deadlineAt, new Date(2027, 4, 22));
});

test("检查点加 7 个自然日支持跨月、跨年", () => {
  assert.deepEqual(addCalendarDays(new Date(2026, 11, 28), 7), new Date(2027, 0, 4));
  assert.deepEqual(addCalendarDays(new Date(2026, 1, 25), 7), new Date(2026, 2, 4));
});

test("跟踪窗口为上线日起 6 个自然月", () => {
  const { start, end } = getValueTrackingWindow(new Date(2026, 5, 30));
  assert.deepEqual(start, new Date(2026, 5, 30));
  assert.deepEqual(end, new Date(2026, 11, 30));
});

test("自然季度与 6 个月窗口相交判断", () => {
  const launchedAt = new Date(2026, 5, 30); // 窗口 2026-06-30 ~ 2026-12-30
  assert.equal(doesCalendarQuarterOverlapTrackingWindow(launchedAt, 2026, 2), true);
  assert.equal(doesCalendarQuarterOverlapTrackingWindow(launchedAt, 2026, 3), true);
  assert.equal(doesCalendarQuarterOverlapTrackingWindow(launchedAt, 2026, 4), true);
  assert.equal(doesCalendarQuarterOverlapTrackingWindow(launchedAt, 2026, 1), false);
  assert.equal(doesCalendarQuarterOverlapTrackingWindow(launchedAt, 2027, 1), false);
});

test("跨年窗口的年度筛选", () => {
  const launchedAt = new Date(2026, 10, 15); // 窗口 2026-11-15 ~ 2027-05-15
  assert.equal(doesYearOverlapTrackingWindow(launchedAt, 2026), true);
  assert.equal(doesYearOverlapTrackingWindow(launchedAt, 2027), true);
  assert.equal(doesYearOverlapTrackingWindow(launchedAt, 2025), false);
  assert.equal(doesYearOverlapTrackingWindow(launchedAt, 2028), false);
  assert.equal(doesCalendarQuarterOverlapTrackingWindow(launchedAt, 2027, 1), true);
  assert.equal(doesCalendarQuarterOverlapTrackingWindow(launchedAt, 2027, 2), true);
  assert.equal(doesCalendarQuarterOverlapTrackingWindow(launchedAt, 2027, 3), false);
});

test("历史记录按填报时间归入检查点", () => {
  const launchedAt = new Date(2026, 5, 30);
  assert.equal(getValueTrackingSequence(launchedAt, new Date(2026, 8, 29)), 1);
  assert.equal(getValueTrackingSequence(launchedAt, new Date(2026, 11, 1)), 2);
  assert.equal(getValueTrackingSequence(launchedAt, new Date(2027, 0, 5)), null);
});

test("任务显示状态按业务日期派生", () => {
  const task = {
    completedAt: null,
    checkpointAt: new Date(2026, 8, 30),
    deadlineAt: new Date(2026, 9, 7),
  };
  assert.equal(getValueTrackTaskState(task, new Date(2026, 8, 29)), "NOT_DUE");
  assert.equal(getValueTrackTaskState(task, new Date(2026, 8, 30)), "PENDING");
  assert.equal(getValueTrackTaskState(task, new Date(2026, 9, 7)), "PENDING");
  assert.equal(getValueTrackTaskState(task, new Date(2026, 9, 8)), "OVERDUE");
  assert.equal(getValueTrackTaskState({ ...task, completedAt: new Date(2026, 9, 20) }, new Date(2026, 9, 21)), "COMPLETED");
});

test("项目超期未完成判断", () => {
  const launchedAt = new Date(2026, 5, 30);
  assert.equal(isValueTrackingOverdue({ launchedAt }, false, new Date(2027, 0, 6)), false);
  assert.equal(isValueTrackingOverdue({ launchedAt }, false, new Date(2027, 0, 7)), true);
  assert.equal(isValueTrackingOverdue({ launchedAt }, true, new Date(2027, 0, 7)), false);
  assert.equal(isValueTrackingOverdue({ launchedAt: null }, false, new Date(2027, 0, 7)), false);
});

test("toBusinessDate 归一化为本地业务日期", () => {
  assert.deepEqual(toBusinessDate(new Date(2026, 5, 30, 23, 59, 59)), new Date(2026, 5, 30));
});
