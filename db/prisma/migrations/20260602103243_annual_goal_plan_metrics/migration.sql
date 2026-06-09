/*
  Warnings:

  - You are about to drop the `AnnualGoal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GoalProgress` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `relatedGoalId` on the `PersonalKpiItem` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "AnnualGoal_ownerId_idx";

-- DropIndex
DROP INDEX "AnnualGoal_departmentId_teamId_idx";

-- DropIndex
DROP INDEX "AnnualGoal_year_quarter_idx";

-- DropIndex
DROP INDEX "GoalProgress_updaterId_idx";

-- DropIndex
DROP INDEX "GoalProgress_goalId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AnnualGoal";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "GoalProgress";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "AnnualGoalPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerType" TEXT NOT NULL,
    "departmentId" TEXT,
    "teamId" TEXT,
    "parentPlanId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "approvedAt" DATETIME,
    "revisionReason" TEXT,
    "revisedFromPlanId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AnnualGoalMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
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
    CONSTRAINT "AnnualGoalMetric_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AnnualGoalPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnnualGoalQuarterTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "targetValue" REAL NOT NULL,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AnnualGoalProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricId" TEXT NOT NULL,
    "quarterTargetId" TEXT,
    "updaterId" TEXT NOT NULL,
    "progressDate" DATETIME NOT NULL,
    "completedValue" REAL NOT NULL,
    "cumulativeValue" REAL NOT NULL,
    "summary" TEXT,
    "riskNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AnnualGoalRevisionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "oldPlanId" TEXT NOT NULL,
    "newPlanId" TEXT NOT NULL,
    "revisionReason" TEXT NOT NULL,
    "revisedById" TEXT NOT NULL,
    "revisedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PersonalKpiItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalKpiId" TEXT NOT NULL,
    "sourceTemplateItemId" TEXT,
    "relatedAnnualMetricId" TEXT,
    "relatedQuarterTargetId" TEXT,
    "relatedWorkId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" REAL NOT NULL,
    "target" TEXT,
    "scoringStandard" TEXT,
    "selfScore" REAL,
    "leaderScore" REAL,
    "managerScore" REAL,
    "finalScore" REAL,
    "selfComment" TEXT,
    "leaderComment" TEXT,
    "managerComment" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PersonalKpiItem" ("createdAt", "description", "finalScore", "id", "leaderComment", "leaderScore", "managerComment", "managerScore", "name", "personalKpiId", "relatedWorkId", "scoringStandard", "selfComment", "selfScore", "sortOrder", "sourceTemplateItemId", "target", "updatedAt", "weight") SELECT "createdAt", "description", "finalScore", "id", "leaderComment", "leaderScore", "managerComment", "managerScore", "name", "personalKpiId", "relatedWorkId", "scoringStandard", "selfComment", "selfScore", "sortOrder", "sourceTemplateItemId", "target", "updatedAt", "weight" FROM "PersonalKpiItem";
DROP TABLE "PersonalKpiItem";
ALTER TABLE "new_PersonalKpiItem" RENAME TO "PersonalKpiItem";
CREATE INDEX "PersonalKpiItem_personalKpiId_idx" ON "PersonalKpiItem"("personalKpiId");
CREATE INDEX "PersonalKpiItem_relatedAnnualMetricId_idx" ON "PersonalKpiItem"("relatedAnnualMetricId");
CREATE INDEX "PersonalKpiItem_relatedQuarterTargetId_idx" ON "PersonalKpiItem"("relatedQuarterTargetId");
CREATE INDEX "PersonalKpiItem_relatedWorkId_idx" ON "PersonalKpiItem"("relatedWorkId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AnnualGoalPlan_year_idx" ON "AnnualGoalPlan"("year");

-- CreateIndex
CREATE INDEX "AnnualGoalPlan_ownerType_idx" ON "AnnualGoalPlan"("ownerType");

-- CreateIndex
CREATE INDEX "AnnualGoalPlan_departmentId_teamId_idx" ON "AnnualGoalPlan"("departmentId", "teamId");

-- CreateIndex
CREATE INDEX "AnnualGoalPlan_parentPlanId_idx" ON "AnnualGoalPlan"("parentPlanId");

-- CreateIndex
CREATE INDEX "AnnualGoalPlan_isActive_idx" ON "AnnualGoalPlan"("isActive");

-- CreateIndex
CREATE INDEX "AnnualGoalMetric_planId_idx" ON "AnnualGoalMetric"("planId");

-- CreateIndex
CREATE INDEX "AnnualGoalMetric_metricCode_idx" ON "AnnualGoalMetric"("metricCode");

-- CreateIndex
CREATE INDEX "AnnualGoalMetric_riskStatus_idx" ON "AnnualGoalMetric"("riskStatus");

-- CreateIndex
CREATE INDEX "AnnualGoalQuarterTarget_metricId_idx" ON "AnnualGoalQuarterTarget"("metricId");

-- CreateIndex
CREATE INDEX "AnnualGoalQuarterTarget_year_quarter_idx" ON "AnnualGoalQuarterTarget"("year", "quarter");

-- CreateIndex
CREATE INDEX "AnnualGoalQuarterTarget_riskStatus_idx" ON "AnnualGoalQuarterTarget"("riskStatus");

-- CreateIndex
CREATE INDEX "AnnualGoalProgress_metricId_idx" ON "AnnualGoalProgress"("metricId");

-- CreateIndex
CREATE INDEX "AnnualGoalProgress_quarterTargetId_idx" ON "AnnualGoalProgress"("quarterTargetId");

-- CreateIndex
CREATE INDEX "AnnualGoalProgress_updaterId_idx" ON "AnnualGoalProgress"("updaterId");

-- CreateIndex
CREATE INDEX "AnnualGoalRevisionLog_oldPlanId_idx" ON "AnnualGoalRevisionLog"("oldPlanId");

-- CreateIndex
CREATE INDEX "AnnualGoalRevisionLog_newPlanId_idx" ON "AnnualGoalRevisionLog"("newPlanId");

-- CreateIndex
CREATE INDEX "AnnualGoalRevisionLog_revisedById_idx" ON "AnnualGoalRevisionLog"("revisedById");
