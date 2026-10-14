-- 首版完成度手工维护：项目维度新增首版/迭代工作量字段
-- 填写后优先于需求汇总自动计算；两个都为空表示不手工维护
ALTER TABLE "Project" ADD COLUMN "firstVersionWorkloadPersonDay" REAL;
ALTER TABLE "Project" ADD COLUMN "postLaunchIterationWorkloadPersonDay" REAL;
