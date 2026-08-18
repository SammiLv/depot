import { prisma } from "@/server/db/prisma";
import type { OperationLogTargetType } from "@/server/quarterly-work/operation-log-constants";

export {
  OPERATION_LOG_ACTION_CREATE,
  OPERATION_LOG_ACTION_DELETE,
  OPERATION_LOG_ACTION_UPDATE,
  OPERATION_LOG_TARGET_TYPES,
  OPERATION_LOG_TARGET_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  WORK_STATUS_LABELS,
  type OperationLogTargetType,
} from "@/server/quarterly-work/operation-log-constants";

type OperationLogClient = Pick<typeof prisma, "operationLog">;

export async function writeOperationLog(
  client: OperationLogClient,
  entry: {
    targetType: OperationLogTargetType;
    targetId: string;
    targetTitle: string;
    action: string;
    operatorId: string;
    remark: string;
  },
) {
  await client.operationLog.create({
    data: {
      targetType: entry.targetType,
      targetId: entry.targetId,
      targetTitle: entry.targetTitle,
      action: entry.action,
      operatorId: entry.operatorId,
      remark: entry.remark,
    },
  });
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "空";
  return String(value);
}

export type FieldChange = {
  label: string;
  previous: string | number | null | undefined;
  next: string | number | null | undefined;
};

/**
 * 生成编辑类日志备注，如：项目名称从『A』改为『B』；负责人从『张三』改为『李四』
 * 没有实际变化时返回空字符串。
 */
export function buildFieldChangeRemark(changes: FieldChange[]) {
  return changes
    .filter((change) => displayValue(change.previous) !== displayValue(change.next))
    .map((change) => `${change.label}从『${displayValue(change.previous)}』改为『${displayValue(change.next)}』`)
    .join("；");
}

export async function resolveUserNames(userIds: Array<string | null | undefined>) {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!uniqueIds.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}
