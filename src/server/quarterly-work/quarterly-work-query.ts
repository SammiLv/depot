import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import {
  canManageProductGoal,
  canManageProductTask,
  canManageProjectAndValueTracking,
} from "@/server/quarterly-work/permission";
import {
  isLaunchedProjectVisibleInPeriod,
  isProjectVisibleInPeriod,
  isQuarterlyWorkVisibleInPeriod,
  isValueTrackVisibleInPeriod,
  type ActivePeriod,
} from "@/server/quarterly-work/quarterly-work-period-filters";
import { normalizeValueTrackStatus } from "@/server/quarterly-work/value-track-constants";
import {
  doesCalendarQuarterOverlapTrackingWindow,
  doesYearOverlapTrackingWindow,
  getValueTrackingTaskDates,
  getValueTrackTaskState,
  isValueTrackingOverdue,
  toBusinessDate,
  type ValueTrackTaskState,
} from "@/server/quarterly-work/value-tracking-period";
import type { OrgNodeType, ProjectStatus, RoleType, WorkStatus } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

type WorkspaceStatusFilter = ProjectStatus | "DELAYED" | "all";
type WorkspaceViewMode = "card" | "list";
type ProjectPanelMode = "task" | "value";
type WorkspacePanel = "goal" | "project" | "task" | "value";

type QuarterlyWorkQueryOptions = {
  selectedYear?: number;
  selectedQuarter?: number | "all";
  goalId?: string | "all";
  view?: WorkspaceViewMode;
  projectPanel?: ProjectPanelMode;
  panel?: WorkspacePanel;
  status?: WorkspaceStatusFilter[];
  orgNodeId?: string | null;
  teamId?: string | "all" | null;
  ownerId?: string | null;
  projectId?: string | null;
  workId?: string | null;
  query?: string | null;
};

type OrgNodeSummary = {
  id: string;
  name: string;
  nodeType: OrgNodeType;
  parentId: string | null;
};

type BoardItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  year: number;
  startMonth: number | null;
  endMonth: number | null;
  startDate: Date | null;
  endDate: Date | null;
  status: WorkStatus;
  description: string | null;
  taskDescription: string | null;
  expectedOutcome: string | null;
  taskResult: string | null;
  executionSummary: string | null;
  workloadPersonDay: number | null;
  needsDevelopment: boolean | null;
  remainingWeeksLabel: string | null;
  createdAt: Date;
  completedAt: Date | null;
  progress?: number;
  delay?: number;
};

type ProductGoalBoardItem = {
  id: string;
  title: string;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  status: ProjectStatus;
  year: number;
  description: string | null;
  expectedOutcome: string | null;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

type ProjectBoardItem = {
  id: string;
  title: string;
  productGoalIds: string[];
  productGoalTitle: string | null;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  status: ProjectStatus;
  startQuarter: string | null;
  endQuarter: string | null;
  remainingWeeksLabel: string | null;
  description: string | null;
  expectedOutcome: string | null;
  workloadPersonDay: number | null;
  needsDevelopment: boolean | null;
  otherCost: string | null;
  actualValue: string | null;
  valueJudgement: string | null;
  valueTrackStatus: string;
  workCount: number;
  activeQuarterCount: number;
  createdAt: Date;
  launchedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
};

type ColumnData = {
  key: string;
  title: string;
  tone: "default" | "primary" | "warning" | "success";
  status: WorkStatus;
  items: BoardItem[];
};

type ProductGoalColumnData = {
  key: string;
  title: string;
  tone: "default" | "primary" | "warning" | "success";
  status: ProjectStatus;
  items: ProductGoalBoardItem[];
};

type ProjectColumnData = {
  key: string;
  title: string;
  tone: "default" | "primary" | "warning" | "success";
  status: ProjectStatus;
  items: ProjectBoardItem[];
};

type ValueOverviewItem = {
  id: string;
  title: string;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  /** 项目总工作量 = 首版工作量 + 上线后迭代工作量（需求汇总口径，只读） */
  workloadPersonDay: number | null;
  otherCost: string | null;
  expectedOutcome: string | null;
  actualValue: string | null;
  valueJudgement: string | null;
  valueTrackStatus: string;
  status: ProjectStatus;
  launchedAt: Date | null;
  firstVersionWorkloadPersonDay: number | null;
  postLaunchIterationWorkloadPersonDay: number | null;
  /** 首版完成度（0~100）；数据不完整为 null */
  firstVersionCompletionPercent: number | null;
  /** 最终值已冻结 */
  completionIsFinal: boolean;
  /** 已填写工作量需求数 / 纳入统计的开发需求数 */
  includedRequirementCount: number;
  missingWorkloadRequirementCount: number;
  /** 超过最终填报截止日期仍未完成最终确认 */
  valueTrackOverdue: boolean;
  /** 当前待处理检查点：1 或 2；全部完成为 null */
  currentTrackingSequence: number | null;
};

type ValueTrackItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  trackedAt: Date;
  trackingSequence: number | null;
  periodStartAt: Date | null;
  checkpointAt: Date | null;
  deadlineAt: Date | null;
  completedAt: Date | null;
  isFinal: boolean;
  taskState: ValueTrackTaskState;
  trackingResult: string | null;
  followUpOptimization: string | null;
  firstVersionWorkloadPersonDay: number | null;
  postLaunchIterationWorkloadPersonDay: number | null;
  totalWorkloadPersonDay: number | null;
  firstVersionCompletionPercent: number | null;
  workloadComplete: boolean | null;
  actualValue: string | null;
  valueJudgement: string | null;
  valueTrackStatus: string;
};

type GoalNavigationItem = {
  id: string;
  title: string;
  year: number | null;
  ownerId: string | null;
  owner: string | null;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  status: ProjectStatus | "all";
  description: string | null;
  expectedOutcome: string | null;
  projectCount: number;
  taskCount: number;
  isAll: boolean;
};

type ProjectWorkspaceTaskItem = BoardItem & {
  year: number;
  quarter: number;
  periodLabel: string;
  isOverdue: boolean;
};

type ProjectWorkspaceValueTrackItem = ValueTrackItem & {
  periodLabel: string;
};

type ValueTrackingRequirementItem = {
  id: string;
  title: string;
  createdAt: Date;
  completedAt: Date | null;
  needsDevelopment: boolean | null;
  workloadPersonDay: number | null;
  status: WorkStatus;
  /** 仅上线后迭代需求使用：第 1 / 第 2 跟踪周期 */
  trackingPeriodLabel: string | null;
};

type ProjectWorkspaceItem = ProjectBoardItem & {
  productGoals: Array<{
    id: string;
    title: string;
    year: number;
  }>;
  statusFilterKey: WorkspaceStatusFilter;
  isOverdue: boolean;
  tasks: ProjectWorkspaceTaskItem[];
  valueTracks: ProjectWorkspaceValueTrackItem[];
  valueTrackSummary: {
    status: string;
    judgement: string | null;
    actualValue: string | null;
    latestTrackedAt: Date | null;
    trackCount: number;
    // 是否已进入价值跟踪：存在有效上线时间即进入（不再依赖项目当前状态）
    initialized: boolean;
    // 逾期待完成：超过最终填报截止日期仍未完成最终确认
    overdue: boolean;
    // 当前待处理检查点：1 或 2；全部完成为 null
    currentSequence: number | null;
    firstVersionWorkloadPersonDay: number | null;
    postLaunchIterationWorkloadPersonDay: number | null;
    totalWorkloadPersonDay: number | null;
    // 首版完成度（0~100）；数据不完整为 null；completionIsFinal 标识最终冻结值
    firstVersionCompletionPercent: number | null;
    completionIsFinal: boolean;
    workloadComplete: boolean;
    includedRequirementCount: number;
    missingWorkloadRequirementCount: number;
    // 需求构成明细（供价值详情核查指标来源）
    firstVersionRequirements: ValueTrackingRequirementItem[];
    postLaunchRequirements: ValueTrackingRequirementItem[];
  };
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

function parseQuarterCode(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-Q([1-4])$/);
  if (!match) {
    return null;
  }

  return {
    year: Number.parseInt(match[1], 10),
    quarter: Number.parseInt(match[2], 10),
  };
}

function getQuarterEndDate(value: string | null | undefined) {
  const parsed = parseQuarterCode(value);
  if (!parsed) {
    return null;
  }
  // 季度末取当季最后一天的 23:59:59（月末结束），而非当天零点
  return new Date(parsed.year, parsed.quarter * 3, 0, 23, 59, 59, 999);
}

function getQuarterByDate(date: Date | null | undefined) {
  if (!date) {
    return null;
  }
  return Math.floor(date.getMonth() / 3) + 1;
}

function computeTaskWorkloadPersonDay(tasks: Array<{ workloadPersonDay: number | null }>): number | null {
  if (tasks.length === 0) return null;
  const sum = tasks.reduce((total, task) => total + (task.workloadPersonDay ?? 0), 0);
  return sum > 0 ? Math.round(sum * 10) / 10 : null;
}

function formatTaskRemainLabel(work: { year: number; endMonth: number | null; endDate?: Date | null; completedAt: Date | null; status: WorkStatus }) {
  // 关闭的任务已中止，不再统计剩余/逾期
  if (work.status === "CLOSED") {
    return null;
  }
  // 按月推算时，截止点取当月最后一天的 23:59:59（月末结束），而非当天零点
  const planEndDate = work.endDate ?? (work.endMonth ? new Date(work.year, work.endMonth, 0, 23, 59, 59, 999) : null);
  if (!planEndDate) {
    return null;
  }
  // 已完成任务以完成时间衡量是否逾期，未完成任务以当前时间衡量剩余/逾期
  const referenceDate = work.completedAt ?? new Date();
  const diffDays = (planEndDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
  const roundedWeeks = Math.round((Math.abs(diffDays) / 7) * 10) / 10;
  if (diffDays < 0) {
    return `逾期${roundedWeeks}周`;
  }
  // 已完成且未逾期（在周期内完成）：不打任何标签
  if (work.completedAt) {
    return null;
  }
  // 未完成：仅剩余 2 周内才提示，超过 2 周不打标签
  if (diffDays / 7 <= 2) {
    return `剩余${roundedWeeks}周`;
  }
  return null;
}

function formatProjectRemainLabel(project: {
  startQuarter: string | null;
  endQuarter: string | null;
  status: ProjectStatus;
  completedAt: Date | null;
}) {
  // 关闭的项目已中止，不再统计剩余/逾期
  if (project.status === "CLOSED") {
    return null;
  }
  const planEndDate = getQuarterEndDate(project.endQuarter ?? project.startQuarter);
  if (!planEndDate) {
    return null;
  }
  // 仅「已完成」算项目完成状态，以完成时间衡量是否逾期；其余（含已上线）均以当前时间衡量
  const referenceDate = project.status === "COMPLETED" ? (project.completedAt ?? new Date()) : new Date();
  const diffDays = (planEndDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
  const roundedWeeks = Math.round((Math.abs(diffDays) / 7) * 10) / 10;
  if (diffDays < 0) {
    return `逾期${roundedWeeks}周`;
  }
  // 已完成且未逾期（在周期内完成）：不打任何标签
  if (project.status === "COMPLETED") {
    return null;
  }
  // 未完成项目：距季度截止 ≤1 个月才提示剩余，超过 1 个月不打标签
  const oneMonthAhead = new Date(referenceDate);
  oneMonthAhead.setMonth(oneMonthAhead.getMonth() + 1);
  if (planEndDate.getTime() <= oneMonthAhead.getTime()) {
    return `剩余${roundedWeeks}周`;
  }
  return null;
}

// 需求周期展示：优先精确日期（短格式 9月1日 ~ 9月30日），老数据退到月份
function formatTaskPeriodLabel(work: {
  startDate?: Date | null;
  endDate?: Date | null;
  startMonth?: number | null;
  endMonth?: number | null;
}) {
  const { startDate, endDate } = work;
  if (startDate && endDate) {
    const startText = `${startDate.getMonth() + 1}月${startDate.getDate()}日`;
    const endText = `${endDate.getMonth() + 1}月${endDate.getDate()}日`;
    return startText === endText ? startText : `${startText} - ${endText}`;
  }
  if (startDate) {
    return `${startDate.getMonth() + 1}月${startDate.getDate()}日起`;
  }
  if (endDate) {
    return `${endDate.getMonth() + 1}月${endDate.getDate()}日前`;
  }
  const { startMonth, endMonth } = work;
  if (startMonth && endMonth) {
    return startMonth === endMonth ? `${startMonth}月` : `${startMonth}月 - ${endMonth}月`;
  }
  if (startMonth) {
    return `${startMonth}月起`;
  }
  if (endMonth) {
    return `${endMonth}月前`;
  }
  return "—";
}

function normalizeSearchQuery(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function textMatchesSearchQuery(query: string, ...values: Array<string | number | null | undefined>) {
  if (!query) {
    return true;
  }
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function normalizeWorkspaceStatusFilters(values: WorkspaceStatusFilter[] | null | undefined): WorkspaceStatusFilter[] {
  const allowed: WorkspaceStatusFilter[] = ["DELAYED", "NOT_STARTED", "IN_PROGRESS", "LAUNCHED", "COMPLETED", "CLOSED"];
  if (!values?.length) return [];
  return [...new Set(values.filter((value): value is Exclude<WorkspaceStatusFilter, "all"> => allowed.includes(value)))];
}

function normalizeWorkspaceViewMode(value: WorkspaceViewMode | null | undefined): WorkspaceViewMode {
  return value === "list" ? "list" : "card";
}

/** 系统管理员、主管进入产品管理默认列表模式，便于总览；其余角色默认卡片 */
function defaultWorkspaceViewByRole(roleType: RoleType): WorkspaceViewMode {
  return roleType === "ADMIN" || roleType === "DEPARTMENT_MANAGER" ? "list" : "card";
}

function normalizeProjectPanelMode(value: ProjectPanelMode | null | undefined): ProjectPanelMode {
  return value === "value" ? "value" : "task";
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

function buildDepartmentAndTeamMaps(orgNodes: OrgNodeSummary[]) {
  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const departmentOrgNodeIdByTeamOrgNodeId = new Map<string, string>();
  const teamNameByOrgNodeId = new Map<string, string>();

  function findNearestDepartmentOrgNodeIdForNode(nodeId: string) {
    let currentNode = orgNodeById.get(nodeId) ?? null;
    while (currentNode) {
      if (currentNode.nodeType === "DEPARTMENT") {
        return currentNode.id;
      }
      currentNode = currentNode.parentId ? orgNodeById.get(currentNode.parentId) ?? null : null;
    }
    return null;
  }

  for (const node of orgNodes) {
    if (node.nodeType !== "TEAM") {
      continue;
    }

    teamNameByOrgNodeId.set(node.id, node.name);

    const departmentOrgNodeId = findNearestDepartmentOrgNodeIdForNode(node.id);
    if (departmentOrgNodeId) {
      departmentOrgNodeIdByTeamOrgNodeId.set(node.id, departmentOrgNodeId);
    }
  }

  return { orgNodeById, departmentOrgNodeIdByTeamOrgNodeId, teamNameByOrgNodeId };
}

function getDepartmentOrgNodeIdForRecord(
  orgNodeId: string | null | undefined,
  orgNodeById: Map<string, OrgNodeSummary>,
  departmentOrgNodeIdByTeamOrgNodeId: Map<string, string>,
) {
  if (!orgNodeId) {
    return null;
  }
  const node = orgNodeById.get(orgNodeId) ?? null;
  if (!node) {
    return null;
  }
  if (node.nodeType === "DEPARTMENT") {
    return node.id;
  }
  if (node.nodeType === "TEAM") {
    return departmentOrgNodeIdByTeamOrgNodeId.get(node.id) ?? null;
  }
  return null;
}

function getTeamOrgNodeIdForRecord(orgNodeId: string | null | undefined, orgNodeById: Map<string, OrgNodeSummary>) {
  if (!orgNodeId) {
    return null;
  }
  const node = orgNodeById.get(orgNodeId) ?? null;
  return node?.nodeType === "TEAM" ? node.id : null;
}

function getProjectManagementScopeWhere(currentUser: DataScopeInput, departmentOrgNodeId: string | null, scopedOrgNodeIds: string[] | null) {
  if (currentUser.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (departmentOrgNodeId) {
    return { orgNodeId: { in: scopedOrgNodeIds ?? [departmentOrgNodeId] }, deletedAt: null };
  }

  return { ownerId: currentUser.id, deletedAt: null };
}

function getProjectManagementUserWhere(currentUser: DataScopeInput, departmentOrgNodeId: string | null, scopedOrgNodeIds: string[] | null) {
  if (currentUser.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (departmentOrgNodeId) {
    return { orgNodeId: { in: scopedOrgNodeIds ?? [departmentOrgNodeId] }, isActive: true, deletedAt: null };
  }

  return { id: currentUser.id, isActive: true, deletedAt: null };
}

function normalizeWorkspacePanel(value: string | undefined): WorkspacePanel | null {
  if (value === "goal" || value === "project" || value === "task" || value === "value") {
    return value;
  }
  return null;
}

async function resolveQuarterlyWorkDeepLinkOptions(options?: QuarterlyWorkQueryOptions): Promise<QuarterlyWorkQueryOptions | undefined> {
  if (!options) return options;

  let resolved = { ...options };
  const workId = options.workId?.trim() || null;
  const projectId = options.projectId?.trim() || null;

  if (workId) {
    const work = await prisma.quarterlyWork.findFirst({
      where: { id: workId, deletedAt: null },
      select: { year: true, quarter: true, projectId: true },
    });
    if (work) {
      resolved = {
        ...resolved,
        selectedYear: work.year,
        selectedQuarter: work.quarter,
        projectId: projectId ?? work.projectId,
        panel: resolved.panel ?? "task",
      };
    }
  } else if (projectId && !options.selectedYear) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { endQuarter: true, startQuarter: true },
    });
    const parsed = parseQuarterCode(project?.endQuarter ?? project?.startQuarter ?? null);
    if (parsed) {
      resolved = {
        ...resolved,
        selectedYear: parsed.year,
        selectedQuarter: parsed.quarter,
      };
    }
  }

  return resolved;
}

export async function getQuarterlyWorkData(currentUser: DataScopeInput, options?: QuarterlyWorkQueryOptions) {
  options = await resolveQuarterlyWorkDeepLinkOptions(options);
  const departmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? null
    : await findNearestDepartmentOrgNodeId(currentUser.orgNodeId ?? null);
  const scopedOrgNodeIds = currentUser.roleType === "ADMIN"
    ? null
    : departmentOrgNodeId
      ? await getDescendantOrgNodeIds(departmentOrgNodeId)
      : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);
  const ownerWhere = getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds);

  const [orgNodes, users, projects, works, productGoals, valueTracks] = await Promise.all([
    prisma.orgNode.findMany({
      where: scopedOrgNodeIds === null
        ? { nodeType: { in: ["DEPARTMENT", "TEAM"] } }
        : { id: { in: scopedOrgNodeIds }, nodeType: { in: ["DEPARTMENT", "TEAM"] } },
      orderBy: [{ nodeType: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nodeType: true, parentId: true },
    }),
    prisma.user.findMany({
      where: getProjectManagementUserWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
      orderBy: [{ orgNodeId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, orgNodeId: true },
    }),
    prisma.project.findMany({
      where: ownerWhere,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        productGoalLinks: {
          orderBy: { sortOrder: "asc" },
          select: { productGoalId: true },
        },
      },
    }),
    prisma.quarterlyWork.findMany({
      where: ownerWhere,
      orderBy: [{ year: "desc" }, { quarter: "desc" }, { createdAt: "desc" }],
    }),
    prisma.productGoal.findMany({
      where: ownerWhere,
      orderBy: [{ year: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        year: true,
        ownerId: true,
        orgNodeId: true,
        status: true,
        description: true,
        expectedOutcome: true,
        createdAt: true,
        completedAt: true,
        updatedAt: true,
      },
    }),
    prisma.requirementValueTrack.findMany({
      where: {
        deletedAt: null,
        projectId: {
          in: (await prisma.project.findMany({
            // 不再按项目当前状态限定：已上线后转已完成/关闭的项目仍在 6 个月跟踪窗口内
            where: { ...ownerWhere, launchedAt: { not: null } },
            select: { id: true },
          })).map((project) => project.id),
        },
      },
      orderBy: [{ trackingSequence: "asc" }, { trackedAt: "desc" }],
    }),
  ]);

  const { orgNodeById, departmentOrgNodeIdByTeamOrgNodeId } = buildDepartmentAndTeamMaps(orgNodes);
  const departments = orgNodes
    .filter((node) => node.nodeType === "DEPARTMENT")
    .map((node) => ({
      orgNodeId: node.id,
      name: node.name,
    }));
  const teams = orgNodes
    .filter((node) => node.nodeType === "TEAM")
    .map((node) => ({
      orgNodeId: node.id,
      name: node.name,
      departmentOrgNodeId: departmentOrgNodeIdByTeamOrgNodeId.get(node.id) ?? null,
    }))
    .filter((team): team is { orgNodeId: string; name: string; departmentOrgNodeId: string } => Boolean(team.departmentOrgNodeId));

  const now = new Date();
  const fallbackYear = now.getFullYear();
  const fallbackQuarter = Math.floor(now.getMonth() / 3) + 1;
  const availableYears = Array.from(new Set(works.map((work) => work.year))).sort((a, b) => b - a);
  if (!availableYears.includes(fallbackYear)) availableYears.unshift(fallbackYear);
  const activeYear = availableYears.includes(options?.selectedYear ?? Number.NaN) ? options!.selectedYear! : fallbackYear;
  const availableQuarters = [1, 2, 3, 4];
  const allQuarterSelected = options?.selectedQuarter === "all";
  const selectedQuarter = typeof options?.selectedQuarter === "number" ? options.selectedQuarter : undefined;
  const activeQuarter = allQuarterSelected
    ? "all"
    : availableQuarters.includes(selectedQuarter ?? Number.NaN)
      ? selectedQuarter!
      : (availableQuarters.includes(fallbackQuarter) ? fallbackQuarter : availableQuarters[0]);
  const isWorkOverdue = (work: (typeof works)[number]) => formatTaskRemainLabel(work)?.startsWith("逾期") ?? false;
  const activePeriod: ActivePeriod = { year: activeYear, quarter: activeQuarter };

  const activeWorks = works.filter((work) => isQuarterlyWorkVisibleInPeriod(work, activePeriod, now));

  const workIds = activeWorks.map((work) => work.id);
  const allMonthlyPlans = workIds.length
    ? await prisma.monthlyWorkPlan.findMany({
        where: { quarterlyWorkId: { in: workIds } },
      })
    : [];

  const plansByWork = new Map<string, typeof allMonthlyPlans>();
  for (const plan of allMonthlyPlans) {
    const list = plansByWork.get(plan.quarterlyWorkId) ?? [];
    list.push(plan);
    plansByWork.set(plan.quarterlyWorkId, list);
  }

  const worksByProject = new Map<string, typeof works>();
  for (const work of works) {
    const list = worksByProject.get(work.projectId) ?? [];
    list.push(work);
    worksByProject.set(work.projectId, list);
  }

  const ownerMap = new Map(users.map((user) => [user.id, user.name]));
  const ownerAffiliationByUserId = new Map(
    users.map((user) => [
      user.id,
      {
        teamOrgNodeId: getTeamOrgNodeIdForRecord(user.orgNodeId, orgNodeById),
        departmentOrgNodeId: getDepartmentOrgNodeIdForRecord(user.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId),
      },
    ]),
  );
  const teamNameMap = new Map(teams.map((team) => [team.orgNodeId, team.name]));
  const scopedDepartments = currentUser.roleType === "ADMIN"
    ? departments
    : departments.filter((department) =>
        teams.some((team) => team.departmentOrgNodeId === department.orgNodeId)
        || users.some((user) => getDepartmentOrgNodeIdForRecord(user.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId) === department.orgNodeId)
      );
  const defaultDepartmentOrgNodeId = activeWorks.map((work) => getDepartmentOrgNodeIdForRecord(work.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId))
    .find((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId))
    ?? projects.map((project) => getDepartmentOrgNodeIdForRecord(project.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId))
      .find((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId))
    ?? teams[0]?.departmentOrgNodeId
    ?? departments[0]?.orgNodeId
    ?? null;

  const toBoardItem = (work: (typeof activeWorks)[number]): BoardItem => {
    const plans = plansByWork.get(work.id) ?? [];
    const totalPlans = plans.length;
    const completedPlans = plans.filter((plan) => plan.status === "COMPLETED").length;
    const delayedPlans = plans.filter((plan) => plan.status === "DELAYED_COMPLETED").length;
    const progress = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : undefined;
    const ownerAffiliation = ownerAffiliationByUserId.get(work.ownerId);
    const teamOrgNodeId = ownerAffiliation?.teamOrgNodeId ?? getTeamOrgNodeIdForRecord(work.orgNodeId, orgNodeById);
    const departmentOrgNodeId = ownerAffiliation?.departmentOrgNodeId
      ?? getDepartmentOrgNodeIdForRecord(work.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);

    return {
      id: work.id,
      projectId: work.projectId,
      projectTitle: projects.find((project) => project.id === work.projectId)?.title ?? work.title,
      title: work.title,
      ownerId: work.ownerId,
      owner: ownerMap.get(work.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      year: work.year,
      startMonth: work.startMonth,
      endMonth: work.endMonth,
      startDate: work.startDate,
      endDate: work.endDate,
      status: work.status,
      description: work.description,
      taskDescription: work.taskDescription,
      expectedOutcome: work.expectedOutcome,
      taskResult: work.taskResult,
      executionSummary: work.executionSummary,
      workloadPersonDay: work.workloadPersonDay,
      needsDevelopment: work.needsDevelopment,
      remainingWeeksLabel: formatTaskRemainLabel(work),
      createdAt: work.createdAt,
      completedAt: work.completedAt,
      progress,
      delay: delayedPlans > 0 ? delayedPlans : undefined,
    };
  };

  const toProjectBoardItem = (project: (typeof projects)[number]): ProjectBoardItem => {
    const projectWorks = worksByProject.get(project.id) ?? [];
    const activeProjectWorks = projectWorks.filter((work) => work.status !== "COMPLETED" && work.status !== "CLOSED");
    const taskWorkloadPersonDay = computeTaskWorkloadPersonDay(projectWorks);
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(project.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(project.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);
    const productGoalIds = project.productGoalLinks.map((link) => link.productGoalId);
    const productGoalTitles = productGoalIds
      .map((goalId) => productGoals.find((goal) => goal.id === goalId)?.title ?? null)
      .filter((title): title is string => Boolean(title));

    return {
      id: project.id,
      title: project.title,
      productGoalIds,
      productGoalTitle: productGoalTitles.length ? productGoalTitles.join("、") : null,
      ownerId: project.ownerId,
      owner: ownerMap.get(project.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      status: project.status,
      startQuarter: project.startQuarter,
      endQuarter: project.endQuarter,
      remainingWeeksLabel: formatProjectRemainLabel(project),
      description: project.description,
      expectedOutcome: project.expectedOutcome,
      workloadPersonDay: projectWorks.length > 0 ? taskWorkloadPersonDay : project.workloadPersonDay,
      needsDevelopment: project.needsDevelopment,
      otherCost: project.otherCost,
      actualValue: project.actualValue,
      valueJudgement: project.valueJudgement,
      valueTrackStatus: normalizeValueTrackStatus(project.valueTrackStatus),
      workCount: projectWorks.length,
      activeQuarterCount: activeProjectWorks.length,
      createdAt: project.createdAt,
      launchedAt: project.launchedAt,
      completedAt: project.completedAt,
      updatedAt: project.updatedAt,
    };
  };

  const toProductGoalBoardItem = (goal: (typeof productGoals)[number]): ProductGoalBoardItem => {
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(goal.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(goal.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);

    return {
      id: goal.id,
      title: goal.title,
      ownerId: goal.ownerId,
      owner: ownerMap.get(goal.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      status: goal.status,
      year: goal.year,
      description: goal.description,
      expectedOutcome: goal.expectedOutcome,
      createdAt: goal.createdAt,
      completedAt: goal.completedAt,
      updatedAt: goal.updatedAt,
    };
  };

  const getProjectOrgAffiliation = (project: (typeof projects)[number]) => {
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(project.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(project.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);
    return { teamOrgNodeId, departmentOrgNodeId };
  };

  const toValueOverviewItem = (project: (typeof projects)[number]): ValueOverviewItem => {
    const { teamOrgNodeId, departmentOrgNodeId } = getProjectOrgAffiliation(project);
    const metrics = getProjectValueMetrics(project);

    return {
      id: project.id,
      title: project.title,
      ownerId: project.ownerId,
      owner: ownerMap.get(project.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      // 项目总工作量改为需求工作量汇总口径（只读）
      workloadPersonDay: metrics?.totalWorkloadPersonDay ?? null,
      otherCost: project.otherCost,
      expectedOutcome: project.expectedOutcome,
      actualValue: project.actualValue,
      valueJudgement: project.valueJudgement,
      valueTrackStatus: normalizeValueTrackStatus(project.valueTrackStatus),
      status: project.status,
      launchedAt: project.launchedAt,
      firstVersionWorkloadPersonDay: metrics?.firstVersionWorkloadPersonDay ?? null,
      postLaunchIterationWorkloadPersonDay: metrics?.postLaunchIterationWorkloadPersonDay ?? null,
      firstVersionCompletionPercent: metrics?.firstVersionCompletionPercent ?? null,
      completionIsFinal: metrics?.completionIsFinal ?? false,
      includedRequirementCount: metrics?.includedRequirementCount ?? 0,
      missingWorkloadRequirementCount: metrics?.missingWorkloadRequirementCount ?? 0,
      valueTrackOverdue: isProjectValueTrackOverdue(project),
      currentTrackingSequence: getCurrentTrackingSequence(project.id),
    };
  };

  const notStarted = activeWorks.filter((work) => work.status === "NOT_STARTED" && !isWorkOverdue(work));
  const inProgress = activeWorks.filter((work) => work.status === "IN_PROGRESS" && !isWorkOverdue(work));
  const delayed = activeWorks.filter((work) => {
    if (!isWorkOverdue(work)) {
      return false;
    }
    if (work.status === "COMPLETED") {
      return true;
    }
    return work.status === "NOT_STARTED" || work.status === "IN_PROGRESS" || work.status === "CLOSED" || work.status === "DELAYED_COMPLETED";
  });
  const completed = activeWorks.filter((work) => work.status === "COMPLETED" && !isWorkOverdue(work));

  const columns: ColumnData[] = [
    { key: "not_started", title: "未启动", tone: "default", status: "NOT_STARTED", items: notStarted.map(toBoardItem) },
    { key: "in_progress", title: "进行中", tone: "primary", status: "IN_PROGRESS", items: inProgress.map(toBoardItem) },
    { key: "delayed", title: "延期", tone: "warning", status: "DELAYED_COMPLETED", items: delayed.map(toBoardItem) },
    { key: "completed", title: "已完成", tone: "success", status: "COMPLETED", items: completed.map(toBoardItem) },
  ];

  // 以「已完成」为状态分割点判断是否延期，与项目逾期标签口径一致（已上线不算完成，按当前时间衡量）
  const isProjectOverdue = (project: (typeof projects)[number]) => formatProjectRemainLabel(project)?.startsWith("逾期") ?? false;
  const isLaunchedProjectInActivePeriod = (project: (typeof projects)[number]) =>
    isLaunchedProjectVisibleInPeriod(project, activePeriod, isProjectOverdue(project));
  const delayedProjects = projects.filter((project) => isProjectOverdue(project));

  const projectColumns: ProjectColumnData[] = [
    {
      key: "project_not_started",
      title: "未启动",
      tone: "default",
      status: "NOT_STARTED",
      items: projects.filter((project) => project.status === "NOT_STARTED" && !isProjectOverdue(project) && isProjectVisibleInPeriod(project, activePeriod, now)).map(toProjectBoardItem),
    },
    {
      key: "project_in_progress",
      title: "进行中",
      tone: "primary",
      status: "IN_PROGRESS",
      items: projects.filter((project) => project.status === "IN_PROGRESS" && !isProjectOverdue(project) && isProjectVisibleInPeriod(project, activePeriod, now)).map(toProjectBoardItem),
    },
    {
      key: "project_delayed",
      title: "延期",
      tone: "warning",
      status: "IN_PROGRESS",
      items: delayedProjects.filter((project) => isProjectVisibleInPeriod(project, activePeriod, now)).map(toProjectBoardItem),
    },
    {
      key: "project_launched",
      title: "已上线",
      tone: "success",
      status: "LAUNCHED",
      items: projects.filter(isLaunchedProjectInActivePeriod).map(toProjectBoardItem),
    },
  ];

  const productGoalColumns: ProductGoalColumnData[] = [
    { key: "goal_not_started", title: "未启动", tone: "default", status: "NOT_STARTED", items: productGoals.filter((goal) => goal.status === "NOT_STARTED").map(toProductGoalBoardItem) },
    { key: "goal_in_progress", title: "进行中", tone: "primary", status: "IN_PROGRESS", items: productGoals.filter((goal) => goal.status === "IN_PROGRESS").map(toProductGoalBoardItem) },
    { key: "goal_completed", title: "已完成", tone: "success", status: "COMPLETED", items: productGoals.filter((goal) => goal.status === "COMPLETED").map(toProductGoalBoardItem) },
    { key: "goal_closed", title: "关闭", tone: "warning", status: "CLOSED", items: productGoals.filter((goal) => goal.status === "CLOSED").map(toProductGoalBoardItem) },
  ];

  const logScopeWhere = { ...ownerWhere, deletedAt: undefined };
  const [logScopeProjects, logScopeGoals, logScopeWorks] = await Promise.all([
    prisma.project.findMany({ where: logScopeWhere, select: { id: true, orgNodeId: true } }),
    prisma.productGoal.findMany({ where: logScopeWhere, select: { id: true, orgNodeId: true } }),
    prisma.quarterlyWork.findMany({ where: logScopeWhere, select: { id: true, orgNodeId: true } }),
  ]);
  const logAffiliationByTargetId = new Map<string, { teamOrgNodeId: string | null; departmentOrgNodeId: string | null }>();
  for (const row of [...logScopeProjects, ...logScopeGoals, ...logScopeWorks]) {
    logAffiliationByTargetId.set(row.id, {
      teamOrgNodeId: getTeamOrgNodeIdForRecord(row.orgNodeId, orgNodeById),
      departmentOrgNodeId: getDepartmentOrgNodeIdForRecord(row.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId),
    });
  }
  const operationLogRows = logAffiliationByTargetId.size
    ? await prisma.operationLog.findMany({
        where: { targetId: { in: [...logAffiliationByTargetId.keys()] } },
        orderBy: { createdAt: "desc" },
        take: 1000,
      })
    : [];
  const operationLogs = operationLogRows.map((log) => ({
    id: log.id,
    targetType: log.targetType,
    targetId: log.targetId,
    targetTitle: log.targetTitle,
    action: log.action,
    operator: ownerMap.get(log.operatorId) ?? "—",
    remark: log.remark,
    createdAt: log.createdAt,
    teamOrgNodeId: logAffiliationByTargetId.get(log.targetId)?.teamOrgNodeId ?? null,
    departmentOrgNodeId: logAffiliationByTargetId.get(log.targetId)?.departmentOrgNodeId ?? null,
  }));

  const productGoalById = new Map(productGoals.map((goal) => [goal.id, goal]));
  const productGoalIdsByProjectId = new Map(
    projects.map((project) => [project.id, project.productGoalLinks.map((link) => link.productGoalId)]),
  );
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const activeWorksByProject = new Map<string, typeof activeWorks>();
  for (const work of activeWorks) {
    const list = activeWorksByProject.get(work.projectId) ?? [];
    list.push(work);
    activeWorksByProject.set(work.projectId, list);
  }

  const mapValueTrackItem = (track: (typeof valueTracks)[number]): ValueTrackItem => {
    const project = projects.find((item) => item.id === track.projectId) ?? null;
    const { teamOrgNodeId, departmentOrgNodeId } = project
      ? getProjectOrgAffiliation(project)
      : { teamOrgNodeId: null, departmentOrgNodeId: null };

    return {
      id: track.id,
      projectId: track.projectId,
      projectTitle: project?.title ?? "—",
      ownerId: project?.ownerId ?? "",
      owner: project ? ownerMap.get(project.ownerId) ?? "—" : "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      trackedAt: track.trackedAt,
      trackingSequence: track.trackingSequence,
      periodStartAt: track.periodStartAt,
      checkpointAt: track.checkpointAt,
      deadlineAt: track.deadlineAt,
      completedAt: track.completedAt,
      isFinal: track.isFinal,
      // 无检查点序号的历史/手动记录：已有填报内容视为已完成，否则按时间轴派生
      taskState: track.trackingSequence !== null
        ? getValueTrackTaskState(track, now)
        : (track.completedAt ?? track.trackingResult) ? "COMPLETED" : getValueTrackTaskState(track, now),
      trackingResult: track.trackingResult,
      followUpOptimization: track.followUpOptimization,
      firstVersionWorkloadPersonDay: track.firstVersionWorkloadPersonDay,
      postLaunchIterationWorkloadPersonDay: track.postLaunchIterationWorkloadPersonDay,
      totalWorkloadPersonDay: track.totalWorkloadPersonDay,
      firstVersionCompletionPercent: track.firstVersionCompletionPercent,
      workloadComplete: track.workloadComplete,
      // 价值判断/实际收益读记录自身的填报快照，不随项目当前值变化
      actualValue: track.actualValue ?? null,
      valueJudgement: track.valueJudgement ?? null,
      valueTrackStatus: normalizeValueTrackStatus(project?.valueTrackStatus),
    };
  };

  // 扁平列表按所选季度过滤（任务周期与季度相交）；项目面板展示全周期任务
  const valueTrackItems = valueTracks
    .filter((track) => isValueTrackVisibleInPeriod(track, activePeriod))
    .map(mapValueTrackItem);
  const valueTracksByProject = new Map<string, ValueTrackItem[]>();
  for (const track of valueTrackItems) {
    const list = valueTracksByProject.get(track.projectId) ?? [];
    list.push(track);
    valueTracksByProject.set(track.projectId, list);
  }

  // 项目全周期跟踪任务（不按所选季度过滤），用于项目面板展示、最终确认/逾期/当前检查点判断
  const allValueTracksByProject = new Map<string, typeof valueTracks>();
  for (const track of valueTracks) {
    const list = allValueTracksByProject.get(track.projectId) ?? [];
    list.push(track);
    allValueTracksByProject.set(track.projectId, list);
  }
  const allValueTrackItemsByProject = new Map<string, ValueTrackItem[]>();
  for (const track of valueTracks) {
    const list = allValueTrackItemsByProject.get(track.projectId) ?? [];
    list.push(mapValueTrackItem(track));
    allValueTrackItemsByProject.set(track.projectId, list);
  }

  // 首版完成度：唯一数据源是 Project 表的服务端自动快照；已冻结项目以最终快照为准
  // 开发项目创建即进入统计，未上线时全部需求计入首版
  const getProjectValueMetrics = (project: (typeof projects)[number]) => {
    if (project.needsDevelopment !== true && !project.launchedAt) return null;
    // 工作量完整度按当前全部开发需求统计
    let includedRequirementCount = 0;
    let missingWorkloadRequirementCount = 0;
    for (const work of worksByProject.get(project.id) ?? []) {
      if (work.needsDevelopment !== true || work.status === "CLOSED") continue;
      includedRequirementCount += 1;
      if (work.workloadPersonDay === null || work.workloadPersonDay === undefined) missingWorkloadRequirementCount += 1;
    }
    const finalTrack = (allValueTracksByProject.get(project.id) ?? []).find((track) => track.isFinal);
    if (finalTrack) {
      return {
        firstVersionWorkloadPersonDay: finalTrack.firstVersionWorkloadPersonDay,
        postLaunchIterationWorkloadPersonDay: finalTrack.postLaunchIterationWorkloadPersonDay,
        totalWorkloadPersonDay: finalTrack.totalWorkloadPersonDay,
        firstVersionCompletionPercent: finalTrack.firstVersionCompletionPercent,
        completionIsFinal: true,
        workloadComplete: finalTrack.workloadComplete ?? false,
        includedRequirementCount,
        missingWorkloadRequirementCount,
      };
    }
    const firstVersionWorkload = project.firstVersionWorkloadPersonDay;
    const iterationWorkload = project.postLaunchIterationWorkloadPersonDay;
    const totalWorkload = project.totalWorkloadPersonDay
      ?? ((firstVersionWorkload ?? 0) + (iterationWorkload ?? 0));
    // 任一纳入需求缺工作量、无开发需求或总量为 0 时，完成度不可计算（缺数据不按 0 处理）
    const calculable = firstVersionWorkload !== null
      && includedRequirementCount > 0
      && missingWorkloadRequirementCount === 0
      && totalWorkload > 0;
    return {
      firstVersionWorkloadPersonDay: firstVersionWorkload,
      postLaunchIterationWorkloadPersonDay: iterationWorkload,
      totalWorkloadPersonDay: totalWorkload,
      firstVersionCompletionPercent: calculable ? (firstVersionWorkload / totalWorkload) * 100 : null,
      completionIsFinal: false,
      workloadComplete: includedRequirementCount > 0 && missingWorkloadRequirementCount === 0,
      includedRequirementCount,
      missingWorkloadRequirementCount,
    };
  };

  const isProjectValueTrackOverdue = (project: (typeof projects)[number]) => {
    const hasFinalCompletion = (allValueTracksByProject.get(project.id) ?? []).some((track) => track.isFinal);
    return isValueTrackingOverdue(project, hasFinalCompletion, now);
  };

  // 价值跟踪范围：开发项目按规划周期纳入（未上线也可跟踪）；
  // 已上线项目看跟踪窗口与所选自然季度是否相交，或超期未完成
  const isInValueTrackingScope = (project: (typeof projects)[number]) => {
    if (!project.launchedAt) {
      if (project.needsDevelopment !== true) return false;
      // 从未上线的已完成/已关闭项目不进入价值跟踪
      if (project.status === "COMPLETED" || project.status === "CLOSED") return false;
      return isProjectVisibleInPeriod(project, activePeriod, now);
    }
    if (isProjectValueTrackOverdue(project)) return true;
    return allQuarterSelected
      ? doesYearOverlapTrackingWindow(project.launchedAt, activeYear)
      : doesCalendarQuarterOverlapTrackingWindow(project.launchedAt, activeYear, activeQuarter as number);
  };

  const getCurrentTrackingSequence = (projectId: string): number | null => {
    const projectTracks = allValueTracksByProject.get(projectId) ?? [];
    const pending = projectTracks
      .filter((track) => (track.trackingSequence === 1 || track.trackingSequence === 2) && !track.completedAt && !track.isFinal)
      .map((track) => track.trackingSequence as number)
      .sort((left, right) => left - right);
    return pending[0] ?? null;
  };

  const toRequirementItem = (
    work: (typeof works)[number],
    trackingPeriodLabel: string | null,
  ): ValueTrackingRequirementItem => ({
    id: work.id,
    title: work.title,
    createdAt: work.createdAt,
    completedAt: work.completedAt,
    needsDevelopment: work.needsDevelopment,
    workloadPersonDay: work.workloadPersonDay,
    status: work.status,
    trackingPeriodLabel,
  });

  // 需求构成明细：首版（完成日 <= 上线日）与上线后迭代（上线后完成或尚未完成），供价值详情核查指标来源
  const getRequirementBreakdown = (project: (typeof projects)[number]) => {
    // 未上线时全部需求计入首版
    const launchDay = project.launchedAt ? toBusinessDate(project.launchedAt) : null;
    const checkpoint1 = project.launchedAt ? getValueTrackingTaskDates(project.launchedAt, 1).checkpointAt : null;
    const firstVersion: ValueTrackingRequirementItem[] = [];
    const postLaunch: ValueTrackingRequirementItem[] = [];
    for (const work of (worksByProject.get(project.id) ?? [])) {
      if (work.deletedAt) continue;
      const completedDay = work.completedAt ? toBusinessDate(work.completedAt) : null;
      if (!launchDay || (completedDay && completedDay <= launchDay)) {
        firstVersion.push(toRequirementItem(work, null));
      } else {
        postLaunch.push(toRequirementItem(work, checkpoint1 && completedDay && completedDay < toBusinessDate(checkpoint1) ? "第 1 跟踪周期" : "第 2 跟踪周期"));
      }
    }
    firstVersion.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    postLaunch.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    return { firstVersionRequirements: firstVersion, postLaunchRequirements: postLaunch };
  };

  const workspaceStatuses = normalizeWorkspaceStatusFilters(options?.status);
  const workspaceView = options?.view ? normalizeWorkspaceViewMode(options.view) : defaultWorkspaceViewByRole(currentUser.roleType);
  const workspaceProjectPanel = normalizeProjectPanelMode(options?.projectPanel);
  const workspaceSearchQuery = normalizeSearchQuery(options?.query);
  const selectedGoalId = options?.goalId && options.goalId !== "all" ? options.goalId : null;
  const currentUserTeamOrgNodeId = getTeamOrgNodeIdForRecord(currentUser.orgNodeId, orgNodeById);
  const roleDefaultTeamId = (currentUser.roleType === "TEAM_LEADER" || currentUser.roleType === "MEMBER")
    ? currentUserTeamOrgNodeId
    : null;
  const roleDefaultOwnerId = currentUser.roleType === "MEMBER" ? currentUser.id : null;
  const rawTeamId = options?.teamId;
  const selectedTeamId = rawTeamId == null
    ? roleDefaultTeamId
    : rawTeamId === "all"
      ? null
      : rawTeamId;
  const selectedOrgNodeId = options?.orgNodeId?.trim() || null;
  const rawOwnerId = options?.ownerId;
  const selectedOwnerId = rawOwnerId == null
    ? roleDefaultOwnerId
    : rawOwnerId === "all"
      ? null
      : rawOwnerId.trim() || null;
  const selectedProjectId = options?.projectId?.trim() || null;
  const selectedWorkId = options?.workId?.trim() || null;
  const workspacePanel = normalizeWorkspacePanel(options?.panel ?? undefined);

  const toProjectWorkspaceTaskItem = (work: (typeof activeWorks)[number]): ProjectWorkspaceTaskItem => ({
    ...toBoardItem(work),
    year: work.year,
    quarter: work.quarter,
    periodLabel: formatTaskPeriodLabel(work),
    isOverdue: isWorkOverdue(work),
  });

  const buildProjectWorkspaceItem = (project: (typeof projects)[number]): ProjectWorkspaceItem => {
    const base = toProjectBoardItem(project);
    const projectGoals = base.productGoalIds
      .map((goalId) => productGoalById.get(goalId) ?? null)
      .filter((goal): goal is NonNullable<typeof goal> => Boolean(goal))
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        year: goal.year,
      }));
    const tasks = (activeWorksByProject.get(project.id) ?? [])
      .map(toProjectWorkspaceTaskItem)
      .sort((left, right) => {
        const leftEnd = left.endMonth ?? left.startMonth ?? 13;
        const rightEnd = right.endMonth ?? right.startMonth ?? 13;
        return leftEnd - rightEnd || right.createdAt.getTime() - left.createdAt.getTime();
      });
    const projectValueTracks = [...(allValueTrackItemsByProject.get(project.id) ?? [])]
      .sort((left, right) => (left.trackingSequence ?? 99) - (right.trackingSequence ?? 99));
    const latestValueTrack = projectValueTracks.filter((track) => track.completedAt).at(-1) ?? projectValueTracks[0] ?? null;
    const isOverdue = isProjectOverdue(project);
    const valueMetrics = getProjectValueMetrics(project);
    const requirementBreakdown = getRequirementBreakdown(project);

    return {
      ...base,
      productGoals: projectGoals,
      statusFilterKey: isOverdue ? "DELAYED" : project.status,
      isOverdue,
      tasks,
      valueTracks: projectValueTracks.map((track) => ({
        ...track,
        periodLabel: track.trackingSequence
          ? `第 ${track.trackingSequence} 次跟踪`
          : `${track.trackedAt.getFullYear()}年Q${getQuarterByDate(track.trackedAt) ?? ""}`,
      })),
      valueTrackSummary: {
        status: normalizeValueTrackStatus(project.valueTrackStatus),
        judgement: project.valueJudgement,
        actualValue: project.actualValue,
        latestTrackedAt: latestValueTrack?.trackedAt ?? null,
        trackCount: projectValueTracks.length,
        // 开发项目或有上线时间的项目进入跟踪；但从未上线的已完成/已关闭项目不进入
        initialized: !(Boolean(!project.launchedAt) && (project.status === "COMPLETED" || project.status === "CLOSED"))
          && (project.needsDevelopment === true || Boolean(project.launchedAt)),
        overdue: isProjectValueTrackOverdue(project),
        currentSequence: getCurrentTrackingSequence(project.id),
        firstVersionWorkloadPersonDay: valueMetrics?.firstVersionWorkloadPersonDay ?? null,
        postLaunchIterationWorkloadPersonDay: valueMetrics?.postLaunchIterationWorkloadPersonDay ?? null,
        totalWorkloadPersonDay: valueMetrics?.totalWorkloadPersonDay ?? null,
        firstVersionCompletionPercent: valueMetrics?.firstVersionCompletionPercent ?? null,
        completionIsFinal: valueMetrics?.completionIsFinal ?? false,
        workloadComplete: valueMetrics?.workloadComplete ?? false,
        includedRequirementCount: valueMetrics?.includedRequirementCount ?? 0,
        missingWorkloadRequirementCount: valueMetrics?.missingWorkloadRequirementCount ?? 0,
        firstVersionRequirements: requirementBreakdown.firstVersionRequirements,
        postLaunchRequirements: requirementBreakdown.postLaunchRequirements,
      },
    };
  };

  const projectMatchesActivePeriod = (project: (typeof projects)[number]) => {
    const hasActiveTasks = Boolean(activeWorksByProject.get(project.id)?.length);
    const hasActiveValueTracks = Boolean(valueTracksByProject.get(project.id)?.length);
    const projectPeriodMatched = isProjectVisibleInPeriod(project, activePeriod, now);
    return projectPeriodMatched || hasActiveTasks || hasActiveValueTracks || isInValueTrackingScope(project);
  };

  const projectWorkspaceSourceItems = projects
    .filter(projectMatchesActivePeriod)
    .map(buildProjectWorkspaceItem);

  const matchesProjectWorkspaceFilters = (
    item: ReturnType<typeof buildProjectWorkspaceItem>,
    options?: { ignoreStatus?: boolean; ignoreOwner?: boolean },
  ) => {
    const ignoreStatus = options?.ignoreStatus ?? false;
    const ignoreOwner = options?.ignoreOwner ?? false;
    if (selectedProjectId && item.id !== selectedProjectId) {
      return false;
    }
    if (selectedGoalId && !item.productGoalIds.includes(selectedGoalId)) {
      return false;
    }
    if (!ignoreStatus && workspaceStatuses.length > 0 && !workspaceStatuses.includes(item.statusFilterKey)) {
      return false;
    }
    if (selectedTeamId && item.teamOrgNodeId !== selectedTeamId) {
      return false;
    }
    if (selectedOrgNodeId) {
      const belongsToSelectedOrg = item.departmentOrgNodeId === selectedOrgNodeId || item.teamOrgNodeId === selectedOrgNodeId;
      if (!belongsToSelectedOrg) {
        return false;
      }
    }
    if (!ignoreOwner && selectedOwnerId && item.ownerId !== selectedOwnerId) {
      return false;
    }
    if (!workspaceSearchQuery) {
      return true;
    }

    return textMatchesSearchQuery(
      workspaceSearchQuery,
      item.title,
      item.description,
      item.expectedOutcome,
      item.actualValue,
      item.valueJudgement,
      ...item.productGoals.flatMap((goal) => [goal.title, goal.year]),
      ...item.tasks.flatMap((task) => [task.title, task.description, task.taskDescription, task.expectedOutcome, task.taskResult, task.executionSummary]),
      ...item.valueTracks.flatMap((track) => [track.trackingResult, track.followUpOptimization, track.actualValue, track.valueJudgement]),
    );
  };

  const projectWorkspaceItems = projectWorkspaceSourceItems.filter((item) => matchesProjectWorkspaceFilters(item));
  const projectStatusScopeItems = projectWorkspaceSourceItems.filter((item) => matchesProjectWorkspaceFilters(item, { ignoreStatus: true }));
  const matchesTaskWorkspaceFilters = (task: ProjectWorkspaceTaskItem) => {
    const project = projectById.get(task.projectId);
    const projectGoalIds = productGoalIdsByProjectId.get(task.projectId) ?? [];
    if (selectedProjectId && task.projectId !== selectedProjectId) {
      return false;
    }
    if (selectedGoalId && !projectGoalIds.includes(selectedGoalId)) {
      return false;
    }
    if (selectedOwnerId && task.ownerId !== selectedOwnerId) {
      return false;
    }
    if (selectedTeamId && task.teamOrgNodeId !== selectedTeamId) {
      return false;
    }
    if (selectedOrgNodeId) {
      const belongsToSelectedOrg = task.departmentOrgNodeId === selectedOrgNodeId || task.teamOrgNodeId === selectedOrgNodeId;
      if (!belongsToSelectedOrg) {
        return false;
      }
    }
    if (!workspaceSearchQuery) {
      return true;
    }
    return textMatchesSearchQuery(
      workspaceSearchQuery,
      task.title,
      task.description,
      task.taskDescription,
      task.expectedOutcome,
      task.taskResult,
      task.executionSummary,
      project?.title,
      project?.description,
      project?.expectedOutcome,
      ...projectGoalIds.flatMap((goalId) => {
        const goal = productGoalById.get(goalId);
        return goal ? [goal.title, goal.year] : [];
      }),
    );
  };
  const taskWorkspaceItems = activeWorks
    .map(toProjectWorkspaceTaskItem)
    .filter(matchesTaskWorkspaceFilters);
  const countByStatusFilterKey = (key: Exclude<WorkspaceStatusFilter, "all">) =>
    projectStatusScopeItems.filter((item) => item.statusFilterKey === key).length;
  const projectStatusCounts = {
    all: projectStatusScopeItems.length,
    IN_PROGRESS: countByStatusFilterKey("IN_PROGRESS"),
    DELAYED: countByStatusFilterKey("DELAYED"),
    LAUNCHED: countByStatusFilterKey("LAUNCHED"),
    NOT_STARTED: countByStatusFilterKey("NOT_STARTED"),
    COMPLETED: countByStatusFilterKey("COMPLETED"),
    CLOSED: countByStatusFilterKey("CLOSED"),
  };

  const goalNavigationScopeItems = projectWorkspaceSourceItems.filter((item) => {
    if (workspaceStatuses.length > 0 && !workspaceStatuses.includes(item.statusFilterKey)) {
      return false;
    }
    if (selectedTeamId && item.teamOrgNodeId !== selectedTeamId) {
      return false;
    }
    if (selectedOrgNodeId) {
      const belongsToSelectedOrg = item.departmentOrgNodeId === selectedOrgNodeId || item.teamOrgNodeId === selectedOrgNodeId;
      if (!belongsToSelectedOrg) {
        return false;
      }
    }
    if (selectedOwnerId && item.ownerId !== selectedOwnerId) {
      return false;
    }
    if (!workspaceSearchQuery) {
      return true;
    }
    return projectWorkspaceItems.some((itemInSearchResult) => itemInSearchResult.id === item.id);
  });

  const countGoalProjects = (goalId: string) => goalNavigationScopeItems.filter((item) => item.productGoalIds.includes(goalId));
  const sumTaskCount = (items: ProjectWorkspaceItem[]) => items.reduce((sum, item) => sum + item.tasks.length, 0);
  const toGoalNavigationItem = (goal: (typeof productGoals)[number]): GoalNavigationItem => {
    const goalProjects = countGoalProjects(goal.id);
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(goal.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(goal.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);

    return {
      id: goal.id,
      title: goal.title,
      year: goal.year,
      ownerId: goal.ownerId,
      owner: ownerMap.get(goal.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      status: goal.status,
      description: goal.description,
      expectedOutcome: goal.expectedOutcome,
      projectCount: goalProjects.length,
      taskCount: sumTaskCount(goalProjects),
      isAll: false,
    };
  };
  const visibleGoalIds = new Set(goalNavigationScopeItems.flatMap((item) => item.productGoalIds));
  const goalNavigationItems: GoalNavigationItem[] = [
    {
      id: "all",
      title: "全部",
      year: null,
      ownerId: null,
      owner: null,
      departmentOrgNodeId: null,
      teamOrgNodeId: null,
      teamName: null,
      status: "all",
      description: null,
      expectedOutcome: null,
      projectCount: goalNavigationScopeItems.length,
      taskCount: sumTaskCount(goalNavigationScopeItems),
      isAll: true,
    },
    ...productGoals
      .filter((goal) => goal.year === activeYear || visibleGoalIds.has(goal.id))
      .map(toGoalNavigationItem),
  ];

  const workspaceSummary = {
    totalProjectCount: projectWorkspaceSourceItems.length,
    filteredProjectCount: projectWorkspaceItems.length,
    totalTaskCount: sumTaskCount(projectWorkspaceSourceItems),
    filteredTaskCount: sumTaskCount(projectWorkspaceItems),
    totalValueTrackCount: projectWorkspaceSourceItems.reduce((sum, item) => sum + item.valueTracks.length, 0),
    filteredValueTrackCount: projectWorkspaceItems.reduce((sum, item) => sum + item.valueTracks.length, 0),
    overdueProjectCount: projectWorkspaceSourceItems.filter((item) => item.isOverdue).length,
    overdueTaskCount: projectWorkspaceSourceItems.reduce((sum, item) => sum + item.tasks.filter((task) => task.isOverdue).length, 0),
    projectStatusCounts,
  };

  const [
    canManageProductGoalPermission,
    canManageProjectAndValueTrackingPermission,
    canManageProductTaskPermission,
  ] = await Promise.all([
    canManageProductGoal(currentUser),
    canManageProjectAndValueTracking(currentUser),
    canManageProductTask(currentUser),
  ]);

  return {
    year: activeYear,
    quarter: activeQuarter,
    availableYears,
    availableQuarters,
    productGoalColumns,
    projectColumns,
    columns,
    totalCount: activeWorks.length,
    projectTotalCount: projects.length,
    operationLogs,
    canCreate: users.length > 0,
    permissions: {
      canManageProductGoal: canManageProductGoalPermission,
      canManageProjectAndValueTracking: canManageProjectAndValueTrackingPermission,
      canManageProductTask: canManageProductTaskPermission,
    },
    currentUserId: currentUser.id,
    isSystemAdmin: currentUser.roleType === "ADMIN",
    departments: scopedDepartments.sort(compareNames).map((department) => ({
      id: department.orgNodeId,
      name: department.name,
    })),
    defaultDepartmentOrgNodeId,
    teamOptions: [...teams].sort(compareNames).map((team) => ({
      id: team.orgNodeId,
      name: team.name,
      departmentOrgNodeId: team.departmentOrgNodeId,
    })),
    memberOptions: users.map((user) => {
      const teamOrgNodeId = getTeamOrgNodeIdForRecord(user.orgNodeId, orgNodeById);
      const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(user.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);
      return {
        id: user.id,
        name: user.name,
        teamOrgNodeId,
        teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
        departmentOrgNodeId,
      };
    }),
    valueOverviewItems: projects
      .filter(isInValueTrackingScope)
      .sort((left, right) => (right.launchedAt?.getTime() ?? 0) - (left.launchedAt?.getTime() ?? 0))
      .map(toValueOverviewItem),
    valueTrackItems,
    goalNavigationItems,
    projectWorkspaceItems,
    taskWorkspaceItems,
    workspaceSummary,
    workspaceFilters: {
      goalId: selectedGoalId ?? "all",
      view: workspaceView,
      projectPanel: workspaceProjectPanel,
      panel: workspacePanel,
      status: workspaceStatuses,
      orgNodeId: selectedOrgNodeId,
      teamId: selectedTeamId ?? "all",
      ownerId: selectedOwnerId,
      projectId: selectedProjectId,
      workId: selectedWorkId,
      query: workspaceSearchQuery,
    },
    productGoalOptions: productGoals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      year: goal.year,
    })),
    launchedProjectOptions: projects
      // 新增价值跟踪快照可选项目：有有效上线时间即可（已完成项目仍可跟踪）
      .filter((project) => Boolean(project.launchedAt))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((project) => ({
        id: project.id,
        title: project.title,
        launchedAt: project.launchedAt,
        expectedOutcome: project.expectedOutcome,
        workloadPersonDay: project.totalWorkloadPersonDay ?? project.workloadPersonDay,
        firstVersionWorkloadPersonDay: project.firstVersionWorkloadPersonDay,
        postLaunchIterationWorkloadPersonDay: project.postLaunchIterationWorkloadPersonDay,
        otherCost: project.otherCost,
        actualValue: project.actualValue,
        valueJudgement: project.valueJudgement,
        valueTrackStatus: normalizeValueTrackStatus(project.valueTrackStatus),
        // 该项目已存在的跟踪周期序号（新增弹窗中对应选项禁用）
        existingTrackingSequences: (allValueTracksByProject.get(project.id) ?? [])
          .map((track) => track.trackingSequence)
          .filter((sequence): sequence is number => sequence !== null),
      })),
    projectOptions: projects
      .filter((project) => project.status !== "COMPLETED" && project.status !== "CLOSED")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((project) => ({
        id: project.id,
        title: project.title,
        ownerId: project.ownerId,
        expectedOutcome: project.expectedOutcome,
        status: project.status,
      })),
  };
}
