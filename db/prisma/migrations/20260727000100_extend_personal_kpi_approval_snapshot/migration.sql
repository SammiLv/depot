ALTER TABLE "PersonalKpi" ADD COLUMN "approvalPolicyId" TEXT;
ALTER TABLE "PersonalKpi" ADD COLUMN "approvalPolicyName" TEXT;
ALTER TABLE "PersonalKpi" ADD COLUMN "approvalPolicyScopeType" TEXT;
ALTER TABLE "PersonalKpi" ADD COLUMN "approvalPolicyDepartmentOrgNodeId" TEXT;

CREATE INDEX "PersonalKpi_approvalPolicyId_idx" ON "PersonalKpi"("approvalPolicyId");

ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "policyStepId" TEXT;
ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "stepLabel" TEXT;
ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "ancestorDepth" INTEGER;
ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "resolverType" TEXT;
ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "resolverUserId" TEXT;
ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "orgNodeId" TEXT;
ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "comment" TEXT;
ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "actedAt" DATETIME;

CREATE INDEX "PersonalKpiApprovalStep_policyStepId_idx" ON "PersonalKpiApprovalStep"("policyStepId");
