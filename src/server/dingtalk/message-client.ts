type DingTalkApiResponse<T = unknown> = {
  code?: number | string;
  success?: boolean;
  msg?: string;
  message?: string;
  data?: T;
};

export type SendDingTalkMessageInput = {
  dingUserIds?: string[];
  mobiles?: string[];
  title: string;
  content: string;
  messageUrl?: string;
  notifyEventType?: number;
  openConversationId?: string;
  webhook?: string;
};

function getAppKey() {
  const appKey = process.env.DINGTALK_APP_KEY;
  if (!appKey) throw new Error("缺少 DINGTALK_APP_KEY 配置");
  return appKey;
}

function getGatewayBase() {
  return (process.env.DINGTALK_GATEWAY_BASE ?? "https://gateway.rjmart.cn").replace(/\/$/, "");
}

export function isDingTalkNotifyEnabled() {
  const flag = process.env.DINGTALK_NOTIFY_ENABLED;
  if (flag == null || flag === "") return Boolean(process.env.DINGTALK_APP_KEY);
  return !["0", "false", "off", "no"].includes(flag.toLowerCase());
}

export async function sendDingTalkMessage(input: SendDingTalkMessageInput) {
  if (!isDingTalkNotifyEnabled()) {
    return { skipped: true as const, reason: "DINGTALK_NOTIFY_ENABLED is off" };
  }

  const dingUserIds = [...new Set((input.dingUserIds ?? []).filter(Boolean))];
  const mobiles = [...new Set((input.mobiles ?? []).filter(Boolean))];
  if (dingUserIds.length === 0 && mobiles.length === 0) {
    return { skipped: true as const, reason: "no recipients" };
  }

  const notifyEventType = input.notifyEventType ?? 5;
  const appId = process.env.DINGTALK_APP_ID?.trim() || undefined;
  const chunks = dingUserIds.length > 0
    ? chunk(dingUserIds, 5000).map((ids) => ({ dingUserIds: ids as string[], mobile: undefined as string[] | undefined }))
    : chunk(mobiles, 10).map((ids) => ({ dingUserIds: undefined as string[] | undefined, mobile: ids as string[] }));

  for (const recipients of chunks) {
    const body: Record<string, unknown> = {
      appKey: getAppKey(),
      notifyEventType,
      title: input.title,
      content: input.content,
    };
    if (recipients.dingUserIds) body.dingUserIds = recipients.dingUserIds;
    if (recipients.mobile) body.mobile = recipients.mobile;
    if (appId) body.appId = appId;
    if (input.messageUrl) body.messageUrl = input.messageUrl;
    if (input.openConversationId) body.openConversationId = input.openConversationId;
    if (input.webhook) body.webhook = input.webhook;

    const response = await fetch(`${getGatewayBase()}/base/dt/dtcloud/openapi/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`钉钉消息接口请求失败: HTTP ${response.status}`);
    }

    const result = await response.json() as DingTalkApiResponse;
    const code = result.code == null ? 200 : Number(result.code);
    if (result.success === false || ![0, 200].includes(code)) {
      throw new Error(result.message ?? result.msg ?? "钉钉消息接口返回失败");
    }
  }

  return { skipped: false as const };
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
