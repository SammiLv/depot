import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

const integrationTestMenuIds = ["menu-dashboard", "menu-project"] as const;
const integrationTestMenuCodes = ["dashboard-test", "project-test"] as const;
const integrationTestOrgNodeIds = ["root", "dept-a", "dept-b"] as const;

export async function removePermissionMatrixIntegrationTestArtifacts(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const obsoleteMenus = await client.menuPermission.findMany({
    where: {
      OR: [
        { id: { in: [...integrationTestMenuIds] } },
        { code: { in: [...integrationTestMenuCodes] } },
      ],
    },
    select: { id: true },
  });
  const obsoleteMenuIds = obsoleteMenus.map((menu) => menu.id);
  if (obsoleteMenuIds.length > 0) {
    await client.roleMenuPermission.deleteMany({ where: { menuPermissionId: { in: obsoleteMenuIds } } });
    await client.menuPermission.deleteMany({ where: { id: { in: obsoleteMenuIds } } });
  }

  const obsoleteOrgNodeIds = [...integrationTestOrgNodeIds];
  const existingOrgNodes = await client.orgNode.findMany({
    where: { id: { in: obsoleteOrgNodeIds } },
    select: { id: true },
  });
  if (existingOrgNodes.length > 0) {
    const ids = existingOrgNodes.map((node) => node.id);
    await client.orgClosure.deleteMany({
      where: {
        OR: [
          { ancestorId: { in: ids } },
          { descendantId: { in: ids } },
        ],
      },
    });
    await client.orgNode.deleteMany({ where: { id: { in: ids } } });
  }
}
