import { processNotificationEvent } from "@/server/notifications/engine";
import type { NotificationEventPayload } from "@/server/notifications/types";

/**
 * 业务侧统一入口：失败不影响主流程。
 */
export async function emitNotificationEvent(
  eventCode: string,
  payload: NotificationEventPayload,
  options?: { scenarioIds?: string[] },
) {
  try {
    await processNotificationEvent(eventCode, payload, options);
  } catch (error) {
    console.error("[notifications] emit failed", eventCode, error);
  }
}
