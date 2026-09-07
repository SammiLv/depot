-- 任务「是否需要开发」标记:可空、无默认值,历史数据保持 NULL,上线后人工补齐
ALTER TABLE "QuarterlyWork" ADD COLUMN "needsDevelopment" BOOLEAN;
