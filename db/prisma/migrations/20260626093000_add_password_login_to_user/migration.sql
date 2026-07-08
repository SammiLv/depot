-- AlterTable
ALTER TABLE "User" ADD COLUMN "loginName" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordLoginEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_loginName_key" ON "User"("loginName");
