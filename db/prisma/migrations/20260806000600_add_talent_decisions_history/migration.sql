CREATE TABLE "TalentDecisionRecommendation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recommendationNo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "departmentOrgNodeId" TEXT NOT NULL,
  "decisionType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "recommendationContentJson" TEXT NOT NULL,
  "ruleVersionId" TEXT,
  "evidenceSnapshotJson" TEXT NOT NULL,
  "qualificationResultJson" TEXT NOT NULL,
  "companyFeedbackStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "companyFeedbackContent" TEXT,
  "externalProcessNo" TEXT,
  "proposedById" TEXT NOT NULL,
  "proposedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedById" TEXT,
  "closedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "TalentDecisionRecommendation_recommendationNo_key" ON "TalentDecisionRecommendation"("recommendationNo");
CREATE INDEX "TalentDecisionRecommendation_userId_decisionType_createdAt_idx" ON "TalentDecisionRecommendation"("userId","decisionType","createdAt");
CREATE INDEX "TalentDecisionRecommendation_departmentOrgNodeId_status_idx" ON "TalentDecisionRecommendation"("departmentOrgNodeId","status");
CREATE INDEX "TalentDecisionRecommendation_externalProcessNo_idx" ON "TalentDecisionRecommendation"("externalProcessNo");
CREATE INDEX "TalentDecisionRecommendation_deletedAt_idx" ON "TalentDecisionRecommendation"("deletedAt");

CREATE TABLE "PromotionRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,"recordNo" TEXT NOT NULL,"userId" TEXT NOT NULL,"fromJobRoleId" TEXT,"toJobRoleId" TEXT,"fromJobLevelId" TEXT,"toJobLevelId" TEXT,"promotionType" TEXT,"reason" TEXT,"effectiveDate" DATETIME NOT NULL,"recommendationId" TEXT,"sourceType" TEXT NOT NULL DEFAULT 'MANUAL_ENTRY',"externalProcessNo" TEXT,"resultStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',"confirmedById" TEXT,"confirmedAt" DATETIME,"voidReason" TEXT,"createdById" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,"deletedAt" DATETIME
);
CREATE UNIQUE INDEX "PromotionRecord_recordNo_key" ON "PromotionRecord"("recordNo");
CREATE INDEX "PromotionRecord_userId_effectiveDate_idx" ON "PromotionRecord"("userId","effectiveDate");
CREATE INDEX "PromotionRecord_recommendationId_idx" ON "PromotionRecord"("recommendationId");
CREATE INDEX "PromotionRecord_externalProcessNo_idx" ON "PromotionRecord"("externalProcessNo");
CREATE INDEX "PromotionRecord_resultStatus_deletedAt_idx" ON "PromotionRecord"("resultStatus","deletedAt");

CREATE TABLE "SalaryAdjustmentRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,"recordNo" TEXT NOT NULL,"userId" TEXT NOT NULL,"beforeSalary" INTEGER,"afterSalary" INTEGER,"adjustmentAmount" INTEGER,"adjustmentRate" REAL,"reason" TEXT,"effectiveDate" DATETIME NOT NULL,"recommendationId" TEXT,"sourceType" TEXT NOT NULL DEFAULT 'MANUAL_ENTRY',"externalProcessNo" TEXT,"resultStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',"confirmedById" TEXT,"confirmedAt" DATETIME,"voidReason" TEXT,"createdById" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,"deletedAt" DATETIME
);
CREATE UNIQUE INDEX "SalaryAdjustmentRecord_recordNo_key" ON "SalaryAdjustmentRecord"("recordNo");
CREATE INDEX "SalaryAdjustmentRecord_userId_effectiveDate_idx" ON "SalaryAdjustmentRecord"("userId","effectiveDate");
CREATE INDEX "SalaryAdjustmentRecord_recommendationId_idx" ON "SalaryAdjustmentRecord"("recommendationId");
CREATE INDEX "SalaryAdjustmentRecord_externalProcessNo_idx" ON "SalaryAdjustmentRecord"("externalProcessNo");
CREATE INDEX "SalaryAdjustmentRecord_resultStatus_deletedAt_idx" ON "SalaryAdjustmentRecord"("resultStatus","deletedAt");

CREATE TABLE "RewardRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,"recordNo" TEXT NOT NULL,"userId" TEXT NOT NULL,"rewardType" TEXT NOT NULL,"rewardName" TEXT NOT NULL,"rewardAmount" INTEGER,"rewardDescription" TEXT,"effectiveDate" DATETIME NOT NULL,"recommendationId" TEXT,"sourceType" TEXT NOT NULL DEFAULT 'MANUAL_ENTRY',"externalProcessNo" TEXT,"resultStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',"confirmedById" TEXT,"confirmedAt" DATETIME,"voidReason" TEXT,"createdById" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,"deletedAt" DATETIME
);
CREATE UNIQUE INDEX "RewardRecord_recordNo_key" ON "RewardRecord"("recordNo");
CREATE INDEX "RewardRecord_userId_effectiveDate_idx" ON "RewardRecord"("userId","effectiveDate");
CREATE INDEX "RewardRecord_recommendationId_idx" ON "RewardRecord"("recommendationId");
CREATE INDEX "RewardRecord_externalProcessNo_idx" ON "RewardRecord"("externalProcessNo");
CREATE INDEX "RewardRecord_resultStatus_deletedAt_idx" ON "RewardRecord"("resultStatus","deletedAt");

ALTER TABLE "EmploymentContractTerm" ADD COLUMN "outcome" TEXT;
