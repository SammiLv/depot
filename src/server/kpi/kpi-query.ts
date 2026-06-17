import { prisma } from "@/server/db/prisma";
import { getKpiWhereByScope, getUserWhereByScope } from "@/server/permissions/data-scope";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodes } from "@/server/organization/org-tree-utils";
import type { KpiTemplateAssignmentTargetType, RoleType } from "@prisma/client";


type DataScopeInput = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

type OrgNodeSummary = {
  id: string;
  name: string;
  nodeType: "DEPARTMENT" | "TEAM";
  parentId: string | null;
};

const stageLabels: Record<string, string> = {
  DRAFT: "待自评",
  PENDING_SELF_REVIEW: "自评中",
  PENDING_LEADER_SCORE: "组长评",
  PENDING_MANAGER_SCORE: "主管评",
  COMPLETED: "已完成",
};

const stageOrder = [
  "DRAFT",
  "PENDING_SELF_REVIEW",
  "PENDING_LEADER_SCORE",
  "PENDING_MANAGER_SCORE",
  "COMPLETED",
];

function getDepartmentOrgNodeIdForRecord(
  orgNodeId: string | null | undefined,
  orgNodeById: Map<string, OrgNodeSummary>,
  departmentOrgNodeIdByTeamOrgNodeId: Map<string, string>,
) {
  if (!orgNodeId) {
    return null;
  }
  const node = orgNodeById.get(orgNodeId) ?? null;
  if (!node) {
    return null;
  }
  if (node.nodeType === "DEPARTMENT") {
    return node.id;
  }
  if (node.nodeType === "TEAM") {
    return departmentOrgNodeIdByTeamOrgNodeId.get(node.id) ?? null;
  }
  return null;
}

function getTeamOrgNodeIdForRecord(orgNodeId: string | null | undefined, orgNodeById: Map<string, OrgNodeSummary>) {
  if (!orgNodeId) {
    return null;
  }
  const node = orgNodeById.get(orgNodeId) ?? null;
  return node?.nodeType === "TEAM" ? node.id : null;
}

export async function getKpiData(currentUser: DataScopeInput) {
  const where = await getKpiWhereByScope(currentUser);
  const userWhere = await getUserWhereByScope(currentUser);
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;

  const scopedDepartmentOrgNodeId = await findNearestDepartmentOrgNodeId(currentUser.orgNodeId);
  const departments = currentUser.roleType === "ADMIN"
    ? await prisma.orgNode.findMany({
        where: { nodeType: "DEPARTMENT" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : await getDescendantOrgNodes(scopedDepartmentOrgNodeId, "DEPARTMENT");
  const defaultDepartmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? (departments[0]?.id ?? "")
    : (scopedDepartmentOrgNodeId ?? departments[0]?.id ?? "");

  const kpis = await prisma.personalKpi.findMany({
    where,
    orderBy: [{ year: "desc" }, { quarter: "desc" }, { createdAt: "desc" }],
  });

  const kpiIds = kpis.map((k) => k.id);
  const allItems = kpiIds.length
    ? await prisma.personalKpiItem.findMany({ where: { personalKpiId: { in: kpiIds } } })
    : [];
  const itemsByKpi = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const list = itemsByKpi.get(item.personalKpiId) ?? [];
    list.push(item);
    itemsByKpi.set(item.personalKpiId, list);
  }

  const users = await prisma.user.findMany({
    where: {
      ...userWhere,
      isActive: true,
    },
    select: { id: true, name: true, orgNodeId: true, roleType: true },
    orderBy: { name: "asc" },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const orgNodeIds = [...new Set(users.map((user) => user.orgNodeId).filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId)))];
  const orgNodes = orgNodeIds.length
    ? await prisma.orgNode.findMany({ where: { id: { in: orgNodeIds } }, select: { id: true, name: true, nodeType: true, parentId: true } })
    : [];
  const scopedOrgNodes = orgNodes.filter(
    (orgNode): orgNode is OrgNodeSummary => orgNode.nodeType === "DEPARTMENT" || orgNode.nodeType === "TEAM"
  );
  const orgNodeMap = new Map(scopedOrgNodes.map((orgNode) => [orgNode.id, orgNode] as const));
  const departmentOrgNodeIdByTeamOrgNodeId = new Map<string, string>();
  for (const orgNode of scopedOrgNodes) {
    if (orgNode.nodeType === "TEAM" && orgNode.parentId) {
      const parentNode = orgNodeMap.get(orgNode.parentId);
      if (parentNode?.nodeType === "DEPARTMENT") {
        departmentOrgNodeIdByTeamOrgNodeId.set(orgNode.id, parentNode.id);
      }
    }
  }

  const stageCounts: Record<string, number> = {};
  for (const s of stageOrder) {
    stageCounts[s] = kpis.filter((k) => k.status === s).length;
  }

  const rows = kpis.map((k) => {
    const user = userMap.get(k.userId);
    const items = itemsByKpi.get(k.id) ?? [];
    const progress = k.status === "COMPLETED" ? 100
      : items.length > 0 ? Math.round((items.filter((i) => i.selfScore !== null).length / items.length) * 100)
      : 0;
    const tone: "default" | "primary" | "info" | "success" | "warning" =
      k.status === "COMPLETED" ? "success"
      : k.status.includes("SCORE") ? "info"
      : k.status.includes("REVIEW") ? "info"
      : k.status.includes("PENDING") ? "warning"
      : "default";
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(user?.orgNodeId, orgNodeMap);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(user?.orgNodeId, orgNodeMap, departmentOrgNodeIdByTeamOrgNodeId);
    const teamNode = teamOrgNodeId ? orgNodeMap.get(teamOrgNodeId) : null;

    return {
      id: k.id,
      userName: user?.name ?? "—",
      teamName: teamNode?.name ?? "—",
      teamOrgNodeId,
      departmentOrgNodeId,
      status: stageLabels[k.status] ?? k.status,
      tone,
      score: k.finalScore?.toString() ?? "—",
      progress,
      itemCount: items.length,
    };
  });

  const templateDepartmentIds = currentUser.roleType === "ADMIN"
    ? departments.map((department) => department.id)
    : defaultDepartmentOrgNodeId ? [defaultDepartmentOrgNodeId] : [];
  const templates = templateDepartmentIds.length
    ? await prisma.kpiTemplate.findMany({
        where: {
          deletedAt: null,
          departmentOrgNodeId: { in: templateDepartmentIds },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          description: true,
          createdById: true,
          updatedById: true,
          departmentOrgNodeId: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    : [];
  const templateItems = templates.length
    ? await prisma.kpiTemplateItem.findMany({
        where: { templateId: { in: templates.map((template) => template.id) } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          templateId: true,
          name: true,
          description: true,
          score: true,
          scoringStandard: true,
          sortOrder: true,
        },
      })
    : [];
  const templateItemsByTemplateId = new Map<string, typeof templateItems>();
  for (const item of templateItems) {
    const items = templateItemsByTemplateId.get(item.templateId) ?? [];
    items.push(item);
    templateItemsByTemplateId.set(item.templateId, items);
  }
  const templateAssignments = templates.length
    ? await prisma.kpiTemplateAssignment.findMany({
        where: { templateId: { in: templates.map((template) => template.id) }, isActive: true },
        select: {
          templateId: true,
          targetType: true,
          targetUserId: true,
          targetOrgNodeId: true,
        },
      })
    : [];
  const templateAssignmentsByTemplateId = new Map<string, typeof templateAssignments>();
  for (const assignment of templateAssignments) {
    const items = templateAssignmentsByTemplateId.get(assignment.templateId) ?? [];
    items.push(assignment);
    templateAssignmentsByTemplateId.set(assignment.templateId, items);
  }
  const templateUserIds = [...new Set([
    ...templates.flatMap((template) => [template.createdById, template.updatedById].filter((id): id is string => Boolean(id))),
    ...templateAssignments.flatMap((assignment) => assignment.targetUserId ? [assignment.targetUserId] : []),
  ])];
  const templateUsers = templateUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: templateUserIds } },
        select: { id: true, name: true },
      })
    : [];
  const templateUserById = new Map(templateUsers.map((user) => [user.id, user.name] as const));
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name] as const));

  const stages = [
    { label: "待自评", count: stageCounts.DRAFT ?? 0 },
    { label: "自评中", count: stageCounts.PENDING_SELF_REVIEW ?? 0 },
    { label: "组长评", count: stageCounts.PENDING_LEADER_SCORE ?? 0 },
    { label: "主管评", count: stageCounts.PENDING_MANAGER_SCORE ?? 0 },
    { label: "已完成", count: stageCounts.COMPLETED ?? 0 },
  ];

  const teamOptions = scopedOrgNodes
    .filter((orgNode) => orgNode.nodeType === "TEAM")
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .map((orgNode) => ({
      id: orgNode.id,
      name: orgNode.name,
      departmentOrgNodeId: departmentOrgNodeIdByTeamOrgNodeId.get(orgNode.id) ?? null,
    }));

  const teamNameById = new Map(teamOptions.map((team) => [team.id, team.name] as const));
  const memberNameById = new Map(users.map((user) => [user.id, user.name] as const));

  return {
    year,
    quarter,
    rows,
    stages,
    totalCount: kpis.length,
    memberOptions: users.map((user) => ({
      id: user.id,
      name: user.name,
      orgNodeId: user.orgNodeId,
      roleType: user.roleType,
    })),
    teamOptions,
    departmentOptions: departments.map((department) => ({
      id: department.id,
      name: department.name,
    })),
    defaultDepartmentOrgNodeId,
    canSelectAnyDepartment: currentUser.roleType === "ADMIN",
    templateRows: templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      createdByName: templateUserById.get(template.createdById) ?? "—",
      updatedByName: template.updatedById ? (templateUserById.get(template.updatedById) ?? "—") : "—",
      scopeName: (() => {
        const assignments = templateAssignmentsByTemplateId.get(template.id) ?? [];
        const labels = assignments.map((assignment) => {
          if (assignment.targetType === "ORG_NODE") {
            return assignment.targetOrgNodeId ? (teamNameById.get(assignment.targetOrgNodeId) ?? departmentNameById.get(assignment.targetOrgNodeId) ?? "—") : "—";
          }
          if (assignment.targetType === "USER") {
            return assignment.targetUserId ? (memberNameById.get(assignment.targetUserId) ?? "—") : "—";
          }
          return "—";
        }).filter((label, index, list) => label !== "—" && list.indexOf(label) === index);
        return labels.length ? labels.join("、") : "—";
      })(),
      scopeTeamIds: (() => {
        const assignments = templateAssignmentsByTemplateId.get(template.id) ?? [];
        return [...new Set(assignments
          .filter((assignment) => assignment.targetType === "ORG_NODE" && assignment.targetOrgNodeId)
          .map((assignment) => assignment.targetOrgNodeId as string))];
      })(),
      scopeUserIds: (() => {
        const assignments = templateAssignmentsByTemplateId.get(template.id) ?? [];
        return [...new Set(assignments
          .filter((assignment) => assignment.targetType === "USER" && assignment.targetUserId)
          .map((assignment) => assignment.targetUserId as string))];
      })(),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      departmentOrgNodeId: template.departmentOrgNodeId,
      items: (templateItemsByTemplateId.get(template.id) ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        score: item.score,
        scoringStandard: item.scoringStandard,
        sortOrder: item.sortOrder,
      })),
    })),
  };
}
