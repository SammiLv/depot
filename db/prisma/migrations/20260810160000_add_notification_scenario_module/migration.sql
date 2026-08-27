-- AlterTable
ALTER TABLE "NotificationScenario" ADD COLUMN "module" TEXT NOT NULL DEFAULT '其他';

-- Backfill existing rows
UPDATE "NotificationScenario" SET "module" = 'KPI' WHERE "triggerEvent" LIKE 'kpi.%';
UPDATE "NotificationScenario" SET "module" = '待办' WHERE "triggerEvent" LIKE 'todo.%';

-- CreateIndex
CREATE INDEX "NotificationScenario_module_isActive_idx" ON "NotificationScenario"("module", "isActive");
