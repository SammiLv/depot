import { prisma } from "@/server/db/prisma";
import { getKpiWhereByScope, getUserWhereByScope } from "@/server/permissions/data-scope";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodes } from "@/server/organization/org-tree-utils";
import type { RoleType } from "@prisma/client";


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
  DRAFT: "初始化",
  PENDING_SELF_REVIEW: "自评",
  PENDING_LEADER_SCORE: "组长评",
  PENDING_MANAGER_SCORE: "主管评",
  PENDING_FINAL_REVIEW: "终审",
  COMPLETED: "已完成",
};

const stageOrder = [
  "DRAFT",
  "PENDING_SELF_REVIEW",
  "PENDING_LEADER_SCORE",
  "PENDING_MANAGER_SCORE",
  "PENDING_FINAL_REVIEW",
  "COMPLETED",
];

function getKpiTone(status: string): "default" | "primary" | "info" | "success" | "warning" {
  return status === "COMPLETED" ? "success"
    : status.includes("SCORE") ? "info"
    : status.includes("REVIEW") ? "info"
    : status.includes("PENDING") ? "warning"
    : "default";
}

function getKpiListStageLabel(status: string) {
  if (status === "DRAFT" || status === "PENDING_SELF_REVIEW") {
    return "自评";
  }
  if (status === "PENDING_LEADER_SCORE") {
    return "组长评";
  }
  if (status === "PENDING_MANAGER_SCORE") {
    return "主管评";
  }
  if (status === "PENDING_FINAL_REVIEW") {
    return "终审";
  }
  if (status === "COMPLETED") {
    return "已完成";
  }
  return status;
}

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

export async function getPersonalKpiDetail(currentUser: DataScopeInput, personalKpiId: string) {
  const where = await getKpiWhereByScope(currentUser);
  const personalKpi = await prisma.personalKpi.findFirst({
    where: {
      ...where,
      id: personalKpiId,
    },
    select: {
      id: true,
      year: true,
      quarter: true,
      userId: true,
      orgNodeId: true,
      status: true,
      selfScore: true,
      leaderScore: true,
      managerScore: true,
      finalScore: true,
      selfComment: true,
      leaderComment: true,
      managerComment: true,
      initializedAt: true,
    },
  });

  if (!personalKpi) {
    throw new Error("季度 KPI 不存在或无权限查看");
  }

  const [user, items, orgNodes] = await Promise.all([
    prisma.user.findFirst({
      where: { id: personalKpi.userId },
      select: { id: true, name: true, title: true, orgNodeId: true },
    }),
    prisma.personalKpiItem.findMany({
      where: { personalKpiId: personalKpi.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        score: true,
        scoringStandard: true,
        target: true,
        selfScore: true,
        leaderScore: true,
        managerScore: true,
        finalScore: true,
        selfComment: true,
        leaderComment: true,
        managerComment: true,
        sortOrder: true,
      },
    }),
    prisma.orgNode.findMany({
      where: { nodeType: { in: ["DEPARTMENT", "TEAM"] } },
      select: { id: true, name: true, nodeType: true, parentId: true },
    }),
  ]);

  const orgNodeMap = new Map(
    orgNodes
      .filter((orgNode): orgNode is OrgNodeSummary => orgNode.nodeType === "DEPARTMENT" || orgNode.nodeType === "TEAM")
      .map((orgNode) => [orgNode.id, orgNode] as const)
  );
  const departmentOrgNodeIdByTeamOrgNodeId = new Map<string, string>();
  for (const orgNode of orgNodes) {
    if (orgNode.nodeType === "TEAM" && orgNode.parentId) {
      const parentNode = orgNodeMap.get(orgNode.parentId);
      if (parentNode?.nodeType === "DEPARTMENT") {
        departmentOrgNodeIdByTeamOrgNodeId.set(orgNode.id, parentNode.id);
      }
    }
  }

  const teamOrgNodeId = getTeamOrgNodeIdForRecord(user?.orgNodeId ?? personalKpi.orgNodeId, orgNodeMap);
  const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(
    user?.orgNodeId ?? personalKpi.orgNodeId,
    orgNodeMap,
    departmentOrgNodeIdByTeamOrgNodeId,
  );
  const teamName = teamOrgNodeId ? (orgNodeMap.get(teamOrgNodeId)?.name ?? "—") : "—";
  const departmentName = departmentOrgNodeId ? (orgNodeMap.get(departmentOrgNodeId)?.name ?? "—") : "—";
  const tone = getKpiTone(personalKpi.status);
    const completedStageIndex = stageOrder.includes(personalKpi.status)
      ? stageOrder.indexOf(personalKpi.status)
      : 0;
  const stages = stageOrder.map((stage, index) => ({
    key: stage,
    label: stageLabels[stage] ?? stage,
    count: index <= completedStageIndex ? 1 : 0,
    active: index === completedStageIndex,
    completed: index < completedStageIndex,
  }));
  const scoreTotal = items.reduce((sum, item) => sum + item.score, 0);
  const selfPenaltyTotal = items.reduce((sum, item) => sum + Math.abs(Math.min(item.selfScore ?? 0, 0)), 0);
  const leaderPenaltyTotal = items.reduce((sum, item) => sum + Math.abs(Math.min(item.leaderScore ?? 0, 0)), 0);
  const managerPenaltyTotal = items.reduce((sum, item) => sum + Math.abs(Math.min(item.managerScore ?? 0, 0)), 0);
  const selfTotal = scoreTotal - selfPenaltyTotal;
  const leaderTotal = scoreTotal - leaderPenaltyTotal;
  const managerTotal = scoreTotal - managerPenaltyTotal;
  const attendanceScore = personalKpi.finalScore !== null && personalKpi.managerScore !== null
    ? personalKpi.finalScore - personalKpi.managerScore
    : 0;
  const finalTotal = managerTotal + attendanceScore;

  return {
    id: personalKpi.id,
    year: personalKpi.year,
    quarter: personalKpi.quarter,
    status: stageLabels[personalKpi.status] ?? personalKpi.status,
    tone,
    stages,
    basicInfo: {
      department: departmentName,
      team: teamName,
      name: user?.name ?? "—",
      title: user?.title ?? "—",
      quarterLabel: `${personalKpi.year} Q${personalKpi.quarter}`,
    },
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      scoringStandard: item.scoringStandard || item.description || "—",
      targetDetail: item.target || item.selfComment || "",
      score: item.score,
      selfScore: item.selfScore ?? 0,
      leaderScore: item.leaderScore ?? 0,
      managerScore: item.managerScore ?? 0,
    })),
    totals: {
      scoreTotal,
      selfTotal,
      leaderTotal,
      managerTotal,
      attendanceScore,
      finalTotal,
    },
    summary: {
      workSummary: personalKpi.selfComment ?? "",
      abilitySummary: "",
      praise: personalKpi.leaderComment ?? "",
      opportunity: personalKpi.managerComment ?? "",
      crossDepartment: {
        department: "",
        praise: "",
        opportunity: "",
        complaint: "",
      },
    },
  };
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
    const tone = getKpiTone(k.status);
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(user?.orgNodeId, orgNodeMap);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(user?.orgNodeId, orgNodeMap, departmentOrgNodeIdByTeamOrgNodeId);
    const teamNode = teamOrgNodeId ? orgNodeMap.get(teamOrgNodeId) : null;

    return {
      id: k.id,
      userName: user?.name ?? "—",
      teamName: teamNode?.name ?? "—",
      teamOrgNodeId,
      departmentOrgNodeId,
      stageKey: k.status,
      status: getKpiListStageLabel(k.status),
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
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          name: true,
          description: true,
          createdById: true,
          updatedById: true,
          departmentOrgNodeId: true,
          isActive: true,
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
    { label: "初始化", count: stageCounts.DRAFT ?? 0 },
    { label: "自评", count: stageCounts.PENDING_SELF_REVIEW ?? 0 },
    { label: "组长评", count: stageCounts.PENDING_LEADER_SCORE ?? 0 },
    { label: "主管评", count: stageCounts.PENDING_MANAGER_SCORE ?? 0 },
    { label: "终审", count: stageCounts.PENDING_FINAL_REVIEW ?? 0 },
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
      isActive: template.isActive,
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
