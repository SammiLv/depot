import type { OrgNodeType } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/server/db/prisma";

// React cache() 提供请求级 memo:同一次 SSR 内,同参数只会真正命中一次数据库。
// getDescendantOrgNodeIds / getAncestorOrgNodeIds 在 KPI/Talent 首屏中被反复调用同参数,收益明显。
export const getDescendantOrgNodeIds = cache(async (orgNodeId: string | null): Promise<string[]> => {
  if (!orgNodeId) return [];
  const rows = await prisma.orgClosure.findMany({
    where: { ancestorId: orgNodeId },
    select: { descendantId: true },
  });
  return rows.map((r) => r.descendantId);
});

export const getAncestorOrgNodeIds = cache(async (orgNodeId: string | null): Promise<string[]> => {
  if (!orgNodeId) return [];
  const rows = await prisma.orgClosure.findMany({
    where: { descendantId: orgNodeId },
    select: { ancestorId: true },
  });
  return rows.map((r) => r.ancestorId);
});

export const getAncestorOrgNodes = cache(async (orgNodeId: string | null) => {
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
});

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

export const findNearestDepartmentOrgNodeId = cache(async (orgNodeId: string | null | undefined): Promise<string | null> => {
  const departmentNode = await findNearestAncestorByType(orgNodeId, "DEPARTMENT");
  return departmentNode?.id ?? null;
});

/**
 * 批量版:一次拉取所有 orgNodeId 的祖先 + 一次拉 DEPARTMENT 类型节点,
 * 内存里为每个 orgNodeId 挑深度最小(即最近)的 DEPARTMENT 祖先。
 * 用于替代循环内 await findNearestDepartmentOrgNodeId 的 N+1 场景。
 */
export async function findNearestDepartmentOrgNodeIdsForOrgNodes(
  orgNodeIds: Array<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const uniqueIds = Array.from(new Set(orgNodeIds.filter((id): id is string => Boolean(id))));
  if (uniqueIds.length === 0) return result;

  const closureRows = await prisma.orgClosure.findMany({
    where: { descendantId: { in: uniqueIds } },
    select: { ancestorId: true, descendantId: true, depth: true },
    orderBy: { depth: "asc" },
  });

  const ancestorIds = Array.from(new Set(closureRows.map((row) => row.ancestorId)));
  if (ancestorIds.length === 0) {
    for (const id of uniqueIds) result.set(id, null);
    return result;
  }

  const departmentNodes = await prisma.orgNode.findMany({
    where: { id: { in: ancestorIds }, nodeType: "DEPARTMENT" },
    select: { id: true },
  });
  const departmentIdSet = new Set(departmentNodes.map((node) => node.id));

  for (const descendantId of uniqueIds) {
    const nearest = closureRows.find(
      (row) => row.descendantId === descendantId && departmentIdSet.has(row.ancestorId),
    );
    result.set(descendantId, nearest?.ancestorId ?? null);
  }

  return result;
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
