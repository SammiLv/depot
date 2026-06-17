-- AlterTable
ALTER TABLE "KpiTemplate" ADD COLUMN "templateKey" TEXT NOT NULL DEFAULT 'kpi-default-quarterly';
ALTER TABLE "KpiTemplate" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "KpiTemplate" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "KpiTemplate" ADD COLUMN "isLatest" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "KpiTemplate" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "KpiTemplate" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "KpiTemplate" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "KpiTemplate" ADD COLUMN "reviewComment" TEXT;
ALTER TABLE "KpiTemplate" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "KpiTemplateItem" ADD COLUMN "score" REAL NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PersonalKpi" ADD COLUMN "templateVersion" INTEGER;
ALTER TABLE "PersonalKpi" ADD COLUMN "initializedAt" DATETIME;
ALTER TABLE "PersonalKpi" ADD COLUMN "initializedById" TEXT;

-- AlterTable
ALTER TABLE "PersonalKpiItem" ADD COLUMN "score" REAL NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "KpiTemplateAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetOrgNodeId" TEXT,
    "targetRoleType" TEXT,
    "effectiveFromYear" INTEGER,
    "effectiveFromQuarter" INTEGER,
    "effectiveToYear" INTEGER,
    "effectiveToQuarter" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "KpiTemplate_templateKey_version_key" ON "KpiTemplate"("templateKey", "version");
CREATE INDEX "KpiTemplate_templateKey_isLatest_idx" ON "KpiTemplate"("templateKey", "isLatest");
CREATE INDEX "KpiTemplate_status_isActive_idx" ON "KpiTemplate"("status", "isActive");
CREATE INDEX "KpiTemplate_deletedAt_idx" ON "KpiTemplate"("deletedAt");
CREATE INDEX "KpiTemplateAssignment_templateId_idx" ON "KpiTemplateAssignment"("templateId");
CREATE INDEX "KpiTemplateAssignment_targetType_targetUserId_idx" ON "KpiTemplateAssignment"("targetType", "targetUserId");
CREATE INDEX "KpiTemplateAssignment_targetType_targetOrgNodeId_idx" ON "KpiTemplateAssignment"("targetType", "targetOrgNodeId");
CREATE INDEX "KpiTemplateAssignment_targetType_targetRoleType_idx" ON "KpiTemplateAssignment"("targetType", "targetRoleType");
CREATE INDEX "KpiTemplateAssignment_isActive_idx" ON "KpiTemplateAssignment"("isActive");
