-- AlterTable: extend permission enums (SQLite stores as TEXT)
-- CreateTable
CREATE TABLE "NotificationScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "scheduleConfig" TEXT,
    "nextRunAt" DATETIME,
    "recipientConfig" TEXT NOT NULL,
    "channelConfig" TEXT NOT NULL,
    "conditionConfig" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationDeliveryLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDeliveryLog_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "NotificationScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NotificationScenario_triggerType_isActive_idx" ON "NotificationScenario"("triggerType", "isActive");

-- CreateIndex
CREATE INDEX "NotificationScenario_triggerEvent_isActive_idx" ON "NotificationScenario"("triggerEvent", "isActive");

-- CreateIndex
CREATE INDEX "NotificationScenario_nextRunAt_idx" ON "NotificationScenario"("nextRunAt");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_userId_idx" ON "NotificationDeliveryLog"("userId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_createdAt_idx" ON "NotificationDeliveryLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDeliveryLog_scenarioId_eventKey_channel_key" ON "NotificationDeliveryLog"("scenarioId", "eventKey", "channel");
