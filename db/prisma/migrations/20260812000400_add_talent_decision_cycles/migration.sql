-- CreateTable
CREATE TABLE "TalentDecisionCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "departmentOrgNodeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "decisionMonth" INTEGER NOT NULL,
    "observationStartDate" DATETIME NOT NULL,
    "observationEndDate" DATETIME NOT NULL,
    "decisionDate" DATETIME NOT NULL,
    "dataCutoffDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CALCULATION',
    "ruleVersionId" TEXT NOT NULL,
    "ruleSnapshotJson" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "calculatedById" TEXT,
    "calculatedAt" DATETIME,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "TalentDecisionEmployeeResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgNodeIdSnapshot" TEXT,
    "jobRoleIdSnapshot" TEXT,
    "jobLevelIdSnapshot" TEXT,
    "evidenceStatus" TEXT NOT NULL DEFAULT 'INCOMPLETE',
    "missingItemsJson" TEXT NOT NULL DEFAULT '[]',
    "kpiCount" INTEGER NOT NULL DEFAULT 0,
    "assessmentCount" INTEGER NOT NULL DEFAULT 0,
    "activeRestrictionCount" INTEGER NOT NULL DEFAULT 0,
    "evidenceSnapshotJson" TEXT NOT NULL,
    "ruleSnapshotJson" TEXT NOT NULL,
    "calculatedById" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TalentDecisionCycle_departmentOrgNodeId_status_idx" ON "TalentDecisionCycle"("departmentOrgNodeId", "status");
CREATE INDEX "TalentDecisionCycle_year_decisionMonth_idx" ON "TalentDecisionCycle"("year", "decisionMonth");
CREATE INDEX "TalentDecisionCycle_ruleVersionId_idx" ON "TalentDecisionCycle"("ruleVersionId");
CREATE INDEX "TalentDecisionCycle_deletedAt_idx" ON "TalentDecisionCycle"("deletedAt");
CREATE UNIQUE INDEX "TalentDecisionCycle_departmentOrgNodeId_year_decisionMonth_key" ON "TalentDecisionCycle"("departmentOrgNodeId", "year", "decisionMonth");
CREATE INDEX "TalentDecisionEmployeeResult_cycleId_evidenceStatus_idx" ON "TalentDecisionEmployeeResult"("cycleId", "evidenceStatus");
CREATE INDEX "TalentDecisionEmployeeResult_userId_calculatedAt_idx" ON "TalentDecisionEmployeeResult"("userId", "calculatedAt");
CREATE UNIQUE INDEX "TalentDecisionEmployeeResult_cycleId_userId_key" ON "TalentDecisionEmployeeResult"("cycleId", "userId");
