-- AlterTable
ALTER TABLE "AnnualGoalMetric" ADD COLUMN "adjustedAt" DATETIME;
ALTER TABLE "AnnualGoalMetric" ADD COLUMN "progressUpdatedAt" DATETIME;

-- AlterTable
ALTER TABLE "AnnualGoalMetricSource" ADD COLUMN "adjustedAt" DATETIME;
ALTER TABLE "AnnualGoalMetricSource" ADD COLUMN "progressUpdatedAt" DATETIME;
