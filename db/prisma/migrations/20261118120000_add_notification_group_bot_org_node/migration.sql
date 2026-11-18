-- 群机器人可绑定部门/业务组，用于按通知接收人所属组织自动路由。
CREATE TABLE "NotificationGroupBotOrgNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupBotId" TEXT NOT NULL,
    "orgNodeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationGroupBotOrgNode_groupBotId_fkey" FOREIGN KEY ("groupBotId") REFERENCES "NotificationGroupBot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationGroupBotOrgNode_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NotificationGroupBotOrgNode_groupBotId_orgNodeId_key" ON "NotificationGroupBotOrgNode"("groupBotId", "orgNodeId");
CREATE INDEX "NotificationGroupBotOrgNode_groupBotId_idx" ON "NotificationGroupBotOrgNode"("groupBotId");
CREATE INDEX "NotificationGroupBotOrgNode_orgNodeId_idx" ON "NotificationGroupBotOrgNode"("orgNodeId");
