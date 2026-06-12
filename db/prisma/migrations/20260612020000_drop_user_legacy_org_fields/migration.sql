DROP INDEX IF EXISTS "User_departmentId_idx";
DROP INDEX IF EXISTS "User_teamId_idx";
ALTER TABLE "User" DROP COLUMN "departmentId";
ALTER TABLE "User" DROP COLUMN "teamId";
