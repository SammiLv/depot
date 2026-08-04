import type {
  KpiApprovalNodeMode,
  KpiApprovalResolverType,
  OrgNodeType,
  PermissionScopeType,
} from "@prisma/client";

export type KpiApprovalPolicyStepInput = {
  label: string;
  nodeMode: KpiApprovalNodeMode | null;
  approvalOrgNodeId: string | null;
  approvalOrgNodeIds: string[];
  ancestorDepth: number | null;
  resolverType: KpiApprovalResolverType;
  resolverUserId: string | null;
  skipIfSelf: boolean;
  skipIfDuplicateApprover: boolean;
  allowSkipWhenNoApprover: boolean;
};

const nodeModes = new Set<KpiApprovalNodeMode>([
  "CURRENT_TEAM",
  "CURRENT_DEPARTMENT",
  "FIXED_NODE",
  "NONE",
  "ORG_NODE_OWNER",
  "CASCADE_TO_DEPARTMENT",
]);

const resolverTypes = new Set<KpiApprovalResolverType>([
  "TEAM_LEADER",
  "DEPARTMENT_MANAGER",
  "ADMIN",
  "EXPLICIT_USER",
]);

export function getKpiApprovalResolverTypeForNode(
  nodeType: OrgNodeType,
): Exclude<KpiApprovalResolverType, "EXPLICIT_USER"> {
  if (nodeType === "TEAM") return "TEAM_LEADER";
  if (nodeType === "DEPARTMENT") return "DEPARTMENT_MANAGER";
  return "ADMIN";
}

export function getKpiApprovalPolicyActiveScopeKey(
  scopeType: PermissionScopeType,
  departmentOrgNodeId: string,
  isActive: boolean,
) {
  if (!isActive) return null;
  return scopeType === "SYSTEM" ? "SYSTEM:" : null;
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
    const rawNodeMode = Reflect.get(row, "nodeMode");
    const nodeMode = rawNodeMode === null || rawNodeMode === "" || rawNodeMode === undefined
      ? null
      : rawNodeMode as KpiApprovalNodeMode;
    const approvalOrgNodeId = String(Reflect.get(row, "approvalOrgNodeId") ?? "").trim() || null;
    const rawApprovalOrgNodeIds = Reflect.get(row, "approvalOrgNodeIds");
    const approvalOrgNodeIds = Array.isArray(rawApprovalOrgNodeIds)
      ? [...new Set(rawApprovalOrgNodeIds.map((item) => String(item).trim()).filter(Boolean))]
      : [];
    let resolverType = Reflect.get(row, "resolverType") as KpiApprovalResolverType;
    const rawDepth = Reflect.get(row, "ancestorDepth");
    const ancestorDepth = rawDepth === null || rawDepth === "" || rawDepth === undefined
      ? null
      : Number(rawDepth);
    const resolverUserId = String(Reflect.get(row, "resolverUserId") ?? "").trim() || null;
    if (!label) throw new Error(`第 ${index + 1} 个审批步骤缺少名称`);
    if (nodeMode !== null && !nodeModes.has(nodeMode)) {
      throw new Error(`第 ${index + 1} 个审批步骤审批节点无效`);
    }
    if (nodeMode === "CURRENT_TEAM") resolverType = "TEAM_LEADER";
    if (nodeMode === "CURRENT_DEPARTMENT") resolverType = "DEPARTMENT_MANAGER";
    if (nodeMode === "NONE") resolverType = "EXPLICIT_USER";
    if (nodeMode === "ORG_NODE_OWNER" || nodeMode === "CASCADE_TO_DEPARTMENT") {
      resolverType = "TEAM_LEADER";
    }
    if (!resolverTypes.has(resolverType)) throw new Error(`第 ${index + 1} 个审批步骤解析方式无效`);
    if (nodeMode === "FIXED_NODE" && !approvalOrgNodeId) {
      throw new Error(`第 ${index + 1} 个审批步骤缺少固定审批节点`);
    }
    if (nodeMode === "ORG_NODE_OWNER" && approvalOrgNodeIds.length === 0) {
      throw new Error(`第 ${index + 1} 个审批步骤至少需要选择一个组织节点`);
    }
    if (nodeMode !== null && nodeMode !== "FIXED_NODE" && approvalOrgNodeId) {
      throw new Error(`第 ${index + 1} 个审批步骤审批节点配置无效`);
    }
    if (nodeMode !== "ORG_NODE_OWNER" && approvalOrgNodeIds.length > 0) {
      throw new Error(`第 ${index + 1} 个审批步骤组织节点配置无效`);
    }
    if (nodeMode === "NONE" && !resolverUserId) {
      throw new Error(`第 ${index + 1} 个审批步骤缺少指定审批人`);
    }
    if (nodeMode === "CASCADE_TO_DEPARTMENT" && resolverUserId) {
      throw new Error(`第 ${index + 1} 个审批步骤为逐级审批时不允许指定审批人`);
    }
    if (ancestorDepth !== null && (!Number.isInteger(ancestorDepth) || ancestorDepth < 0)) {
      throw new Error(`第 ${index + 1} 个审批步骤祖先层级无效`);
    }
    if (nodeMode === null && resolverType === "EXPLICIT_USER" && !resolverUserId) {
      throw new Error(`第 ${index + 1} 个审批步骤缺少指定审批人`);
    }

    return {
      label,
      nodeMode,
      approvalOrgNodeId: nodeMode === "FIXED_NODE" ? approvalOrgNodeId : null,
      approvalOrgNodeIds: nodeMode === "ORG_NODE_OWNER" ? approvalOrgNodeIds : [],
      ancestorDepth: nodeMode === null ? ancestorDepth : null,
      resolverType,
      resolverUserId: nodeMode === "CASCADE_TO_DEPARTMENT"
        || (nodeMode === null && resolverType !== "EXPLICIT_USER")
        ? null
        : resolverUserId,
      skipIfSelf: Reflect.get(row, "skipIfSelf") !== false,
      skipIfDuplicateApprover: Reflect.get(row, "skipIfDuplicateApprover") !== false,
      allowSkipWhenNoApprover: Reflect.get(row, "allowSkipWhenNoApprover") === true,
    };
  });
}
