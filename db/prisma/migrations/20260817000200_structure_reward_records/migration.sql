-- 奖励履历尚未投入使用，直接替换旧的类别/子类型结构，不保留旧字段。
DROP TABLE "RewardRecord";

CREATE TABLE "RewardRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recordNo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rewardLevel" TEXT NOT NULL,
  "rewardForm" TEXT NOT NULL,
  "rewardRecipient" TEXT NOT NULL,
  "rewardCycle" TEXT NOT NULL,
  "rewardPeriodYear" INTEGER NOT NULL,
  "rewardPeriodMonth" INTEGER,
  "rewardPeriodQuarter" INTEGER,
  "rewardName" TEXT NOT NULL,
  "rewardAmount" INTEGER NOT NULL,
  "rewardDescription" TEXT,
  "effectiveDate" DATETIME NOT NULL,
  "recommendationId" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL_ENTRY',
  "externalProcessNo" TEXT,
  "resultStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "confirmedById" TEXT,
  "confirmedAt" DATETIME,
  "voidReason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME
);

CREATE UNIQUE INDEX "RewardRecord_recordNo_key" ON "RewardRecord"("recordNo");
CREATE INDEX "RewardRecord_userId_effectiveDate_idx" ON "RewardRecord"("userId", "effectiveDate");
CREATE INDEX "RewardRecord_recommendationId_idx" ON "RewardRecord"("recommendationId");
CREATE INDEX "RewardRecord_externalProcessNo_idx" ON "RewardRecord"("externalProcessNo");
CREATE INDEX "RewardRecord_resultStatus_deletedAt_idx" ON "RewardRecord"("resultStatus", "deletedAt");
CREATE INDEX "RewardRecord_rewardCycle_rewardPeriodYear_rewardPeriodMonth_rewardPeriodQuarter_idx"
ON "RewardRecord"("rewardCycle", "rewardPeriodYear", "rewardPeriodMonth", "rewardPeriodQuarter");
