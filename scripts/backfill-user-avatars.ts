// 一次性回填：从钉钉 getDingUser 接口拉取存量用户头像，写入 User.avatarUrl。
// 可重复执行：仅处理 avatarUrl 为空的用户；接口失败的用户跳过不影响其它。
// 用法：node --import tsx scripts/backfill-user-avatars.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

const GATEWAY_BASE = (process.env.DINGTALK_GATEWAY_BASE ?? "https://gateway.rjmart.cn").replace(/\/$/, "");
const APP_KEY = process.env.DINGTALK_APP_KEY;

async function fetchAvatar(dingtalkUserId: string): Promise<string | null> {
  const response = await fetch(`${GATEWAY_BASE}/base/dt/dtcloud/openapi/getDingUser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appKey: APP_KEY, userId: dingtalkUserId }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const result = await response.json() as { code?: number; success?: boolean; data?: { avatar?: string } };
  const code = result.code == null ? 200 : Number(result.code);
  if (result.success === false || ![0, 200].includes(code)) return null;
  return result.data?.avatar ?? null;
}

async function main() {
  if (!APP_KEY) throw new Error("缺少 DINGTALK_APP_KEY 配置（请通过环境变量或 .env 提供）");

  const users = await prisma.user.findMany({
    where: { dingtalkUserId: { not: null }, deletedAt: null, avatarUrl: null },
    select: { id: true, name: true, dingtalkUserId: true },
  });
  console.log(`待回填 ${users.length} 人`);

  let updated = 0;
  for (const user of users) {
    const avatar = await fetchAvatar(user.dingtalkUserId!);
    if (avatar) {
      await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: avatar } });
      updated += 1;
      console.log(`✓ ${user.name}`);
    } else {
      console.log(`✗ ${user.name}（接口未返回头像）`);
    }
  }
  console.log(`完成：${updated}/${users.length} 人已写入头像`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
