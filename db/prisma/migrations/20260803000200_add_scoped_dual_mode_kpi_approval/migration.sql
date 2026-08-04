DROP INDEX IF EXISTS "KpiApprovalPolicy_single_active_scope_key";

CREATE TABLE "KpiApprovalPolicyScope" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "orgNodeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "KpiApprovalPolicyScope_policyId_orgNodeId_key"
  ON "KpiApprovalPolicyScope"("policyId", "orgNodeId");
CREATE INDEX "KpiApprovalPolicyScope_policyId_idx"
  ON "KpiApprovalPolicyScope"("policyId");
CREATE INDEX "KpiApprovalPolicyScope_orgNodeId_idx"
  ON "KpiApprovalPolicyScope"("orgNodeId");

CREATE TABLE "KpiApprovalPolicyStepOrgNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyStepId" TEXT NOT NULL,
    "orgNodeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "KpiApprovalPolicyStepOrgNode_policyStepId_orgNodeId_key"
  ON "KpiApprovalPolicyStepOrgNode"("policyStepId", "orgNodeId");
CREATE INDEX "KpiApprovalPolicyStepOrgNode_policyStepId_idx"
  ON "KpiApprovalPolicyStepOrgNode"("policyStepId");
CREATE INDEX "KpiApprovalPolicyStepOrgNode_orgNodeId_idx"
  ON "KpiApprovalPolicyStepOrgNode"("orgNodeId");

ALTER TABLE "PersonalKpi" ADD COLUMN "approvalPolicyScopeOrgNodeId" TEXT;

CREATE INDEX "PersonalKpi_approvalPolicyScopeOrgNodeId_idx"
  ON "PersonalKpi"("approvalPolicyScopeOrgNodeId");
