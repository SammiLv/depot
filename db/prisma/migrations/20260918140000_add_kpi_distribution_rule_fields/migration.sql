-- AlterTable
-- 部门绩效分布规则字段（随版本冻结；草稿可编辑、发布后只读）
ALTER TABLE "KpiRatingRuleVersion" ADD COLUMN "distributionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KpiRatingRuleVersion" ADD COLUMN "distributionMinHeadcount" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "KpiRatingRuleVersion" ADD COLUMN "distributionMinGap" REAL NOT NULL DEFAULT 10;
ALTER TABLE "KpiRatingRuleVersion" ADD COLUMN "distributionBelowScore" REAL NOT NULL DEFAULT 100;
ALTER TABLE "KpiRatingRuleVersion" ADD COLUMN "distributionBelowMinPercent" REAL NOT NULL DEFAULT 10;
ALTER TABLE "KpiRatingRuleVersion" ADD COLUMN "distributionExcludeManager" BOOLEAN NOT NULL DEFAULT true;
