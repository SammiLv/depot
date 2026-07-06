import { prisma } from "@/server/db/prisma";

export async function getDescendantOrgNodeIds(orgNodeId: string | null): Promise<string[]> {
  if (!orgNodeId) return [];
  const rows = await prisma.orgClosure.findMany({
    where: { ancestorId: orgNodeId },
    select: { descendantId: true },
  });
  return rows.map((r) => r.descendantId);
}

export async function getAncestorOrgNodeIds(orgNodeId: string | null): Promise<string[]> {
  if (!orgNodeId) return [];
  const rows = await prisma.orgClosure.findMany({
    where: { descendantId: orgNodeId },
    select: { ancestorId: true },
  });
  return rows.map((r) => r.ancestorId);
}

export async function getDescendantOrgNodes(
  orgNodeId: string | null,
  nodeType?: "DEPARTMENT" | "TEAM",
) {
  const descendantIds = await getDescendantOrgNodeIds(orgNodeId);
  if (descendantIds.length === 0) return [];

  return prisma.orgNode.findMany({
    where: {
      id: { in: descendantIds },
      ...(nodeType ? { nodeType } : {}),
    },
    select: { id: true, name: true, nodeType: true, parentId: true },
    orderBy: { name: "asc" },
  });
}

export async function findOrgNodeById(orgNodeId: string | null | undefined) {
  if (!orgNodeId) return null;
  return prisma.orgNode.findUnique({
    where: { id: orgNodeId },
    select: { id: true, name: true, nodeType: true, parentId: true },
  });
}

export async function findNearestDepartmentOrgNodeId(orgNodeId: string | null | undefined): Promise<string | null> {
  if (!orgNodeId) return null;

  const ancestorRows = await prisma.orgClosure.findMany({
    where: { descendantId: orgNodeId },
    orderBy: { depth: "desc" },
    select: { ancestorId: true },
  });

  if (ancestorRows.length === 0) return null;

  const departmentNodes = await prisma.orgNode.findMany({
    where: {
      id: { in: ancestorRows.map((row) => row.ancestorId) },
      nodeType: "DEPARTMENT",
    },
    select: { id: true },
  });

  const departmentIdSet = new Set(departmentNodes.map((node) => node.id));
  return ancestorRows.find((row) => departmentIdSet.has(row.ancestorId))?.ancestorId ?? null;
}

export async function isOrgNodeInSubtree(
  targetOrgNodeId: string | null | undefined,
  ancestorOrgNodeId: string | null | undefined,
): Promise<boolean> {
  if (!targetOrgNodeId || !ancestorOrgNodeId) return false;

  const row = await prisma.orgClosure.findUnique({
    where: {
      ancestorId_descendantId: {
        ancestorId: ancestorOrgNodeId,
        descendantId: targetOrgNodeId,
      },
    },
    select: { ancestorId: true },
  });

  return Boolean(row);
}
