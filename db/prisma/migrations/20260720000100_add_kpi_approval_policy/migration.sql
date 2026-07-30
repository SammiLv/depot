CREATE TABLE "KpiApprovalPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "departmentOrgNodeId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeScopeKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "KpiApprovalPolicy_scopeType_departmentOrgNodeId_name_key" ON "KpiApprovalPolicy"("scopeType", "departmentOrgNodeId", "name");
CREATE UNIQUE INDEX "KpiApprovalPolicy_activeScopeKey_key" ON "KpiApprovalPolicy"("activeScopeKey");
CREATE UNIQUE INDEX "KpiApprovalPolicy_single_active_scope_key" ON "KpiApprovalPolicy"("scopeType", "departmentOrgNodeId") WHERE "isActive" = true;
CREATE INDEX "KpiApprovalPolicy_scopeType_departmentOrgNodeId_isActive_idx" ON "KpiApprovalPolicy"("scopeType", "departmentOrgNodeId", "isActive");
