-- AlterTable
ALTER TABLE "Project" ADD COLUMN "launchedAt" DATETIME;

-- Backfill: 存量已完成且有价值产出的项目迁移为「已上线」，之后价值体系只认已上线项目
-- 注意：valueTrackStatus 在上一轮迁移中被全量回填，不能作为「有价值」的判别条件
UPDATE "Project"
SET "status" = 'LAUNCHED',
    "launchedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'COMPLETED'
  AND (
    "valueJudgement" IS NOT NULL
    OR "actualValue" IS NOT NULL
    OR "workloadPersonDay" IS NOT NULL
    OR "otherCost" IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM "RequirementValueTrack" AS rvt
      WHERE rvt."projectId" = "Project"."id"
        AND rvt."deletedAt" IS NULL
    )
  );
