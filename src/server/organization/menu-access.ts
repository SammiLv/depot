import type { RoleType } from "@prisma/client";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";
import { getCachedDepartmentRoleMenus, getCachedEnabledMenus, getCachedSystemRoleMenus } from "@/server/organization/cached-menu-permissions";

// 菜单访问判定：与 (authenticated)/layout.tsx 侧栏可见性同一口径——
// 部门级授权优先，无部门级记录时回落系统级授权。
// 页面守卫（如 /logs）必须复用本函数，避免出现「菜单可见但页面被重定向」的不一致。
export async function isMenuAllowedForUser(
  user: { roleType: RoleType; orgNodeId: string | null },
  menuCode: string,
): Promise<boolean> {
  const enabledMenus = await getCachedEnabledMenus();
  const menu = enabledMenus.find((item) => item.code === menuCode);
  if (!menu) return false;

  const scopedDepartmentOrgNodeId = user.roleType === "ADMIN"
    ? ""
    : await findNearestDepartmentOrgNodeId(user.orgNodeId);
  const [systemGrants, scopedGrants] = await Promise.all([
    getCachedSystemRoleMenus(user.roleType),
    user.roleType === "ADMIN" || !scopedDepartmentOrgNodeId
      ? Promise.resolve([])
      : getCachedDepartmentRoleMenus(user.roleType, scopedDepartmentOrgNodeId),
  ]);

  const grant = scopedGrants.find((row) => row.menuPermissionId === menu.id)
    ?? systemGrants.find((row) => row.menuPermissionId === menu.id);
  return grant?.allowed ?? false;
}
