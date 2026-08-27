-- AlterTable
ALTER TABLE "Project" ADD COLUMN "valueTrackStatus" TEXT;

-- Backfill: split old mixed valueJudgement into status + judgement
UPDATE "Project"
SET "valueTrackStatus" = '未观测'
WHERE "valueJudgement" IS NULL OR "valueJudgement" = '' OR "valueJudgement" = '未观测';

UPDATE "Project"
SET "valueTrackStatus" = '观测中'
WHERE "valueJudgement" = '观测中';

UPDATE "Project"
SET "valueTrackStatus" = '观测中', "valueJudgement" = '未达预期'
WHERE "valueJudgement" = '不达预期';

UPDATE "Project"
SET "valueTrackStatus" = '观测中'
WHERE "valueJudgement" = '已达预期';

UPDATE "Project"
SET "valueJudgement" = NULL
WHERE "valueJudgement" IN ('未观测', '观测中');
