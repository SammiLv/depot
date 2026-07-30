import type { KpiApprovalResolverType, PermissionScopeType } from "@prisma/client";

export type KpiApprovalPolicyStepInput = {
  label: string;
  ancestorDepth: number | null;
  resolverType: KpiApprovalResolverType;
  resolverUserId: string | null;
  skipIfSelf: boolean;
  skipIfDuplicateApprover: boolean;
  allowSkipWhenNoApprover: boolean;
};

const resolverTypes = new Set<KpiApprovalResolverType>([
  "TEAM_LEADER",
  "DEPARTMENT_MANAGER",
  "ADMIN",
  "EXPLICIT_USER",
]);

export function getKpiApprovalPolicyActiveScopeKey(
  scopeType: PermissionScopeType,
  departmentOrgNodeId: string,
  isActive: boolean,
) {
  return isActive ? `${scopeType}:${departmentOrgNodeId}` : null;
}

export function parseKpiApprovalPolicySteps(value: string): KpiApprovalPolicyStepInput[] {
  let rows: unknown;
  try {
    rows = JSON.parse(value);
  } catch {
    throw new Error("审批步骤数据格式错误");
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("审批策略至少需要一个步骤");
  }
  if (rows.length > 20) {
    throw new Error("审批策略最多支持 20 个步骤");
  }

  return rows.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(`第 ${index + 1} 个审批步骤格式错误`);
    }
    const label = String(Reflect.get(row, "label") ?? "").trim();
    const resolverType = Reflect.get(row, "resolverType") as KpiApprovalResolverType;
    const rawDepth = Reflect.get(row, "ancestorDepth");
    const ancestorDepth = rawDepth === null || rawDepth === "" || rawDepth === undefined
      ? null
      : Number(rawDepth);
    const resolverUserId = String(Reflect.get(row, "resolverUserId") ?? "").trim() || null;
    if (!label) throw new Error(`第 ${index + 1} 个审批步骤缺少名称`);
    if (!resolverTypes.has(resolverType)) throw new Error(`第 ${index + 1} 个审批步骤解析方式无效`);
    if (ancestorDepth !== null && (!Number.isInteger(ancestorDepth) || ancestorDepth < 0)) {
      throw new Error(`第 ${index + 1} 个审批步骤祖先层级无效`);
    }
    if (resolverType === "EXPLICIT_USER" && !resolverUserId) {
      throw new Error(`第 ${index + 1} 个审批步骤缺少指定审批人`);
    }

    return {
      label,
      ancestorDepth,
      resolverType,
      resolverUserId: resolverType === "EXPLICIT_USER" ? resolverUserId : null,
      skipIfSelf: Reflect.get(row, "skipIfSelf") !== false,
      skipIfDuplicateApprover: Reflect.get(row, "skipIfDuplicateApprover") !== false,
      allowSkipWhenNoApprover: Reflect.get(row, "allowSkipWhenNoApprover") === true,
    };
  });
}
