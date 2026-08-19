import "dotenv/config";
import path from "node:path";
import type { NotificationType, Prisma } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { renderTemplate } from "../src/server/notifications/template-render";
import type { ChannelConfig, NotificationEventPayload } from "../src/server/notifications/types";

function resolveDatabaseUrl() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "file:./dev.db") {
    return `file:${path.resolve(process.cwd(), "db/dev.db")}`;
  }
  if (process.env.DATABASE_URL.startsWith("file:")) {
    const rawPath = process.env.DATABASE_URL.slice("file:".length);
    return path.isAbsolute(rawPath) ? process.env.DATABASE_URL : `file:${path.resolve(process.cwd(), rawPath)}`;
  }
  return process.env.DATABASE_URL;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

function asChannelConfig(value: Prisma.JsonValue): ChannelConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { channels: ["IN_APP"], titleTemplate: "" };
  }
  const config = value as ChannelConfig;
  return {
    channels: Array.isArray(config.channels) && config.channels.length ? config.channels : ["IN_APP"],
    notificationType: config.notificationType,
    titleTemplate: config.titleTemplate ?? "",
    contentTemplate: config.contentTemplate,
    messageUrlTemplate: config.messageUrlTemplate,
  };
}

function stripChannelEventKey(eventKey: string, userId: string) {
  const parts = eventKey.split(":");
  if (parts.length > 1 && parts[parts.length - 1] === userId) {
    parts.pop();
  }
  return parts;
}

async function rebuildPayload(
  triggerEvent: string,
  eventKey: string,
  userId: string,
): Promise<NotificationEventPayload> {
  const parts = stripChannelEventKey(eventKey, userId);
  const tail = parts.slice(1);

  while (tail.length > 0 && /^\d{10,}$/.test(tail[tail.length - 1]!)) {
    tail.pop();
  }
  while (tail.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(tail[tail.length - 1]!)) {
    tail.pop();
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { name: true },
  });
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const payload: NotificationEventPayload = {
    userId,
    subjectUserId: userId,
    userName: user?.name ?? "",
    appUrl,
    year: new Date().getFullYear(),
    quarter: Math.floor(new Date().getMonth() / 3) + 1,
  };

  const kpi = tail.length
    ? await prisma.personalKpi.findFirst({
        where: { id: { in: tail }, deletedAt: null },
        select: { id: true, userId: true, year: true, quarter: true, status: true },
      })
    : null;
  if (kpi) {
    const subject = await prisma.user.findFirst({
      where: { id: kpi.userId, deletedAt: null },
      select: { name: true },
    });
    payload.kpiId = kpi.id;
    payload.targetId = kpi.id;
    payload.targetType = "PersonalKpi";
    payload.year = kpi.year;
    payload.quarter = kpi.quarter;
    payload.status = kpi.status;
    payload.userId = kpi.userId;
    payload.subjectUserId = kpi.userId;
    payload.userName = subject?.name ?? payload.userName;
  }

  const department = tail.length
    ? await prisma.orgNode.findFirst({
        where: { id: { in: tail }, nodeType: "DEPARTMENT" },
        select: { id: true, name: true },
      })
    : null;
  if (department) {
    payload.departmentOrgNodeId = department.id;
    payload.departmentName = department.name;
    payload.targetId = department.id;
    payload.targetType = "OrgNode";
    if (triggerEvent === "kpi.initialization.pending") {
      payload.pendingCount = payload.pendingCount ?? 1;
    }
  }

  for (const part of tail) {
    if (/^20\d{2}$/.test(part)) payload.year = Number(part);
    if (/^[1-4]$/.test(part)) payload.quarter = Number(part);
    if (["DRAFT", "PENDING_SELF_REVIEW", "PENDING_LEADER_SCORE", "PENDING_MANAGER_SCORE", "PENDING_FINAL_REVIEW", "COMPLETED", "REJECTED"].includes(part)) {
      payload.status = part;
    }
  }

  if (triggerEvent === "kpi.approval.rejected" && !payload.comment) {
    payload.comment = "请修改后重新提交";
  }

  if (triggerEvent === "kpi.initialized" && kpi) {
    payload.userId = kpi.userId;
    payload.subjectUserId = kpi.userId;
  }

  return payload;
}

async function main() {
  const force = process.argv.includes("--force");
  const existingCount = await prisma.notification.count();
  if (existingCount > 0 && !force) {
    console.info(`[backfill] Notification 表已有 ${existingCount} 条，跳过。如需合并回填请加 --force`);
    return;
  }

  const logs = await prisma.notificationDeliveryLog.findMany({
    where: { channel: "IN_APP", status: "SENT" },
    include: {
      scenario: {
        select: {
          name: true,
          triggerEvent: true,
          channelConfig: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!logs.length) {
    console.info("[backfill] 没有可回填的 IN_APP 投递记录");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const log of logs) {
    const channelConfig = asChannelConfig(log.scenario.channelConfig);
    const payload = await rebuildPayload(log.scenario.triggerEvent, log.eventKey, log.userId);
    const renderedTitle = renderTemplate(channelConfig.titleTemplate, payload) || log.scenario.name;
    const title = payload.testRunId != null
      ? `${renderedTitle}（测试）`
      : renderedTitle;
    const content = renderTemplate(channelConfig.contentTemplate, payload) || null;
    const notificationType = (channelConfig.notificationType ?? "KPI_TODO") as NotificationType;

    const duplicate = await prisma.notification.findFirst({
      where: {
        userId: log.userId,
        title,
        createdAt: log.createdAt,
      },
      select: { id: true },
    });
    if (duplicate) {
      skipped += 1;
      continue;
    }

    await prisma.notification.create({
      data: {
        userId: log.userId,
        type: notificationType,
        title,
        content,
        targetType: payload.targetType ? String(payload.targetType) : null,
        targetId: payload.targetId ? String(payload.targetId) : null,
        createdAt: log.createdAt,
      },
    });
    created += 1;
  }

  console.info(`[backfill] 已从投递日志回填 ${created} 条站内通知，跳过重复 ${skipped} 条`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
