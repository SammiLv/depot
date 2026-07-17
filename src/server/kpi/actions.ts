"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import type { KpiStatus, KpiTemplate, KpiTemplateAssignment, OrgNodeType, OrgPermissionAbilityKey, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { buildKpiWhereByPermission, buildUserWhereByPermission, resolveAuthorizedOrgNodeIds, resolvePermissionScope } from "@/server/permissions/permission-resolver";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodes } from "@/server/organization/org-tree-utils";
import { resolveApprovalChain } from "@/server/kpi/approval-chain";

const editableRoles = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER"] as const;
const assignmentPriority: Record<"USER" | "ORG_NODE" | "ROLE", number> = {
  USER: 3,
  ORG_NODE: 2,
  ROLE: 1,
};

type TemplateSummary = Pick<KpiTemplate, "id" | "templateKey" | "departmentOrgNodeId" | "name" | "version" | "approvedAt" | "updatedAt">;
type TemplateAssignmentWithTemplate = Pick<
  KpiTemplateAssignment,
  | "id"
  | "templateId"
  | "targetType"
  | "targetUserId"
  | "targetOrgNodeId"
  | "targetRoleType"
  | "effectiveFromYear"
  | "effectiveFromQuarter"
  | "effectiveToYear"
  | "effectiveToQuarter"
> & { template: TemplateSummary };

type ScopeUser = {
  id: string;
  name: string;
  orgNodeId: string | null;
  roleType: RoleType;
};

type DepartmentOption = {
  id: string;
  name: string;
};

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

type KpiPermissionContext = {
  currentUser: Awaited<ReturnType<typeof requireCurrentUser>>;
  scope: NonNullable<Awaited<ReturnType<typeof resolvePermissionScope>>>;
};

async function requireKpiAbility(abilityKey: OrgPermissionAbilityKey, errorMessage: string) {
  const currentUser = await requireCurrentUser();
  const scope = await resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, abilityKey);
  if (!scope) {
    throw new Error(errorMessage);
  }
  return { currentUser, scope } satisfies KpiPermissionContext;
}

async function requireKpiTemplateEditor() {
  return requireKpiAbility(kpiAbilityKeys.manageKpiTemplate, "当前角色不能维护 KPI 模板");
}

async function requireKpiManager() {
  return requireKpiAbility(kpiAbilityKeys.initializeKpi, "当前角色不能维护 KPI");
}

type InitializationSummary = {
  year: number;
  quarter: number;
  createdCount: number;
  existingCount: number;
  skippedNoTemplateCount: number;
  createdUsers: string[];
  existingUsers: string[];
  skippedUsers: string[];
};

type PersonalKpiSnapshotInput = {
  year: number;
  quarter: number;
  userId: string;
  orgNodeId: string | null;
  initializerId: string;
  template: TemplateSummary;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    score: number;
    scoringStandard: string | null;
    sortOrder: number;
  }>;
};

type TemplateImportSummary = {
  importedTemplateCount: number;
  importedAssignmentCount: number;
  importedItemCount: number;
  importedTemplateNames: string[];
  departmentName: string;
};

type ImportedTemplateDefaults = {
  templateDescription: string | null;
};

type TemplateCreateSummary = {
  templateId: string;
  templateName: string;
  itemCount: number;
  assignmentCount: number;
  departmentOrgNodeId: string;
};

type TemplateItemInput = {
  name: string;
  description: string | null;
  score: number;
  scoringStandard: string | null;
  sortOrder: number;
};

type TemplateUpdateSummary = {
  templateId: string;
  templateName: string;
  itemCount: number;
  departmentOrgNodeId: string;
};

type TemplateScopeTarget = {
  targetType: "ORG_NODE" | "USER";
  targetUserId: string | null;
  targetOrgNodeId: string | null;
  targetRoleType: null;
};

type PersonalKpiDeleteSummary = {
  personalKpiId: string;
};

type TemplateImportRow = {
  itemName: string;
  score: number;
  description: string | null;
  scoringStandard: string | null;
};

type ParsedTemplateSheet = {
  sheetName: string;
  rows: TemplateImportRow[];
};

const KPI_TEMPLATE_MAX_TOTAL_SCORE = 110;

function buildDepartmentTemplateKey(departmentOrgNodeId: string) {
  return `kpi-template-${departmentOrgNodeId}`;
}

function buildDepartmentTemplateName(departmentName: string, sheetName: string, importDate: string) {
  return `${departmentName}-${sheetName}${importDate}`;
}

function parsePositiveInt(value: FormDataEntryValue | null, fieldName: string) {
  const text = typeof value === "string" ? value.trim() : "";
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName}不正确`);
  }
  return parsed;
}

function requiredString(value: FormDataEntryValue | null, fieldName: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`${fieldName}不能为空`);
  }
  return text;
}

function optionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function validateTemplateItemScore(score: number, fieldName: string) {
  if (!Number.isFinite(score) || score < 0) {
    throw new Error(`${fieldName}不正确`);
  }
  return score;
}

function validateTemplateItems(items: TemplateItemInput[], totalScoreLabel = "模板分值") {
  if (items.length === 0) {
    throw new Error("至少需要一个模板项");
  }

  const totalScore = items.reduce((sum, item) => sum + item.score, 0);
  if (totalScore > KPI_TEMPLATE_MAX_TOTAL_SCORE) {
    throw new Error(`${totalScoreLabel}总计不能超过${KPI_TEMPLATE_MAX_TOTAL_SCORE}分`);
  }

  return items;
}

function parseTemplateItemsFromFormData(formData: FormData) {
  const itemNames = formData.getAll("itemName");
  const itemScores = formData.getAll("itemScore");
  const itemDescriptions = formData.getAll("itemDescription");
  const itemScoringStandards = formData.getAll("itemScoringStandard");

  const items = itemNames.map((value, index) => {
    const name = requiredString(value, `模板项${index + 1}`);
    const score = validateTemplateItemScore(
      Number.parseFloat(requiredString(itemScores[index] ?? null, `模板项${index + 1}分值`)),
      `模板项${index + 1}分值`
    );
    return {
      name,
      description: optionalString(itemDescriptions[index] ?? null),
      score,
      scoringStandard: optionalString(itemScoringStandards[index] ?? null),
      sortOrder: (index + 1) * 10,
    } satisfies TemplateItemInput;
  }).filter((item) => item.name);

  return validateTemplateItems(items);
}

function buildKpiTemplateWorkbook() {
  const header = [
    "指标项*",
    "评分标准*",
    "分值*",
  ];

  const rows = [
    ["目标达成", "按目标完成质量评分", 40],
    ["协作效率", "按协同质量与时效评分", 30],
    ["过程规范", "按规范性与复盘质量评分", 30],
  ];
  const sheetName = "模板名称";

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  worksheet["!cols"] = [
    { wch: 24 },
    { wch: 36 },
    { wch: 10 },
  ];

  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1:C1");
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address];
      if (!cell) continue;
      cell.s = {
        font: { sz: 12, name: "Arial" },
        alignment: { vertical: "center", wrapText: true },
      };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}

function parseTemplateImportRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  if (workbook.SheetNames.length === 0) {
    throw new Error("导入文件不能为空");
  }

  const expectedHeader = ["指标项*", "评分标准*", "分值*"];
  const sheets: ParsedTemplateSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as Array<Array<string | number | null>>;

    if (rows.length === 0 || !rows.some((cells) => cells.some((cell) => String(cell ?? "").trim()))) {
      continue;
    }

    if (rows.length < 2) {
      throw new Error(`工作表《${sheetName}》不能为空`);
    }

    const header = rows[0].map((cell: string | number | null) => String(cell).trim());
    if (header.join("|") !== expectedHeader.join("|")) {
      throw new Error(`工作表《${sheetName}》表头不正确，请先下载最新模板`);
    }

    const parsedRows = validateTemplateItems(
      rows.slice(1)
        .filter((cells: Array<string | number | null>) => cells.some((cell) => String(cell ?? "").trim()))
        .map((cells: Array<string | number | null>, index: number) => {
          const itemName = String(cells[0] ?? "").trim();
          const scoringStandard = String(cells[1] ?? "").trim();
          const scoreText = String(cells[2] ?? "").trim();
          const score = validateTemplateItemScore(
            scoreText ? Number.parseFloat(scoreText) : 0,
            `工作表《${sheetName}》第${index + 2}行分值`
          );

          if (!itemName) throw new Error(`工作表《${sheetName}》第${index + 2}行指标项不能为空`);
          if (!scoringStandard) throw new Error(`工作表《${sheetName}》第${index + 2}行评分标准不能为空`);

          return {
            name: itemName,
            score,
            description: itemName,
            scoringStandard,
            sortOrder: (index + 1) * 10,
          } satisfies TemplateItemInput;
        }),
      `工作表《${sheetName}》分值`
    );

    const sheetRows = parsedRows.map(({ name, score, description, scoringStandard }) => ({
      itemName: name,
      score,
      description,
      scoringStandard,
    } satisfies TemplateImportRow));

    if (sheetRows.length === 0) {
      throw new Error(`工作表《${sheetName}》不能为空`);
    }

    sheets.push({ sheetName: sheetName.trim(), rows: sheetRows });
  }

  if (sheets.length === 0) {
    throw new Error("导入文件不能为空");
  }

  return sheets;
}

function getQuarterCode(year: number, quarter: number) {
  return year * 10 + quarter;
}

function isAssignmentEffective(assignment: TemplateAssignmentWithTemplate, year: number, quarter: number) {
  const current = getQuarterCode(year, quarter);
  const from = assignment.effectiveFromYear && assignment.effectiveFromQuarter
    ? getQuarterCode(assignment.effectiveFromYear, assignment.effectiveFromQuarter)
    : null;
  const to = assignment.effectiveToYear && assignment.effectiveToQuarter
    ? getQuarterCode(assignment.effectiveToYear, assignment.effectiveToQuarter)
    : null;

  if (from !== null && current < from) return false;
  if (to !== null && current > to) return false;
  return true;
}

function rankAssignment(assignment: TemplateAssignmentWithTemplate, userOrgDepth: number | null) {
  const typePriority = assignmentPriority[assignment.targetType];
  const orgDepthScore = assignment.targetType === "ORG_NODE"
    ? -(userOrgDepth ?? Number.MAX_SAFE_INTEGER)
    : 0;
  const approvedAt = assignment.template.approvedAt?.getTime() ?? 0;
  const updatedAt = assignment.template.updatedAt.getTime();

  return [
    typePriority,
    orgDepthScore,
    assignment.template.version,
    approvedAt,
    updatedAt,
    assignment.id,
  ] as const;
}

function isBetterRank(next: ReturnType<typeof rankAssignment>, current: ReturnType<typeof rankAssignment> | null) {
  if (!current) return true;
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] > current[index]) return true;
    if (next[index] < current[index]) return false;
  }
  return false;
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

function getTeamOrgNodeIdForRecord(
  orgNodeId: string | null | undefined,
  nearestTeamOrgNodeIdByNodeId: Map<string, string | null>,
) {
  if (!orgNodeId) {
    return null;
  }
  return nearestTeamOrgNodeIdByNodeId.get(orgNodeId) ?? null;
}

async function buildTemplateScopeContext(rootOrgNodeId: string) {
  const scopedOrgNodes = await prisma.orgNode.findMany({
    select: { id: true, name: true, nodeType: true, parentId: true },
  });
  const relationships = buildOrgNodeRelationships(scopedOrgNodes);
  const subtreeNodeIds = relationships.descendantOrgNodeIdsByNodeId.get(rootOrgNodeId) ?? [];
  const teamNodes = scopedOrgNodes.filter((orgNode) =>
    orgNode.nodeType === "TEAM" && subtreeNodeIds.includes(orgNode.id)
  );

  return {
    relationships,
    teamNodes,
    teamIdSet: new Set(teamNodes.map((team) => team.id)),
  };
}

function getScoringAbilityKey(stage: KpiEditableStage | null) {
  if (stage === "SELF") return kpiAbilityKeys.scoreSelf;
  if (stage === "LEADER") return kpiAbilityKeys.scoreLeader;
  if (stage === "MANAGER") return kpiAbilityKeys.scoreManager;
  if (stage === "FINAL") return kpiAbilityKeys.scoreFinal;
  return null;
}

async function resolveAllowedDepartmentOrgNodeIds(context: KpiPermissionContext) {
  const orgNodeIds = await resolveAuthorizedOrgNodeIds(
    context.currentUser,
    orgPermissionModuleKeys.kpi,
    kpiAbilityKeys.manageKpiTemplate,
  );
  if (orgNodeIds === null) {
    return null;
  }

  const departmentOrgNodeIds = new Set<string>();
  for (const orgNodeId of orgNodeIds) {
    const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(orgNodeId);
    if (departmentOrgNodeId) {
      departmentOrgNodeIds.add(departmentOrgNodeId);
    }
  }

  return [...departmentOrgNodeIds];
}

async function resolveKpiTemplateDepartmentContext(
  context: KpiPermissionContext,
  requestedDepartmentOrgNodeId: string | null | undefined,
) {
  const allowedDepartmentIds = await resolveAllowedDepartmentOrgNodeIds(context);
  const departmentOrgNodeId = allowedDepartmentIds === null
    ? (requestedDepartmentOrgNodeId ?? "")
    : (requestedDepartmentOrgNodeId ?? allowedDepartmentIds[0] ?? "");

  if (!departmentOrgNodeId) {
    throw new Error("请选择部门");
  }

  if (allowedDepartmentIds !== null && !allowedDepartmentIds.includes(departmentOrgNodeId)) {
    throw new Error("无权操作该部门的 KPI 模板");
  }

  const department = await prisma.orgNode.findFirst({
    where: {
      id: departmentOrgNodeId,
    },
    select: { id: true, name: true },
  });

  if (!department) {
    throw new Error("部门不存在");
  }

  return department;
}

export async function getKpiTemplateDepartmentOptions() {
  const context = await requireKpiTemplateEditor();
  const allowedDepartmentIds = await resolveAllowedDepartmentOrgNodeIds(context);
  const departments = allowedDepartmentIds === null
    ? await prisma.orgNode.findMany({
        where: { nodeType: "DEPARTMENT" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : await prisma.orgNode.findMany({
        where: {
          id: { in: allowedDepartmentIds },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });

  return {
    departmentOptions: departments.map((department) => ({
      id: department.id,
      name: department.name,
    } satisfies DepartmentOption)),
    defaultDepartmentOrgNodeId: departments[0]?.id ?? "",
    canSelectAnyDepartment: departments.length > 1,
  };
}

function parseTemplateScopeTargets(
  formData: FormData,
  memberTeamOrgNodeIdById: Map<string, string | null>,
) {
  const selectedTeamIds = formData.getAll("scopeTeamOrgNodeId")
    .map((value) => optionalString(value))
    .filter((value): value is string => Boolean(value));
  const selectedMemberIds = formData.getAll("scopeUserId")
    .map((value) => optionalString(value))
    .filter((value): value is string => Boolean(value));

  const selectedTeamIdSet = new Set(selectedTeamIds);
  const filteredMemberIds = selectedMemberIds.filter((memberId) => {
    const memberTeamOrgNodeId = memberTeamOrgNodeIdById.get(memberId) ?? null;
    return !memberTeamOrgNodeId || !selectedTeamIdSet.has(memberTeamOrgNodeId);
  });

  const dedupedTeamIds = [...new Set(selectedTeamIds)];
  const dedupedMemberIds = [...new Set(filteredMemberIds)];

  if (dedupedTeamIds.length === 0 && dedupedMemberIds.length === 0) {
    throw new Error("请至少选择一个适用范围");
  }

  return [
    ...dedupedTeamIds.map((teamId) => ({
      targetType: "ORG_NODE" as const,
      targetUserId: null,
      targetOrgNodeId: teamId,
      targetRoleType: null,
    })),
    ...dedupedMemberIds.map((userId) => ({
      targetType: "USER" as const,
      targetUserId: userId,
      targetOrgNodeId: null,
      targetRoleType: null,
    })),
  ] satisfies TemplateScopeTarget[];
}

async function validateTemplateScopeTargets(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  options: {
    departmentOrgNodeId: string;
    scopeTargets: TemplateScopeTarget[];
    currentTemplateId?: string;
  }
) {
  const teamIds = options.scopeTargets
    .filter((target) => target.targetType === "ORG_NODE" && target.targetOrgNodeId)
    .map((target) => target.targetOrgNodeId as string);
  const memberIds = options.scopeTargets
    .filter((target) => target.targetType === "USER" && target.targetUserId)
    .map((target) => target.targetUserId as string);

  if (teamIds.length === 0 && memberIds.length === 0) {
    return;
  }

  const activeTemplateIds = await tx.kpiTemplate.findMany({
    where: {
      departmentOrgNodeId: options.departmentOrgNodeId,
      isActive: true,
      deletedAt: null,
      ...(options.currentTemplateId ? { id: { not: options.currentTemplateId } } : {}),
    },
    select: { id: true },
  });

  const templateScopeContext = await buildTemplateScopeContext(options.departmentOrgNodeId);
  const scopeTeamIds = [...templateScopeContext.teamIdSet];
  const [teamNodes, scopeUsers, activeAssignments] = await Promise.all([
    tx.orgNode.findMany({
      where: {
        id: { in: scopeTeamIds.length ? scopeTeamIds : ["__never__"] },
      },
      select: { id: true, name: true },
    }),
    tx.user.findMany({
      where: {
        isActive: true,
        orgNodeId: { in: scopeTeamIds.length ? scopeTeamIds : ["__never__"] },
      },
      select: { id: true, name: true, orgNodeId: true },
    }),
    activeTemplateIds.length
      ? tx.kpiTemplateAssignment.findMany({
          where: {
            isActive: true,
            templateId: { in: activeTemplateIds.map((template) => template.id) },
          },
          select: {
            targetType: true,
            targetUserId: true,
            targetOrgNodeId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const teamNameById = new Map(teamNodes.map((team) => [team.id, team.name] as const));
  const teamMembersByTeamId = new Map<string, Array<{ id: string; name: string }>>();
  for (const user of scopeUsers) {
    const teamId = getTeamOrgNodeIdForRecord(user.orgNodeId, templateScopeContext.relationships.nearestTeamOrgNodeIdByNodeId);
    if (!teamId || !templateScopeContext.teamIdSet.has(teamId)) {
      continue;
    }
    const members = teamMembersByTeamId.get(teamId) ?? [];
    members.push({ id: user.id, name: user.name });
    teamMembersByTeamId.set(teamId, members);
  }

  const occupiedMemberIdSet = new Set(
    activeAssignments
      .filter((assignment) => assignment.targetType === "USER" && assignment.targetUserId)
      .map((assignment) => assignment.targetUserId as string)
  );
  const occupiedTeamIdSet = new Set(
    activeAssignments
      .filter((assignment) => assignment.targetType === "ORG_NODE" && assignment.targetOrgNodeId)
      .map((assignment) => assignment.targetOrgNodeId as string)
  );

  const invalidTeamNames = teamIds
    .filter((teamId) => templateScopeContext.teamIdSet.has(teamId))
    .filter((teamId) => {
      if (occupiedTeamIdSet.has(teamId)) {
        return true;
      }
      const teamMembers = teamMembersByTeamId.get(teamId) ?? [];
      return teamMembers.some((member) => occupiedMemberIdSet.has(member.id));
    })
    .map((teamId) => teamNameById.get(teamId) ?? "—");

  if (invalidTeamNames.length > 0) {
    throw new Error(`以下小组已被启用模板占用，不能保存：${invalidTeamNames.join("、")}`);
  }

  const invalidMemberNames = await tx.user.findMany({
    where: {
      id: { in: memberIds.filter((memberId) => occupiedMemberIdSet.has(memberId)) },
    },
    select: { name: true },
  });

  if (invalidMemberNames.length > 0) {
    throw new Error(`以下成员已被启用模板占用，不能保存：${invalidMemberNames.map((member) => member.name).join("、")}`);
  }
}

async function resolveScopedUsers(context: Awaited<ReturnType<typeof requireKpiManager>>) {
  const where = await buildUserWhereByPermission(
    context.currentUser,
    orgPermissionModuleKeys.kpi,
    kpiAbilityKeys.initializeKpi,
  );
  return prisma.user.findMany({
    where: {
      ...where,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      orgNodeId: true,
      roleType: true,
    },
    orderBy: { name: "asc" },
  });
}

async function resolveApplicableTemplates(users: ScopeUser[], year: number, quarter: number) {
  const userIds = users.map((user) => user.id);
  const orgNodeIds = [...new Set(users.map((user) => user.orgNodeId).filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId)))];
  if (orgNodeIds.length === 0) {
    return new Map();
  }
  const roleTypes = [...new Set(users.map((user) => user.roleType))];
  const userDepartmentOrgNodeIdEntries = await Promise.all(
    users.map(async (user) => [user.id, await findNearestDepartmentOrgNodeId(user.orgNodeId)] as const)
  );
  const userDepartmentOrgNodeIdByUserId = new Map(userDepartmentOrgNodeIdEntries);
  const departmentOrgNodeIds = [...new Set(
    userDepartmentOrgNodeIdEntries
      .map(([, departmentOrgNodeId]) => departmentOrgNodeId)
      .filter((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId))
  )];
  if (departmentOrgNodeIds.length === 0) {
    return new Map();
  }

  const [rawAssignments, templates, closureRows] = await Promise.all([
    prisma.kpiTemplateAssignment.findMany({
      where: {
        isActive: true,
        OR: [
          { targetType: "USER", targetUserId: { in: userIds } },
          { targetType: "ORG_NODE", targetOrgNodeId: { in: orgNodeIds } },
          { targetType: "ROLE", targetRoleType: { in: roleTypes } },
        ],
      },
      select: {
        id: true,
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
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.kpiTemplate.findMany({
      where: {
        status: "APPROVED",
        isActive: true,
        isLatest: true,
        deletedAt: null,
        departmentOrgNodeId: { in: departmentOrgNodeIds },
      },
      select: {
        id: true,
        templateKey: true,
        name: true,
        version: true,
        approvedAt: true,
        updatedAt: true,
        departmentOrgNodeId: true,
      },
    }),
    orgNodeIds.length
      ? prisma.orgClosure.findMany({
          where: {
            descendantId: { in: orgNodeIds },
            ancestorId: { in: orgNodeIds },
          },
          select: {
            ancestorId: true,
            descendantId: true,
            depth: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const templateById = new Map(templates.map((template) => [template.id, template]));
  const assignments: TemplateAssignmentWithTemplate[] = rawAssignments
    .map((assignment) => {
      const template = templateById.get(assignment.templateId);
      return template ? { ...assignment, template } : null;
    })
    .filter((assignment): assignment is TemplateAssignmentWithTemplate => Boolean(assignment));

  const depthByPair = new Map(closureRows.map((row) => [`${row.descendantId}:${row.ancestorId}`, row.depth]));
  const bestByUserId = new Map<string, { assignment: TemplateAssignmentWithTemplate; rank: ReturnType<typeof rankAssignment> }>();

  for (const user of users) {
    const userDepartmentOrgNodeId = userDepartmentOrgNodeIdByUserId.get(user.id) ?? null;
    if (!userDepartmentOrgNodeId) continue;

    for (const assignment of assignments) {
      if (!isAssignmentEffective(assignment, year, quarter)) continue;
      if (assignment.template.departmentOrgNodeId !== userDepartmentOrgNodeId) continue;

      let matched = false;
      let orgDepth: number | null = null;

      if (assignment.targetType === "USER") {
        matched = assignment.targetUserId === user.id;
      } else if (assignment.targetType === "ROLE") {
        matched = assignment.targetRoleType === user.roleType;
      } else if (assignment.targetType === "ORG_NODE") {
        if (!user.orgNodeId || !assignment.targetOrgNodeId) continue;
        orgDepth = depthByPair.get(`${user.orgNodeId}:${assignment.targetOrgNodeId}`) ?? null;
        matched = orgDepth !== null;
      }

      if (!matched) continue;

      const nextRank = rankAssignment(assignment, orgDepth);
      const currentBest = bestByUserId.get(user.id);
      if (isBetterRank(nextRank, currentBest?.rank ?? null)) {
        bestByUserId.set(user.id, { assignment, rank: nextRank });
      }
    }
  }

  return bestByUserId;
}

async function createPersonalKpiSnapshot(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: PersonalKpiSnapshotInput,
) {
  const createdKpi = await tx.personalKpi.create({
    data: {
      year: input.year,
      quarter: input.quarter,
      userId: input.userId,
      orgNodeId: input.orgNodeId,
      templateId: input.template.id,
      templateVersion: input.template.version,
      status: "DRAFT",
      initializedAt: new Date(),
      initializedById: input.initializerId,
    },
  });

  if (input.items.length > 0) {
    await tx.personalKpiItem.createMany({
      data: input.items.map((item) => ({
        personalKpiId: createdKpi.id,
        sourceTemplateItemId: item.id,
        name: item.name,
        description: item.description,
        score: item.score,
        weight: 0,
        scoringStandard: item.scoringStandard,
        sortOrder: item.sortOrder,
      })),
    });
  }

  const chain = await resolveApprovalChain(input.userId, input.orgNodeId);
  if (chain.length > 0) {
    await tx.personalKpiApprovalStep.createMany({
      data: chain.map((step) => ({
        personalKpiId: createdKpi.id,
        stepOrder: step.stepOrder,
        stageKey: step.stageKey,
        approverId: step.approverId,
      })),
    });
  }

  return createdKpi;
}

export async function downloadKpiTemplateCsv(formData: FormData) {
  const context = await requireKpiTemplateEditor();
  const department = await resolveKpiTemplateDepartmentContext(
    context,
    optionalString(formData.get("departmentOrgNodeId")),
  );
  return {
    fileName: `${department.name}-kpi-template-import.xlsx`,
    content: buildKpiTemplateWorkbook().toString("base64"),
    departmentName: department.name,
    departmentOrgNodeId: department.id,
  };
}

export async function importKpiTemplates(formData: FormData): Promise<TemplateImportSummary> {
  const context = await requireKpiTemplateEditor();
  const department = await resolveKpiTemplateDepartmentContext(
    context,
    optionalString(formData.get("departmentOrgNodeId")),
  );
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("请上传模板文件");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sheets = parseTemplateImportRows(buffer);

  const defaults: ImportedTemplateDefaults = {
    templateDescription: null,
  };
  const importDate = new Date().toISOString().slice(0, 10);

  let importedTemplateCount = 0;
  const importedAssignmentCount = 0;
  let importedItemCount = 0;
  const importedTemplateNames: string[] = [];

  for (const sheet of sheets) {
    const normalizedSheetName = sheet.sheetName.trim();
    if (!normalizedSheetName) {
      throw new Error("存在未命名的工作表，请先填写 sheet 名称");
    }

    const templateName = buildDepartmentTemplateName(department.name, normalizedSheetName, importDate);
    const templateKey = `${buildDepartmentTemplateKey(department.id)}-${normalizedSheetName}`;

    await prisma.$transaction(async (tx) => {
      const existingTemplate = await tx.kpiTemplate.findFirst({
        where: {
          departmentOrgNodeId: department.id,
          templateKey,
          deletedAt: null,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      const template = existingTemplate
        ? await tx.kpiTemplate.update({
            where: {
              id: existingTemplate.id,
            },
            data: {
              name: templateName,
              description: defaults.templateDescription,
              status: "APPROVED",
              isLatest: true,
              isActive: false,
              approvedAt: new Date(),
              updatedById: context.currentUser.id,
            },
          })
        : await tx.kpiTemplate.create({
            data: {
              templateKey,
              departmentOrgNodeId: department.id,
              name: templateName,
              description: defaults.templateDescription,
              status: "APPROVED",
              version: 1,
              isLatest: true,
              isActive: true,
              approvedAt: new Date(),
              createdById: context.currentUser.id,
              updatedById: context.currentUser.id,
            },
          });

      await tx.kpiTemplateItem.deleteMany({
        where: {
          templateId: template.id,
        },
      });

      await tx.kpiTemplateItem.createMany({
        data: sheet.rows.map((row, index) => ({
          templateId: template.id,
          name: row.itemName,
          description: row.description,
          score: row.score,
          weight: 0,
          scoringStandard: row.scoringStandard,
          sortOrder: (index + 1) * 10,
        })),
      });
    });

    importedTemplateCount += 1;
    importedItemCount += sheet.rows.length;
    importedTemplateNames.push(templateName);
  }

  revalidatePath("/kpi");
  revalidatePath("/dashboard");

  return {
    importedTemplateCount,
    importedAssignmentCount,
    importedItemCount,
    importedTemplateNames,
    departmentName: department.name,
  };
}

export async function createKpiTemplate(formData: FormData): Promise<TemplateCreateSummary> {
  const context = await requireKpiTemplateEditor();
  const department = await resolveKpiTemplateDepartmentContext(
    context,
    optionalString(formData.get("departmentOrgNodeId")),
  );
  const templateName = requiredString(formData.get("name"), "模板名称");
  const description = optionalString(formData.get("description"));
  const items = parseTemplateItemsFromFormData(formData);

  const scopedUsers = await resolveScopedUsers(context);
  const templateScopeContext = await buildTemplateScopeContext(department.id);
  const memberTeamOrgNodeIdById = new Map(scopedUsers.map((user) => [
    user.id,
    getTeamOrgNodeIdForRecord(user.orgNodeId, templateScopeContext.relationships.nearestTeamOrgNodeIdByNodeId),
  ] as const));
  const scopeTargets = parseTemplateScopeTargets(formData, memberTeamOrgNodeIdById);

  await validateTemplateScopeTargets(prisma, {
    departmentOrgNodeId: department.id,
    scopeTargets,
  });

  const templateKey = `${buildDepartmentTemplateKey(department.id)}-${Date.now()}`;

  const created = await prisma.$transaction(async (tx) => {
    const template = await tx.kpiTemplate.create({
      data: {
        templateKey,
        departmentOrgNodeId: department.id,
        name: templateName,
        description,
        status: "APPROVED",
        version: 1,
        isLatest: true,
        isActive: false,
        approvedAt: new Date(),
        createdById: context.currentUser.id,
        updatedById: context.currentUser.id,
      },
    });

    await tx.kpiTemplateItem.createMany({
      data: items.map((item) => ({
        templateId: template.id,
        name: item.name,
        description: item.description,
        score: item.score,
        weight: 0,
        scoringStandard: item.scoringStandard,
        sortOrder: item.sortOrder,
      })),
    });

    await tx.kpiTemplateAssignment.createMany({
      data: scopeTargets.map((target) => ({
        templateId: template.id,
        targetType: target.targetType,
        targetUserId: target.targetUserId,
        targetOrgNodeId: target.targetOrgNodeId,
        targetRoleType: target.targetRoleType,
        isActive: true,
      })),
    });

    return template;
  });

  revalidatePath("/kpi");
  revalidatePath("/dashboard");

  return {
    templateId: created.id,
    templateName: created.name,
    departmentOrgNodeId: created.departmentOrgNodeId,
    itemCount: items.length,
    assignmentCount: scopeTargets.length,
  };
}

export async function updateKpiTemplate(formData: FormData): Promise<TemplateUpdateSummary> {
  const context = await requireKpiTemplateEditor();
  const templateId = requiredString(formData.get("templateId"), "模板");
  const templateName = requiredString(formData.get("name"), "模板名称");
  const description = optionalString(formData.get("description"));
  const items = parseTemplateItemsFromFormData(formData);

  const template = await prisma.kpiTemplate.findFirst({
    where: {
      id: templateId,
      deletedAt: null,
    },
    select: {
      id: true,
      departmentOrgNodeId: true,
    },
  });

  if (!template) {
    throw new Error("模板不存在或已删除");
  }

  const allowedDepartmentIds = await resolveAllowedDepartmentOrgNodeIds(context);
  if (allowedDepartmentIds !== null && !allowedDepartmentIds.includes(template.departmentOrgNodeId)) {
    throw new Error("无权编辑该部门模板");
  }

  const scopedUsers = await resolveScopedUsers(context);
  const templateScopeContext = await buildTemplateScopeContext(template.departmentOrgNodeId);
  const memberTeamOrgNodeIdById = new Map(scopedUsers.map((user) => [
    user.id,
    getTeamOrgNodeIdForRecord(user.orgNodeId, templateScopeContext.relationships.nearestTeamOrgNodeIdByNodeId),
  ] as const));
  const scopeTargets = parseTemplateScopeTargets(formData, memberTeamOrgNodeIdById);

  await validateTemplateScopeTargets(prisma, {
    departmentOrgNodeId: template.departmentOrgNodeId,
    scopeTargets,
    currentTemplateId: template.id,
  });

  await prisma.$transaction(async (tx) => {
    await tx.kpiTemplate.update({
      where: { id: template.id },
      data: {
        name: templateName,
        description,
        updatedById: context.currentUser.id,
        updatedAt: new Date(),
      },
    });

    await tx.kpiTemplateItem.deleteMany({
      where: { templateId: template.id },
    });

    await tx.kpiTemplateItem.createMany({
      data: items.map((item) => ({
        templateId: template.id,
        name: item.name,
        description: item.description,
        score: item.score,
        weight: 0,
        scoringStandard: item.scoringStandard,
        sortOrder: item.sortOrder,
      })),
    });

    await tx.kpiTemplateAssignment.updateMany({
      where: { templateId: template.id, isActive: true },
      data: { isActive: false },
    });

    await tx.kpiTemplateAssignment.createMany({
      data: scopeTargets.map((target) => ({
        templateId: template.id,
        targetType: target.targetType,
        targetUserId: target.targetUserId,
        targetOrgNodeId: target.targetOrgNodeId,
        targetRoleType: target.targetRoleType,
        isActive: true,
      })),
    });
  });

  revalidatePath("/kpi");
  revalidatePath("/dashboard");

  return {
    templateId,
    templateName,
    itemCount: items.length,
    departmentOrgNodeId: template.departmentOrgNodeId,
  };
}

export async function toggleKpiTemplateActive(templateId: string): Promise<{ templateId: string; isActive: boolean }> {
  const context = await requireKpiAbility(kpiAbilityKeys.toggleKpiTemplate, "当前角色不能启用或禁用 KPI 模板");
  const template = await prisma.kpiTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
    select: { id: true, departmentOrgNodeId: true, isActive: true },
  });
  if (!template) throw new Error("模板不存在");
  const allowedDepartmentIds = await resolveAllowedDepartmentOrgNodeIds(context);
  if (allowedDepartmentIds !== null && !allowedDepartmentIds.includes(template.departmentOrgNodeId)) {
    throw new Error("无权限操作该模板");
  }
  const updated = await prisma.kpiTemplate.update({
    where: { id: templateId },
    data: { isActive: !template.isActive },
    select: { id: true, isActive: true },
  });
  revalidatePath("/kpi");
  revalidatePath("/dashboard");
  return { templateId: updated.id, isActive: updated.isActive };
}

export async function deletePersonalKpi(personalKpiId: string): Promise<PersonalKpiDeleteSummary> {
  const context = await requireKpiManager();
  const where = await buildKpiWhereByPermission(
    context.currentUser,
    orgPermissionModuleKeys.kpi,
    kpiAbilityKeys.initializeKpi,
  );
  const personalKpi = await prisma.personalKpi.findFirst({
    where: {
      ...where,
      id: personalKpiId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!personalKpi) {
    throw new Error("季度 KPI 不存在或无权限删除");
  }

  await prisma.$transaction(async (tx) => {
    await tx.personalKpiItem.deleteMany({
      where: { personalKpiId },
    });
    await tx.personalKpi.delete({
      where: { id: personalKpiId },
    });
  });

  revalidatePath("/kpi");
  revalidatePath("/dashboard");

  return { personalKpiId };
}

type KpiEditableStage = "SELF" | "LEADER" | "MANAGER" | "FINAL";
type KpiScoringAction = "save" | "submit" | "approve" | "reject";

type SummaryFields = {
  workSummary: string;
  abilitySummary: string;
  praise: string;
  opportunity: string;
  attendanceScore: number;
};

type KpiActionLogInput = {
  personalKpiId: string;
  actorId: string;
  action: string;
  remark?: string | null;
};

function getKpiEditableStage(status: KpiStatus): KpiEditableStage | null {
  if (status === "DRAFT" || status === "PENDING_SELF_REVIEW") return "SELF";
  if (status === "PENDING_LEADER_SCORE") return "LEADER";
  if (status === "PENDING_MANAGER_SCORE") return "MANAGER";
  if (status === "PENDING_FINAL_REVIEW") return "FINAL";
  return null;
}

function getNextKpiStage(status: KpiStatus): KpiStatus {
  if (status === "DRAFT" || status === "PENDING_SELF_REVIEW") return "PENDING_LEADER_SCORE";
  if (status === "PENDING_LEADER_SCORE") return "PENDING_MANAGER_SCORE";
  if (status === "PENDING_MANAGER_SCORE") return "PENDING_FINAL_REVIEW";
  if (status === "PENDING_FINAL_REVIEW") return "COMPLETED";
  throw new Error("当前阶段不能继续流转");
}

function getPreviousKpiStage(status: KpiStatus): KpiStatus {
  if (status === "PENDING_LEADER_SCORE") return "PENDING_SELF_REVIEW";
  if (status === "PENDING_MANAGER_SCORE") return "PENDING_LEADER_SCORE";
  if (status === "PENDING_FINAL_REVIEW") return "PENDING_MANAGER_SCORE";
  throw new Error("当前阶段不能退回");
}

function assertKpiScoringActionAllowed(status: KpiStatus, action: KpiScoringAction) {
  const editableStage = getKpiEditableStage(status);
  if (!editableStage) throw new Error("当前 KPI 阶段不支持评分操作");
  if (action === "submit" && editableStage !== "SELF") throw new Error("当前阶段不能提交");
  if (action === "approve" && editableStage === "SELF") throw new Error("当前阶段不能审核通过");
  if (action === "reject" && editableStage === "SELF") throw new Error("当前阶段不能退回");
}

function parseNonPositiveScore(value: FormDataEntryValue | null, fieldName: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return 0;
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed) || parsed > 0) {
    throw new Error(`${fieldName}只能填写 0 或负数`);
  }
  return parsed;
}

function serializeStructuredSummary(firstLabel: string, firstValue: string, secondLabel: string, secondValue: string) {
  const normalizedFirst = firstValue.trim();
  const normalizedSecond = secondValue.trim();
  if (!normalizedFirst && !normalizedSecond) return null;
  return `【${firstLabel}】
${normalizedFirst}

【${secondLabel}】
${normalizedSecond}`.trim();
}

function parseScoringSummary(formData: FormData): SummaryFields {
  return {
    workSummary: optionalString(formData.get("workSummary")) ?? "",
    abilitySummary: optionalString(formData.get("abilitySummary")) ?? "",
    praise: optionalString(formData.get("praise")) ?? "",
    opportunity: optionalString(formData.get("opportunity")) ?? "",
    attendanceScore: parseNonPositiveScore(formData.get("attendanceScore"), "考勤分"),
  };
}

function parseRejectRemark(formData: FormData) {
  return requiredString(formData.get("rejectRemark"), "退回原因");
}

async function createPersonalKpiActionLog(tx: any, input: KpiActionLogInput) {
  await tx.personalKpiActionLog.create({
    data: {
      personalKpiId: input.personalKpiId,
      actorId: input.actorId,
      action: input.action,
      remark: input.remark ?? null,
    },
  });
}

function getKpiActionLogLabel(editableStage: KpiEditableStage, action: KpiScoringAction) {
  if (action === "reject") {
    return "退回";
  }
  if (editableStage === "SELF") {
    return "自评";
  }
  if (editableStage === "LEADER") {
    return "组长评";
  }
  if (editableStage === "MANAGER") {
    return "主管评";
  }
  return "终审";
}

function calculatePenaltyTotal(values: Array<number | null | undefined>) {
  return values.reduce<number>((sum, value) => sum + Math.abs(Math.min(value ?? 0, 0)), 0);
}

function assertRequiredScoringSummary(editableStage: KpiEditableStage, summary: SummaryFields) {
  if (editableStage === "SELF") {
    if (!summary.workSummary.trim()) {
      throw new Error("季度工作任务总结不能为空");
    }
    if (!summary.abilitySummary.trim()) {
      throw new Error("季度工作能力总结不能为空");
    }
  }
  if (editableStage === "LEADER") {
    if (!summary.praise.trim()) {
      throw new Error("表扬不能为空");
    }
    if (!summary.opportunity.trim()) {
      throw new Error("机会不能为空");
    }
  }
}

async function persistPersonalKpiScoring(formData: FormData, action: KpiScoringAction) {
  const personalKpiId = requiredString(formData.get("personalKpiId"), "季度 KPI");
  const currentUser = await requireCurrentUser();
  const summary = parseScoringSummary(formData);
  const rejectRemark = action === "reject" ? parseRejectRemark(formData) : null;

  const result = await prisma.$transaction(async (tx) => {
    const personalKpi = await tx.personalKpi.findFirst({
      where: {
        id: personalKpiId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        selfComment: true,
        leaderComment: true,
        managerComment: true,
        selfScore: true,
        managerScore: true,
        finalScore: true,
      },
    });

    if (!personalKpi) {
      throw new Error("季度 KPI 不存在或无权限操作");
    }

    assertKpiScoringActionAllowed(personalKpi.status, action);
    const editableStage = getKpiEditableStage(personalKpi.status);
    if (!editableStage) {
      throw new Error("当前 KPI 阶段不支持评分操作");
    }

    const scoringAbilityKey = getScoringAbilityKey(editableStage);
    if (!scoringAbilityKey) {
      throw new Error("当前 KPI 阶段不支持评分操作");
    }
    if (action !== "save" && action !== "reject") {
      assertRequiredScoringSummary(editableStage, summary);
    }
    const where = await buildKpiWhereByPermission(
      currentUser,
      orgPermissionModuleKeys.kpi,
      scoringAbilityKey,
    );
    const authorizedKpi = await tx.personalKpi.findFirst({
      where: {
        ...where,
        id: personalKpiId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!authorizedKpi) {
      throw new Error("季度 KPI 不存在或无权限操作");
    }

    const currentApprovalStep = editableStage !== "SELF"
      ? await tx.personalKpiApprovalStep.findFirst({
          where: { personalKpiId, status: "PENDING" },
          orderBy: { stepOrder: "asc" },
        })
      : null;
    if (currentApprovalStep && currentApprovalStep.approverId !== currentUser.id) {
      throw new Error("你不是当前阶段的审批人");
    }

    const itemIds = formData.getAll("itemId").map((value, index) => requiredString(value, `指标项${index + 1}`));
    if (editableStage !== "FINAL") {
      const scoreFieldName = editableStage === "SELF"
        ? "selfScore"
        : editableStage === "LEADER"
          ? "leaderScore"
          : "managerScore";
      const stageScores = formData.getAll(scoreFieldName);
      if (stageScores.length !== itemIds.length) {
        throw new Error("评分项数据不完整，请刷新后重试");
      }
      for (const [index, itemId] of itemIds.entries()) {
        const scoreValue = parseNonPositiveScore(stageScores[index] ?? null, `第${index + 1}项评分`);
        if (editableStage === "SELF") {
          await tx.personalKpiItem.update({ where: { id: itemId }, data: { selfScore: scoreValue } });
        } else if (editableStage === "LEADER") {
          await tx.personalKpiItem.update({ where: { id: itemId }, data: { leaderScore: scoreValue } });
        } else {
          await tx.personalKpiItem.update({ where: { id: itemId }, data: { managerScore: scoreValue } });
        }
      }
    }

    const items = await tx.personalKpiItem.findMany({
      where: { personalKpiId },
      select: { score: true, selfScore: true, leaderScore: true, managerScore: true },
    });

    const scoreTotal = items.reduce<number>((sum, item) => sum + item.score, 0);
    const selfTotal = scoreTotal - calculatePenaltyTotal(items.map((item) => item.selfScore));
    const leaderTotal = scoreTotal - calculatePenaltyTotal(items.map((item) => item.leaderScore));
    const managerTotal = scoreTotal - calculatePenaltyTotal(items.map((item) => item.managerScore));
    const currentAttendanceScore = personalKpi.finalScore !== null && personalKpi.managerScore !== null
      ? personalKpi.finalScore - personalKpi.managerScore
      : 0;
    const attendanceScore = editableStage === "FINAL" ? summary.attendanceScore : currentAttendanceScore;
    const stageKeyToStatus: Record<string, KpiStatus> = {
      LEADER: "PENDING_LEADER_SCORE",
      MANAGER: "PENDING_MANAGER_SCORE",
      FINAL: "PENDING_FINAL_REVIEW",
    };

    let nextStatus: KpiStatus;
    if (action === "save") {
      nextStatus = personalKpi.status;
    } else if (action === "reject") {
      if (currentApprovalStep) {
        await tx.personalKpiApprovalStep.update({
          where: { id: currentApprovalStep.id },
          data: { status: "REJECTED", completedAt: new Date() },
        });
      }
      nextStatus = "PENDING_SELF_REVIEW";
    } else {
      const hasChain = (await tx.personalKpiApprovalStep.count({ where: { personalKpiId } })) > 0;
      if (!hasChain) {
        nextStatus = getNextKpiStage(personalKpi.status);
      } else {
        if (currentApprovalStep) {
          await tx.personalKpiApprovalStep.update({
            where: { id: currentApprovalStep.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
        const nextStep = await tx.personalKpiApprovalStep.findFirst({
          where: { personalKpiId, status: { in: ["PENDING", "REJECTED"] } },
          orderBy: { stepOrder: "asc" },
        });
        if (nextStep?.status === "REJECTED") {
          await tx.personalKpiApprovalStep.update({
            where: { id: nextStep.id },
            data: { status: "PENDING", completedAt: null },
          });
        }
        nextStatus = nextStep ? (stageKeyToStatus[nextStep.stageKey] ?? "COMPLETED") : "COMPLETED";
      }
    }

    await tx.personalKpi.update({
      where: { id: personalKpiId },
      data: {
        status: nextStatus,
        selfScore: selfTotal,
        leaderScore: leaderTotal,
        managerScore: managerTotal,
        finalScore: managerTotal + attendanceScore,
        selfComment: editableStage === "SELF"
          ? serializeStructuredSummary("季度工作任务总结", summary.workSummary, "季度工作能力总结", summary.abilitySummary)
          : personalKpi.selfComment,
        leaderComment: editableStage === "LEADER"
          ? serializeStructuredSummary("表扬", summary.praise, "机会", summary.opportunity)
          : personalKpi.leaderComment,
        managerComment: editableStage === "MANAGER"
          ? serializeStructuredSummary("表扬", summary.praise, "机会", summary.opportunity)
          : personalKpi.managerComment,
        submittedAt: action === "submit" ? new Date() : undefined,
        completedAt: nextStatus === "COMPLETED" ? new Date() : null,
      },
    });

    if (action !== "save") {
      await createPersonalKpiActionLog(tx, {
        personalKpiId,
        actorId: currentUser.id,
        action: getKpiActionLogLabel(editableStage, action),
        remark: action === "reject" ? rejectRemark : null,
      });
    }

    return { personalKpiId, nextStatus };
  });

  revalidatePath("/kpi");
  revalidatePath("/dashboard");
  revalidatePath(`/kpi/${personalKpiId}`);

  return result;
}

export async function savePersonalKpiScoring(formData: FormData) {
  return persistPersonalKpiScoring(formData, "save");
}

export async function submitPersonalKpiScoring(formData: FormData) {
  return persistPersonalKpiScoring(formData, "submit");
}

export async function approvePersonalKpiScoring(formData: FormData) {
  return persistPersonalKpiScoring(formData, "approve");
}

export async function rejectPersonalKpiScoring(formData: FormData) {
  return persistPersonalKpiScoring(formData, "reject");
}

export async function initializeQuarterlyKpis(formData: FormData): Promise<InitializationSummary> {
  const context = await requireKpiManager();
  const year = parsePositiveInt(formData.get("year"), "年份");
  const quarter = parsePositiveInt(formData.get("quarter"), "季度");
  if (quarter < 1 || quarter > 4) {
    throw new Error("季度不正确");
  }

  const users = await resolveScopedUsers(context);
  const assignmentByUserId = await resolveApplicableTemplates(users, year, quarter);

  const templateIds = [...new Set([...assignmentByUserId.values()].map((item) => item.assignment.templateId))];
  const templateItems = templateIds.length
    ? await prisma.kpiTemplateItem.findMany({
        where: { templateId: { in: templateIds } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      })
    : [];
  const templateItemsByTemplateId = new Map<string, typeof templateItems>();
  for (const item of templateItems) {
    const list = templateItemsByTemplateId.get(item.templateId) ?? [];
    list.push(item);
    templateItemsByTemplateId.set(item.templateId, list);
  }

  const existingKpis = await prisma.personalKpi.findMany({
    where: {
      year,
      quarter,
      userId: { in: users.map((user) => user.id) },
    },
    select: { userId: true, id: true, deletedAt: true },
  });
  const activeExistingUserIds = new Set(
    existingKpis
      .filter((kpi) => kpi.deletedAt === null)
      .map((kpi) => kpi.userId)
  );
  const deletedExistingKpiByUserId = new Map(
    existingKpis
      .filter((kpi) => kpi.deletedAt !== null)
      .map((kpi) => [kpi.userId, kpi.id] as const)
  );

  const createdUsers: string[] = [];
  const existingUsers: string[] = [];
  const skippedUsers: string[] = [];

  for (const user of users) {
    if (activeExistingUserIds.has(user.id)) {
      existingUsers.push(user.name);
      continue;
    }

    const resolved = assignmentByUserId.get(user.id)?.assignment;
    if (!resolved) {
      skippedUsers.push(user.name);
      continue;
    }

    const items = templateItemsByTemplateId.get(resolved.templateId) ?? [];
    const deletedExistingKpiId = deletedExistingKpiByUserId.get(user.id) ?? null;

    await prisma.$transaction(async (tx) => {
      if (deletedExistingKpiId) {
        await tx.personalKpiItem.deleteMany({
          where: { personalKpiId: deletedExistingKpiId },
        });
        await tx.personalKpi.delete({
          where: { id: deletedExistingKpiId },
        });
      }

      await createPersonalKpiSnapshot(tx, {
        year,
        quarter,
        userId: user.id,
        orgNodeId: user.orgNodeId,
        initializerId: context.currentUser.id,
        template: resolved.template,
        items,
      });
    });

    createdUsers.push(user.name);
  }

  revalidatePath("/kpi");
  revalidatePath("/dashboard");

  return {
    year,
    quarter,
    createdCount: createdUsers.length,
    existingCount: existingUsers.length,
    skippedNoTemplateCount: skippedUsers.length,
    createdUsers,
    existingUsers,
    skippedUsers,
  };
}
