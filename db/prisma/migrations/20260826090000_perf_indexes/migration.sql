-- 性能索引:配合 KPI/人才发展页面首屏查询与调度器扫描
-- PersonalKpi: talent-overview 按 userId in + status COMPLETED 过滤
CREATE INDEX "PersonalKpi_userId_status_idx" ON "PersonalKpi"("userId", "status");

-- PromotionRecord: talent-overview 按 outcome=SUCCESS + resultStatus=CONFIRMED 过滤
CREATE INDEX "PromotionRecord_outcome_resultStatus_idx" ON "PromotionRecord"("outcome", "resultStatus");

-- RewardRecord: talent-overview 按 effectiveDate 范围过滤(不带 userId)
CREATE INDEX "RewardRecord_effectiveDate_idx" ON "RewardRecord"("effectiveDate");

-- TalentReviewCycle: review-query 按 departmentOrgNodeId in + deletedAt null 过滤
CREATE INDEX "TalentReviewCycle_departmentOrgNodeId_deletedAt_idx" ON "TalentReviewCycle"("departmentOrgNodeId", "deletedAt");
