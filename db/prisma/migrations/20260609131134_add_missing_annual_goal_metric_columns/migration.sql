-- AlterTable
ALTER TABLE "AnnualGoalMetric" ADD COLUMN "responsibleUserId" TEXT;

-- AlterTable
ALTER TABLE "AnnualGoalMetricSource" ADD COLUMN "responsibleUserId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnnualGoalQuarterTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricId" TEXT NOT NULL,
    "sourceMetricId" TEXT,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "targetValue" REAL NOT NULL,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "weeklyIncrement" REAL NOT NULL DEFAULT 0,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "adjustedAt" DATETIME,
    "progressUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_AnnualGoalQuarterTarget" ("adjustedAt", "createdAt", "currentValue", "deletedAt", "endDate", "id", "metricId", "progressUpdatedAt", "quarter", "riskStatus", "sourceMetricId", "startDate", "targetValue", "updatedAt", "year") SELECT "adjustedAt", "createdAt", "currentValue", "deletedAt", "endDate", "id", "metricId", "progressUpdatedAt", "quarter", "riskStatus", "sourceMetricId", "startDate", "targetValue", "updatedAt", "year" FROM "AnnualGoalQuarterTarget";
DROP TABLE "AnnualGoalQuarterTarget";
ALTER TABLE "new_AnnualGoalQuarterTarget" RENAME TO "AnnualGoalQuarterTarget";
CREATE INDEX "AnnualGoalQuarterTarget_metricId_idx" ON "AnnualGoalQuarterTarget"("metricId");
CREATE INDEX "AnnualGoalQuarterTarget_sourceMetricId_idx" ON "AnnualGoalQuarterTarget"("sourceMetricId");
CREATE INDEX "AnnualGoalQuarterTarget_year_quarter_idx" ON "AnnualGoalQuarterTarget"("year", "quarter");
CREATE INDEX "AnnualGoalQuarterTarget_riskStatus_idx" ON "AnnualGoalQuarterTarget"("riskStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AnnualGoalMetric_responsibleUserId_idx" ON "AnnualGoalMetric"("responsibleUserId");

-- CreateIndex
CREATE INDEX "AnnualGoalMetricSource_responsibleUserId_idx" ON "AnnualGoalMetricSource"("responsibleUserId");
