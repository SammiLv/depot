-- AlterTable
-- 部门绩效分布规则新增「平均分下限」；NULL 表示不校验平均分（存量已发布版本不受影响）
ALTER TABLE "KpiRatingRuleVersion" ADD COLUMN "distributionMinAverage" REAL;
