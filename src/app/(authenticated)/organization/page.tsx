import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { ensureAnnualGoalPermissions } from "@/server/organization/annual-goal-permissions";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { getActivePermissionGrants } from "@/server/permissions/permission-query";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";
import { getUserWhereByScope } from "@/server/permissions/data-scope";
import { OrgContent } from "./content";

const roleTypes = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"] as const;

export default async function OrgPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const requestedDepartment = Array.isArray(params.department) ? params.department[0] : params.department;
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const requestedSection = Array.isArray(params.section) ? params.section[0] : params.section;
  const currentUser = await requireCurrentUser();
  const canManageUsers = currentUser.roleType === "ADMIN" || currentUser.roleType === "DEPARTMENT_MANAGER";
  const canManageTeams = canManageUsers;
  const canManageRolePermissions = currentUser.roleType === "ADMIN" || currentUser.roleType === "DEPARTMENT_MANAGER";
  const scopedOrgNodeIds = currentUser.roleType === "ADMIN"
    ? null
    : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);

  const [users, orgNodes, menus, annualGoalPermissions, kpiPermissionGrants] = await Promise.all([
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
  ]);

  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const departmentById = new Map(orgNodes.filter((node) => node.nodeType === "DEPARTMENT").map((node) => [node.id, node]));

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
      return node.parentId ? {
        orgNodeId: node.id,
        departmentOrgNodeId: node.parentId,
        name: node.name,
        leaderId: leader?.id ?? null,
        description: null,
      } : null;
    })
    .filter((team): team is { orgNodeId: string; departmentOrgNodeId: string; name: string; leaderId: string | null; description: null } => Boolean(team));

  const mappedUsers = users.map((user) => {
    const orgNode = user.orgNodeId ? orgNodeById.get(user.orgNodeId) ?? null : null;
    const departmentOrgNodeId = orgNode?.nodeType === "DEPARTMENT"
      ? orgNode.id
      : orgNode?.parentId && departmentById.has(orgNode.parentId)
        ? orgNode.parentId
        : null;
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

  const currentOrgNode = currentUser.orgNodeId ? orgNodeById.get(currentUser.orgNodeId) ?? null : null;
  const currentDepartmentOrgNodeId = currentOrgNode?.nodeType === "DEPARTMENT"
    ? currentOrgNode.id
    : currentOrgNode?.parentId && departmentById.has(currentOrgNode.parentId)
      ? currentOrgNode.parentId
      : null;
  const department = departments.find((item) => item.orgNodeId === currentDepartmentOrgNodeId) ?? departments[0] ?? null;
  const defaultScope = currentUser.roleType === "ADMIN"
    ? { scopeType: "SYSTEM" as const, departmentOrgNodeId: "" }
    : { scopeType: "DEPARTMENT" as const, departmentOrgNodeId: currentDepartmentOrgNodeId ?? department?.orgNodeId ?? "" };
  const requestedScopeType = requestedScope === "SYSTEM" || requestedScope === "DEPARTMENT"
    ? requestedScope
    : defaultScope.scopeType;
  const normalizedScopeType = currentUser.roleType === "ADMIN"
    ? requestedScopeType
    : "DEPARTMENT" as const;
  const requestedDepartmentId = requestedDepartment && departments.some((item) => item.orgNodeId === requestedDepartment)
    ? requestedDepartment
    : defaultScope.departmentOrgNodeId;
  const initialScope = normalizedScopeType === "SYSTEM"
    ? { scopeType: "SYSTEM" as const, departmentOrgNodeId: "" }
    : { scopeType: "DEPARTMENT" as const, departmentOrgNodeId: requestedDepartmentId };
  const scopeOptions = currentUser.roleType === "ADMIN"
    ? [
        { scopeType: "SYSTEM" as const, departmentOrgNodeId: "", label: "系统" },
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
  const roleMenuMatrix = menus.map((menu) => ({
    id: menu.id,
    code: menu.code,
    name: menu.name,
    path: menu.path,
    cells: Object.fromEntries(roleTypes.map((roleType) => {
      const systemRow = roleMenuMap.get(`SYSTEM::${roleType}:${menu.id}`);
      const scopedRow = initialScope.scopeType === "DEPARTMENT"
        ? roleMenuMap.get(`DEPARTMENT:${initialScope.departmentOrgNodeId}:${roleType}:${menu.id}`)
        : undefined;
      const sourceRow = scopedRow ?? systemRow;
      const allowed = sourceRow?.allowed ?? false;
      return [roleType, {
        allowed,
        source: scopedRow ? "DEPARTMENT" : "SYSTEM",
        explicit: Boolean(scopedRow || (initialScope.scopeType === "SYSTEM" && systemRow)),
        inherited: initialScope.scopeType === "DEPARTMENT" && !scopedRow,
      }];
    })) as Record<(typeof roleTypes)[number], { allowed: boolean; source: "SYSTEM" | "DEPARTMENT"; explicit: boolean; inherited: boolean }>,
  }));

  const annualGoalMatrixRows = await prisma.roleAnnualGoalPermission.findMany({
    where: { roleType: { in: [...roleTypes] } },
  });
  const annualGoalMatrixMap = new Map(annualGoalMatrixRows.map((row) => [`${row.scopeType}:${row.departmentOrgNodeId}:${row.roleType}:${row.annualGoalPermissionId}`, row]));
  const annualGoalMatrix = annualGoalPermissions.map((permission) => ({
    id: permission.id,
    code: permission.code,
    name: permission.name,
    description: permission.description,
    cells: Object.fromEntries(roleTypes.map((roleType) => {
      const systemRow = annualGoalMatrixMap.get(`SYSTEM::${roleType}:${permission.id}`);
      const scopedRow = initialScope.scopeType === "DEPARTMENT"
        ? annualGoalMatrixMap.get(`DEPARTMENT:${initialScope.departmentOrgNodeId}:${roleType}:${permission.id}`)
        : undefined;
      const sourceRow = scopedRow ?? systemRow;
      const allowed = sourceRow?.allowed ?? false;
      return [roleType, {
        allowed,
        source: scopedRow ? "DEPARTMENT" : "SYSTEM",
        explicit: Boolean(scopedRow || (initialScope.scopeType === "SYSTEM" && systemRow)),
        inherited: initialScope.scopeType === "DEPARTMENT" && !scopedRow,
      }];
    })) as Record<(typeof roleTypes)[number], { allowed: boolean; source: "SYSTEM" | "DEPARTMENT"; explicit: boolean; inherited: boolean }>,
  }));

  const kpiPermissionMap = new Map(kpiPermissionGrants.map((row) => [`${row.scopeType}:${row.orgNodeId ?? ""}:${row.roleType}:${row.abilityKey}`, row]));
  const kpiPermissions = Object.values(kpiAbilityKeys).map((abilityKey) => ({
    id: abilityKey,
    code: abilityKey,
    name: ({
      VIEW_KPI: "查看 KPI",
      INITIALIZE_KPI: "维护KPI",
      VIEW_KPI_TEMPLATE: "查看 KPI 模板",
      MANAGE_KPI_TEMPLATE: "维护 KPI 模板",
      TOGGLE_KPI_TEMPLATE: "启用/禁用 KPI 模板",
      SCORE_SELF: "自评",
      SCORE_LEADER: "组长评分",
      SCORE_MANAGER: "主管评分",
      SCORE_FINAL: "终审",
    })[abilityKey],
    description: ({
      VIEW_KPI: "允许查看 KPI 列表与详情。",
      INITIALIZE_KPI: "允许维护季度 KPI，包括初始化与删除个人 KPI。",
      VIEW_KPI_TEMPLATE: "允许查看 KPI 模板列表与适用范围。",
      MANAGE_KPI_TEMPLATE: "允许新建、编辑 KPI 模板内容。",
      TOGGLE_KPI_TEMPLATE: "允许启用或禁用 KPI 模板。",
      SCORE_SELF: "允许执行 KPI 自评。",
      SCORE_LEADER: "允许执行 KPI 组长评分。",
      SCORE_MANAGER: "允许执行 KPI 主管评分。",
      SCORE_FINAL: "允许执行 KPI 终审。",
    })[abilityKey],
    cells: Object.fromEntries(roleTypes.map((roleType) => {
      const scopeByRole = roleType === "ADMIN" ? "ALL" : roleType === "DEPARTMENT_MANAGER" ? "SUBTREE" : roleType === "TEAM_LEADER" ? "NODE" : "SELF";
      const systemRow = kpiPermissionMap.get(`${scopeByRole}:${""}:${roleType}:${abilityKey}`);
      const scopedOrgNodeId = initialScope.scopeType === "DEPARTMENT" ? initialScope.departmentOrgNodeId : "";
      const scopedRow = scopedOrgNodeId
        ? kpiPermissionMap.get(`${scopeByRole}:${scopedOrgNodeId}:${roleType}:${abilityKey}`)
        : undefined;
      const sourceRow = scopedRow ?? systemRow;
      const allowed = Boolean(sourceRow);
      return [roleType, {
        allowed,
        source: scopedRow ? "DEPARTMENT" : "SYSTEM",
        explicit: Boolean(scopedRow || (initialScope.scopeType === "SYSTEM" && systemRow)),
        inherited: initialScope.scopeType === "DEPARTMENT" && !scopedRow,
      }];
    })) as Record<(typeof roleTypes)[number], { allowed: boolean; source: "SYSTEM" | "DEPARTMENT"; explicit: boolean; inherited: boolean }>,
  }));

  const selectedDepartment = initialScope.scopeType === "DEPARTMENT"
    ? departments.find((item) => item.orgNodeId === initialScope.departmentOrgNodeId) ?? null
    : null;

  return (
    <OrgContent
      currentUser={{ id: currentUser.id, roleType: currentUser.roleType }}
      users={mappedUsers}
      teams={teams}
      teamData={teamData}
      departments={departments}
      department={selectedDepartment}
      scopeOptions={scopeOptions}
      initialScope={initialScope}
      initialTab={requestedTab === "organization" || requestedTab === "permissions" ? requestedTab : initialScope.scopeType === "SYSTEM" ? "permissions" : "organization"}
      initialPermissionSection={requestedSection === "annual-goal" || requestedSection === "kpi" || requestedSection === "menu" ? requestedSection : "menu"}
      menus={roleMenuMatrix}
      annualGoalPermissions={annualGoalMatrix}
      kpiPermissions={kpiPermissions}
      canManageUsers={canManageUsers}
      canManageTeams={canManageTeams}
      canManageRolePermissions={canManageRolePermissions}
      manageableRoleOptions={currentUser.roleType === "ADMIN" ? [...roleTypes] : ["DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"]}
    />
  );
}
