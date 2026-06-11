import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRoleLabel } from "@/server/permissions/role-labels";
import { prisma } from "@/server/db/prisma";
import { AppShell } from "@/components/app-shell";
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

  const roleMenus = await prisma.roleMenuPermission.findMany({
    where: { roleType: currentUser.roleType },
  });
  const menuIds = roleMenus.map((rm) => rm.menuPermissionId);
  const menuPermissions = menuIds.length
    ? await prisma.menuPermission.findMany({
        where: { id: { in: menuIds }, isEnabled: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];

  const allowedMenus = menuPermissions.map((mp) => ({
    code: mp.code,
    name: mp.name,
    path: mp.path,
  }));

  return <AppShell user={user} allowedMenus={allowedMenus}>{children}</AppShell>;
}
