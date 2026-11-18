/**
 * 群机器人组织路由的纯函数，便于独立测试。
 * 输入的组织祖先必须按 depth 从小到大排列（自身→最近父级→根）。
 */
export function selectOrgRoutedGroupBotId(
  ancestors: Array<{ ancestorId: string }>,
  bindings: Array<{ orgNodeId: string; groupBotId: string }>,
): string | null {
  const botsByOrgNodeId = new Map<string, string>();
  for (const binding of bindings) {
    // 同一组织存在多个机器人时取首个，调用方负责稳定的绑定排序
    if (!botsByOrgNodeId.has(binding.orgNodeId)) {
      botsByOrgNodeId.set(binding.orgNodeId, binding.groupBotId);
    }
  }
  for (const ancestor of ancestors) {
    const groupBotId = botsByOrgNodeId.get(ancestor.ancestorId);
    if (groupBotId) return groupBotId;
  }
  return null;
}

export function buildGroupDeliveryEventKey(eventKey: string, groupBotId: string, userIds: string[]) {
  return `${eventKey}:group:${groupBotId}:${[...new Set(userIds)].sort().join(",")}`;
}

export type GroupMentionUser = {
  id: string;
  name: string;
  dingtalkUserId: string | null;
  mobile: string | null;
};

/** 同一群的接收人合并为一次 @；钉钉 ID 与手机号分别去重 */
export function mergeGroupMentions(users: GroupMentionUser[]) {
  const atUserIds: string[] = [];
  const atMobiles: string[] = [];
  const mentionNames: string[] = [];
  for (const user of users) {
    if (user.dingtalkUserId && !atUserIds.includes(user.dingtalkUserId)) atUserIds.push(user.dingtalkUserId);
    if (user.mobile && !atMobiles.includes(user.mobile)) atMobiles.push(user.mobile);
    const mention = user.mobile ?? user.dingtalkUserId ?? user.name;
    if (mention && !mentionNames.includes(mention)) mentionNames.push(mention);
  }
  return {
    atUserIds,
    atMobiles,
    mentionPrefix: mentionNames.map((mention) => `@${mention}`).join(" "),
  };
}
