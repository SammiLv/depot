import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
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
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] as const : ["error"] as const,
  };
}

function createPrismaClient() {
  return new PrismaClient(resolvePrismaClientOptions());
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaHash?: string;
};

function hasCurrentDelegates(client: PrismaClient) {
  return typeof client.notificationScenario?.findMany === "function"
    && typeof client.notificationDeliveryLog?.findMany === "function"
    && typeof client.notificationGroupBot?.findMany === "function";
}

function isCachedClientValid(client: PrismaClient | undefined, schemaHash: string) {
  if (!client) return false;
  if (globalForPrisma.prismaSchemaHash !== schemaHash) return false;
  return hasCurrentDelegates(client);
}

function resolvePrismaClient() {
  const schemaHash = getSchemaHash();
  const cached = globalForPrisma.prisma;
  if (isCachedClientValid(cached, schemaHash)) {
    return cached;
  }

  if (cached && typeof cached.$disconnect === "function") {
    void cached.$disconnect().catch(() => undefined);
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaSchemaHash = schemaHash;
  }
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
