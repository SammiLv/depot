import type { RoleType } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/db/prisma";

export const getCachedEnabledMenus = unstable_cache(
  async () => prisma.menuPermission.findMany({
    where: { isEnabled: true },
    orderBy: { sortOrder: "asc" },
  }),
  ["enabled-menu-permissions"],
  { revalidate: 300 },
);

export const getCachedSystemRoleMenus = unstable_cache(
  async (roleType: RoleType) => prisma.roleMenuPermission.findMany({
    where: {
      scopeType: "SYSTEM",
      departmentOrgNodeId: "",
      roleType,
    },
  }),
  ["system-role-menu-permissions"],
  { revalidate: 300 },
);

export const getCachedDepartmentRoleMenus = unstable_cache(
  async (roleType: RoleType, departmentOrgNodeId: string) => prisma.roleMenuPermission.findMany({
    where: {
      scopeType: "DEPARTMENT",
      departmentOrgNodeId,
      roleType,
    },
  }),
  ["department-role-menu-permissions"],
  { revalidate: 300 },
);
