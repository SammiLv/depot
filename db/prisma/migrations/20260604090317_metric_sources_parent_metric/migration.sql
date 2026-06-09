/*
  Warnings:

  - Added the required column `parentMetricId` to the `AnnualGoalMetricSource` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnnualGoalMetricSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentMetricId" TEXT NOT NULL,
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
    "deletedAt" DATETIME,
    CONSTRAINT "AnnualGoalMetricSource_parentMetricId_fkey" FOREIGN KEY ("parentMetricId") REFERENCES "AnnualGoalMetric" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AnnualGoalMetricSource" ("calculationType", "createdAt", "createdById", "currentValue", "deletedAt", "description", "id", "metricCode", "name", "riskStatus", "targetValue", "unit", "updatedAt") SELECT "calculationType", "createdAt", "createdById", "currentValue", "deletedAt", "description", "id", "metricCode", "name", "riskStatus", "targetValue", "unit", "updatedAt" FROM "AnnualGoalMetricSource";
DROP TABLE "AnnualGoalMetricSource";
ALTER TABLE "new_AnnualGoalMetricSource" RENAME TO "AnnualGoalMetricSource";
CREATE UNIQUE INDEX "AnnualGoalMetricSource_metricCode_key" ON "AnnualGoalMetricSource"("metricCode");
CREATE INDEX "AnnualGoalMetricSource_parentMetricId_idx" ON "AnnualGoalMetricSource"("parentMetricId");
CREATE INDEX "AnnualGoalMetricSource_riskStatus_idx" ON "AnnualGoalMetricSource"("riskStatus");
CREATE INDEX "AnnualGoalMetricSource_deletedAt_idx" ON "AnnualGoalMetricSource"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
