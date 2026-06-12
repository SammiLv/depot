import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRoleLabel } from "@/server/permissions/role-labels";
import { prisma } from "@/server/db/prisma";
import { AppShell } from "@/components/app-shell";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";
import type { ReactNode } from "react";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const currentOrgNode = currentUser.orgNodeId
    ? await prisma.orgNode.findUnique({
        where: { id: currentUser.orgNodeId },
        select: { id: true, name: true, nodeType: true, parentId: true },
      })
    : null;

  const parentOrgNode = currentOrgNode?.parentId
    ? await prisma.orgNode.findUnique({
        where: { id: currentOrgNode.parentId },
        select: { id: true, name: true },
      })
    : null;

  const user = {
    name: currentUser.name,
    roleLabel: getRoleLabel(currentUser.roleType),
    teamName: currentOrgNode?.nodeType === "TEAM"
      ? currentOrgNode.name
      : currentOrgNode?.name ?? "未分配",
    avatarInitial: currentUser.name.charAt(0),
  };

  const scopedDepartmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? ""
    : await findNearestDepartmentOrgNodeId(currentUser.orgNodeId);

  const [menuPermissions, systemRoleMenus, scopedRoleMenus] = await Promise.all([
    prisma.menuPermission.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.roleMenuPermission.findMany({
      where: {
        scopeType: "SYSTEM",
        departmentOrgNodeId: "",
        roleType: currentUser.roleType,
      },
    }),
    currentUser.roleType === "ADMIN" || !scopedDepartmentOrgNodeId
      ? Promise.resolve([])
      : prisma.roleMenuPermission.findMany({
          where: {
            scopeType: "DEPARTMENT",
            departmentOrgNodeId: scopedDepartmentOrgNodeId,
            roleType: currentUser.roleType,
          },
        }),
  ]);

  const systemMenuMap = new Map(systemRoleMenus.map((row) => [row.menuPermissionId, row]));
  const scopedMenuMap = new Map(scopedRoleMenus.map((row) => [row.menuPermissionId, row]));

  const allowedMenus = menuPermissions
    .filter((menuPermission) => (scopedMenuMap.get(menuPermission.id) ?? systemMenuMap.get(menuPermission.id))?.allowed)
    .map((menuPermission) => ({
      code: menuPermission.code,
      name: menuPermission.name,
      path: menuPermission.path,
    }));

  return <AppShell user={user} allowedMenus={allowedMenus}>{children}</AppShell>;
}
