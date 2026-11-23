-- 内置通知场景按固定标识认同一条记录，改显示名称不再补插重复场景。
ALTER TABLE "NotificationScenario" ADD COLUMN "presetKey" TEXT;

CREATE UNIQUE INDEX "NotificationScenario_presetKey_key" ON "NotificationScenario"("presetKey");
