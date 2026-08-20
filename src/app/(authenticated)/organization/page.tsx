import { requireCurrentUser } from "@/server/auth/current-user";
import type { OrgPermissionAbilityKey } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/prisma";
import { ensureAnnualGoalPermissions } from "@/server/organization/annual-goal-permissions";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { getActivePermissionGrants } from "@/server/permissions/permission-query";
import {
  kpiAbilityKeys,
  kpiOrdinaryPermissionAbilityKeys,
  notificationAbilityKeys,
  notificationOrdinaryPermissionAbilityKeys,
  productManagementAbilityKeys,
  productManagementOrdinaryPermissionAbilityKeys,
  orgPermissionModuleKeys,
} from "@/server/permissions/permission-constants";
import { getUserWhereByScope } from "@/server/permissions/data-scope";
import { OrgContent } from "./content";

type OrgTeamPayload = {
  orgNodeId: string;
  departmentOrgNodeId: string;
  parentOrgNodeId: string;
  parentName: string;
  name: string;
  leaderId: string | null;
  description: string | null;
};

type KpiUserPermissionGrantView = {
  id: string;
  userId: string;
  userName: string;
  abilityKey: string;
  abilityName: string;
  scopeType: "SELF" | "NODE" | "SUBTREE" | "ALL";
  orgNodeId: string | null;
  orgNodeName: string | null;
};

export type OrganizationPersonNode = {
  id: string;
  nodeType: "PERSON";
  name: string;
  email: string | null;
  mobile: string | null;
  title: string | null;
  roleType: "ADMIN" | "DEPARTMENT_MANAGER" | "TEAM_LEADER" | "MEMBER";
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  isActive: boolean;
};

export type OrganizationEntityNode = {
  id: string;
  nodeType: "DEPARTMENT" | "TEAM";
  name: string;
  parentOrgNodeId: string | null;
  departmentOrgNodeId: string;
  leaderId: string | null;
  leaderName: string | null;
  directMemberCount: number;
  children: OrganizationHierarchyNode[];
  team: OrgTeamPayload | null;
};

export type OrganizationHierarchyNode = OrganizationEntityNode | OrganizationPersonNode;


const roleTypes = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"] as const;
const COMPANY_ORG_NAME = "锐竞信息";

export default async function OrgPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  if (Object.keys(params).length > 0) {
    redirect("/organization");
  }
  const currentUser = await requireCurrentUser();
  const canManageUsers = currentUser.roleType === "ADMIN" || currentUser.roleType === "DEPARTMENT_MANAGER";
  const canManageTeams = canManageUsers;
  const canManageRolePermissions = currentUser.roleType === "ADMIN" || currentUser.roleType === "DEPARTMENT_MANAGER";
  const scopedOrgNodeIds = currentUser.roleType === "ADMIN"
    ? null
    : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);

  const [users, orgNodes, menus, annualGoalPermissions, kpiPermissionGrants, kpiUserPermissionGrantRows, notificationPermissionGrants, productManagementPermissionGrants] = await Promise.all([
    prisma.user.findMany({
      where: { ...(await getUserWhereByScope(currentUser)), isActive: true },
      orderBy: [{ roleType: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        roleType: true,
        title: true,
        isActive: true,
        orgNodeId: true,
      },
    }),
    prisma.orgNode.findMany({
      where: scopedOrgNodeIds === null
        ? { nodeType: { in: ["DEPARTMENT", "TEAM"] } }
        : { id: { in: scopedOrgNodeIds }, nodeType: { in: ["DEPARTMENT", "TEAM"] } },
      orderBy: [{ nodeType: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nodeType: true, parentId: true },
    }),
    prisma.menuPermission.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    }),
    (async () => {
      await ensureAnnualGoalPermissions();
      return prisma.annualGoalPermission.findMany({ orderBy: { sortOrder: "asc" } });
    })(),
    getActivePermissionGrants(orgPermissionModuleKeys.kpi, Object.values(kpiAbilityKeys), [...roleTypes]),
    prisma.orgPermissionGrant.findMany({
      where: {
        moduleKey: orgPermissionModuleKeys.kpi,
        subjectType: "USER",
        abilityKey: { in: kpiOrdinaryPermissionAbilityKeys },
        isActive: true,
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        userId: true,
        abilityKey: true,
        scopeType: true,
        orgNodeId: true,
      },
    }),
    getActivePermissionGrants(
      orgPermissionModuleKeys.notification,
      Object.values(notificationAbilityKeys),
      [...roleTypes],
    ),
    getActivePermissionGrants(
      orgPermissionModuleKeys.productManagement,
      Object.values(productManagementAbilityKeys),
      [...roleTypes],
    ),
  ]);

  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const rootOrgNode = await prisma.orgNode.findUnique({
    where: { id: "org_root" },
    select: { id: true, name: true, nodeType: true, parentId: true },
  }) ?? await prisma.orgNode.findFirst({
    where: { nodeType: "ROOT" },
    select: { id: true, name: true, nodeType: true, parentId: true },
  });
  const departmentById = new Map(orgNodes.filter((node) => node.nodeType === "DEPARTMENT").map((node) => [node.id, node]));
  const nearestDepartmentOrgNodeIdByNodeId = new Map<string, string | null>();

  await Promise.all(orgNodes.map(async (node) => {
    nearestDepartmentOrgNodeIdByNodeId.set(node.id, await findNearestDepartmentOrgNodeId(node.id));
  }));

  const departments = orgNodes
    .filter((node) => node.nodeType === "DEPARTMENT")
    .map((node) => {
      const manager = users.find((user) => user.roleType === "DEPARTMENT_MANAGER" && user.orgNodeId === node.id) ?? null;
      return {
        orgNodeId: node.id,
        name: node.name,
        managerId: manager?.id ?? null,
        managerName: manager?.name ?? null,
      };
    });

  const teams = orgNodes
    .filter((node) => node.nodeType === "TEAM")
    .map((node) => {
      const leader = users.find((user) => user.roleType === "TEAM_LEADER" && user.orgNodeId === node.id) ?? null;
      const departmentOrgNodeId = nearestDepartmentOrgNodeIdByNodeId.get(node.id) ?? null;
      const parentNode = node.parentId ? orgNodeById.get(node.parentId) ?? null : null;
      return departmentOrgNodeId && parentNode ? {
        orgNodeId: node.id,
        departmentOrgNodeId,
        parentOrgNodeId: parentNode.id,
        parentName: parentNode.name,
        name: node.name,
        leaderId: leader?.id ?? null,
        description: null,
      } : null;
    })
    .filter((team): team is { orgNodeId: string; departmentOrgNodeId: string; parentOrgNodeId: string; parentName: string; name: string; leaderId: string | null; description: null } => Boolean(team));

  const mappedUsers = users.map((user) => {
    const orgNode = user.orgNodeId ? orgNodeById.get(user.orgNodeId) ?? null : null;
    const departmentOrgNodeId = user.orgNodeId ? (nearestDepartmentOrgNodeIdByNodeId.get(user.orgNodeId) ?? null) : null;
    const teamOrgNodeId = orgNode?.nodeType === "TEAM" ? orgNode.id : null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      roleType: user.roleType,
      departmentOrgNodeId,
      teamOrgNodeId,
      title: user.title,
      isActive: user.isActive,
    };
  });

  const teamData = teams.map((team) => {
    const teamUsers = mappedUsers.filter((user) => user.teamOrgNodeId === team.orgNodeId && user.isActive);
    const leader = teamUsers.find((user) => user.roleType === "TEAM_LEADER") ?? null;
    return { teamOrgNodeId: team.orgNodeId, count: teamUsers.length, leaderName: leader?.name };
  });

  const teamParentOptions = [
    ...departments.map((department) => ({
      orgNodeId: department.orgNodeId,
      name: department.name,
      nodeType: "DEPARTMENT" as const,
      departmentOrgNodeId: department.orgNodeId,
    })),
    ...teams.map((team) => ({
      orgNodeId: team.orgNodeId,
      name: team.name,
      nodeType: "TEAM" as const,
      departmentOrgNodeId: team.departmentOrgNodeId,
    })),
  ];

  const currentOrgNode = currentUser.orgNodeId ? orgNodeById.get(currentUser.orgNodeId) ?? null : null;
  const currentDepartmentOrgNodeId = currentUser.orgNodeId
    ? (nearestDepartmentOrgNodeIdByNodeId.get(currentUser.orgNodeId) ?? null)
    : null;
  const department = departments.find((item) => item.orgNodeId === currentDepartmentOrgNodeId) ?? departments[0] ?? null;
  const defaultScope = currentUser.roleType === "ADMIN"
    ? { scopeType: "SYSTEM" as const, departmentOrgNodeId: "" }
    : { scopeType: "DEPARTMENT" as const, departmentOrgNodeId: currentDepartmentOrgNodeId ?? department?.orgNodeId ?? "" };
  const initialScope = defaultScope;
  const scopeOptions = currentUser.roleType === "ADMIN"
    ? [
        { scopeType: "SYSTEM" as const, departmentOrgNodeId: "", label: "全部" },
        ...departments.map((item) => ({
          scopeType: "DEPARTMENT" as const,
          departmentOrgNodeId: item.orgNodeId,
          label: item.name,
        })),
      ]
    : currentDepartmentOrgNodeId
      ? [{
          scopeType: "DEPARTMENT" as const,
          departmentOrgNodeId: currentDepartmentOrgNodeId,
          label: departments.find((item) => item.orgNodeId === currentDepartmentOrgNodeId)?.name ?? "当前部门",
        }]
      : [];

  const roleMenuRows = await prisma.roleMenuPermission.findMany({
    where: { roleType: { in: [...roleTypes] } },
  });
  const roleMenuMap = new Map(roleMenuRows.map((row) => [`${row.scopeType}:${row.departmentOrgNodeId}:${row.roleType}:${row.menuPermissionId}`, row]));
  const buildRoleMenuMatrix = (scope: { scopeType: "SYSTEM" | "DEPARTMENT"; departmentOrgNodeId: string }) => menus.map((menu) => ({
    id: menu.id,
    code: menu.code,
    name: menu.name,
    path: menu.path,
    cells: Object.fromEntries(roleTypes.map((roleType) => {
      const systemRow = roleMenuMap.get(`SYSTEM::${roleType}:${menu.id}`);
      const scopedRow = scope.scopeType === "DEPARTMENT"
        ? roleMenuMap.get(`DEPARTMENT:${scope.departmentOrgNodeId}:${roleType}:${menu.id}`)
        : undefined;
      const sourceRow = scopedRow ?? systemRow;
      const allowed = sourceRow?.allowed ?? false;
      return [roleType, {
        allowed,
        source: scopedRow ? "DEPARTMENT" : "SYSTEM",
        explicit: Boolean(scopedRow || (scope.scopeType === "SYSTEM" && systemRow)),
        inherited: scope.scopeType === "DEPARTMENT" && !scopedRow,
      }];
    })) as Record<(typeof roleTypes)[number], { allowed: boolean; source: "SYSTEM" | "DEPARTMENT"; explicit: boolean; inherited: boolean }>,
  }));

  const annualGoalMatrixRows = await prisma.roleAnnualGoalPermission.findMany({
    where: { roleType: { in: [...roleTypes] } },
  });
  const annualGoalMatrixMap = new Map(annualGoalMatrixRows.map((row) => [`${row.scopeType}:${row.departmentOrgNodeId}:${row.roleType}:${row.annualGoalPermissionId}`, row]));
  const buildAnnualGoalMatrix = (scope: { scopeType: "SYSTEM" | "DEPARTMENT"; departmentOrgNodeId: string }) => annualGoalPermissions.map((permission) => ({
    id: permission.id,
    code: permission.code,
    name: permission.name,
    description: permission.description,
    cells: Object.fromEntries(roleTypes.map((roleType) => {
      const systemRow = annualGoalMatrixMap.get(`SYSTEM::${roleType}:${permission.id}`);
      const scopedRow = scope.scopeType === "DEPARTMENT"
        ? annualGoalMatrixMap.get(`DEPARTMENT:${scope.departmentOrgNodeId}:${roleType}:${permission.id}`)
        : undefined;
      const sourceRow = scopedRow ?? systemRow;
      const allowed = sourceRow?.allowed ?? false;
      return [roleType, {
        allowed,
        source: scopedRow ? "DEPARTMENT" : "SYSTEM",
        explicit: Boolean(scopedRow || (scope.scopeType === "SYSTEM" && systemRow)),
        inherited: scope.scopeType === "DEPARTMENT" && !scopedRow,
      }];
    })) as Record<(typeof roleTypes)[number], { allowed: boolean; source: "SYSTEM" | "DEPARTMENT"; explicit: boolean; inherited: boolean }>,
  }));

  const kpiPermissionPresentation: Partial<Record<OrgPermissionAbilityKey, { name: string; description: string }>> = {
    VIEW_KPI: {
      name: "查看 KPI",
      description: "允许查看 KPI 列表与详情。",
    },
    INITIALIZE_KPI: {
      name: "维护KPI",
      description: "允许维护季度 KPI，包括初始化与删除个人 KPI。",
    },
    VIEW_KPI_TEMPLATE: {
      name: "查看 KPI 模板",
      description: "允许查看 KPI 模板列表与适用范围。",
    },
    MANAGE_KPI_TEMPLATE: {
      name: "维护 KPI 模板",
      description: "允许新建、编辑 KPI 模板内容。",
    },
    TOGGLE_KPI_TEMPLATE: {
      name: "启用/禁用 KPI 模板",
      description: "允许启用或禁用 KPI 模板。",
    },
    SCORE_SELF: {
      name: "自评",
      description: "允许执行 KPI 自评。",
    },
    SCORE_LEADER: {
      name: "组长评分",
      description: "允许执行 KPI 组长评分。",
    },
    SCORE_MANAGER: {
      name: "主管评分",
      description: "允许执行 KPI 主管评分。",
    },
    SCORE_FINAL: {
      name: "终审",
      description: "允许执行 KPI 终审。",
    },
    MANAGE_BUSINESS_ASSESSMENT: {
      name: "维护业务考核",
      description: "允许在 KPI 管理中创建、编辑、导入和删除业务考核批次及结果。",
    },
    MANAGE_WORK_INCIDENT: {
      name: "维护工作事故",
      description: "允许在 KPI 管理中录入、作废工作事故记录。",
    },
  };

  const notificationPermissionPresentation = {
    MANAGE_NOTIFICATION_SCENARIO: {
      name: "管理通知场景",
      description: "允许在通知中心配置、启停与测试通知场景（全系统共享）。",
    },
  } as const;

  const productManagementPermissionPresentation = {
    MANAGE_PRODUCT_GOAL: {
      name: "管理产品目标",
      description: "允许创建、编辑与删除产品目标。",
    },
    MANAGE_PROJECT_AND_VALUE_TRACKING: {
      name: "管理项目与需求价值跟踪",
      description: "允许维护项目、项目价值判定及需求价值跟踪记录。",
    },
    MANAGE_PRODUCT_TASK: {
      name: "管理任务",
      description: "允许创建、编辑与删除季度任务及任务看板内容。",
    },
  } as const;

  const productManagementPermissionMap = new Map(productManagementPermissionGrants
    .filter((row) => row.subjectType === "ROLE")
    .map((row) => [`${row.scopeType}:${row.orgNodeId ?? ""}:${row.roleType}:${row.abilityKey}`, row]));
  const buildProductManagementPermissions = (scope: { scopeType: "SYSTEM" | "DEPARTMENT"; departmentOrgNodeId: string }) => (
    productManagementOrdinaryPermissionAbilityKeys.map((abilityKey) => {
      const presentation = productManagementPermissionPresentation[
        abilityKey as keyof typeof productManagementPermissionPresentation
      ];
      return {
        id: abilityKey,
        code: abilityKey,
        name: presentation.name,
        description: presentation.description,
        cells: Object.fromEntries(roleTypes.map((roleType) => {
          const scopeByRole = roleType === "ADMIN" ? "ALL" : roleType === "DEPARTMENT_MANAGER" ? "SUBTREE" : roleType === "TEAM_LEADER" ? "NODE" : "SELF";
          const systemRow = productManagementPermissionMap.get(`${scopeByRole}:${""}:${roleType}:${abilityKey}`);
          const scopedOrgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : "";
          const scopedRow = scopedOrgNodeId
            ? productManagementPermissionMap.get(`${scopeByRole}:${scopedOrgNodeId}:${roleType}:${abilityKey}`)
            : undefined;
          const sourceRow = scopedRow ?? systemRow;
          const allowed = Boolean(sourceRow);
          return [roleType, {
            allowed,
            source: scopedRow ? "DEPARTMENT" : "SYSTEM",
            explicit: Boolean(scopedRow || (scope.scopeType === "SYSTEM" && systemRow)),
            inherited: scope.scopeType === "DEPARTMENT" && !scopedRow,
          }];
        })) as Record<(typeof roleTypes)[number], { allowed: boolean; source: "SYSTEM" | "DEPARTMENT"; explicit: boolean; inherited: boolean }>,
      };
    })
  );

  const notificationPermissionMap = new Map(notificationPermissionGrants
    .filter((row) => row.subjectType === "ROLE")
    .map((row) => [`${row.scopeType}:${row.orgNodeId ?? ""}:${row.roleType}:${row.abilityKey}`, row]));
  const notificationScopeByRole = {
    ADMIN: "ALL",
    DEPARTMENT_MANAGER: "SUBTREE",
    TEAM_LEADER: "NODE",
    MEMBER: "SELF",
  } as const;
  const buildNotificationPermissions = (scope: { scopeType: "SYSTEM" | "DEPARTMENT"; departmentOrgNodeId: string }) => (
    notificationOrdinaryPermissionAbilityKeys.map((abilityKey) => {
      const presentation = notificationPermissionPresentation[
        abilityKey as keyof typeof notificationPermissionPresentation
      ];
      return {
        id: abilityKey,
        code: abilityKey,
        name: presentation.name,
        description: presentation.description,
        cells: Object.fromEntries(roleTypes.map((roleType) => {
          const systemRow = notificationPermissionMap.get(`ALL::${roleType}:${abilityKey}`);
          const scopedOrgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : "";
          const scopedRow = scopedOrgNodeId
            ? notificationPermissionMap.get(`${notificationScopeByRole[roleType]}:${scopedOrgNodeId}:${roleType}:${abilityKey}`)
            : undefined;
          const sourceRow = scopedRow ?? systemRow;
          const allowed = Boolean(sourceRow);
          return [roleType, {
            allowed,
            source: scopedRow ? "DEPARTMENT" : "SYSTEM",
            explicit: Boolean(scopedRow || (scope.scopeType === "SYSTEM" && systemRow)),
            inherited: scope.scopeType === "DEPARTMENT" && !scopedRow,
          }];
        })) as Record<(typeof roleTypes)[number], { allowed: boolean; source: "SYSTEM" | "DEPARTMENT"; explicit: boolean; inherited: boolean }>,
      };
    })
  );

  const kpiPermissionMap = new Map(kpiPermissionGrants
    .filter((row) => row.subjectType === "ROLE")
    .map((row) => [`${row.scopeType}:${row.orgNodeId ?? ""}:${row.roleType}:${row.abilityKey}`, row]));
  const buildKpiPermissions = (scope: { scopeType: "SYSTEM" | "DEPARTMENT"; departmentOrgNodeId: string }) => kpiOrdinaryPermissionAbilityKeys.map((abilityKey) => ({
    id: abilityKey,
    code: abilityKey,
    name: kpiPermissionPresentation[abilityKey]?.name ?? abilityKey,
    description: kpiPermissionPresentation[abilityKey]?.description ?? "",
    cells: Object.fromEntries(roleTypes.map((roleType) => {
      const scopeByRole = roleType === "ADMIN" ? "ALL" : roleType === "DEPARTMENT_MANAGER" ? "SUBTREE" : roleType === "TEAM_LEADER" ? "NODE" : "SELF";
      const systemRow = kpiPermissionMap.get(`${scopeByRole}:${""}:${roleType}:${abilityKey}`);
      const scopedOrgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : "";
      const scopedRow = scopedOrgNodeId
        ? kpiPermissionMap.get(`${scopeByRole}:${scopedOrgNodeId}:${roleType}:${abilityKey}`)
        : undefined;
      const sourceRow = scopedRow ?? systemRow;
      const allowed = Boolean(sourceRow);
      return [roleType, {
        allowed,
        source: scopedRow ? "DEPARTMENT" : "SYSTEM",
        explicit: Boolean(scopedRow || (scope.scopeType === "SYSTEM" && systemRow)),
        inherited: scope.scopeType === "DEPARTMENT" && !scopedRow,
      }];
    })) as Record<(typeof roleTypes)[number], { allowed: boolean; source: "SYSTEM" | "DEPARTMENT"; explicit: boolean; inherited: boolean }>,
  }));

  type KpiUserPermissionGrantRowWithDepartment = KpiUserPermissionGrantView & {
    departmentOrgNodeId: string | null;
  };

  const kpiUserPermissionGrants = kpiUserPermissionGrantRows
    .map((row): KpiUserPermissionGrantRowWithDepartment | null => {
      const user = mappedUsers.find((item) => item.id === row.userId) ?? null;
      const orgNode = row.orgNodeId ? orgNodeById.get(row.orgNodeId) ?? null : null;
      const departmentOrgNodeId = row.orgNodeId ? (nearestDepartmentOrgNodeIdByNodeId.get(row.orgNodeId) ?? null) : null;
      if (!user || !row.userId) {
        return null;
      }
      return {
        id: row.id,
        userId: row.userId,
        userName: user.name,
        abilityKey: row.abilityKey,
        abilityName: kpiPermissionPresentation[row.abilityKey as keyof typeof kpiPermissionPresentation]?.name ?? row.abilityKey,
        scopeType: row.scopeType,
        orgNodeId: row.orgNodeId,
        orgNodeName: orgNode?.name ?? null,
        departmentOrgNodeId,
      };
    })
    .filter((grant): grant is KpiUserPermissionGrantRowWithDepartment => Boolean(grant));

  const leaderNameByTeamOrgNodeId = new Map(teamData.map((item) => [item.teamOrgNodeId, item.leaderName ?? null]));
  const directMemberCountByOrgNodeId = new Map(teamData.map((item) => [item.teamOrgNodeId, item.count]));
  const teamByOrgNodeId = new Map(teams.map((team) => [team.orgNodeId, team]));
  const childrenByParentOrgNodeId = new Map<string, typeof teams>();
  const usersByDepartmentOrgNodeId = new Map<string, typeof mappedUsers>();
  const usersByTeamOrgNodeId = new Map<string, typeof mappedUsers>();

  for (const team of teams) {
    const list = childrenByParentOrgNodeId.get(team.parentOrgNodeId) ?? [];
    list.push(team);
    childrenByParentOrgNodeId.set(team.parentOrgNodeId, list);
  }
  for (const list of childrenByParentOrgNodeId.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  }

  for (const user of mappedUsers) {
    if (!user.departmentOrgNodeId) continue;
    if (user.teamOrgNodeId) {
      const list = usersByTeamOrgNodeId.get(user.teamOrgNodeId) ?? [];
      list.push(user);
      usersByTeamOrgNodeId.set(user.teamOrgNodeId, list);
      continue;
    }

    const list = usersByDepartmentOrgNodeId.get(user.departmentOrgNodeId) ?? [];
    list.push(user);
    usersByDepartmentOrgNodeId.set(user.departmentOrgNodeId, list);
  }
  for (const list of usersByDepartmentOrgNodeId.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  }
  for (const list of usersByTeamOrgNodeId.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  }

  function buildPersonNode(user: (typeof mappedUsers)[number]): OrganizationPersonNode {
    return {
      id: user.id,
      nodeType: "PERSON",
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      title: user.title,
      roleType: user.roleType,
      departmentOrgNodeId: user.departmentOrgNodeId,
      teamOrgNodeId: user.teamOrgNodeId,
      isActive: user.isActive,
    };
  }

  function buildOrganizationEntityNode(
    node: { id: string; name: string; nodeType: "DEPARTMENT" | "TEAM"; parentId: string | null },
    departmentOrgNodeId: string,
  ): OrganizationEntityNode {
    const childTeamNodes = (childrenByParentOrgNodeId.get(node.id) ?? []).map((childTeam) =>
      buildOrganizationEntityNode(
        {
          id: childTeam.orgNodeId,
          name: childTeam.name,
          nodeType: "TEAM",
          parentId: childTeam.parentOrgNodeId,
        },
        departmentOrgNodeId,
      )
    );
    const personNodes = (node.nodeType === "DEPARTMENT"
      ? (usersByDepartmentOrgNodeId.get(node.id) ?? [])
      : (usersByTeamOrgNodeId.get(node.id) ?? [])
    ).map(buildPersonNode);

    return {
      id: node.id,
      nodeType: node.nodeType,
      name: node.name,
      parentOrgNodeId: node.parentId,
      departmentOrgNodeId,
      leaderId: node.nodeType === "TEAM" ? (teamByOrgNodeId.get(node.id)?.leaderId ?? null) : departments.find((item) => item.orgNodeId === node.id)?.managerId ?? null,
      leaderName: node.nodeType === "TEAM" ? (leaderNameByTeamOrgNodeId.get(node.id) ?? null) : departments.find((item) => item.orgNodeId === node.id)?.managerName ?? null,
      directMemberCount: node.nodeType === "TEAM"
        ? (directMemberCountByOrgNodeId.get(node.id) ?? 0)
        : mappedUsers.filter((user) => user.departmentOrgNodeId === departmentOrgNodeId).length,
      children: [...childTeamNodes, ...personNodes],
      team: node.nodeType === "TEAM" ? (teamByOrgNodeId.get(node.id) ?? null) : null,
    };
  }

  const systemOrganizationHierarchyRoot = {
        id: "company-root",
        nodeType: "DEPARTMENT" as const,
        name: COMPANY_ORG_NAME,
        parentOrgNodeId: null,
        departmentOrgNodeId: "company-root",
        leaderId: null,
        leaderName: null,
        directMemberCount: mappedUsers.length,
        children: [
          ...departments
            .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))
            .map((item) => buildOrganizationEntityNode({
              id: item.orgNodeId,
              name: item.name,
              nodeType: "DEPARTMENT",
              parentId: "company-root",
            }, item.orgNodeId)),
          ...mappedUsers.filter((user) => !user.departmentOrgNodeId).map(buildPersonNode),
        ],
        team: null,
      };

  const buildDepartmentOrganizationHierarchyRoot = (departmentItem: (typeof departments)[number]) =>
    buildOrganizationEntityNode(
      {
        id: departmentItem.orgNodeId,
        name: departmentItem.name,
        nodeType: "DEPARTMENT",
        parentId: null,
      },
      departmentItem.orgNodeId,
    );

  const approvalPolicyRows = await prisma.kpiApprovalPolicy.findMany({
    where: {
      OR: [
        { scopeType: "SYSTEM", departmentOrgNodeId: "" },
        { scopeType: "DEPARTMENT", departmentOrgNodeId: { in: departments.map((item) => item.orgNodeId) } },
      ],
    },
    orderBy: [{ scopeType: "desc" }, { isActive: "desc" }, { createdAt: "asc" }],
  });
  const approvalPolicySteps = approvalPolicyRows.length
    ? await prisma.kpiApprovalPolicyStep.findMany({
        where: { policyId: { in: approvalPolicyRows.map((policy) => policy.id) } },
        orderBy: [{ policyId: "asc" }, { stepOrder: "asc" }],
      })
    : [];
  const approvalPolicyScopeRows = approvalPolicyRows.length
    ? await prisma.kpiApprovalPolicyScope.findMany({
        where: { policyId: { in: approvalPolicyRows.map((policy) => policy.id) } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const approvalPolicyStepOrgNodeRows = approvalPolicySteps.length
    ? await prisma.kpiApprovalPolicyStepOrgNode.findMany({
        where: { policyStepId: { in: approvalPolicySteps.map((step) => step.id) } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const kpiApprovalPolicies = approvalPolicyRows.map((policy) => ({
    ...policy,
    inherited: false,
    scopeOrgNodeIds: approvalPolicyScopeRows
      .filter((row) => row.policyId === policy.id)
      .map((row) => row.orgNodeId),
    steps: approvalPolicySteps
      .filter((step) => step.policyId === policy.id)
      .map((step) => ({
        ...step,
        approvalOrgNodeIds: approvalPolicyStepOrgNodeRows
          .filter((row) => row.policyStepId === step.id)
          .map((row) => row.orgNodeId),
      })),
  }));
  const approvalOrgNodeRows = rootOrgNode
    ? [{ ...rootOrgNode, name: COMPANY_ORG_NAME }, ...orgNodes]
    : orgNodes;
  const approvalOrgNodeById = new Map(approvalOrgNodeRows.map((node) => [node.id, node]));
  const getApprovalOrgNodePath = (orgNodeId: string) => {
    const names: string[] = [];
    const visited = new Set<string>();
    let current = approvalOrgNodeById.get(orgNodeId) ?? null;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? approvalOrgNodeById.get(current.parentId) ?? null : null;
    }
    return names.join(" / ");
  };
  const approvalOrgNodes = approvalOrgNodeRows.map((node) => ({
    id: node.id,
    name: node.name,
    nodeType: node.nodeType,
    parentId: node.parentId,
    departmentOrgNodeId: node.nodeType === "ROOT"
      ? null
      : nearestDepartmentOrgNodeIdByNodeId.get(node.id) ?? null,
    path: getApprovalOrgNodePath(node.id),
  }));

  const scopesForViews = scopeOptions.length > 0
    ? scopeOptions.map(({ scopeType, departmentOrgNodeId }) => ({ scopeType, departmentOrgNodeId }))
    : [initialScope];
  const scopeViews = Object.fromEntries(scopesForViews.map((scope) => {
    const selectedDepartment = scope.scopeType === "DEPARTMENT"
      ? departments.find((item) => item.orgNodeId === scope.departmentOrgNodeId) ?? null
      : null;
    const scopedUserPermissionGrants = kpiUserPermissionGrants
      .filter((grant) => scope.scopeType === "SYSTEM"
        ? true
        : grant.scopeType !== "ALL" && grant.departmentOrgNodeId === scope.departmentOrgNodeId)
      .map(({ departmentOrgNodeId: _departmentOrgNodeId, ...grant }) => grant);
    const scopedApprovalPolicies = kpiApprovalPolicies
      .filter((policy) => scope.scopeType === "SYSTEM"
        ? policy.scopeType === "SYSTEM"
        : policy.scopeType === "SYSTEM"
          || (policy.scopeType === "DEPARTMENT" && policy.departmentOrgNodeId === scope.departmentOrgNodeId))
      .map((policy) => ({
        ...policy,
        inherited: scope.scopeType === "DEPARTMENT" && policy.scopeType === "SYSTEM",
      }));

    return [`${scope.scopeType}:${scope.departmentOrgNodeId}`, {
      department: selectedDepartment,
      organizationHierarchyRoot: scope.scopeType === "SYSTEM"
        ? systemOrganizationHierarchyRoot
        : selectedDepartment
          ? buildDepartmentOrganizationHierarchyRoot(selectedDepartment)
          : null,
      menus: buildRoleMenuMatrix(scope),
      annualGoalPermissions: buildAnnualGoalMatrix(scope),
      kpiPermissions: buildKpiPermissions(scope),
      notificationPermissions: buildNotificationPermissions(scope),
      productManagementPermissions: buildProductManagementPermissions(scope),
      kpiUserPermissionGrants: scopedUserPermissionGrants,
      kpiApprovalPolicies: scopedApprovalPolicies,
    }];
  }));

  return (
    <OrgContent
      currentUser={{ id: currentUser.id, roleType: currentUser.roleType }}
      users={mappedUsers}
      teams={teams}
      departments={departments}
      teamParentOptions={teamParentOptions}
      approvalOrgNodes={approvalOrgNodes}
      scopeOptions={scopeOptions}
      initialScope={initialScope}
      initialTab={initialScope.scopeType === "SYSTEM" ? "permissions" : "organization"}
      initialPermissionSection="menu"
      scopeViews={scopeViews}
      canManageUsers={canManageUsers}
      canManageTeams={canManageTeams}
      canManageRolePermissions={canManageRolePermissions}
      manageableRoleOptions={currentUser.roleType === "ADMIN" ? [...roleTypes] : ["DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"]}
    />
  );
}
