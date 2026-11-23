-- 组织架构：离职、删除守卫、调组跟随、整组并入
-- User：离职时间与离职前原业务组（单据原业务组从负责人身上取，单据表不加字段）
ALTER TABLE "User" ADD COLUMN "resignedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "originalOrgNodeId" TEXT;
ALTER TABLE "User" ADD COLUMN "originalOrgName" TEXT;

-- OrgNode：部门下系统小组「离职人员」标记，不可改名/并入/删除，不参与钉钉按名称匹配
ALTER TABLE "OrgNode" ADD COLUMN "isResignedPool" BOOLEAN NOT NULL DEFAULT false;
