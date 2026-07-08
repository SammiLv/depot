import { scryptSync } from "node:crypto";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const [, , loginNameArg, passwordArg] = process.argv;

if (!loginNameArg || !passwordArg) {
  console.error("Usage: npm run set-admin-password -- <loginName> <password>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

function hashPassword(password: string) {
  return scryptSync(password, "department-management", 64).toString("hex");
}

async function main() {
  const user = await prisma.user.findFirst({
    where: {
      loginName: loginNameArg,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });

  if (!user) {
    throw new Error(`未找到账号: ${loginNameArg}`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(passwordArg),
      passwordLoginEnabled: true,
    },
  });

  console.log(`已为 ${user.name} 更新账号密码登录: ${loginNameArg}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
