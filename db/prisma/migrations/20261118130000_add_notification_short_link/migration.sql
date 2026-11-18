-- 通知短链，避免在群消息中暴露长查询参数与 CUID。
CREATE TABLE "NotificationShortLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "targetHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "NotificationShortLink_code_key" ON "NotificationShortLink"("code");
CREATE UNIQUE INDEX "NotificationShortLink_targetHash_key" ON "NotificationShortLink"("targetHash");
CREATE INDEX "NotificationShortLink_createdAt_idx" ON "NotificationShortLink"("createdAt");
