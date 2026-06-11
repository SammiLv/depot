import { prisma } from "@/server/db/prisma";

function extractLegacyId(orgNodeId: string, prefix: string) {
  return orgNodeId.startsWith(prefix) ? orgNodeId.slice(prefix.length) : null;
}

export function getDepartmentIdFromOrgNodeId(orgNodeId: string | null | undefined) {
  return orgNodeId?.startsWith("org_dept_") ? orgNodeId.slice("org_dept_".length) : null;
}

export function getTeamIdFromOrgNodeId(orgNodeId: string | null | undefined) {
  return orgNodeId?.startsWith("org_team_") ? orgNodeId.slice("org_team_".length) : null;
}

export function getDepartmentOrgNodeId(departmentId: string) {
  return `org_dept_${departmentId}`;
}

export function getTeamOrgNodeId(teamId: string) {
  return `org_team_${teamId}`;
}

/** Return all descendant org node IDs for the given node (includes self via depth=0). */
export async function getDescendantOrgNodeIds(orgNodeId: string | null): Promise<string[]> {
  if (!orgNodeId) return [];
  const rows = await prisma.orgClosure.findMany({
    where: { ancestorId: orgNodeId },
    select: { descendantId: true },
  });
  return rows.map((r) => r.descendantId);
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

export async function getDescendantTeamIds(orgNodeId: string | null): Promise<string[]> {
  const teamNodes = await getDescendantOrgNodes(orgNodeId, "TEAM");
  return teamNodes
    .map((node) => extractLegacyId(node.id, "org_team_"))
    .filter((value): value is string => Boolean(value));
}

export async function getDescendantDepartmentIds(orgNodeId: string | null): Promise<string[]> {
  const departmentNodes = await getDescendantOrgNodes(orgNodeId, "DEPARTMENT");
  return departmentNodes
    .map((node) => extractLegacyId(node.id, "org_dept_"))
    .filter((value): value is string => Boolean(value));
}
