ALTER TABLE "Team" ADD COLUMN "dingtalkDeptId" TEXT;

CREATE UNIQUE INDEX "Team_dingtalkDeptId_key" ON "Team"("dingtalkDeptId");
