-- AlterTable
ALTER TABLE "AnnualGoalProgress" ADD COLUMN "sourceMetricId" TEXT;

-- AlterTable
ALTER TABLE "AnnualGoalQuarterTarget" ADD COLUMN "sourceMetricId" TEXT;

-- CreateTable
CREATE TABLE "AnnualGoalMetricSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" REAL NOT NULL,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "calculationType" TEXT NOT NULL DEFAULT 'RATIO',
    "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnnualGoalMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "sourceMetricId" TEXT,
    "metricCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" REAL NOT NULL,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "calculationType" TEXT NOT NULL DEFAULT 'RATIO',
    "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "AnnualGoalMetric_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AnnualGoalPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnnualGoalMetric_sourceMetricId_fkey" FOREIGN KEY ("sourceMetricId") REFERENCES "AnnualGoalMetricSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AnnualGoalMetric" ("calculationType", "createdAt", "currentValue", "deletedAt", "description", "id", "metricCode", "name", "planId", "riskStatus", "sortOrder", "targetValue", "unit", "updatedAt", "weight") SELECT "calculationType", "createdAt", "currentValue", "deletedAt", "description", "id", "metricCode", "name", "planId", "riskStatus", "sortOrder", "targetValue", "unit", "updatedAt", "weight" FROM "AnnualGoalMetric";
DROP TABLE "AnnualGoalMetric";
ALTER TABLE "new_AnnualGoalMetric" RENAME TO "AnnualGoalMetric";
CREATE INDEX "AnnualGoalMetric_planId_idx" ON "AnnualGoalMetric"("planId");
CREATE INDEX "AnnualGoalMetric_sourceMetricId_idx" ON "AnnualGoalMetric"("sourceMetricId");
CREATE INDEX "AnnualGoalMetric_metricCode_idx" ON "AnnualGoalMetric"("metricCode");
CREATE INDEX "AnnualGoalMetric_riskStatus_idx" ON "AnnualGoalMetric"("riskStatus");
CREATE UNIQUE INDEX "AnnualGoalMetric_planId_sourceMetricId_key" ON "AnnualGoalMetric"("planId", "sourceMetricId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AnnualGoalMetricSource_metricCode_key" ON "AnnualGoalMetricSource"("metricCode");

-- CreateIndex
CREATE INDEX "AnnualGoalMetricSource_riskStatus_idx" ON "AnnualGoalMetricSource"("riskStatus");

-- CreateIndex
CREATE INDEX "AnnualGoalMetricSource_deletedAt_idx" ON "AnnualGoalMetricSource"("deletedAt");

-- CreateIndex
CREATE INDEX "AnnualGoalProgress_sourceMetricId_idx" ON "AnnualGoalProgress"("sourceMetricId");

-- CreateIndex
CREATE INDEX "AnnualGoalQuarterTarget_sourceMetricId_idx" ON "AnnualGoalQuarterTarget"("sourceMetricId");
