DROP INDEX IF EXISTS "AnnualGoalPlan_departmentId_teamId_idx";
ALTER TABLE "AnnualGoalPlan" DROP COLUMN "departmentId";
ALTER TABLE "AnnualGoalPlan" DROP COLUMN "teamId";
