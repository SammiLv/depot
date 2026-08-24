import type {
  RoleType,
  TalentRestrictionRevisionStatus,
  TalentRestrictionRuleStatus,
  TalentRuleCategory,
  TalentRuleFieldSource,
  TalentRuleOutputType,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export type TalentRestrictionRuleFilters = {
  query?: string;
  category?: TalentRuleCategory;
  source?: TalentRuleFieldSource;
  outputType?: TalentRuleOutputType;
  departmentOrgNodeId?: string;
  status?: TalentRestrictionRuleStatus;
};

const categoryValues = ["WORK_INCIDENT", "QUARTERLY_KPI", "BUSINESS_ASSESSMENT", "TALENT_REVIEW", "EMPLOYEE_PROFILE"] as const;
const sourceValues = categoryValues;
const outputTypeValues = ["KPI_PROCESSING", "REWARD_PROCESSING", "SALARY_RESTRICTION", "PROMOTION_RESTRICTION", "ANNUAL_BONUS_PROCESSING", "TRAINING_OR_TRANSFER", "SALARY_REDUCTION", "CONTRACT_PROCESSING"] as const;
const statusValues = ["DRAFT", "ACTIVE", "DISABLED"] as const;

function includesValue<const T extends readonly string[]>(values: T, value: string | undefined): value is T[number] {
  return Boolean(value && values.includes(value as T[number]));
}

export function normalizeTalentRestrictionRuleFilters(input: Record<string, string | string[] | undefined>): TalentRestrictionRuleFilters {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const query = first(input.query)?.trim().slice(0, 80) || undefined;
  const category = first(input.category);
  const source = first(input.source);
  const outputType = first(input.outputType);
  const status = first(input.status);
  return {
    query,
    category: includesValue(categoryValues, category) ? category : undefined,
    source: includesValue(sourceValues, source) ? source : undefined,
    outputType: includesValue(outputTypeValues, outputType) ? outputType : undefined,
    departmentOrgNodeId: first(input.departmentOrgNodeId)?.trim() || undefined,
    status: includesValue(statusValues, status) ? status : undefined,
  };
}

async function configurationScope(viewer: Viewer) {
  const [authorizedOrgNodeIds, permission] = await Promise.all([
    resolveAuthorizedOrgNodeIds(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewConfig),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewConfig),
  ]);
  const departments = permission.hasPermission
    ? await prisma.orgNode.findMany({
        where: authorizedOrgNodeIds === null ? { nodeType: "DEPARTMENT" } : { nodeType: "DEPARTMENT", id: { in: authorizedOrgNodeIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  return { canView: permission.hasPermission, departments, departmentIds: departments.map((row) => row.id) };
}

export async function getTalentRestrictionRuleList(viewer: Viewer, filters: TalentRestrictionRuleFilters) {
  const scope = await configurationScope(viewer);
  if (!scope.canView) return { ...scope, rows: [], fieldDefinitions: [] };
  const allowedDepartmentId = filters.departmentOrgNodeId && scope.departmentIds.includes(filters.departmentOrgNodeId)
    ? filters.departmentOrgNodeId
    : undefined;
  const fieldDefinitions = await prisma.talentRuleFieldDefinition.findMany({ where: { isEnabled: true }, orderBy: [{ source: "asc" }, { displayName: "asc" }] });
  const matchingFieldIds = filters.source ? fieldDefinitions.filter((field) => field.source === filters.source).map((field) => field.id) : [];
  const matchingConditionRevisionIds = filters.source
    ? (matchingFieldIds.length ? await prisma.talentRestrictionRuleCondition.findMany({ where: { fieldDefinitionId: { in: matchingFieldIds } }, select: { revisionId: true } }) : [])
    : [];
  const matchingOutputRevisionIds = filters.outputType
    ? await prisma.talentRestrictionRuleOutput.findMany({ where: { outputType: filters.outputType }, select: { revisionId: true } })
    : [];
  const [sourceRuleRows, outputRuleRows] = await Promise.all([
    filters.source && matchingConditionRevisionIds.length
      ? prisma.talentRestrictionRuleRevision.findMany({ where: { id: { in: matchingConditionRevisionIds.map((row) => row.revisionId) } }, select: { ruleId: true } })
      : Promise.resolve([]),
    filters.outputType && matchingOutputRevisionIds.length
      ? prisma.talentRestrictionRuleRevision.findMany({ where: { id: { in: matchingOutputRevisionIds.map((row) => row.revisionId) } }, select: { ruleId: true } })
      : Promise.resolve([]),
  ]);
  const sourceRuleIds = new Set(sourceRuleRows.map((row) => row.ruleId));
  const outputRuleIds = new Set(outputRuleRows.map((row) => row.ruleId));
  const filteredRuleIds = filters.source && filters.outputType
    ? [...sourceRuleIds].filter((ruleId) => outputRuleIds.has(ruleId))
    : filters.source ? [...sourceRuleIds]
      : filters.outputType ? [...outputRuleIds]
        : null;
  const rules = await prisma.talentRestrictionRule.findMany({
    where: {
      departmentOrgNodeId: { in: allowedDepartmentId ? [allowedDepartmentId] : scope.departmentIds },
      deletedAt: null,
      ...(filters.query ? { name: { contains: filters.query } } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filteredRuleIds ? { id: { in: filteredRuleIds } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });
  const ruleIds = rules.map((rule) => rule.id);
  const revisions = ruleIds.length ? await prisma.talentRestrictionRuleRevision.findMany({ where: { ruleId: { in: ruleIds } }, orderBy: [{ revisionNo: "desc" }] }) : [];
  const displayedRevisions = rules.map((rule) => revisions.find((revision) => revision.id === rule.currentRevisionId) ?? revisions.find((revision) => revision.ruleId === rule.id) ?? null).filter((revision): revision is NonNullable<typeof revision> => Boolean(revision));
  const revisionIds = displayedRevisions.map((revision) => revision.id);
  const [conditions, outputs] = await Promise.all([
    revisionIds.length ? prisma.talentRestrictionRuleCondition.findMany({ where: { revisionId: { in: revisionIds } } }) : [],
    revisionIds.length ? prisma.talentRestrictionRuleOutput.findMany({ where: { revisionId: { in: revisionIds } }, orderBy: [{ sortOrder: "asc" }] }) : [],
  ]);
  const fieldById = new Map(fieldDefinitions.map((field) => [field.id, field]));
  const rows = rules.map((rule) => {
    const revision = displayedRevisions.find((item) => item.ruleId === rule.id) ?? null;
    const condition = revision ? conditions.find((item) => item.revisionId === revision.id) ?? null : null;
    return {
      rule,
      revision,
      condition,
      field: condition ? fieldById.get(condition.fieldDefinitionId) ?? null : null,
      outputs: revision ? outputs.filter((item) => item.revisionId === revision.id) : [],
    };
  }).filter((row) => (!filters.source || row.field?.source === filters.source)
    && (!filters.outputType || row.outputs.some((output) => output.outputType === filters.outputType)));
  return {
    ...scope,
    fieldDefinitions,
    rows,
  };
}

export async function getTalentRestrictionRuleDetail(viewer: Viewer, ruleId: string) {
  const scope = await configurationScope(viewer);
  if (!scope.canView) return { ...scope, detail: null };
  const rule = await prisma.talentRestrictionRule.findFirst({ where: { id: ruleId, departmentOrgNodeId: { in: scope.departmentIds }, deletedAt: null } });
  if (!rule) return { ...scope, detail: null };
  const revisions = await prisma.talentRestrictionRuleRevision.findMany({ where: { ruleId }, orderBy: [{ revisionNo: "desc" }] });
  const revisionIds = revisions.map((revision) => revision.id);
  const creatorIds = [...new Set([rule.createdById, ...revisions.flatMap((revision) => [revision.createdById, revision.publishedById].filter((id): id is string => Boolean(id)))])];
  const [conditions, outputs, fields, creators] = await Promise.all([
    prisma.talentRestrictionRuleCondition.findMany({ where: { revisionId: { in: revisionIds } } }),
    prisma.talentRestrictionRuleOutput.findMany({ where: { revisionId: { in: revisionIds } }, orderBy: [{ revisionId: "asc" }, { sortOrder: "asc" }] }),
    prisma.talentRuleFieldDefinition.findMany(),
    prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }),
  ]);
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const userById = new Map(creators.map((user) => [user.id, user.name]));
  const revisionDetails = revisions.map((revision) => {
    const condition = conditions.find((item) => item.revisionId === revision.id) ?? null;
    return {
      revision,
      condition,
      field: condition ? fieldById.get(condition.fieldDefinitionId) ?? null : null,
      outputs: outputs.filter((output) => output.revisionId === revision.id),
      createdByName: userById.get(revision.createdById) ?? "历史用户",
      publishedByName: revision.publishedById ? userById.get(revision.publishedById) ?? "历史用户" : null,
    };
  });
  return {
    ...scope,
    detail: {
      rule,
      department: scope.departments.find((department) => department.id === rule.departmentOrgNodeId) ?? null,
      createdByName: userById.get(rule.createdById) ?? "历史用户",
      currentRevision: revisionDetails.find((item) => item.revision.id === rule.currentRevisionId) ?? revisionDetails[0] ?? null,
      revisions: revisionDetails,
    },
  };
}

export const restrictionRevisionStatuses: readonly TalentRestrictionRevisionStatus[] = ["DRAFT", "SCHEDULED", "ACTIVE", "RETIRED", "WITHDRAWN"];
