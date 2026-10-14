-- 首版完成度统计快照改为服务端自动维护（随需求增删改重算，不可手工编辑），并补充总工作量快照
ALTER TABLE "Project" ADD COLUMN "totalWorkloadPersonDay" REAL;
