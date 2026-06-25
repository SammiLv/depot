-- Add missing annual goal audit columns that current schema and seed expect.
ALTER TABLE "AnnualGoalMetric" ADD COLUMN "createdById" TEXT;
ALTER TABLE "AnnualGoalMetric" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "AnnualGoalMetricSource" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "AnnualGoalQuarterTarget" ADD COLUMN "createdById" TEXT;
ALTER TABLE "AnnualGoalQuarterTarget" ADD COLUMN "updatedById" TEXT;
