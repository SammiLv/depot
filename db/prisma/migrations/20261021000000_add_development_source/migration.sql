-- 需求新增「开发方」：INTERNAL=产品部内部自研，EXTERNAL=外部开发
-- 存量已标记需要开发的需求统一回填为外部开发
ALTER TABLE "QuarterlyWork" ADD COLUMN "developmentSource" TEXT;

UPDATE "QuarterlyWork" SET "developmentSource" = 'EXTERNAL'
WHERE "needsDevelopment" = 1 AND "developmentSource" IS NULL;
