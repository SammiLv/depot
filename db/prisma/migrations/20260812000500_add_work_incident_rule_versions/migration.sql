CREATE TABLE "WorkIncidentRuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentOrgNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "policyVersion" TEXT NOT NULL DEFAULT 'V3.0',
    "matrixJson" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
CREATE INDEX "WorkIncidentRuleVersion_departmentOrgNodeId_status_idx" ON "WorkIncidentRuleVersion"("departmentOrgNodeId", "status");
CREATE INDEX "WorkIncidentRuleVersion_deletedAt_idx" ON "WorkIncidentRuleVersion"("deletedAt");
CREATE UNIQUE INDEX "WorkIncidentRuleVersion_departmentOrgNodeId_name_version_key" ON "WorkIncidentRuleVersion"("departmentOrgNodeId", "name", "version");
