-- 项目新增「关闭原因」：关闭状态必填，随项目编辑弹窗维护
ALTER TABLE "Project" ADD COLUMN "closeReason" TEXT;
