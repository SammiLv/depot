ALTER TABLE "KpiApprovalPolicyStep" ADD COLUMN "nodeMode" TEXT;
ALTER TABLE "KpiApprovalPolicyStep" ADD COLUMN "approvalOrgNodeId" TEXT;

CREATE INDEX "KpiApprovalPolicyStep_approvalOrgNodeId_idx"
  ON "KpiApprovalPolicyStep"("approvalOrgNodeId");

ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "nodeMode" TEXT;
ALTER TABLE "PersonalKpiApprovalStep" ADD COLUMN "configuredOrgNodeId" TEXT;

CREATE INDEX "PersonalKpiApprovalStep_configuredOrgNodeId_idx"
  ON "PersonalKpiApprovalStep"("configuredOrgNodeId");
