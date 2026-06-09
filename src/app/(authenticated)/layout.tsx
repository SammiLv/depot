import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRoleLabel } from "@/server/permissions/data-scope";
import { prisma } from "@/server/db/prisma";
import { AppShell } from "@/components/app-shell";
import type { ReactNode } from "react";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const team = currentUser.teamId
    ? await prisma.team.findUnique({ where: { id: currentUser.teamId } })
    : null;

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

  const user = {
    name: currentUser.name,
    roleLabel: getRoleLabel(currentUser.roleType),
    teamName: team?.name ?? "未分配",
    avatarInitial: currentUser.name.charAt(0),
  };

  const allowedMenus = menuPermissions.map((mp) => ({
    code: mp.code,
    name: mp.name,
    path: mp.path,
  }));

  return <AppShell user={user} allowedMenus={allowedMenus}>{children}</AppShell>;
}
