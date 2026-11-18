import { createHmac } from "node:crypto";

export type GroupBotSecurityType = "KEYWORD" | "SIGN" | "IP";

export type SendGroupRobotMessageInput = {
  webhookUrl: string;
  securityType: GroupBotSecurityType;
  securityValue: string;
  title: string;
  text: string;
  messageUrl?: string;
  atUserIds?: string[];
  atMobiles?: string[];
};

type DingTalkRobotResponse = {
  errcode?: number;
  errmsg?: string;
};

function buildSignedWebhookUrl(webhookUrl: string, secret: string) {
  const timestamp = Date.now();
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = encodeURIComponent(
    createHmac("sha256", secret).update(stringToSign).digest("base64"),
  );
  const separator = webhookUrl.includes("?") ? "&" : "?";
  return `${webhookUrl}${separator}timestamp=${timestamp}&sign=${sign}`;
}

function ensureKeywordInBody(text: string, keyword: string, title = "") {
  // 钉钉关键词可出现在标题或正文，不要因只检查正文而重复补【关键词】
  if (!keyword || title.includes(keyword) || text.includes(keyword)) return text;
  return `【${keyword}】${text}`;
}

/** 钉钉 Markdown 会把单个 \n 合并到同一行；统一转为段落换行，保留模板中的换行语义 */
export function normalizeGroupRobotLineBreaks(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n+/g, "\n\n");
}

function buildMarkdownText(input: SendGroupRobotMessageInput) {
  // 标题不使用 ### 标题语法，保持与正文相同的字号
  const lines = [input.title, "", normalizeGroupRobotLineBreaks(input.text)];
  if (input.messageUrl) {
    lines.push("", `[查看详情](${input.messageUrl})`);
  }
  return lines.join("\n");
}

export async function sendGroupRobotMessage(input: SendGroupRobotMessageInput) {
  const bodyText = input.securityType === "KEYWORD"
    ? ensureKeywordInBody(input.text, input.securityValue.trim(), input.title)
    : input.text;
  const markdownText = buildMarkdownText({ ...input, text: bodyText });

  const webhookUrl = input.securityType === "SIGN" && input.securityValue.trim()
    ? buildSignedWebhookUrl(input.webhookUrl, input.securityValue.trim())
    : input.webhookUrl;

  const atUserIds = [...new Set((input.atUserIds ?? []).filter(Boolean))];
  const atMobiles = [...new Set((input.atMobiles ?? []).filter(Boolean))];

  const body = {
    msgtype: "markdown",
    markdown: {
      title: input.title,
      text: markdownText,
    },
    at: {
      atUserIds,
      atMobiles,
      isAtAll: false,
    },
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`钉钉群机器人请求失败: HTTP ${response.status}`);
  }

  const result = await response.json() as DingTalkRobotResponse;
  if (result.errcode !== 0) {
    throw new Error(result.errmsg ?? `钉钉群机器人返回错误: ${result.errcode ?? "unknown"}`);
  }

  return { skipped: false as const };
}
