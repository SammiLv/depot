import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { getAnnualGoalPermissionMatrix } from "@/server/organization/annual-goal-permissions";
import { getUserWhereByScope, getTeamWhereByScope } from "@/server/permissions/data-scope";
import { OrgContent } from "./content";

const roleTypes = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"] as const;

export default async function OrgPage() {
  const currentUser = await requireCurrentUser();
  const canManageUsers = currentUser.roleType === "ADMIN" || currentUser.roleType === "DEPARTMENT_MANAGER";
  const canManageTeams = canManageUsers;
  const canManageRolePermissions = currentUser.roleType === "ADMIN";

  const [users, teams, department, menus, roleMenuPermissions, annualGoalPermissionMatrix] = await Promise.all([
    prisma.user.findMany({
      where: { ...getUserWhereByScope(currentUser), isActive: true },
      orderBy: [{ roleType: "asc" }, { name: "asc" }],
    }),
    prisma.team.findMany({
      where: getTeamWhereByScope(currentUser),
      orderBy: { name: "asc" },
    }),
    currentUser.departmentId ? prisma.department.findUnique({ where: { id: currentUser.departmentId } }) : null,
    prisma.menuPermission.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.roleMenuPermission.findMany({
      where: { roleType: { in: [...roleTypes] } },
    }),
    getAnnualGoalPermissionMatrix(),
  ]);

  const manager = department?.managerId
    ? await prisma.user.findUnique({ where: { id: department.managerId } })
    : null;

  const teamData = await Promise.all(
    teams.map(async (team) => {
      const count = await prisma.user.count({
        where: { teamId: team.id, isActive: true, deletedAt: null },
      });
      const leader = team.leaderId
        ? await prisma.user.findUnique({ where: { id: team.leaderId } })
        : null;
      return { teamId: team.id, count, leaderName: leader?.name };
    })
  );

  return (
    <OrgContent
      currentUser={{ id: currentUser.id, roleType: currentUser.roleType }}
      users={users}
      teams={teams}
      teamData={teamData}
      department={department ? { id: department.id, name: department.name, managerId: department.managerId, managerName: manager?.name ?? null } : null}
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
