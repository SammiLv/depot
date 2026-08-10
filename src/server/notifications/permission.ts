import { requireCurrentUser } from "@/server/auth/current-user";
import {
  notificationAbilityKeys,
  orgPermissionModuleKeys,
} from "@/server/permissions/permission-constants";
import { resolvePermissionScope } from "@/server/permissions/permission-resolver";

export async function canManageNotificationScenario(user?: {
  id: string;
  roleType: "ADMIN" | "DEPARTMENT_MANAGER" | "TEAM_LEADER" | "MEMBER";
  orgNodeId?: string | null;
}) {
  const currentUser = user ?? await requireCurrentUser();
  if (currentUser.roleType === "ADMIN") return true;
  const scope = await resolvePermissionScope(
    currentUser,
    orgPermissionModuleKeys.notification,
    notificationAbilityKeys.manageNotificationScenario,
  );
  return Boolean(scope);
}

export async function requireManageNotificationScenario() {
  const currentUser = await requireCurrentUser();
  const allowed = await canManageNotificationScenario(currentUser);
  if (!allowed) {
    throw new Error("无权管理通知场景");
  }
  return currentUser;
}
