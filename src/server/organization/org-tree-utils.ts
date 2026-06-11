import { prisma } from "@/server/db/prisma";

function extractTeamIdFromOrgNodeId(orgNodeId: string) {
  return orgNodeId.startsWith("org_team_") ? orgNodeId.slice("org_team_".length) : null;
}

function extractDepartmentIdFromOrgNodeId(orgNodeId: string) {
  return orgNodeId.startsWith("org_dept_") ? orgNodeId.slice("org_dept_".length) : null;
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

export async function resolveOrgNodeId(teamId: string | null, departmentId: string | null): Promise<string | null> {
  if (teamId) {
    const directTeamNode = await prisma.orgNode.findUnique({
      where: { id: `org_team_${teamId}` },
      select: { id: true },
    });
    return directTeamNode?.id ?? null;
  }

  if (departmentId) {
    const directDeptNode = await prisma.orgNode.findUnique({
      where: { id: `org_dept_${departmentId}` },
      select: { id: true },
    });
    return directDeptNode?.id ?? null;
  }

  return null;
}

export async function getDescendantTeamIds(orgNodeId: string | null): Promise<string[]> {
  const descendantIds = await getDescendantOrgNodeIds(orgNodeId);
  if (descendantIds.length === 0) return [];

  const teamNodes = await prisma.orgNode.findMany({
    where: {
      id: { in: descendantIds },
      nodeType: "TEAM",
    },
    select: { id: true },
  });

  return teamNodes
    .map((node) => extractTeamIdFromOrgNodeId(node.id))
    .filter((value): value is string => Boolean(value));
}

export async function getDescendantDepartmentIds(orgNodeId: string | null): Promise<string[]> {
  const descendantIds = await getDescendantOrgNodeIds(orgNodeId);
  if (descendantIds.length === 0) return [];

  const departmentNodes = await prisma.orgNode.findMany({
    where: {
      id: { in: descendantIds },
      nodeType: "DEPARTMENT",
    },
    select: { id: true },
  });

  return departmentNodes
    .map((node) => extractDepartmentIdFromOrgNodeId(node.id))
    .filter((value): value is string => Boolean(value));
}
