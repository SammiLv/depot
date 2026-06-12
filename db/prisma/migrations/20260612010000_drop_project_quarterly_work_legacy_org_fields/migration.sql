DROP INDEX IF EXISTS "Project_departmentId_teamId_idx";
DROP INDEX IF EXISTS "QuarterlyWork_departmentId_teamId_idx";
ALTER TABLE "Project" DROP COLUMN "departmentId";
ALTER TABLE "Project" DROP COLUMN "teamId";
ALTER TABLE "QuarterlyWork" DROP COLUMN "departmentId";
ALTER TABLE "QuarterlyWork" DROP COLUMN "teamId";
