import type { NotificationEventPayload } from "@/server/notifications/types";

export function renderTemplate(template: string | undefined | null, payload: NotificationEventPayload) {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = payload[key];
    if (value == null) return "";
    return String(value);
  });
}

export function buildEventKey(parts: Array<string | number | null | undefined>) {
  return parts.filter((part) => part != null && part !== "").map(String).join(":");
}
