import type { OrgNodeType } from "@prisma/client";
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

export async function getAncestorOrgNodes(orgNodeId: string | null) {
  if (!orgNodeId) return [];

  const ancestorRows = await prisma.orgClosure.findMany({
    where: { descendantId: orgNodeId },
    orderBy: { depth: "asc" },
    select: { ancestorId: true },
  });

  if (ancestorRows.length === 0) return [];

  const ancestorOrder = new Map(ancestorRows.map((row, index) => [row.ancestorId, index]));
  const nodes = await prisma.orgNode.findMany({
    where: { id: { in: ancestorRows.map((row) => row.ancestorId) } },
    select: { id: true, name: true, nodeType: true, parentId: true },
  });

  return nodes.sort((left, right) => (ancestorOrder.get(left.id) ?? 0) - (ancestorOrder.get(right.id) ?? 0));
}

export async function findNearestAncestorByType(
  orgNodeId: string | null | undefined,
  nodeType: OrgNodeType,
) {
  const nodes = await getAncestorOrgNodes(orgNodeId ?? null);
  return nodes.find((node) => node.nodeType === nodeType) ?? null;
}

export async function findNearestAncestorByTypes(
  orgNodeId: string | null | undefined,
  nodeTypes: OrgNodeType[],
) {
  const nodeTypeSet = new Set(nodeTypes);
  const nodes = await getAncestorOrgNodes(orgNodeId ?? null);
  return nodes.find((node) => nodeTypeSet.has(node.nodeType)) ?? null;
}

export async function getDescendantOrgNodesByTypes(
  orgNodeId: string | null,
  nodeTypes?: OrgNodeType[],
) {
  const descendantIds = await getDescendantOrgNodeIds(orgNodeId);
  if (descendantIds.length === 0) return [];

  return prisma.orgNode.findMany({
    where: {
      id: { in: descendantIds },
      ...(nodeTypes?.length ? { nodeType: { in: nodeTypes } } : {}),
    },
    select: { id: true, name: true, nodeType: true, parentId: true },
    orderBy: { name: "asc" },
  });
}

export async function getDescendantOrgNodes(
  orgNodeId: string | null,
  nodeType?: OrgNodeType,
) {
  return getDescendantOrgNodesByTypes(orgNodeId, nodeType ? [nodeType] : undefined);
}

export async function findOrgNodeById(orgNodeId: string | null | undefined) {
  if (!orgNodeId) return null;
  return prisma.orgNode.findUnique({
    where: { id: orgNodeId },
    select: { id: true, name: true, nodeType: true, parentId: true },
  });
}

export async function findNearestDepartmentOrgNodeId(orgNodeId: string | null | undefined): Promise<string | null> {
  const departmentNode = await findNearestAncestorByType(orgNodeId, "DEPARTMENT");
  return departmentNode?.id ?? null;
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
