import { prisma } from "@/server/db/prisma";
import { emitNotificationEvent } from "@/server/notifications/emit";
import { runKpiInitializationPendingScan } from "@/server/notifications/kpi-initialization-scan";
import {
  runAnnualGoalQuarterTargetMissingScan,
  runAnnualGoalWeeklyProgressPendingScan,
} from "@/server/notifications/annual-goal-schedule-scan";
import {
  runProjectDueSoonScan,
  runProjectOverdueScan,
  runProjectValueTrackPendingScan,
  runQuarterlyWorkDueSoonScan,
  runQuarterlyWorkOverdueScan,
} from "@/server/notifications/quarterly-work-schedule-scan";
import { computeNextRunAt, getScheduleSlot, parseScheduleConfig } from "@/server/notifications/schedule-utils";

declare global {
  // eslint-disable-next-line no-var
  var __notificationSchedulerStarted: boolean | undefined;
}

function isSchedulerEnabled() {
  const flag = process.env.NOTIFICATION_SCHEDULER_ENABLED;
  if (flag == null || flag === "") return process.env.NODE_ENV === "production";
  return !["0", "false", "off", "no"].includes(flag.toLowerCase());
}

/** 原子认领：仅当场景仍到期时才推进 nextRunAt（避免 SQLite 精确时间比较失败）。 */
async function claimScenarioRun(scenarioId: string, nextRunAt: Date) {
  const now = new Date();
  const result = await prisma.notificationScenario.updateMany({
    where: {
      id: scenarioId,
      isActive: true,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    data: { nextRunAt },
  });
  return result.count > 0;
}

async function runKpiSelfReviewPendingScan(
  scenarioId: string,
  daysBefore: number,
  options?: { testRunId?: number | string; scheduleSlot?: string },
) {
  const kpis = await prisma.personalKpi.findMany({
    where: {
      deletedAt: null,
      status: { in: ["DRAFT", "PENDING_SELF_REVIEW"] },
    },
    select: {
      id: true,
      userId: true,
      year: true,
      quarter: true,
      status: true,
    },
    take: 500,
  });
  const userIds = [...new Set(kpis.map((kpi) => kpi.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, deletedAt: null },
        select: { id: true, name: true },
      })
    : [];
  const nameByUserId = new Map(users.map((user) => [user.id, user.name]));

  for (const kpi of kpis) {
    await emitNotificationEvent("kpi.self_review.pending", {
      userId: kpi.userId,
      subjectUserId: kpi.userId,
      userName: nameByUserId.get(kpi.userId) ?? "",
      kpiId: kpi.id,
      targetType: "PersonalKpi",
      targetId: kpi.id,
      year: kpi.year,
      quarter: kpi.quarter,
      status: kpi.status,
      daysBefore,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}

async function runTodoDueScan(
  scenarioId: string,
  daysBefore: number,
  options?: { testRunId?: number | string; scheduleSlot?: string },
) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + Math.max(0, daysBefore));
  end.setHours(23, 59, 59, 999);

  const todos = await prisma.todoItem.findMany({
    where: {
      isDone: false,
      dueDate: {
        gte: now,
        lte: end,
      },
    },
    select: {
      id: true,
      userId: true,
      title: true,
      dueDate: true,
      targetType: true,
      targetId: true,
    },
    take: 500,
  });

  for (const todo of todos) {
    await emitNotificationEvent("todo.due_soon", {
      userId: todo.userId,
      subjectUserId: todo.userId,
      todoId: todo.id,
      title: todo.title,
      dueDate: todo.dueDate?.toISOString() ?? "",
      targetType: todo.targetType,
      targetId: todo.targetId,
      daysBefore,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}

async function runScanForSchedule(
  scenarioId: string,
  schedule: NonNullable<ReturnType<typeof parseScheduleConfig>>,
  testRunId?: number | string,
) {
  const daysBefore = schedule.daysBefore ?? 0;
  const scheduleSlot = getScheduleSlot();
  const emitOptions = { scenarioIds: [scenarioId], testRunId, scheduleSlot };
  if (schedule.scanType === "kpi_initialization_pending") {
    await runKpiInitializationPendingScan(scenarioId, emitOptions);
  } else if (schedule.scanType === "kpi_self_review_pending") {
    await runKpiSelfReviewPendingScan(scenarioId, daysBefore, emitOptions);
  } else if (schedule.scanType === "todo_due") {
    await runTodoDueScan(scenarioId, daysBefore, emitOptions);
  } else if (schedule.scanType === "annual_goal_weekly_progress_pending") {
    await runAnnualGoalWeeklyProgressPendingScan(scenarioId, daysBefore, emitOptions);
  } else if (schedule.scanType === "annual_goal_quarter_target_missing") {
    await runAnnualGoalQuarterTargetMissingScan(scenarioId, emitOptions);
  } else if (schedule.scanType === "quarterly_work_overdue") {
    await runQuarterlyWorkOverdueScan(scenarioId, emitOptions);
  } else if (schedule.scanType === "quarterly_work_due_soon") {
    await runQuarterlyWorkDueSoonScan(scenarioId, daysBefore, emitOptions);
  } else if (schedule.scanType === "project_overdue") {
    await runProjectOverdueScan(scenarioId, emitOptions);
  } else if (schedule.scanType === "project_due_soon") {
    await runProjectDueSoonScan(scenarioId, daysBefore, emitOptions);
  } else if (schedule.scanType === "project_value_track_pending") {
    await runProjectValueTrackPendingScan(scenarioId, daysBefore, emitOptions);
  }
}

async function executeScheduleScenario(scenarioId: string) {
  const scenario = await prisma.notificationScenario.findFirst({
    where: { id: scenarioId, isActive: true, triggerType: "SCHEDULE" },
  });
  if (!scenario) return;

  const schedule = parseScheduleConfig(scenario.scheduleConfig);
  if (!schedule) {
    console.error("[notifications] invalid scheduleConfig", scenario.id, scenario.scheduleConfig);
    return;
  }

  const nextRunAt = computeNextRunAt(schedule, new Date(), { skipGrace: true });
  const claimed = await claimScenarioRun(scenario.id, nextRunAt);
  if (!claimed) return;

  await runScanForSchedule(scenario.id, schedule);
}

/** 手动或测试触发定时扫描；默认不推进 nextRunAt。 */
export async function runScheduleScenarioScan(
  scenarioId: string,
  options?: { advanceSchedule?: boolean; testRunId?: number | string },
) {
  const scenario = await prisma.notificationScenario.findFirst({
    where: { id: scenarioId, isActive: true, triggerType: "SCHEDULE" },
  });
  if (!scenario) {
    throw new Error("场景不存在或未启用");
  }

  const schedule = parseScheduleConfig(scenario.scheduleConfig);
  if (!schedule) {
    throw new Error("定时配置无效，请检查扫描类型与执行时间");
  }

  if (options?.advanceSchedule) {
    const nextRunAt = computeNextRunAt(schedule, new Date(), { skipGrace: true });
    const claimed = await claimScenarioRun(scenario.id, nextRunAt);
    if (!claimed) {
      throw new Error("场景正在由调度器执行，请稍后再试");
    }
  }

  await runScanForSchedule(scenario.id, schedule, options?.testRunId);
}

export async function tickNotificationScheduler() {
  const now = new Date();
  const dueScenarios = await prisma.notificationScenario.findMany({
    where: {
      isActive: true,
      triggerType: "SCHEDULE",
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    select: { id: true },
    take: 50,
  });

  for (const scenario of dueScenarios) {
    try {
      await executeScheduleScenario(scenario.id);
    } catch (error) {
      console.error("[notifications] schedule run failed", scenario.id, error);
    }
  }
}

export function startNotificationScheduler() {
  if (globalThis.__notificationSchedulerStarted) return;
  if (!isSchedulerEnabled()) {
    console.info("[notifications] scheduler disabled");
    return;
  }

  globalThis.__notificationSchedulerStarted = true;
  console.info("[notifications] scheduler started");

  void tickNotificationScheduler();
  const tickIntervalMs = process.env.NODE_ENV === "development" ? 15_000 : 60_000;
  setInterval(() => {
    void tickNotificationScheduler();
  }, tickIntervalMs);
}
