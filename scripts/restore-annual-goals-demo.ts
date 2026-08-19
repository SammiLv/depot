import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { ensureAnnualGoalDemoData } from "../db/prisma/seed-annual-goals-demo";

function resolveDatabaseUrl() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "file:./dev.db") {
    return `file:${path.resolve(process.cwd(), "db/dev.db")}`;
  }
  if (process.env.DATABASE_URL.startsWith("file:")) {
    const rawPath = process.env.DATABASE_URL.slice("file:".length);
    return path.isAbsolute(rawPath) ? process.env.DATABASE_URL : `file:${path.resolve(process.cwd(), rawPath)}`;
  }
  return process.env.DATABASE_URL;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

async function main() {
  const force = process.argv.includes("--force");
  await ensureAnnualGoalDemoData(prisma, { force });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
