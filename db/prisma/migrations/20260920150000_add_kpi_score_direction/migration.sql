-- AlterTable
-- 指标项计分方向（扣分项 DEDUCTION 默认 / 加分项 BONUS）；存量数据由 scripts/backfill-kpi-score-direction.ts 按规则回填
ALTER TABLE "KpiTemplateItem" ADD COLUMN "scoreDirection" TEXT NOT NULL DEFAULT 'DEDUCTION';
ALTER TABLE "PersonalKpiItem" ADD COLUMN "scoreDirection" TEXT NOT NULL DEFAULT 'DEDUCTION';
