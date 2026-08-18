-- AlterTable
ALTER TABLE "PersonalKpi" ADD COLUMN "finalRatingName" TEXT;
ALTER TABLE "PersonalKpi" ADD COLUMN "ratingRuleVersionId" TEXT;
ALTER TABLE "PersonalKpi" ADD COLUMN "ratingSnapshotJson" TEXT;

-- CreateTable
CREATE TABLE "KpiRatingRuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentOrgNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "KpiRatingBand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minScore" REAL NOT NULL,
    "maxScore" REAL,
    "isUnbounded" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KpiRatingAdjustmentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalKpiId" TEXT NOT NULL,
    "fromRuleVersionId" TEXT,
    "toRuleVersionId" TEXT NOT NULL,
    "originalRatingName" TEXT,
    "adjustedRatingName" TEXT NOT NULL,
    "originalSnapshotJson" TEXT,
    "adjustedSnapshotJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustedById" TEXT NOT NULL,
    "adjustedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TalentDecisionRuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentOrgNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "decisionMonthsJson" TEXT NOT NULL DEFAULT '[4,10]',
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "TalentDecisionRuleCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleVersionId" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "windowType" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "thresholdJson" TEXT NOT NULL,
    "isBlocking" BOOLEAN NOT NULL DEFAULT true,
    "missingPolicy" TEXT NOT NULL DEFAULT 'INCOMPLETE',
    "explanation" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TalentDecisionRuleAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleVersionId" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "parametersJson" TEXT NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "KpiRatingRuleVersion_departmentOrgNodeId_status_idx" ON "KpiRatingRuleVersion"("departmentOrgNodeId", "status");

-- CreateIndex
CREATE INDEX "KpiRatingRuleVersion_effectiveFrom_effectiveTo_idx" ON "KpiRatingRuleVersion"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "KpiRatingRuleVersion_deletedAt_idx" ON "KpiRatingRuleVersion"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRatingRuleVersion_departmentOrgNodeId_name_version_key" ON "KpiRatingRuleVersion"("departmentOrgNodeId", "name", "version");

-- CreateIndex
CREATE INDEX "KpiRatingBand_ruleVersionId_minScore_idx" ON "KpiRatingBand"("ruleVersionId", "minScore");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRatingBand_ruleVersionId_name_key" ON "KpiRatingBand"("ruleVersionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRatingBand_ruleVersionId_sortOrder_key" ON "KpiRatingBand"("ruleVersionId", "sortOrder");

-- CreateIndex
CREATE INDEX "KpiRatingAdjustmentLog_personalKpiId_adjustedAt_idx" ON "KpiRatingAdjustmentLog"("personalKpiId", "adjustedAt");

-- CreateIndex
CREATE INDEX "KpiRatingAdjustmentLog_toRuleVersionId_idx" ON "KpiRatingAdjustmentLog"("toRuleVersionId");

-- CreateIndex
CREATE INDEX "TalentDecisionRuleVersion_departmentOrgNodeId_status_idx" ON "TalentDecisionRuleVersion"("departmentOrgNodeId", "status");

-- CreateIndex
CREATE INDEX "TalentDecisionRuleVersion_effectiveFrom_effectiveTo_idx" ON "TalentDecisionRuleVersion"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "TalentDecisionRuleVersion_deletedAt_idx" ON "TalentDecisionRuleVersion"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TalentDecisionRuleVersion_departmentOrgNodeId_name_version_key" ON "TalentDecisionRuleVersion"("departmentOrgNodeId", "name", "version");

-- CreateIndex
CREATE INDEX "TalentDecisionRuleCondition_ruleVersionId_decisionType_idx" ON "TalentDecisionRuleCondition"("ruleVersionId", "decisionType");

-- CreateIndex
CREATE INDEX "TalentDecisionRuleCondition_dataSource_operator_idx" ON "TalentDecisionRuleCondition"("dataSource", "operator");

-- CreateIndex
CREATE UNIQUE INDEX "TalentDecisionRuleCondition_ruleVersionId_decisionType_sortOrder_key" ON "TalentDecisionRuleCondition"("ruleVersionId", "decisionType", "sortOrder");

-- CreateIndex
CREATE INDEX "TalentDecisionRuleAction_ruleVersionId_decisionType_idx" ON "TalentDecisionRuleAction"("ruleVersionId", "decisionType");

-- CreateIndex
CREATE INDEX "TalentDecisionRuleAction_actionType_idx" ON "TalentDecisionRuleAction"("actionType");

-- CreateIndex
CREATE UNIQUE INDEX "TalentDecisionRuleAction_ruleVersionId_decisionType_priority_key" ON "TalentDecisionRuleAction"("ruleVersionId", "decisionType", "priority");

-- CreateIndex
CREATE INDEX "PersonalKpi_ratingRuleVersionId_idx" ON "PersonalKpi"("ratingRuleVersionId");
