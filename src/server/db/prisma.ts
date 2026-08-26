import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, type Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

function resolveDatabaseUrl() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "file:./dev.db") {
    return `file:${path.resolve(process.cwd(), "db/dev.db")}`;
  }

  if (process.env.DATABASE_URL.startsWith("file:")) {
    const rawPath = process.env.DATABASE_URL.slice("file:".length);
    if (path.isAbsolute(rawPath)) {
      return process.env.DATABASE_URL;
    }
    return `file:${path.resolve(process.cwd(), rawPath)}`;
  }

  return process.env.DATABASE_URL;
}

const schemaPath = path.resolve(process.cwd(), "db/prisma/schema.prisma");

function getSchemaHash() {
  return createHash("sha256").update(readFileSync(schemaPath)).digest("hex");
}

function resolvePrismaClientOptions() {
  const databaseUrl = resolveDatabaseUrl();
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return {
    adapter,
    log: (process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"]) satisfies Prisma.LogLevel[],
  };
}

// Pragmas 只需在每个进程首次建立连接后跑一次:
// - journal_mode=WAL:读写不互相阻塞,通知调度器写入不会卡住用户 SSR
// - synchronous=NORMAL:配合 WAL 是官方推荐组合
// - busy_timeout:并发下短暂锁等待自动重试
// - cache_size / temp_store:让 SQLite 用更多内存降低磁盘 IO
async function applyStartupPragmas(client: PrismaClient) {
  try {
    await client.$executeRawUnsafe("PRAGMA journal_mode=WAL");
    await client.$executeRawUnsafe("PRAGMA synchronous=NORMAL");
    await client.$executeRawUnsafe("PRAGMA busy_timeout=5000");
    await client.$executeRawUnsafe("PRAGMA cache_size=-64000");
    await client.$executeRawUnsafe("PRAGMA temp_store=MEMORY");
  } catch (error) {
    console.error("[prisma] apply startup pragmas failed", error);
  }
}

function createPrismaClient() {
  const client = new PrismaClient(resolvePrismaClientOptions());
  void applyStartupPragmas(client);
  return client;
}

// 生产模式:模块级单例,进程存活期间只建一次。
// 开发模式:走 globalThis 缓存,并在 schema.prisma 变化时失效重建(支持 next dev 的 HMR)。
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaHash?: string;
};

let productionClient: PrismaClient | undefined;

function hasCurrentDelegates(client: PrismaClient) {
  return typeof client.notificationScenario?.findMany === "function"
    && typeof client.notificationDeliveryLog?.findMany === "function"
    && typeof client.notificationGroupBot?.findMany === "function";
}

function resolvePrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    if (!productionClient) {
      productionClient = createPrismaClient();
    }
    return productionClient;
  }

  const cached = globalForPrisma.prisma;
  if (cached && hasCurrentDelegates(cached)) {
    const schemaHash = getSchemaHash();
    if (globalForPrisma.prismaSchemaHash === schemaHash) {
      return cached;
    }
    void cached.$disconnect().catch(() => undefined);
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaSchemaHash = getSchemaHash();
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = resolvePrismaClient();
    const value = Reflect.get(client as object, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
