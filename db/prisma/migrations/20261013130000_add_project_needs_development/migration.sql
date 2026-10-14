-- 项目新增「是否开发项目」：存在开发需求、或已是已上线状态的项目 = 开发项目，其余为否
ALTER TABLE "Project" ADD COLUMN "needsDevelopment" BOOLEAN;
UPDATE "Project" SET "needsDevelopment" = 1
WHERE "launchedAt" IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM "QuarterlyWork"
     WHERE "QuarterlyWork"."projectId" = "Project"."id"
       AND "QuarterlyWork"."needsDevelopment" = 1
       AND "QuarterlyWork"."deletedAt" IS NULL
   );
UPDATE "Project" SET "needsDevelopment" = 0 WHERE "needsDevelopment" IS NULL;
