import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { getAnnualGoalPermissionMatrix } from "@/server/organization/annual-goal-permissions";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { getUserWhereByScope } from "@/server/permissions/data-scope";
import { OrgContent } from "./content";

const roleTypes = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"] as const;

export default async function OrgPage() {
  const currentUser = await requireCurrentUser();
  const canManageUsers = currentUser.roleType === "ADMIN" || currentUser.roleType === "DEPARTMENT_MANAGER";
  const canManageTeams = canManageUsers;
  const canManageRolePermissions = currentUser.roleType === "ADMIN";
  const scopedOrgNodeIds = currentUser.roleType === "ADMIN"
    ? null
    : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);

  const [users, orgNodes, menus, roleMenuPermissions, annualGoalPermissionMatrix] = await Promise.all([
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
    prisma.roleMenuPermission.findMany({
      where: { roleType: { in: [...roleTypes] } },
    }),
    getAnnualGoalPermissionMatrix(),
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

  const currentOrgNode = currentUser.orgNodeId ? orgNodeById.get(currentUser.orgNodeId) ?? null : null;
  const currentDepartmentOrgNodeId = currentOrgNode?.nodeType === "DEPARTMENT"
    ? currentOrgNode.id
    : currentOrgNode?.parentId && departmentById.has(currentOrgNode.parentId)
      ? currentOrgNode.parentId
      : null;
  const department = departments.find((item) => item.orgNodeId === currentDepartmentOrgNodeId) ?? departments[0] ?? null;

  const teamData = teams.map((team) => {
    const teamUsers = mappedUsers.filter((user) => user.teamOrgNodeId === team.orgNodeId && user.isActive);
    const leader = teamUsers.find((user) => user.roleType === "TEAM_LEADER") ?? null;
    return { teamOrgNodeId: team.orgNodeId, count: teamUsers.length, leaderName: leader?.name };
  });

  return (
    <OrgContent
      currentUser={{ id: currentUser.id, roleType: currentUser.roleType }}
      users={mappedUsers}
      teams={teams}
      teamData={teamData}
      departments={departments}
      department={department}
      menus={menus.map((menu) => ({ id: menu.id, code: menu.code, name: menu.name, path: menu.path }))}
      roleMenuPermissions={roleMenuPermissions.map((permission) => ({ roleType: permission.roleType, menuPermissionId: permission.menuPermissionId }))}
      annualGoalPermissions={annualGoalPermissionMatrix.permissions}
      roleAnnualGoalPermissions={annualGoalPermissionMatrix.rolePermissions}
      canManageUsers={canManageUsers}
      canManageTeams={canManageTeams}
      canManageRolePermissions={canManageRolePermissions}
      manageableRoleOptions={currentUser.roleType === "ADMIN" ? [...roleTypes] : ["TEAM_LEADER", "MEMBER"]}
    />
  );
}
