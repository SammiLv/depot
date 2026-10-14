-- 价值跟踪记录增加填报时快照：价值判断、实际收益（历史行展示当次填报值）
ALTER TABLE "RequirementValueTrack" ADD COLUMN "valueJudgement" TEXT;
ALTER TABLE "RequirementValueTrack" ADD COLUMN "actualValue" TEXT;
-- 历史记录用项目当前值兜底回填
UPDATE "RequirementValueTrack"
SET "valueJudgement" = (SELECT "valueJudgement" FROM "Project" WHERE "Project"."id" = "RequirementValueTrack"."projectId"),
    "actualValue" = (SELECT "actualValue" FROM "Project" WHERE "Project"."id" = "RequirementValueTrack"."projectId")
WHERE "valueJudgement" IS NULL AND "actualValue" IS NULL;
