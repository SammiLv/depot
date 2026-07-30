CREATE TABLE "KpiApprovalPolicyStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "ancestorDepth" INTEGER,
    "resolverType" TEXT NOT NULL,
    "resolverUserId" TEXT,
    "skipIfSelf" BOOLEAN NOT NULL DEFAULT true,
    "skipIfDuplicateApprover" BOOLEAN NOT NULL DEFAULT true,
    "allowSkipWhenNoApprover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "KpiApprovalPolicyStep_policyId_stepOrder_key" ON "KpiApprovalPolicyStep"("policyId", "stepOrder");
CREATE INDEX "KpiApprovalPolicyStep_policyId_idx" ON "KpiApprovalPolicyStep"("policyId");
CREATE INDEX "KpiApprovalPolicyStep_resolverType_idx" ON "KpiApprovalPolicyStep"("resolverType");
CREATE INDEX "KpiApprovalPolicyStep_resolverUserId_idx" ON "KpiApprovalPolicyStep"("resolverUserId");
