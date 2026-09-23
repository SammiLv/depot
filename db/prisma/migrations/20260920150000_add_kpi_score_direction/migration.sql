-- AlterTable
-- 指标项计分方向（扣分项 DEDUCTION 默认 / 加分项 BONUS）；存量回填规则见 prodenv-issues-handoff/2026-09-23-KPI计分方向存量回填.md
ALTER TABLE "KpiTemplateItem" ADD COLUMN "scoreDirection" TEXT NOT NULL DEFAULT 'DEDUCTION';
ALTER TABLE "PersonalKpiItem" ADD COLUMN "scoreDirection" TEXT NOT NULL DEFAULT 'DEDUCTION';
