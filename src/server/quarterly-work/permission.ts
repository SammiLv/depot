import type { OrgPermissionAbilityKey, RoleType } from "@prisma/client";
import { requireCurrentUser } from "@/server/auth/current-user";
import {
  orgPermissionModuleKeys,
  productManagementAbilityKeys,
} from "@/server/permissions/permission-constants";
import { resolvePermissionScope } from "@/server/permissions/permission-resolver";

export { productManagementAbilityKeys };

type ScopeUser = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

async function canManageProductManagementAbility(
  abilityKey: OrgPermissionAbilityKey,
  user?: ScopeUser,
) {
  const currentUser = user ?? await requireCurrentUser();
  const scope = await resolvePermissionScope(
    currentUser,
    orgPermissionModuleKeys.productManagement,
    abilityKey,
  );
  return Boolean(scope);
}

export async function canManageProductGoal(user?: ScopeUser) {
  return canManageProductManagementAbility(productManagementAbilityKeys.manageProductGoal, user);
}

export async function canManageProjectAndValueTracking(user?: ScopeUser) {
  return canManageProductManagementAbility(productManagementAbilityKeys.manageProjectAndValueTracking, user);
}

export async function canManageProductTask(user?: ScopeUser) {
  return canManageProductManagementAbility(productManagementAbilityKeys.manageProductTask, user);
}

export async function requireProductManagementAbility(
  abilityKey: OrgPermissionAbilityKey,
  errorMessage: string,
) {
  const currentUser = await requireCurrentUser();
  const scope = await resolvePermissionScope(
    currentUser,
    orgPermissionModuleKeys.productManagement,
    abilityKey,
  );
  if (!scope) {
    throw new Error(errorMessage);
  }
  return { currentUser, scope };
}

export async function requireManageProductGoal() {
  return requireProductManagementAbility(
    productManagementAbilityKeys.manageProductGoal,
    "当前角色不能管理产品目标",
  );
}

export async function requireManageProjectAndValueTracking() {
  return requireProductManagementAbility(
    productManagementAbilityKeys.manageProjectAndValueTracking,
    "当前角色不能管理项目与需求价值跟踪",
  );
}

export async function requireManageProductTask() {
  return requireProductManagementAbility(
    productManagementAbilityKeys.manageProductTask,
    "当前角色不能管理任务",
  );
}
