-- AlterTable
ALTER TABLE "KpiTemplate" ADD COLUMN "updatedById" TEXT;

-- CreateIndex
CREATE INDEX "KpiTemplate_updatedById_idx" ON "KpiTemplate"("updatedById");

-- Backfill
UPDATE "KpiTemplate"
SET "updatedById" = "createdById"
WHERE "updatedById" IS NULL;
