-- CreateTable
CREATE TABLE "AnnualGoalMetricAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamOrgNodeId" TEXT NOT NULL,
    "metricId" TEXT,
    "sourceMetricId" TEXT,
    "weight" REAL NOT NULL,
    "responsibleUserId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "AnnualGoalMetricAssignment_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "AnnualGoalMetric" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AnnualGoalMetricAssignment_sourceMetricId_fkey" FOREIGN KEY ("sourceMetricId") REFERENCES "AnnualGoalMetricSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnnualGoalPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentOrgNodeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerType" TEXT NOT NULL,
    "ownerOrgNodeId" TEXT,
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
INSERT INTO "new_AnnualGoalPlan" ("approvalStatus", "approvedAt", "createdAt", "createdById", "deletedAt", "description", "effectiveFrom", "effectiveTo", "id", "isActive", "name", "ownerOrgNodeId", "ownerType", "parentPlanId", "revisedFromPlanId", "revisionReason", "updatedAt", "version", "year") SELECT "approvalStatus", "approvedAt", "createdAt", "createdById", "deletedAt", "description", "effectiveFrom", "effectiveTo", "id", "isActive", "name", "ownerOrgNodeId", "ownerType", "parentPlanId", "revisedFromPlanId", "revisionReason", "updatedAt", "version", "year" FROM "AnnualGoalPlan";
DROP TABLE "AnnualGoalPlan";
ALTER TABLE "new_AnnualGoalPlan" RENAME TO "AnnualGoalPlan";
CREATE INDEX "AnnualGoalPlan_year_idx" ON "AnnualGoalPlan"("year");
CREATE INDEX "AnnualGoalPlan_departmentOrgNodeId_year_idx" ON "AnnualGoalPlan"("departmentOrgNodeId", "year");
CREATE INDEX "AnnualGoalPlan_status_idx" ON "AnnualGoalPlan"("status");
CREATE INDEX "AnnualGoalPlan_ownerType_idx" ON "AnnualGoalPlan"("ownerType");
CREATE INDEX "AnnualGoalPlan_ownerOrgNodeId_idx" ON "AnnualGoalPlan"("ownerOrgNodeId");
CREATE INDEX "AnnualGoalPlan_parentPlanId_idx" ON "AnnualGoalPlan"("parentPlanId");
CREATE INDEX "AnnualGoalPlan_isActive_idx" ON "AnnualGoalPlan"("isActive");
CREATE TABLE "new_AnnualGoalQuarterTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricId" TEXT,
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
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_AnnualGoalQuarterTarget" ("adjustedAt", "createdAt", "createdById", "currentValue", "deletedAt", "endDate", "id", "metricId", "progressUpdatedAt", "quarter", "riskStatus", "sourceMetricId", "startDate", "targetValue", "updatedAt", "updatedById", "weeklyIncrement", "year") SELECT "adjustedAt", "createdAt", "createdById", "currentValue", "deletedAt", "endDate", "id", "metricId", "progressUpdatedAt", "quarter", "riskStatus", "sourceMetricId", "startDate", "targetValue", "updatedAt", "updatedById", "weeklyIncrement", "year" FROM "AnnualGoalQuarterTarget";
DROP TABLE "AnnualGoalQuarterTarget";
ALTER TABLE "new_AnnualGoalQuarterTarget" RENAME TO "AnnualGoalQuarterTarget";
CREATE INDEX "AnnualGoalQuarterTarget_metricId_idx" ON "AnnualGoalQuarterTarget"("metricId");
CREATE INDEX "AnnualGoalQuarterTarget_sourceMetricId_idx" ON "AnnualGoalQuarterTarget"("sourceMetricId");
CREATE INDEX "AnnualGoalQuarterTarget_year_quarter_idx" ON "AnnualGoalQuarterTarget"("year", "quarter");
CREATE INDEX "AnnualGoalQuarterTarget_riskStatus_idx" ON "AnnualGoalQuarterTarget"("riskStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AnnualGoalMetricAssignment_teamOrgNodeId_idx" ON "AnnualGoalMetricAssignment"("teamOrgNodeId");

-- CreateIndex
CREATE INDEX "AnnualGoalMetricAssignment_metricId_idx" ON "AnnualGoalMetricAssignment"("metricId");

-- CreateIndex
CREATE INDEX "AnnualGoalMetricAssignment_sourceMetricId_idx" ON "AnnualGoalMetricAssignment"("sourceMetricId");

-- CreateIndex
CREATE INDEX "AnnualGoalMetricAssignment_responsibleUserId_idx" ON "AnnualGoalMetricAssignment"("responsibleUserId");

-- CreateIndex
CREATE INDEX "AnnualGoalMetricAssignment_deletedAt_idx" ON "AnnualGoalMetricAssignment"("deletedAt");
