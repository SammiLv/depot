-- CreateTable
CREATE TABLE "NotificationGroupBot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "securityType" TEXT NOT NULL,
    "securityValue" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationGroupBot_name_key" ON "NotificationGroupBot"("name");
