import type { NotificationDeliveryChannel, NotificationDeliveryStatus } from "@prisma/client";

export function summarizeDeliveryLogs(
  logs: Array<{
    channel: NotificationDeliveryChannel;
    status: NotificationDeliveryStatus;
    error: string | null;
  }>,
) {
  if (!logs.length) {
    return "扫描完成，当前没有符合条件的数据，未发送通知。";
  }

  const inApp = logs.filter((log) => log.channel === "IN_APP");
  const dingTalk = logs.filter((log) => log.channel === "DINGTALK");
  const dingTalkPersonal = logs.filter((log) => log.channel === "DINGTALK_PERSONAL");
  const dingTalkGroup = logs.filter((log) => log.channel === "DINGTALK_GROUP");
  const parts: string[] = [];

  if (inApp.some((log) => log.status === "SENT")) {
    parts.push(`系统内通知已发送 ${inApp.filter((log) => log.status === "SENT").length} 条`);
  } else if (inApp.length) {
    parts.push("系统内通知未发送");
  }

  const dingTalkSent = dingTalk.filter((log) => log.status === "SENT");
  const dingTalkSkipped = dingTalk.filter((log) => log.status === "SKIPPED");
  const dingTalkFailed = dingTalk.filter((log) => log.status === "FAILED");

  if (dingTalkSent.length) {
    parts.push(`钉钉工作通知已提交 ${dingTalkSent.length} 条（请在钉钉「工作通知 / RJ机器人」查看；相同标题可能被折叠，测试消息标题会带时间戳）`);
  } else if (dingTalkSkipped.length) {
    parts.push(`钉钉工作通知未发送：${dingTalkSkipped[0]?.error ?? "已跳过"}`);
  } else if (dingTalkFailed.length) {
    parts.push(`钉钉工作通知发送失败：${dingTalkFailed[0]?.error ?? "未知错误"}`);
  }

  const personalSent = dingTalkPersonal.filter((log) => log.status === "SENT");
  const personalSkipped = dingTalkPersonal.filter((log) => log.status === "SKIPPED");
  const personalFailed = dingTalkPersonal.filter((log) => log.status === "FAILED");

  if (personalSent.length) {
    parts.push(`钉钉本人会话通知已提交 ${personalSent.length} 条（请在钉钉与机器人的单聊会话查看）`);
  } else if (personalSkipped.length) {
    parts.push(`钉钉本人会话未发送：${personalSkipped[0]?.error ?? "已跳过"}`);
  } else if (personalFailed.length) {
    parts.push(`钉钉本人会话发送失败：${personalFailed[0]?.error ?? "未知错误"}`);
  }

  const groupSent = dingTalkGroup.filter((log) => log.status === "SENT");
  const groupSkipped = dingTalkGroup.filter((log) => log.status === "SKIPPED");
  const groupFailed = dingTalkGroup.filter((log) => log.status === "FAILED");

  if (groupSent.length) {
    parts.push(`群消息通知已发送 ${groupSent.length} 条（请在对应钉钉群查看，接收人会被 @）`);
  } else if (groupSkipped.length) {
    parts.push(`群消息未发送：${groupSkipped[0]?.error ?? "已跳过"}`);
  } else if (groupFailed.length) {
    parts.push(`群消息发送失败：${groupFailed[0]?.error ?? "未知错误"}`);
  }

  return parts.join("；") || "测试已完成。";
}
