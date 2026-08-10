import { prisma } from "@/server/db/prisma";
import { emitNotificationEvent } from "@/server/notifications/emit";
import { SCHEDULE_SCAN_REGISTRY } from "@/server/notifications/event-registry";
import { computeNextRunAt, parseScheduleConfig } from "@/server/notifications/schedule-utils";

declare global {
  // eslint-disable-next-line no-var
  var __notificationSchedulerStarted: boolean | undefined;
}

function isSchedulerEnabled() {
  const flag = process.env.NOTIFICATION_SCHEDULER_ENABLED;
  if (flag == null || flag === "") return process.env.NODE_ENV === "production";
  return !["0", "false", "off", "no"].includes(flag.toLowerCase());
}

async function claimScenarioRun(scenarioId: string, expectedNextRunAt: Date | null, nextRunAt: Date) {
  const result = await prisma.notificationScenario.updateMany({
    where: {
      id: scenarioId,
      isActive: true,
      ...(expectedNextRunAt
        ? { nextRunAt: expectedNextRunAt }
        : { OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }] }),
    },
    data: { nextRunAt },
  });
  return result.count > 0;
}

async function runKpiSelfReviewPendingScan(scenarioId: string, daysBefore: number) {
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
    }, { scenarioIds: [scenarioId] });
  }
}

async function runTodoDueScan(scenarioId: string, daysBefore: number) {
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
    }, { scenarioIds: [scenarioId] });
  }
}

async function executeScheduleScenario(scenarioId: string) {
  const scenario = await prisma.notificationScenario.findFirst({
    where: { id: scenarioId, isActive: true, triggerType: "SCHEDULE" },
  });
  if (!scenario) return;

  const schedule = parseScheduleConfig(scenario.scheduleConfig);
  if (!schedule) {
    console.error("[notifications] invalid scheduleConfig", scenario.id);
    return;
  }

  const nextRunAt = computeNextRunAt(schedule, new Date());
  const claimed = await claimScenarioRun(scenario.id, scenario.nextRunAt, nextRunAt);
  if (!claimed) return;

  const scanMeta = SCHEDULE_SCAN_REGISTRY[schedule.scanType];
  if (!scanMeta) return;

  const daysBefore = schedule.daysBefore ?? 0;
  if (schedule.scanType === "kpi_self_review_pending") {
    await runKpiSelfReviewPendingScan(scenario.id, daysBefore);
  } else if (schedule.scanType === "todo_due") {
    await runTodoDueScan(scenario.id, daysBefore);
  }
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
  setInterval(() => {
    void tickNotificationScheduler();
  }, 60_000);
}
