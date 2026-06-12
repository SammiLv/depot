DROP INDEX IF EXISTS "RequirementValueTrack_teamId_idx";
DROP INDEX IF EXISTS "PersonalKpi_teamId_idx";
ALTER TABLE "RequirementValueTrack" DROP COLUMN "teamId";
ALTER TABLE "PersonalKpi" DROP COLUMN "teamId";
