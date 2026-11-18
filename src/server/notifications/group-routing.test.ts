import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupDeliveryEventKey,
  mergeGroupMentions,
  selectOrgRoutedGroupBotId,
} from "@/server/notifications/group-routing";
import { normalizeGroupRobotLineBreaks } from "@/server/dingtalk/group-robot-client";

test("自动路由优先选择接收人所在业务组机器人", () => {
  const botId = selectOrgRoutedGroupBotId(
    [{ ancestorId: "team-a" }, { ancestorId: "dept-a" }, { ancestorId: "root" }],
    [
      { orgNodeId: "dept-a", groupBotId: "dept-bot" },
      { orgNodeId: "team-a", groupBotId: "team-bot" },
    ],
  );
  assert.equal(botId, "team-bot");
});

test("业务组未绑定机器人时向上回退到部门群", () => {
  const botId = selectOrgRoutedGroupBotId(
    [{ ancestorId: "team-a" }, { ancestorId: "dept-a" }],
    [{ orgNodeId: "dept-a", groupBotId: "dept-bot" }],
  );
  assert.equal(botId, "dept-bot");
});

test("组织没有绑定机器人时返回 null，由调用方决定兜底或跳过", () => {
  assert.equal(selectOrgRoutedGroupBotId([{ ancestorId: "team-a" }], []), null);
  assert.equal(selectOrgRoutedGroupBotId([], []), null);
});

test("同一组织多个绑定时按输入顺序取首个，结果稳定", () => {
  const botId = selectOrgRoutedGroupBotId(
    [{ ancestorId: "team-a" }],
    [
      { orgNodeId: "team-a", groupBotId: "bot-1" },
      { orgNodeId: "team-a", groupBotId: "bot-2" },
    ],
  );
  assert.equal(botId, "bot-1");
});

test("同群接收人合并 @，钉钉 ID 和手机号去重", () => {
  const mentions = mergeGroupMentions([
    { id: "u1", name: "甲", dingtalkUserId: "ding-1", mobile: "13800000000" },
    { id: "u2", name: "乙", dingtalkUserId: "ding-2", mobile: "13900000000" },
    { id: "u3", name: "丙", dingtalkUserId: "ding-1", mobile: "13800000000" },
  ]);
  assert.deepEqual(mentions.atUserIds, ["ding-1", "ding-2"]);
  assert.deepEqual(mentions.atMobiles, ["13800000000", "13900000000"]);
  assert.equal(mentions.mentionPrefix, "@13800000000 @13900000000");
});

test("群投递幂等键按机器人和接收人组隔离，同组与顺序无关", () => {
  const key1 = buildGroupDeliveryEventKey("event-1", "bot-a", ["u2", "u1"]);
  const key2 = buildGroupDeliveryEventKey("event-1", "bot-a", ["u1", "u2"]);
  const otherBot = buildGroupDeliveryEventKey("event-1", "bot-b", ["u1", "u2"]);
  const otherGroup = buildGroupDeliveryEventKey("event-1", "bot-a", ["u1"]);
  assert.equal(key1, key2);
  assert.notEqual(key1, otherBot);
  assert.notEqual(key1, otherGroup);
});

test("钉钉群 Markdown 将模板换行转为可见的段落换行", () => {
  assert.equal(
    normalizeGroupRobotLineBreaks("需求：测试需求\n指派给：@张三\n\n查看详情"),
    "需求：测试需求\n\n指派给：@张三\n\n查看详情",
  );
});
