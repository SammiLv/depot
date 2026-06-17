"use server";

import { revalidatePath } from "next/cache";
import type { KpiTemplate, KpiTemplateAssignment, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getUserWhereByScope } from "@/server/permissions/data-scope";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodes } from "@/server/organization/org-tree-utils";

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

type KpiTemplateEditorContext = {
  currentUser: Awaited<ReturnType<typeof requireCurrentUser>>;
  scopedDepartmentOrgNodeId: string | null;
  allowedDepartmentIds: string[] | null;
};

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
  const XLSX = require("xlsx") as typeof import("xlsx");
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
  const XLSX = require("xlsx") as typeof import("xlsx");
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

async function requireKpiInitializer() {
  const currentUser = await requireCurrentUser();
  if (!editableRoles.includes(currentUser.roleType as (typeof editableRoles)[number])) {
    throw new Error("当前角色不能执行季度 KPI 初始化");
  }
  return currentUser;
}

async function requireKpiTemplateEditor() {
  const currentUser = await requireCurrentUser();
  if (!editableRoles.includes(currentUser.roleType as (typeof editableRoles)[number])) {
    throw new Error("当前角色不能维护 KPI 模板");
  }

  const scopedDepartmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? null
    : await findNearestDepartmentOrgNodeId(currentUser.orgNodeId);

  if (currentUser.roleType !== "ADMIN" && !scopedDepartmentOrgNodeId) {
    throw new Error("当前角色未归属部门，不能维护 KPI 模板");
  }

  const allowedDepartmentIds = currentUser.roleType === "ADMIN"
    ? null
    : [scopedDepartmentOrgNodeId as string];

  return {
    currentUser,
    scopedDepartmentOrgNodeId,
    allowedDepartmentIds,
  } satisfies KpiTemplateEditorContext;
}

async function resolveKpiTemplateDepartmentContext(
  context: KpiTemplateEditorContext,
  requestedDepartmentOrgNodeId: string | null | undefined,
) {
  const departmentOrgNodeId = context.currentUser.roleType === "ADMIN"
    ? (requestedDepartmentOrgNodeId ?? "")
    : context.scopedDepartmentOrgNodeId;

  if (!departmentOrgNodeId) {
    throw new Error("请选择部门");
  }

  if (context.allowedDepartmentIds && !context.allowedDepartmentIds.includes(departmentOrgNodeId)) {
    throw new Error("无权操作该部门的 KPI 模板");
  }

  const department = await prisma.orgNode.findFirst({
    where: {
      id: departmentOrgNodeId,
      nodeType: "DEPARTMENT",
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
  const departments = context.currentUser.roleType === "ADMIN"
    ? await prisma.orgNode.findMany({
        where: { nodeType: "DEPARTMENT" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : await getDescendantOrgNodes(context.scopedDepartmentOrgNodeId, "DEPARTMENT");

  return {
    departmentOptions: departments.map((department) => ({
      id: department.id,
      name: department.name,
    } satisfies DepartmentOption)),
    defaultDepartmentOrgNodeId: context.currentUser.roleType === "ADMIN"
      ? (departments[0]?.id ?? "")
      : (context.scopedDepartmentOrgNodeId ?? departments[0]?.id ?? ""),
    canSelectAnyDepartment: context.currentUser.roleType === "ADMIN",
  };
}

function parseTemplateScopeTargets(formData: FormData, memberOrgNodeIdById: Map<string, string | null>) {
  const selectedTeamIds = formData.getAll("scopeTeamOrgNodeId")
    .map((value) => optionalString(value))
    .filter((value): value is string => Boolean(value));
  const selectedMemberIds = formData.getAll("scopeUserId")
    .map((value) => optionalString(value))
    .filter((value): value is string => Boolean(value));

  const selectedTeamIdSet = new Set(selectedTeamIds);
  const filteredMemberIds = selectedMemberIds.filter((memberId) => {
    const memberOrgNodeId = memberOrgNodeIdById.get(memberId) ?? null;
    return !memberOrgNodeId || !selectedTeamIdSet.has(memberOrgNodeId);
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
  ];
}

async function resolveScopedUsers(currentUser: Awaited<ReturnType<typeof requireKpiInitializer>>) {
  const where = await getUserWhereByScope(currentUser);
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
        departmentOrgNodeId: { in: orgNodeIds },
      },
      select: {
        id: true,
        templateKey: true,
        name: true,
        version: true,
        approvedAt: true,
        updatedAt: true,
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
    for (const assignment of assignments) {
      if (!isAssignmentEffective(assignment, year, quarter)) continue;

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
  let importedAssignmentCount = 0;
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
              isActive: true,
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

  const scopedUsers = await resolveScopedUsers(context.currentUser);
  const memberOrgNodeIdById = new Map(scopedUsers.map((user) => [user.id, user.orgNodeId] as const));
  const scopeTargets = parseTemplateScopeTargets(formData, memberOrgNodeIdById);

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
        isActive: true,
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

  if (context.allowedDepartmentIds && !context.allowedDepartmentIds.includes(template.departmentOrgNodeId)) {
    throw new Error("无权编辑该部门模板");
  }

  const scopedUsers = await resolveScopedUsers(context.currentUser);
  const memberOrgNodeIdById = new Map(scopedUsers.map((user) => [user.id, user.orgNodeId] as const));
  const scopeTargets = parseTemplateScopeTargets(formData, memberOrgNodeIdById);

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

export async function initializeQuarterlyKpis(formData: FormData): Promise<InitializationSummary> {
  const currentUser = await requireKpiInitializer();
  const year = parsePositiveInt(formData.get("year"), "年份");
  const quarter = parsePositiveInt(formData.get("quarter"), "季度");
  if (quarter < 1 || quarter > 4) {
    throw new Error("季度不正确");
  }

  const users = await resolveScopedUsers(currentUser);
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
      deletedAt: null,
    },
    select: { userId: true },
  });
  const existingUserIds = new Set(existingKpis.map((kpi) => kpi.userId));

  const createdUsers: string[] = [];
  const existingUsers: string[] = [];
  const skippedUsers: string[] = [];

  for (const user of users) {
    if (existingUserIds.has(user.id)) {
      existingUsers.push(user.name);
      continue;
    }

    const resolved = assignmentByUserId.get(user.id)?.assignment;
    if (!resolved) {
      skippedUsers.push(user.name);
      continue;
    }

    const items = templateItemsByTemplateId.get(resolved.templateId) ?? [];

    await prisma.$transaction(async (tx) => {
      const createdKpi = await tx.personalKpi.create({
        data: {
          year,
          quarter,
          userId: user.id,
          orgNodeId: user.orgNodeId,
          templateId: resolved.template.id,
          templateVersion: resolved.template.version,
          status: "DRAFT",
          initializedAt: new Date(),
          initializedById: currentUser.id,
        },
      });

      if (items.length > 0) {
        await tx.personalKpiItem.createMany({
          data: items.map((item) => ({
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
