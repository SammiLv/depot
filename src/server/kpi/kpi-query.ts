import { prisma } from "@/server/db/prisma";
import { buildKpiWhereByPermission, buildUserWhereByPermission, resolvePermissionScope } from "@/server/permissions/permission-resolver";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import type { KpiStatus, OrgNodeType, OrgPermissionAbilityKey, RoleType } from "@prisma/client";


type DataScopeInput = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

type ViewScopeSummary = {
  canViewKpi: boolean;
  canViewTemplate: boolean;
  hasAnyViewPermission: boolean;
  hasGlobalViewKpiScope: boolean;
  departmentAllTabOrgNodeIds: string[];
  visibleDepartmentOrgNodeIds: string[];
  visibleTeamOrgNodeIds: string[];
};

type ResolvedScopeNodes = {
  scopedOrgNodes: OrgNodeSummary[];
  departmentOrgNodeIdByTeamOrgNodeId: Map<string, string>;
  accessibleDepartmentOrgNodeIds: string[];
  departments: Array<{ id: string; name: string }>;
  teamOptions: Array<{ id: string; name: string; departmentOrgNodeId: string | null }>;
  defaultDepartmentOrgNodeId: string;
};

type KpiPageData = {
  year: number;
  quarter: number;
  availableYears: number[];
  availableQuarters: number[];
  rows: Array<{
    id: string;
    userId: string;
    userName: string;
    departmentOrgNodeId: string | null;
    teamOrgNodeId: string | null;
    teamName: string;
    itemCount: number;
    stageKey: string;
    status: string;
    tone: "primary" | "warning" | "success" | "default" | "info";
    progress: number;
    score: string;
    availableActions: {
      canSelfReview: boolean;
      canLeaderScore: boolean;
      canManagerScore: boolean;
      canFinalReview: boolean;
    };
  }>;
  stages: Array<{ label: string; count: number }>;
  totalCount: number;
  memberOptions: Array<{
    id: string;
    name: string;
    orgNodeId: string | null;
    teamOrgNodeId: string | null;
    departmentOrgNodeId: string | null;
    roleType: RoleType;
  }>;
  teamOptions: Array<{
    id: string;
    name: string;
    departmentOrgNodeId: string | null;
  }>;
  departmentOptions: Array<{
    id: string;
    name: string;
  }>;
  departmentAllTabOrgNodeIds: string[];
  defaultDepartmentOrgNodeId: string;
  canSelectAnyDepartment: boolean;
  templateRows: Array<{
    id: string;
    name: string;
    description: string | null;
    createdByName: string;
    updatedByName: string;
    scopeName: string;
    scopeDepartmentOrgNodeIds: string[];
    scopeTeamIds: string[];
    scopeUserIds: string[];
    groupTeamIds: string[];
    createdAt: string;
    updatedAt: string;
    departmentOrgNodeId: string;
    isActive: boolean;
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      score: number;
      scoringStandard: string | null;
      sortOrder: number;
    }>;
  }>;
  permissions: {
    canManageKpi: boolean;
    canManageKpiTemplate: boolean;
    canToggleKpiTemplate: boolean;
  };
  hasAnyViewPermission: boolean;
};

type ApprovalStepSummary = {
  stepOrder: number;
  stageKey: string;
  approverName: string;
  status: string;
};

async function buildViewScopeOrgNodeIds(
  currentUser: DataScopeInput,
  viewKpiScope: Awaited<ReturnType<typeof resolvePermissionScope>>,
) {
  if (!viewKpiScope) {
    return { departmentAllTabOrgNodeIds: [], visibleTeamOrgNodeIds: [], visibleDepartmentOrgNodeIds: [] };
  }

  const scopedOrgNodes = await prisma.orgNode.findMany({
    select: { id: true, parentId: true, nodeType: true, name: true },
  });
  const relationships = buildOrgNodeRelationships(scopedOrgNodes);

  const collectScopeNodeIds = (rootOrgNodeId: string | null | undefined) => {
    if (!rootOrgNodeId) {
      return [];
    }
    const descendantIds = relationships.descendantOrgNodeIdsByNodeId.get(rootOrgNodeId) ?? [];
    return descendantIds.length > 0 ? descendantIds : [rootOrgNodeId];
  };

  const collectDepartmentIds = (nodeIds: string[]) => [...new Set(
    nodeIds
      .map((nodeId) => relationships.nearestDepartmentOrgNodeIdByNodeId.get(nodeId) ?? null)
      .filter((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId))
  )];

  const collectTeamIds = (nodeIds: string[]) => [...new Set(
    nodeIds
      .map((nodeId) => relationships.nearestTeamOrgNodeIdByNodeId.get(nodeId) ?? null)
      .filter((teamOrgNodeId): teamOrgNodeId is string => Boolean(teamOrgNodeId))
  )];

  if (viewKpiScope.scopeType === "ALL") {
    const departmentAllTabOrgNodeIds = scopedOrgNodes
      .filter((orgNode) => orgNode.nodeType === "DEPARTMENT")
      .map((orgNode) => orgNode.id);
    const visibleTeamOrgNodeIds = scopedOrgNodes
      .filter((orgNode) => orgNode.nodeType === "TEAM")
      .map((orgNode) => orgNode.id);
    return {
      departmentAllTabOrgNodeIds,
      visibleTeamOrgNodeIds,
      visibleDepartmentOrgNodeIds: departmentAllTabOrgNodeIds,
    };
  }

  const scopeRootOrgNodeId = viewKpiScope.scopeType === "SELF"
    ? currentUser.orgNodeId ?? null
    : viewKpiScope.orgNodeId ?? null;
  const scopeNodeIds = collectScopeNodeIds(scopeRootOrgNodeId);
  const visibleDepartmentOrgNodeIds = collectDepartmentIds(scopeNodeIds);
  const visibleTeamOrgNodeIds = collectTeamIds(scopeNodeIds);
  const departmentAllTabOrgNodeIds = viewKpiScope.scopeType === "SELF"
    ? visibleDepartmentOrgNodeIds
    : (scopeRootOrgNodeId && scopedOrgNodes.some((orgNode) => orgNode.id === scopeRootOrgNodeId && orgNode.nodeType === "DEPARTMENT")
      ? [scopeRootOrgNodeId]
      : visibleDepartmentOrgNodeIds);

  return {
    departmentAllTabOrgNodeIds,
    visibleTeamOrgNodeIds,
    visibleDepartmentOrgNodeIds,
  };
}

async function resolveKpiViewScope(currentUser: DataScopeInput): Promise<ViewScopeSummary> {
  const viewKpiScope = await resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.viewKpi);
  const viewTemplateScope = await resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.viewKpiTemplate);
  const effectiveScope = viewKpiScope ?? viewTemplateScope;
  const { departmentAllTabOrgNodeIds, visibleTeamOrgNodeIds, visibleDepartmentOrgNodeIds } = await buildViewScopeOrgNodeIds(currentUser, effectiveScope);
  const hasGlobalViewKpiScope = effectiveScope?.scopeType === "ALL";

  return {
    canViewKpi: Boolean(viewKpiScope),
    canViewTemplate: Boolean(viewTemplateScope),
    hasAnyViewPermission: Boolean(viewKpiScope || viewTemplateScope),
    hasGlobalViewKpiScope,
    departmentAllTabOrgNodeIds,
    visibleDepartmentOrgNodeIds,
    visibleTeamOrgNodeIds,
  };
}

type OrgNodeSummary = {
  id: string;
  name: string;
  nodeType: OrgNodeType;
  parentId: string | null;
};

type OrgNodeRelationships = {
  nearestDepartmentOrgNodeIdByNodeId: Map<string, string | null>;
  nearestTeamOrgNodeIdByNodeId: Map<string, string | null>;
  descendantOrgNodeIdsByNodeId: Map<string, string[]>;
};

const asciiLetterPattern = /^[A-Za-z]$/;
const pinyinInitialBoundaries = [
  { initial: "A", boundary: "阿" },
  { initial: "B", boundary: "八" },
  { initial: "C", boundary: "嚓" },
  { initial: "D", boundary: "哒" },
  { initial: "E", boundary: "妸" },
  { initial: "F", boundary: "发" },
  { initial: "G", boundary: "旮" },
  { initial: "H", boundary: "哈" },
  { initial: "J", boundary: "击" },
  { initial: "K", boundary: "喀" },
  { initial: "L", boundary: "垃" },
  { initial: "M", boundary: "妈" },
  { initial: "N", boundary: "拿" },
  { initial: "O", boundary: "哦" },
  { initial: "P", boundary: "啪" },
  { initial: "Q", boundary: "期" },
  { initial: "R", boundary: "然" },
  { initial: "S", boundary: "撒" },
  { initial: "T", boundary: "塌" },
  { initial: "W", boundary: "挖" },
  { initial: "X", boundary: "昔" },
  { initial: "Y", boundary: "压" },
  { initial: "Z", boundary: "匝" },
] as const;
const pinyinCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin");
const englishCollator = new Intl.Collator("en", { sensitivity: "base" });

function getSortToken(name: string) {
  const firstChar = name.trim()[0] ?? "";
  if (!firstChar) return { initial: "", typeOrder: 1 as const };
  if (asciiLetterPattern.test(firstChar)) {
    return { initial: firstChar.toUpperCase(), typeOrder: 0 as const };
  }

  for (let index = pinyinInitialBoundaries.length - 1; index >= 0; index -= 1) {
    const { initial, boundary } = pinyinInitialBoundaries[index];
    if (pinyinCollator.compare(firstChar, boundary) >= 0) {
      return { initial, typeOrder: 1 as const };
    }
  }

  return { initial: firstChar.toUpperCase(), typeOrder: 1 as const };
}

function compareNames(left: { name: string }, right: { name: string }) {
  const leftToken = getSortToken(left.name);
  const rightToken = getSortToken(right.name);

  if (leftToken.initial !== rightToken.initial) {
    return englishCollator.compare(leftToken.initial, rightToken.initial);
  }

  if (leftToken.typeOrder !== rightToken.typeOrder) {
    return leftToken.typeOrder - rightToken.typeOrder;
  }

  if (leftToken.typeOrder === 0) {
    return englishCollator.compare(left.name, right.name);
  }

  return pinyinCollator.compare(left.name, right.name);
}

const stageLabels: Record<string, string> = {
  DRAFT: "初始化",
  PENDING_SELF_REVIEW: "自评",
  PENDING_LEADER_SCORE: "组长评",
  PENDING_MANAGER_SCORE: "主管评",
  PENDING_FINAL_REVIEW: "终审",
  COMPLETED: "已完成",
};

const stageOrder = [
  "DRAFT",
  "PENDING_SELF_REVIEW",
  "PENDING_LEADER_SCORE",
  "PENDING_MANAGER_SCORE",
  "PENDING_FINAL_REVIEW",
  "COMPLETED",
];

function getKpiTone(status: string): "default" | "primary" | "info" | "success" | "warning" {
  return status === "COMPLETED" ? "success"
    : status.includes("SCORE") ? "info"
    : status.includes("REVIEW") ? "info"
    : status.includes("PENDING") ? "warning"
    : "default";
}

function getKpiListStageLabel(status: string) {
  if (status === "DRAFT" || status === "PENDING_SELF_REVIEW") {
    return "自评";
  }
  if (status === "PENDING_LEADER_SCORE") {
    return "组长评";
  }
  if (status === "PENDING_MANAGER_SCORE") {
    return "主管评";
  }
  if (status === "PENDING_FINAL_REVIEW") {
    return "终审";
  }
  if (status === "COMPLETED") {
    return "已完成";
  }
  return status;
}

function getDepartmentOrgNodeIdForRecord(
  orgNodeId: string | null | undefined,
  nearestDepartmentOrgNodeIdByNodeId: Map<string, string | null>,
) {
  if (!orgNodeId) {
    return null;
  }
  return nearestDepartmentOrgNodeIdByNodeId.get(orgNodeId) ?? null;
}

function getTeamOrgNodeIdForRecord(
  orgNodeId: string | null | undefined,
  nearestTeamOrgNodeIdByNodeId: Map<string, string | null>,
) {
  if (!orgNodeId) {
    return null;
  }
  return nearestTeamOrgNodeIdByNodeId.get(orgNodeId) ?? null;
}

function buildOrgNodeRelationships(scopedOrgNodes: OrgNodeSummary[]): OrgNodeRelationships {
  const orgNodeMap = new Map(scopedOrgNodes.map((orgNode) => [orgNode.id, orgNode] as const));
  const nearestDepartmentOrgNodeIdByNodeId = new Map<string, string | null>();
  const nearestTeamOrgNodeIdByNodeId = new Map<string, string | null>();
  const descendantOrgNodeIdsByNodeId = new Map<string, string[]>();

  for (const orgNode of scopedOrgNodes) {
    let currentNode: OrgNodeSummary | null = orgNode;
    let nearestDepartmentOrgNodeId: string | null = null;
    let nearestTeamOrgNodeId: string | null = null;

    while (currentNode) {
      if (!nearestDepartmentOrgNodeId && currentNode.nodeType === "DEPARTMENT") {
        nearestDepartmentOrgNodeId = currentNode.id;
      }
      if (!nearestTeamOrgNodeId && currentNode.nodeType === "TEAM") {
        nearestTeamOrgNodeId = currentNode.id;
      }
      currentNode = currentNode.parentId ? (orgNodeMap.get(currentNode.parentId) ?? null) : null;
    }

    nearestDepartmentOrgNodeIdByNodeId.set(orgNode.id, nearestDepartmentOrgNodeId);
    nearestTeamOrgNodeIdByNodeId.set(orgNode.id, nearestTeamOrgNodeId);
  }

  for (const orgNode of scopedOrgNodes) {
    let currentNode: OrgNodeSummary | null = orgNode;
    while (currentNode) {
      const descendantIds = descendantOrgNodeIdsByNodeId.get(currentNode.id) ?? [];
      descendantIds.push(orgNode.id);
      descendantOrgNodeIdsByNodeId.set(currentNode.id, descendantIds);
      currentNode = currentNode.parentId ? (orgNodeMap.get(currentNode.parentId) ?? null) : null;
    }
  }

  return {
    nearestDepartmentOrgNodeIdByNodeId,
    nearestTeamOrgNodeIdByNodeId,
    descendantOrgNodeIdsByNodeId,
  };
}

function parseStructuredSummary(value: string | null | undefined, firstLabel: string, secondLabel: string) {
  const text = (value ?? "").trim();
  if (!text) {
    return { first: "", second: "" };
  }

  const blockRegex = /【([^】]+)】\s*([\s\S]*?)(?=\n\s*【|$)/g;
  const blockMap = new Map<string, string>();
  let match: RegExpExecArray | null = null;
  while ((match = blockRegex.exec(text)) !== null) {
    blockMap.set(match[1], match[2].trim());
  }

  if (blockMap.size > 0) {
    return {
      first: blockMap.get(firstLabel) ?? "",
      second: blockMap.get(secondLabel) ?? "",
    };
  }

  return { first: text, second: "" };
}

function getEditableStage(status: string): "SELF" | "LEADER" | "MANAGER" | "FINAL" | null {
  if (status === "DRAFT" || status === "PENDING_SELF_REVIEW") {
    return "SELF";
  }
  if (status === "PENDING_LEADER_SCORE") {
    return "LEADER";
  }
  if (status === "PENDING_MANAGER_SCORE") {
    return "MANAGER";
  }
  if (status === "PENDING_FINAL_REVIEW") {
    return "FINAL";
  }
  return null;
}

function resolveScopeNodes(currentUser: DataScopeInput, viewScope: ViewScopeSummary, scopedOrgNodes: OrgNodeSummary[]): ResolvedScopeNodes {
  const relationships = buildOrgNodeRelationships(scopedOrgNodes);

  const visibleTeamOrgNodeIds = [...new Set(viewScope.visibleTeamOrgNodeIds.filter((teamOrgNodeId) =>
    relationships.nearestTeamOrgNodeIdByNodeId.has(teamOrgNodeId)
  ))];
  const accessibleDepartmentOrgNodeIds = [...new Set([
    ...viewScope.departmentAllTabOrgNodeIds.filter((departmentOrgNodeId) => relationships.nearestDepartmentOrgNodeIdByNodeId.has(departmentOrgNodeId)),
    ...viewScope.visibleDepartmentOrgNodeIds.filter((departmentOrgNodeId) => relationships.nearestDepartmentOrgNodeIdByNodeId.has(departmentOrgNodeId)),
    ...visibleTeamOrgNodeIds
      .map((teamOrgNodeId) => relationships.nearestDepartmentOrgNodeIdByNodeId.get(teamOrgNodeId) ?? null)
      .filter((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId)),
  ])];
  const defaultDepartmentOrgNodeId = getDepartmentOrgNodeIdForRecord(
    currentUser.orgNodeId,
    relationships.nearestDepartmentOrgNodeIdByNodeId,
  ) ?? accessibleDepartmentOrgNodeIds[0] ?? "";
  const departments = scopedOrgNodes
    .filter((orgNode) => orgNode.nodeType === "DEPARTMENT" && accessibleDepartmentOrgNodeIds.includes(orgNode.id))
    .sort(compareNames)
    .map((orgNode) => ({ id: orgNode.id, name: orgNode.name }));
  const teamOptions = scopedOrgNodes
    .filter((orgNode) => orgNode.nodeType === "TEAM" && visibleTeamOrgNodeIds.includes(orgNode.id))
    .sort(compareNames)
    .map((orgNode) => ({
      id: orgNode.id,
      name: orgNode.name,
      departmentOrgNodeId: relationships.nearestDepartmentOrgNodeIdByNodeId.get(orgNode.id) ?? null,
    }));

  return {
    scopedOrgNodes,
    departmentOrgNodeIdByTeamOrgNodeId: new Map(teamOptions.map((team) => [team.id, team.departmentOrgNodeId ?? ""] as const).filter((entry) => Boolean(entry[1])) as Array<[string, string]>),
    accessibleDepartmentOrgNodeIds,
    departments,
    teamOptions,
    defaultDepartmentOrgNodeId,
  };
}

function buildEmptyKpiPageData(
  year: number,
  quarter: number,
  availableYears: number[],
  availableQuarters: number[],
  emptyStages: Array<{ label: string; count: number }>,
  scopeNodes: ResolvedScopeNodes,
  departmentAllTabOrgNodeIds: string[],
  hasAnyViewPermission: boolean,
): KpiPageData {
  return {
    year,
    quarter,
    availableYears,
    availableQuarters,
    rows: [],
    stages: emptyStages,
    totalCount: 0,
    memberOptions: [],
    teamOptions: scopeNodes.teamOptions,
    departmentOptions: scopeNodes.departments,
    departmentAllTabOrgNodeIds,
    defaultDepartmentOrgNodeId: scopeNodes.defaultDepartmentOrgNodeId,
    canSelectAnyDepartment: false,
    templateRows: [],
    permissions: {
      canManageKpi: false,
      canManageKpiTemplate: false,
      canToggleKpiTemplate: false,
    },
    hasAnyViewPermission,
  };
}

function getScoringAbilityKey(stage: "SELF" | "LEADER" | "MANAGER" | "FINAL" | null) {
  if (stage === "SELF") return kpiAbilityKeys.scoreSelf;
  if (stage === "LEADER") return kpiAbilityKeys.scoreLeader;
  if (stage === "MANAGER") return kpiAbilityKeys.scoreManager;
  if (stage === "FINAL") return kpiAbilityKeys.scoreFinal;
  return null;
}

export async function getPersonalKpiDetail(currentUser: DataScopeInput, personalKpiId: string) {
  const where = await buildKpiWhereByPermission(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.viewKpi);
  const personalKpi = await prisma.personalKpi.findFirst({
    where: {
      ...where,
      id: personalKpiId,
    },
    select: {
      id: true,
      year: true,
      quarter: true,
      userId: true,
      orgNodeId: true,
      status: true,
      selfScore: true,
      leaderScore: true,
      managerScore: true,
      finalScore: true,
      selfComment: true,
      leaderComment: true,
      managerComment: true,
      initializedAt: true,
    },
  });

  if (!personalKpi) {
    throw new Error("季度 KPI 不存在或无权限查看");
  }

  const [user, items, orgNodes, actionLogs, approvalSteps, actors] = await Promise.all([
    prisma.user.findFirst({
      where: { id: personalKpi.userId },
      select: { id: true, name: true, title: true, orgNodeId: true },
    }),
    prisma.personalKpiItem.findMany({
      where: { personalKpiId: personalKpi.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        score: true,
        scoringStandard: true,
        target: true,
        selfScore: true,
        leaderScore: true,
        managerScore: true,
        finalScore: true,
        selfComment: true,
        leaderComment: true,
        managerComment: true,
        sortOrder: true,
      },
    }),
    prisma.orgNode.findMany({
      select: { id: true, name: true, nodeType: true, parentId: true },
    }),
    prisma.personalKpiActionLog.findMany({
      where: { personalKpiId: personalKpi.id },
      orderBy: [{ actedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, actorId: true, action: true, remark: true, actedAt: true },
    }),
    prisma.personalKpiApprovalStep.findMany({
      where: { personalKpiId: personalKpi.id },
      orderBy: { stepOrder: "asc" },
      select: { stepOrder: true, stageKey: true, approverId: true, status: true },
    }),
    prisma.user.findMany({
      where: {
        id: {
          in: [
            ...(await prisma.personalKpiActionLog.findMany({
              where: { personalKpiId: personalKpi.id },
              select: { actorId: true },
            })).map((log) => log.actorId),
            ...(await prisma.personalKpiApprovalStep.findMany({
              where: { personalKpiId: personalKpi.id },
              select: { approverId: true },
            })).map((step) => step.approverId),
          ],
        },
      },
      select: { id: true, name: true },
    }),
  ]);

  const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name] as const));
  const orgNodeMap = new Map(orgNodes.map((orgNode) => [orgNode.id, orgNode] as const));
  const relationships = buildOrgNodeRelationships(orgNodes);

  const teamOrgNodeId = getTeamOrgNodeIdForRecord(
    user?.orgNodeId ?? personalKpi.orgNodeId,
    relationships.nearestTeamOrgNodeIdByNodeId,
  );
  const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(
    user?.orgNodeId ?? personalKpi.orgNodeId,
    relationships.nearestDepartmentOrgNodeIdByNodeId,
  );
  const teamName = teamOrgNodeId ? (orgNodeMap.get(teamOrgNodeId)?.name ?? "—") : "—";
  const departmentName = departmentOrgNodeId ? (orgNodeMap.get(departmentOrgNodeId)?.name ?? "—") : "—";
  const tone = getKpiTone(personalKpi.status);
  const completedStageIndex = stageOrder.includes(personalKpi.status)
    ? stageOrder.indexOf(personalKpi.status)
    : 0;
  const stages = stageOrder.map((stage, index) => ({
    key: stage,
    label: stageLabels[stage] ?? stage,
    count: index <= completedStageIndex ? 1 : 0,
    active: index === completedStageIndex,
    completed: index < completedStageIndex,
  }));
  const scoreTotal = items.reduce((sum, item) => sum + item.score, 0);
  const selfPenaltyTotal = items.reduce((sum, item) => sum + Math.abs(Math.min(item.selfScore ?? 0, 0)), 0);
  const leaderPenaltyTotal = items.reduce((sum, item) => sum + Math.abs(Math.min(item.leaderScore ?? 0, 0)), 0);
  const managerPenaltyTotal = items.reduce((sum, item) => sum + Math.abs(Math.min(item.managerScore ?? 0, 0)), 0);
  const selfTotal = scoreTotal - selfPenaltyTotal;
  const leaderTotal = scoreTotal - leaderPenaltyTotal;
  const managerTotal = scoreTotal - managerPenaltyTotal;
  const attendanceScore = personalKpi.finalScore !== null && personalKpi.managerScore !== null
    ? personalKpi.finalScore - personalKpi.managerScore
    : 0;
  const finalTotal = managerTotal + attendanceScore;
  const editableStage = getEditableStage(personalKpi.status);
  const hasApprovalChain = approvalSteps.length > 0;
  const currentApprovalStep = approvalSteps.find((step) => step.status === "PENDING") ?? null;
  const scoringAbilityKey = getScoringAbilityKey(editableStage);
  const hasStagePermission = scoringAbilityKey
    ? Boolean(await resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, scoringAbilityKey))
    : false;
  const canScore = editableStage === "SELF"
    ? hasStagePermission && currentUser.id === personalKpi.userId
    : hasStagePermission && (!hasApprovalChain || currentApprovalStep?.approverId === currentUser.id);
  const selfSummary = parseStructuredSummary(personalKpi.selfComment, "季度工作任务总结", "季度工作能力总结");
  const leaderSummary = parseStructuredSummary(personalKpi.leaderComment, "表扬", "机会");
  const managerSummary = parseStructuredSummary(personalKpi.managerComment, "表扬", "机会");

  return {
    id: personalKpi.id,
    year: personalKpi.year,
    quarter: personalKpi.quarter,
    stageKey: personalKpi.status,
    status: stageLabels[personalKpi.status] ?? personalKpi.status,
    tone,
    editableStage,
    availableActions: {
      canSave: editableStage !== null && canScore,
      canSubmit: editableStage === "SELF" && canScore,
      canApprove: (editableStage === "LEADER" || editableStage === "MANAGER" || editableStage === "FINAL") && canScore,
      canReject: (editableStage === "LEADER" || editableStage === "MANAGER" || editableStage === "FINAL") && canScore,
    },
    stages,
    basicInfo: {
      department: departmentName,
      team: teamName,
      name: user?.name ?? "—",
      title: user?.title ?? "—",
      quarterLabel: `${personalKpi.year} Q${personalKpi.quarter}`,
    },
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      scoringStandard: item.scoringStandard || item.description || "—",
      targetDetail: item.target || "",
      score: item.score,
      selfScore: item.selfScore ?? 0,
      leaderScore: item.leaderScore ?? 0,
      managerScore: item.managerScore ?? 0,
    })),
    totals: {
      scoreTotal,
      selfTotal,
      leaderTotal,
      managerTotal,
      attendanceScore,
      finalTotal,
    },
    summary: {
      self: {
        workSummary: selfSummary.first,
        abilitySummary: selfSummary.second,
      },
      leader: {
        praise: leaderSummary.first,
        opportunity: leaderSummary.second,
      },
      manager: {
        praise: managerSummary.first,
        opportunity: managerSummary.second,
      },
      crossDepartment: {
        department: "",
        praise: "",
        opportunity: "",
        complaint: "",
      },
    },
    actionLogs: actionLogs.map((log) => ({
      id: log.id,
      actorName: actorNameById.get(log.actorId) ?? "—",
      action: log.action,
      actedAt: log.actedAt.toISOString(),
      remark: log.remark,
    })),
    approvalSteps: approvalSteps.map((step) => ({
      stepOrder: step.stepOrder,
      stageKey: step.stageKey,
      approverName: actorNameById.get(step.approverId) ?? "—",
      status: step.status,
    } satisfies ApprovalStepSummary)),
  };
}

type KpiPeriodOptions = {
  selectedYear?: number;
  selectedQuarter?: number;
};

function parsePeriodValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildAvailableYears(nowYear: number, yearsFromData: number[]) {
  const uniqueYears = new Set<number>([nowYear, ...yearsFromData.filter((year) => Number.isFinite(year))]);
  return [...uniqueYears].sort((a, b) => b - a);
}

export async function getKpiData(currentUser: DataScopeInput, periodOptions: KpiPeriodOptions = {}): Promise<KpiPageData> {
  const [viewScope, manageKpiScope, manageTemplateScope, toggleTemplateScope, scoreSelfScope, scoreLeaderScope, scoreManagerScope, scoreFinalScope] = await Promise.all([
    resolveKpiViewScope(currentUser),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.initializeKpi),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.manageKpiTemplate),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.toggleKpiTemplate),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.scoreSelf),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.scoreLeader),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.scoreManager),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.scoreFinal),
  ]);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const availableYearsFromDb = [
    ...(await prisma.personalKpi.findMany({
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    })).map((item) => item.year),
    ...(await prisma.kpiTemplateAssignment.findMany({
      where: { effectiveFromYear: { not: null } },
      distinct: ["effectiveFromYear"],
      select: { effectiveFromYear: true },
      orderBy: { effectiveFromYear: "desc" },
    })).flatMap((item) => item.effectiveFromYear ? [item.effectiveFromYear] : []),
    ...(await prisma.kpiTemplateAssignment.findMany({
      where: { effectiveToYear: { not: null } },
      distinct: ["effectiveToYear"],
      select: { effectiveToYear: true },
      orderBy: { effectiveToYear: "desc" },
    })).flatMap((item) => item.effectiveToYear ? [item.effectiveToYear] : []),
  ];
  const availableYears = buildAvailableYears(currentYear, availableYearsFromDb);
  const availableQuarters = [1, 2, 3, 4];
  const selectedYear = parsePeriodValue(periodOptions.selectedYear) ?? currentYear;
  const selectedQuarter = ([1, 2, 3, 4] as const).includes(periodOptions.selectedQuarter as 1 | 2 | 3 | 4)
    ? periodOptions.selectedQuarter as number
    : currentQuarter;
  const year = selectedYear;
  const quarter = selectedQuarter;

  const emptyStages = [
    { label: "初始化", count: 0 },
    { label: "自评", count: 0 },
    { label: "组长评", count: 0 },
    { label: "主管评", count: 0 },
    { label: "终审", count: 0 },
    { label: "已完成", count: 0 },
  ];

  const allScopedOrgNodes = await prisma.orgNode.findMany({
    select: { id: true, name: true, nodeType: true, parentId: true },
  });
  const scopedOrgNodes = allScopedOrgNodes;
  const scopeNodes = resolveScopeNodes(currentUser, viewScope, scopedOrgNodes);

  const canViewRows = viewScope.canViewKpi;
  const canViewTemplates = viewScope.canViewTemplate;
  const canAccessTemplateList = canViewTemplates || Boolean(manageTemplateScope) || Boolean(toggleTemplateScope);

  if (!viewScope.hasAnyViewPermission && !canAccessTemplateList) {
    return buildEmptyKpiPageData(
      year,
      quarter,
      availableYears,
      availableQuarters,
      emptyStages,
      scopeNodes,
      viewScope.departmentAllTabOrgNodeIds,
      false,
    );
  }

  const {
    scopedOrgNodes: resolvedOrgNodes,
    departmentOrgNodeIdByTeamOrgNodeId,
    accessibleDepartmentOrgNodeIds,
    departments,
    teamOptions,
    defaultDepartmentOrgNodeId,
  } = scopeNodes;

  const orgNodeMap = new Map(resolvedOrgNodes.map((orgNode) => [orgNode.id, orgNode] as const));
  const relationships = buildOrgNodeRelationships(resolvedOrgNodes);
  const canManageKpi = Boolean(manageKpiScope);
  const canManageKpiTemplate = Boolean(manageTemplateScope);
  const canToggleKpiTemplate = Boolean(toggleTemplateScope);
  const canScoreSelf = Boolean(scoreSelfScope);
  const canScoreLeader = Boolean(scoreLeaderScope);
  const canScoreManager = Boolean(scoreManagerScope);
  const canScoreFinal = Boolean(scoreFinalScope);
  const stageCounts: Record<KpiStatus, number> = {
    DRAFT: 0,
    PENDING_SELF_REVIEW: 0,
    PENDING_LEADER_SCORE: 0,
    PENDING_MANAGER_SCORE: 0,
    PENDING_FINAL_REVIEW: 0,
    COMPLETED: 0,
  };

  const where = canViewRows
    ? await buildKpiWhereByPermission(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.viewKpi)
    : { id: { in: [] } };
  const templateUserWhere = canAccessTemplateList
    ? await buildUserWhereByPermission(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.viewKpiTemplate)
    : { id: { in: [] } };
  const rowUserWhere = canViewRows
    ? await buildUserWhereByPermission(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.viewKpi)
    : { id: { in: [] } };

  const kpis = canViewRows
    ? await prisma.personalKpi.findMany({
        where: {
          ...where,
          year,
          quarter,
        },
        orderBy: [{ createdAt: "desc" }],
      })
    : [];

  const kpiIds = kpis.map((k) => k.id);
  const allItems = kpiIds.length
    ? await prisma.personalKpiItem.findMany({ where: { personalKpiId: { in: kpiIds } } })
    : [];
  const approvalStepRows = kpiIds.length
    ? await prisma.personalKpiApprovalStep.findMany({
        where: { personalKpiId: { in: kpiIds } },
        orderBy: [{ stepOrder: "asc" }],
        select: { personalKpiId: true, approverId: true, status: true, stepOrder: true },
      })
    : [];
  const activeApprovalStepByKpiId = new Map<string, typeof approvalStepRows[number]>();
  const hasApprovalChainByKpiId = new Map<string, boolean>();
  for (const step of approvalStepRows) {
    hasApprovalChainByKpiId.set(step.personalKpiId, true);
    if (step.status !== "PENDING") continue;
    if (!activeApprovalStepByKpiId.has(step.personalKpiId)) {
      activeApprovalStepByKpiId.set(step.personalKpiId, step);
    }
  }
  const itemsByKpi = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const list = itemsByKpi.get(item.personalKpiId) ?? [];
    list.push(item);
    itemsByKpi.set(item.personalKpiId, list);
  }

  const users = await prisma.user.findMany({
    where: {
      ...rowUserWhere,
      isActive: true,
    },
    select: { id: true, name: true, orgNodeId: true, roleType: true },
    orderBy: { name: "asc" },
  });
  const totalCount = users.length;
  const templateUsersForMatching = canAccessTemplateList
    ? await prisma.user.findMany({
        where: {
          ...templateUserWhere,
          isActive: true,
        },
        select: { id: true, name: true, orgNodeId: true, roleType: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u] as const));
  const rowUserDepartmentOrgNodeIdEntries = await Promise.all(
    users.map(async (user) => [user.id, await findNearestDepartmentOrgNodeId(user.orgNodeId)] as const)
  );
  const rowUserDepartmentOrgNodeIdByUserId = new Map(rowUserDepartmentOrgNodeIdEntries);
  const templateUserMap = new Map(templateUsersForMatching.map((u) => [u.id, u] as const));
  const orgNodeIds = [...new Set(templateUsersForMatching.map((user) => user.orgNodeId).filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId)))];
  const templateUserDepartmentOrgNodeIdEntries = await Promise.all(
    templateUsersForMatching.map(async (user) => [user.id, await findNearestDepartmentOrgNodeId(user.orgNodeId)] as const)
  );
  const templateUserDepartmentOrgNodeIdByUserId = new Map(templateUserDepartmentOrgNodeIdEntries);
  const rows = kpis.flatMap((personalKpi) => {
    const user = userMap.get(personalKpi.userId);
    const items = itemsByKpi.get(personalKpi.id) ?? [];
    const totalScore = items.reduce((sum, item) => sum + item.score, 0);
    const progress = totalScore > 0
      ? Math.round((items.reduce((sum, item) => sum + (item.selfScore ?? 0), 0) / totalScore) * 100)
      : 0;
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(personalKpi.orgNodeId, relationships.nearestTeamOrgNodeIdByNodeId);
    const departmentOrgNodeId = rowUserDepartmentOrgNodeIdByUserId.get(personalKpi.userId)
      ?? getDepartmentOrgNodeIdForRecord(personalKpi.orgNodeId, relationships.nearestDepartmentOrgNodeIdByNodeId)
      ?? null;
    stageCounts[personalKpi.status] += 1;

    return [{
      id: personalKpi.id,
      userId: personalKpi.userId,
      userName: user?.name ?? "历史成员",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? (orgNodeMap.get(teamOrgNodeId)?.name ?? "—") : "—",
      itemCount: items.length,
      stageKey: personalKpi.status,
      status: getKpiListStageLabel(personalKpi.status),
      tone: getKpiTone(personalKpi.status),
      progress,
      score: `${personalKpi.finalScore ?? personalKpi.managerScore ?? personalKpi.leaderScore ?? personalKpi.selfScore ?? 0}`,
      availableActions: {
        canSelfReview: canScoreSelf && personalKpi.userId === currentUser.id && (personalKpi.status === "DRAFT" || personalKpi.status === "PENDING_SELF_REVIEW"),
        canLeaderScore: canScoreLeader
          && personalKpi.status === "PENDING_LEADER_SCORE"
          && (!hasApprovalChainByKpiId.get(personalKpi.id) || activeApprovalStepByKpiId.get(personalKpi.id)?.approverId === currentUser.id),
        canManagerScore: canScoreManager
          && personalKpi.status === "PENDING_MANAGER_SCORE"
          && (!hasApprovalChainByKpiId.get(personalKpi.id) || activeApprovalStepByKpiId.get(personalKpi.id)?.approverId === currentUser.id),
        canFinalReview: canScoreFinal
          && personalKpi.status === "PENDING_FINAL_REVIEW"
          && (!hasApprovalChainByKpiId.get(personalKpi.id) || activeApprovalStepByKpiId.get(personalKpi.id)?.approverId === currentUser.id),
      },
    }];
  });

  const templateDepartmentIds = canAccessTemplateList ? accessibleDepartmentOrgNodeIds : [];
  const candidateTemplates = templateDepartmentIds.length
    ? await prisma.kpiTemplate.findMany({
        where: {
          deletedAt: null,
          departmentOrgNodeId: { in: templateDepartmentIds },
        },
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          name: true,
          description: true,
          createdById: true,
          updatedById: true,
          departmentOrgNodeId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    : [];
  const candidateTemplateAssignments = candidateTemplates.length
    ? await prisma.kpiTemplateAssignment.findMany({
        where: { templateId: { in: candidateTemplates.map((template) => template.id) }, isActive: true },
        select: {
          templateId: true,
          targetType: true,
          targetUserId: true,
          targetOrgNodeId: true,
          targetRoleType: true,
          effectiveFromYear: true,
          effectiveFromQuarter: true,
          effectiveToYear: true,
          effectiveToQuarter: true,
        },
      })
    : [];
  const assignmentOrgNodeIds = [...new Set(
    candidateTemplateAssignments
      .map((assignment) => assignment.targetOrgNodeId)
      .filter((targetOrgNodeId): targetOrgNodeId is string => Boolean(targetOrgNodeId))
  )];
  const orgClosureRows = orgNodeIds.length && assignmentOrgNodeIds.length
    ? await prisma.orgClosure.findMany({
        where: {
          descendantId: { in: orgNodeIds },
          ancestorId: { in: assignmentOrgNodeIds },
        },
        select: {
          descendantId: true,
          ancestorId: true,
        },
      })
    : [];
  const assignmentOrgPairSet = new Set(orgClosureRows.map((row) => `${row.descendantId}:${row.ancestorId}`));
  const visibleTemplateIds = new Set<string>();
  const matchedUserIdsByTemplateId = new Map<string, string[]>();
  const matchedTeamOrgNodeIdsByTemplateId = new Map<string, string[]>();

  const getQuarterCode = (targetYear: number, targetQuarter: number) => targetYear * 10 + targetQuarter;
  const currentQuarterCode = getQuarterCode(year, quarter);

  for (const template of candidateTemplates) {
    const assignments = candidateTemplateAssignments.filter((assignment) => assignment.templateId === template.id);
    const matchedUserIds: string[] = [];
    const matchedTeamOrgNodeIds = new Set<string>();

    if (canManageKpiTemplate) {
      visibleTemplateIds.add(template.id);
      matchedUserIdsByTemplateId.set(template.id, []);
      matchedTeamOrgNodeIdsByTemplateId.set(template.id, []);
      continue;
    }

    if (assignments.length === 0) {
      if (canToggleKpiTemplate) {
        visibleTemplateIds.add(template.id);
        matchedUserIdsByTemplateId.set(template.id, []);
        matchedTeamOrgNodeIdsByTemplateId.set(template.id, []);
      }
      continue;
    }

    for (const user of templateUsersForMatching) {
      const userDepartmentOrgNodeId = templateUserDepartmentOrgNodeIdByUserId.get(user.id) ?? null;
      if (userDepartmentOrgNodeId !== template.departmentOrgNodeId) {
        continue;
      }

      const matched = assignments.some((assignment) => {
        const from = assignment.effectiveFromYear && assignment.effectiveFromQuarter
          ? getQuarterCode(assignment.effectiveFromYear, assignment.effectiveFromQuarter)
          : null;
        const to = assignment.effectiveToYear && assignment.effectiveToQuarter
          ? getQuarterCode(assignment.effectiveToYear, assignment.effectiveToQuarter)
          : null;

        if (from !== null && currentQuarterCode < from) return false;
        if (to !== null && currentQuarterCode > to) return false;

        if (assignment.targetType === "USER") {
          return assignment.targetUserId === user.id;
        }
        if (assignment.targetType === "ROLE") {
          return assignment.targetRoleType === user.roleType;
        }
        if (!user.orgNodeId || !assignment.targetOrgNodeId) {
          return false;
        }
        return assignmentOrgPairSet.has(`${user.orgNodeId}:${assignment.targetOrgNodeId}`);
      });

      if (!matched) {
        continue;
      }

      matchedUserIds.push(user.id);
      const matchedTeamOrgNodeId = getTeamOrgNodeIdForRecord(user.orgNodeId, relationships.nearestTeamOrgNodeIdByNodeId);
      if (matchedTeamOrgNodeId) {
        matchedTeamOrgNodeIds.add(matchedTeamOrgNodeId);
      }
    }

    if (matchedUserIds.length > 0) {
      visibleTemplateIds.add(template.id);
      matchedUserIdsByTemplateId.set(template.id, matchedUserIds);
      matchedTeamOrgNodeIdsByTemplateId.set(template.id, [...matchedTeamOrgNodeIds]);
    }
  }

  const templates = candidateTemplates.filter((template) => visibleTemplateIds.has(template.id));
  const templateItems = templates.length
    ? await prisma.kpiTemplateItem.findMany({
        where: { templateId: { in: templates.map((template) => template.id) } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          templateId: true,
          name: true,
          description: true,
          score: true,
          scoringStandard: true,
          sortOrder: true,
        },
      })
    : [];
  const templateItemsByTemplateId = new Map<string, typeof templateItems>();
  for (const item of templateItems) {
    const items = templateItemsByTemplateId.get(item.templateId) ?? [];
    items.push(item);
    templateItemsByTemplateId.set(item.templateId, items);
  }
  const templateAssignments = templates.length
    ? await prisma.kpiTemplateAssignment.findMany({
        where: { templateId: { in: templates.map((template) => template.id) }, isActive: true },
        select: {
          templateId: true,
          targetType: true,
          targetUserId: true,
          targetOrgNodeId: true,
          targetRoleType: true,
        },
      })
    : [];
  const templateAssignmentsByTemplateId = new Map<string, typeof templateAssignments>();
  for (const assignment of templateAssignments) {
    const items = templateAssignmentsByTemplateId.get(assignment.templateId) ?? [];
    items.push(assignment);
    templateAssignmentsByTemplateId.set(assignment.templateId, items);
  }
  const templateUserIds = [...new Set([
    ...templates.flatMap((template) => [template.createdById, template.updatedById].filter((id): id is string => Boolean(id))),
    ...templateAssignments.flatMap((assignment) => assignment.targetUserId ? [assignment.targetUserId] : []),
  ])];
  const templateUsers = templateUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: templateUserIds } },
        select: { id: true, name: true },
      })
    : [];
  const templateUserById = new Map(templateUsers.map((user) => [user.id, user.name] as const));
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name] as const));

  const stages = [
    {
      label: "初始化",
      count: rows.filter((row) => row.stageKey === "DRAFT").length,
    },
    {
      label: "自评",
      count: rows.filter((row) => row.stageKey === "PENDING_SELF_REVIEW").length,
    },
    {
      label: "组长评",
      count: rows.filter((row) => row.stageKey === "PENDING_LEADER_SCORE").length,
    },
    {
      label: "主管评",
      count: rows.filter((row) => row.stageKey === "PENDING_MANAGER_SCORE").length,
    },
    {
      label: "终审",
      count: rows.filter((row) => row.stageKey === "PENDING_FINAL_REVIEW").length,
    },
    {
      label: "已完成",
      count: rows.filter((row) => row.stageKey === "COMPLETED").length,
    },
  ];

  const teamNameById = new Map(teamOptions.map((team) => [team.id, team.name] as const));
  const memberNameById = new Map(users.map((user) => [user.id, user.name] as const));

  return {
    year,
    quarter,
    availableYears,
    availableQuarters,
    rows,
    stages,
    totalCount,
    memberOptions: users.map((user) => ({
      id: user.id,
      name: user.name,
      orgNodeId: user.orgNodeId,
      teamOrgNodeId: getTeamOrgNodeIdForRecord(user.orgNodeId, relationships.nearestTeamOrgNodeIdByNodeId),
      departmentOrgNodeId: getDepartmentOrgNodeIdForRecord(user.orgNodeId, relationships.nearestDepartmentOrgNodeIdByNodeId),
      roleType: user.roleType,
    })),
    teamOptions,
    departmentOptions: departments,
    departmentAllTabOrgNodeIds: viewScope.departmentAllTabOrgNodeIds,
    defaultDepartmentOrgNodeId,
    canSelectAnyDepartment: currentUser.roleType === "ADMIN",
    templateRows: templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      createdByName: templateUserById.get(template.createdById) ?? "—",
      updatedByName: template.updatedById ? (templateUserById.get(template.updatedById) ?? "—") : "—",
      scopeName: (() => {
        const assignments = templateAssignmentsByTemplateId.get(template.id) ?? [];
        const labels = assignments.map((assignment) => {
          if (assignment.targetType === "ORG_NODE") {
            if (!assignment.targetOrgNodeId) return "—";
            const resolvedTeamOrgNodeId = getTeamOrgNodeIdForRecord(
              assignment.targetOrgNodeId,
              relationships.nearestTeamOrgNodeIdByNodeId,
            );
            const resolvedDepartmentOrgNodeId = getDepartmentOrgNodeIdForRecord(
              assignment.targetOrgNodeId,
              relationships.nearestDepartmentOrgNodeIdByNodeId,
            );
            return resolvedTeamOrgNodeId
              ? (teamNameById.get(resolvedTeamOrgNodeId) ?? "—")
              : (resolvedDepartmentOrgNodeId ? (departmentNameById.get(resolvedDepartmentOrgNodeId) ?? "—") : "—");
          }
          if (assignment.targetType === "USER") {
            return assignment.targetUserId ? (memberNameById.get(assignment.targetUserId) ?? "—") : "—";
          }
          return "—";
        }).filter((label, index, list) => label !== "—" && list.indexOf(label) === index);
        return labels.length ? labels.join("、") : "—";
      })(),
      scopeDepartmentOrgNodeIds: (() => {
        const assignments = templateAssignmentsByTemplateId.get(template.id) ?? [];
        return [...new Set(assignments
          .filter((assignment) => assignment.targetType === "ORG_NODE" && assignment.targetOrgNodeId)
          .map((assignment) => getDepartmentOrgNodeIdForRecord(
            assignment.targetOrgNodeId as string,
            relationships.nearestDepartmentOrgNodeIdByNodeId,
          ))
          .filter((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId)))];
      })(),
      scopeTeamIds: (() => {
        const assignments = templateAssignmentsByTemplateId.get(template.id) ?? [];
        return [...new Set(assignments
          .filter((assignment) => assignment.targetType === "ORG_NODE" && assignment.targetOrgNodeId)
          .map((assignment) => getTeamOrgNodeIdForRecord(
            assignment.targetOrgNodeId as string,
            relationships.nearestTeamOrgNodeIdByNodeId,
          ))
          .filter((teamOrgNodeId): teamOrgNodeId is string => Boolean(teamOrgNodeId)))];
      })(),
      scopeUserIds: (() => {
        const assignments = templateAssignmentsByTemplateId.get(template.id) ?? [];
        return [...new Set(assignments
          .filter((assignment) => assignment.targetType === "USER" && assignment.targetUserId)
          .map((assignment) => assignment.targetUserId as string))];
      })(),
      groupTeamIds: (() => {
        const assignments = templateAssignmentsByTemplateId.get(template.id) ?? [];
        const directTeamIds = assignments
          .filter((assignment) => assignment.targetType === "ORG_NODE" && assignment.targetOrgNodeId)
          .map((assignment) => getTeamOrgNodeIdForRecord(
            assignment.targetOrgNodeId as string,
            relationships.nearestTeamOrgNodeIdByNodeId,
          ))
          .filter((teamOrgNodeId): teamOrgNodeId is string => Boolean(teamOrgNodeId));
        const departmentAssignmentIds = assignments
          .filter((assignment) => assignment.targetType === "ORG_NODE" && assignment.targetOrgNodeId)
          .map((assignment) => getDepartmentOrgNodeIdForRecord(
            assignment.targetOrgNodeId as string,
            relationships.nearestDepartmentOrgNodeIdByNodeId,
          ))
          .filter((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId));
        const roleTeamIds = assignments.flatMap((assignment) => {
          if (assignment.targetType !== "ROLE" || !assignment.targetRoleType) return [];
          return templateUsersForMatching
            .filter((user) => user.roleType === assignment.targetRoleType)
            .map((user) => getTeamOrgNodeIdForRecord(user.orgNodeId, relationships.nearestTeamOrgNodeIdByNodeId))
            .filter((teamOrgNodeId): teamOrgNodeId is string => Boolean(teamOrgNodeId));
        });
        const userTeamIds = assignments.flatMap((assignment) => {
          if (assignment.targetType !== "USER" || !assignment.targetUserId) return [];
          const user = templateUserMap.get(assignment.targetUserId);
          const teamOrgNodeId = getTeamOrgNodeIdForRecord(user?.orgNodeId, relationships.nearestTeamOrgNodeIdByNodeId);
          return teamOrgNodeId ? [teamOrgNodeId] : [];
        });
        const departmentTeamIds = departmentAssignmentIds.flatMap((departmentOrgNodeId) => teamOptions
          .filter((team) => team.departmentOrgNodeId === departmentOrgNodeId)
          .map((team) => team.id));
        return [...new Set([...directTeamIds, ...roleTeamIds, ...userTeamIds, ...departmentTeamIds])];
      })(),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      departmentOrgNodeId: template.departmentOrgNodeId,
      isActive: template.isActive,
      items: (templateItemsByTemplateId.get(template.id) ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        score: item.score,
        scoringStandard: item.scoringStandard,
        sortOrder: item.sortOrder,
      })),
    })),
    permissions: {
      canManageKpi,
      canManageKpiTemplate,
      canToggleKpiTemplate,
    },
    hasAnyViewPermission: true,
  };
}
