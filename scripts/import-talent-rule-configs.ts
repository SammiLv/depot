import { prisma } from "../src/server/db/prisma";
import fs from "fs";
import path from "path";

const DEFAULT_INPUT_FILE = "/Users/sammilv/Desktop/百度云盘/MacbookPro/AIStudy/ClaudeCode工作区/depot-coordination/depot-KPI/requirements/handoff/talent/talent-rule-configs.json";
const SYSTEM_USER_ID = "system-import";

// ==================== Types matching export-talent-rule-configs.ts output ====================
interface TalentReviewDimensionExport {
  code: string;
  name: string;
  category: string;
  weight: number;
  maxScore: number;
  sortOrder: number;
  isRequired: boolean;
}

interface TalentRatingOptionExport {
  code: string;
  label: string;
  numericScore: number;
  sortOrder: number;
}

interface TalentGradeThresholdExport {
  gradeCode: string;
  label: string;
  minScore: number;
  maxScore: number;
  sortOrder: number;
}

interface TalentNineBoxRuleExport {
  code: string;
  label: string;
  potentialMin: number;
  potentialMax: number;
  performanceMin: number;
  performanceMax: number;
  colorToken: string;
  sortOrder: number;
}

interface TalentReviewTemplateExport {
  code: string;
  name: string;
  departmentName: string;
  version: number;
  status: string;
  description: string | null;
  dimensions: TalentReviewDimensionExport[];
  gradeThresholds: TalentGradeThresholdExport[];
  ratingOptions: TalentRatingOptionExport[];
  nineBoxRules: TalentNineBoxRuleExport[];
}

interface CareerTrackExport {
  code: string;
  name: string;
  departmentName: string;
  description: string | null;
  sortOrder: number;
}

interface JobFamilyExport {
  code: string;
  name: string;
  careerTrackCode: string;
  departmentName: string;
  description: string | null;
  sortOrder: number;
}

interface JobRoleExport {
  code: string;
  name: string;
  jobFamilyCode: string;
  careerTrackCode: string;
  departmentName: string;
  description: string | null;
  sortOrder: number;
}

interface JobLevelGroupExport {
  code: string;
  name: string;
  rankOrder: number;
  description: string | null;
}

interface JobLevelExport {
  code: string;
  name: string;
  jobLevelGroupCode: string;
  stepOrder: number;
  displayOrder: number;
}

interface CompetencyItemExport {
  code: string;
  name: string;
  category: string;
  description: string | null;
  measurementGuide: string | null;
}

interface CompetencyPackageItemExport {
  competencyItemCode: string;
  weight: number;
  sortOrder: number;
}

interface CompetencyPackageExport {
  code: string;
  name: string;
  version: number;
  status: string;
  description: string | null;
  items: CompetencyPackageItemExport[];
}

interface JobLevelRequirementExport {
  competencyItemCode: string;
  requiredLevel: number;
  weight: number;
  isMandatory: boolean;
  evidenceRequirement: string | null;
  sortOrder: number;
}

interface CompetencyModelVersionExport {
  code: string;
  name: string;
  version: number;
  status: string;
  description: string | null;
  jobRoleCode: string;
  jobFamilyCode: string;
  careerTrackCode: string;
  departmentName: string;
  targetJobLevelCode: string;
  targetJobLevelGroupCode: string;
  jobLevelRequirements: JobLevelRequirementExport[];
}

interface SalaryCapConfigExport {
  departmentName: string;
  jobLevelGroupCode: string;
  jobLevelCode: string | null;
  maxSalary: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  version: number;
  versionStatus: string;
}

interface BusinessPassingStandardExport {
  scopeType: string;
  scopeName: string;
  scoringType: string;
  passingNumericScore: number | null;
  requiredGradeCode: string | null;
}

interface BusinessRuleSubjectExport {
  code: string;
  name: string;
  scoringType: string;
  sortOrder: number;
  passingStandards: BusinessPassingStandardExport[];
}

interface BusinessAssessmentRuleExport {
  scopeKey: string;
  name: string;
  departmentName: string | null;
  year: number | null;
  quarter: number | null;
  version: number;
  status: string;
  totalKpiScore: number;
  allocationMode: string;
  initialPassPercent: number;
  retestPassPercent: number;
  finalFailPercent: number;
  defaultScoringType: string;
  passingNumericScore: number;
  requiredGradeCode: string;
  subjects: BusinessRuleSubjectExport[];
}

interface WorkIncidentRuleVersionExport {
  departmentName: string;
  name: string;
  version: number;
  status: string;
  policyVersion: string;
  matrixJson: string;
  description: string | null;
}

interface KpiRatingBandExport {
  name: string;
  minScore: number;
  maxScore: number | null;
  isUnbounded: boolean;
  description: string | null;
  sortOrder: number;
}

interface KpiRatingRuleVersionExport {
  departmentName: string;
  name: string;
  version: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  quarterlyKpiTotalScore: number | null;
  bands: KpiRatingBandExport[];
}

interface TalentRestrictionConditionExport {
  fieldDefinitionCode: string;
  operator: string;
  comparisonValueJson: string;
}

interface TalentRestrictionOutputExport {
  outputType: string;
  handlingCode: string;
  numericValue: number | null;
  durationValue: number | null;
  durationUnit: string | null;
  effectPeriodCode: string | null;
  parametersJson: string;
  description: string | null;
  sortOrder: number;
}

interface TalentRestrictionRevisionExport {
  revisionNo: number;
  status: string;
  policyBasis: string | null;
  description: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  priority: number;
  revisionNote: string | null;
  conditions: TalentRestrictionConditionExport[];
  outputs: TalentRestrictionOutputExport[];
}

interface TalentRestrictionRuleExport {
  code: string;
  name: string;
  category: string;
  departmentName: string;
  status: string;
  activeRevision: TalentRestrictionRevisionExport | null;
}

interface TalentRuleFieldDefinitionExport {
  code: string;
  displayName: string;
  source: string;
  sourceFieldPath: string;
  dataType: string;
  enumValuesJson: string;
  operatorsJson: string;
  ownerModule: string;
  isEnabled: boolean;
  isSystem: boolean;
  description: string | null;
}

interface ExportPayload {
  exportedAt: string;
  summary: Record<string, number>;
  modules: {
    talentReviewModel: TalentReviewTemplateExport[];
    careerTrack: {
      careerTracks: CareerTrackExport[];
      jobFamilies: JobFamilyExport[];
      jobRoles: JobRoleExport[];
      jobLevelGroups: JobLevelGroupExport[];
      jobLevels: JobLevelExport[];
    };
    competencyModel: {
      competencyItems: CompetencyItemExport[];
      competencyPackages: CompetencyPackageExport[];
      competencyModelVersions: CompetencyModelVersionExport[];
    };
    salaryCap: SalaryCapConfigExport[];
    businessAssessment: BusinessAssessmentRuleExport[];
    workIncident: WorkIncidentRuleVersionExport[];
    kpiRating: KpiRatingRuleVersionExport[];
    talentRestriction: {
      rules: TalentRestrictionRuleExport[];
      fieldDefinitions: TalentRuleFieldDefinitionExport[];
    };
  };
}

// ==================== Helpers ====================
function loadPayload(filePath: string): ExportPayload {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ExportPayload;
}

async function loadLookupMaps() {
  const [departments, allOrgNodes, users, jobLevelGroups, jobLevels, careerTracks, jobFamilies, jobRoles] =
    await Promise.all([
      prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true, name: true } }),
      prisma.orgNode.findMany({ select: { id: true, name: true, nodeType: true } }),
      prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } }),
      prisma.jobLevelGroup.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
      prisma.jobLevel.findMany({ where: { deletedAt: null }, select: { id: true, code: true, jobLevelGroupId: true } }),
      prisma.careerTrack.findMany({ where: { deletedAt: null }, select: { id: true, code: true, departmentOrgNodeId: true } }),
      prisma.jobFamily.findMany({ where: { deletedAt: null }, select: { id: true, code: true, careerTrackId: true } }),
      prisma.jobRole.findMany({ where: { deletedAt: null }, select: { id: true, code: true, jobFamilyId: true } }),
    ]);

  const deptByName = new Map<string, string>();
  for (const d of departments) {
    if (!deptByName.has(d.name)) deptByName.set(d.name, d.id);
  }

  const orgNodeByName = new Map<string, (typeof allOrgNodes)[number]>();
  for (const n of allOrgNodes) {
    if (!orgNodeByName.has(n.name)) orgNodeByName.set(n.name, n);
  }

  const userByName = new Map<string, string>();
  for (const u of users) {
    if (!userByName.has(u.name)) userByName.set(u.name, u.id);
  }

  const jobLevelGroupByCode = new Map(jobLevelGroups.map((g) => [g.code, g.id]));

  const jobLevelByCodeAndGroup = new Map<string, string>();
  for (const l of jobLevels) {
    jobLevelByCodeAndGroup.set(`${l.jobLevelGroupId}|${l.code}`, l.id);
  }

  const careerTrackByDeptAndCode = new Map<string, string>();
  for (const t of careerTracks) {
    careerTrackByDeptAndCode.set(`${t.departmentOrgNodeId}|${t.code}`, t.id);
  }

  const jobFamilyByTrackAndCode = new Map<string, string>();
  for (const f of jobFamilies) {
    jobFamilyByTrackAndCode.set(`${f.careerTrackId}|${f.code}`, f.id);
  }

  const jobRoleByFamilyAndCode = new Map<string, string>();
  for (const r of jobRoles) {
    jobRoleByFamilyAndCode.set(`${r.jobFamilyId}|${r.code}`, r.id);
  }

  return {
    deptByName,
    orgNodeByName,
    userByName,
    jobLevelGroupByCode,
    jobLevelByCodeAndGroup,
    careerTrackByDeptAndCode,
    jobFamilyByTrackAndCode,
    jobRoleByFamilyAndCode,
  };
}

type Maps = Awaited<ReturnType<typeof loadLookupMaps>>;

function resolveDepartmentId(maps: Maps, name: string, context: string): string | null {
  const id = maps.deptByName.get(name);
  if (!id) {
    console.warn(`[${context}] 未找到部门: ${name}`);
  }
  return id ?? null;
}

function resolveOrgNodeIdByName(maps: Maps, name: string, context: string): string | null {
  const node = maps.orgNodeByName.get(name);
  if (!node) {
    console.warn(`[${context}] 未找到组织节点: ${name}`);
    return null;
  }
  return node.id;
}

function resolveUserIdByName(maps: Maps, name: string, context: string): string | null {
  const id = maps.userByName.get(name);
  if (!id) {
    console.warn(`[${context}] 未找到用户: ${name}`);
  }
  return id ?? null;
}

function resolveJobLevelGroupId(maps: Maps, code: string, context: string): string | null {
  const id = maps.jobLevelGroupByCode.get(code);
  if (!id) {
    console.warn(`[${context}] 未找到职级组: ${code}`);
  }
  return id ?? null;
}

function resolveJobLevelId(maps: Maps, code: string | null, groupCode: string, context: string): string | null {
  if (!code) return null;
  const groupId = resolveJobLevelGroupId(maps, groupCode, context);
  if (!groupId) return null;
  const id = maps.jobLevelByCodeAndGroup.get(`${groupId}|${code}`);
  if (!id) {
    console.warn(`[${context}] 未找到职级: ${code} (组: ${groupCode})`);
  }
  return id ?? null;
}

function resolveCareerTrackId(maps: Maps, deptName: string, trackCode: string, context: string): string | null {
  const deptId = resolveDepartmentId(maps, deptName, context);
  if (!deptId) return null;
  const id = maps.careerTrackByDeptAndCode.get(`${deptId}|${trackCode}`);
  if (!id) {
    console.warn(`[${context}] 未找到职业发展通道: ${trackCode} (部门: ${deptName})`);
  }
  return id ?? null;
}

function resolveJobFamilyId(
  maps: Maps,
  deptName: string,
  trackCode: string,
  familyCode: string,
  context: string
): string | null {
  const trackId = resolveCareerTrackId(maps, deptName, trackCode, context);
  if (!trackId) return null;
  const id = maps.jobFamilyByTrackAndCode.get(`${trackId}|${familyCode}`);
  if (!id) {
    console.warn(`[${context}] 未找到序列: ${familyCode} (通道: ${trackCode}, 部门: ${deptName})`);
  }
  return id ?? null;
}

function resolveJobRoleId(
  maps: Maps,
  deptName: string,
  trackCode: string,
  familyCode: string,
  roleCode: string,
  context: string
): string | null {
  const familyId = resolveJobFamilyId(maps, deptName, trackCode, familyCode, context);
  if (!familyId) return null;
  const id = maps.jobRoleByFamilyAndCode.get(`${familyId}|${roleCode}`);
  if (!id) {
    console.warn(`[${context}] 未找到岗位: ${roleCode} (序列: ${familyCode}, 通道: ${trackCode}, 部门: ${deptName})`);
  }
  return id ?? null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ==================== Import sections ====================
async function importJobLevelGroups(maps: Maps, groups: JobLevelGroupExport[]) {
  let count = 0;
  for (const g of groups) {
    await prisma.jobLevelGroup.upsert({
      where: { code: g.code },
      create: {
        code: g.code,
        name: g.name,
        rankOrder: g.rankOrder,
        description: g.description,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: g.name,
        rankOrder: g.rankOrder,
        description: g.description,
      },
    });
    count++;
  }
  console.log(`[职级组] 已导入/更新 ${count} 条`);
}

async function importJobLevels(maps: Maps, levels: JobLevelExport[]) {
  let count = 0;
  for (const l of levels) {
    const groupId = resolveJobLevelGroupId(maps, l.jobLevelGroupCode, `职级 ${l.code}`);
    if (!groupId) continue;
    await prisma.jobLevel.upsert({
      where: { jobLevelGroupId_code: { jobLevelGroupId: groupId, code: l.code } },
      create: {
        jobLevelGroupId: groupId,
        code: l.code,
        name: l.name,
        stepOrder: l.stepOrder,
        displayOrder: l.displayOrder,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: l.name,
        stepOrder: l.stepOrder,
        displayOrder: l.displayOrder,
      },
    });
    count++;
  }
  console.log(`[职级] 已导入/更新 ${count} 条`);
}

async function importCareerTracks(maps: Maps, tracks: CareerTrackExport[]) {
  let count = 0;
  for (const t of tracks) {
    const deptId = resolveDepartmentId(maps, t.departmentName, `职业发展通道 ${t.code}`);
    if (!deptId) continue;
    await prisma.careerTrack.upsert({
      where: { departmentOrgNodeId_code: { departmentOrgNodeId: deptId, code: t.code } },
      create: {
        departmentOrgNodeId: deptId,
        code: t.code,
        name: t.name,
        description: t.description,
        sortOrder: t.sortOrder,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: t.name,
        description: t.description,
        sortOrder: t.sortOrder,
      },
    });
    count++;
  }
  console.log(`[职业发展通道] 已导入/更新 ${count} 条`);
}

async function importJobFamilies(maps: Maps, families: JobFamilyExport[]) {
  let count = 0;
  for (const f of families) {
    const trackId = resolveCareerTrackId(maps, f.departmentName, f.careerTrackCode, `序列 ${f.code}`);
    if (!trackId) continue;
    await prisma.jobFamily.upsert({
      where: { careerTrackId_code: { careerTrackId: trackId, code: f.code } },
      create: {
        careerTrackId: trackId,
        code: f.code,
        name: f.name,
        description: f.description,
        sortOrder: f.sortOrder,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: f.name,
        description: f.description,
        sortOrder: f.sortOrder,
      },
    });
    count++;
  }
  console.log(`[序列] 已导入/更新 ${count} 条`);
}

async function importJobRoles(maps: Maps, roles: JobRoleExport[]) {
  let count = 0;
  for (const r of roles) {
    const familyId = resolveJobFamilyId(maps, r.departmentName, r.careerTrackCode, r.jobFamilyCode, `岗位 ${r.code}`);
    if (!familyId) continue;
    await prisma.jobRole.upsert({
      where: { jobFamilyId_code: { jobFamilyId: familyId, code: r.code } },
      create: {
        jobFamilyId: familyId,
        code: r.code,
        name: r.name,
        description: r.description,
        sortOrder: r.sortOrder,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: r.name,
        description: r.description,
        sortOrder: r.sortOrder,
      },
    });
    count++;
  }
  console.log(`[岗位] 已导入/更新 ${count} 条`);
}

async function importTalentReviewModel(maps: Maps, templates: TalentReviewTemplateExport[]) {
  let templateCount = 0;
  let dimensionCount = 0;
  let ratingOptionCount = 0;
  let thresholdCount = 0;
  let nineBoxCount = 0;

  for (const t of templates) {
    const deptId = resolveDepartmentId(maps, t.departmentName, `人才盘点模板 ${t.code}`);
    if (!deptId) continue;

    const template = await prisma.talentReviewTemplateVersion.upsert({
      where: { departmentOrgNodeId_code_version: { departmentOrgNodeId: deptId, code: t.code, version: t.version } },
      create: {
        departmentOrgNodeId: deptId,
        code: t.code,
        name: t.name,
        version: t.version,
        status: t.status as any,
        description: t.description,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: t.name,
        status: t.status as any,
        description: t.description,
      },
    });
    templateCount++;

    for (const d of t.dimensions) {
      await prisma.talentReviewDimension.upsert({
        where: { templateVersionId_code: { templateVersionId: template.id, code: d.code } },
        create: {
          templateVersionId: template.id,
          code: d.code,
          name: d.name,
          category: d.category,
          weight: d.weight,
          maxScore: d.maxScore,
          sortOrder: d.sortOrder,
          isRequired: d.isRequired,
        },
        update: {
          name: d.name,
          category: d.category,
          weight: d.weight,
          maxScore: d.maxScore,
          sortOrder: d.sortOrder,
          isRequired: d.isRequired,
        },
      });
      dimensionCount++;
    }

    const ratingOptions = t.ratingOptions ?? [];
    for (const r of ratingOptions) {
      await prisma.talentRatingOption.upsert({
        where: { templateVersionId_code: { templateVersionId: template.id, code: r.code } },
        create: {
          templateVersionId: template.id,
          code: r.code,
          label: r.label,
          numericScore: r.numericScore,
          sortOrder: r.sortOrder,
        },
        update: {
          label: r.label,
          numericScore: r.numericScore,
          sortOrder: r.sortOrder,
        },
      });
      ratingOptionCount++;
    }

    for (const g of t.gradeThresholds) {
      await prisma.talentGradeThreshold.upsert({
        where: { templateVersionId_gradeCode: { templateVersionId: template.id, gradeCode: g.gradeCode } },
        create: {
          templateVersionId: template.id,
          gradeCode: g.gradeCode,
          label: g.label,
          minScore: g.minScore,
          maxScore: g.maxScore,
          sortOrder: g.sortOrder,
        },
        update: {
          label: g.label,
          minScore: g.minScore,
          maxScore: g.maxScore,
          sortOrder: g.sortOrder,
        },
      });
      thresholdCount++;
    }

    for (const n of t.nineBoxRules) {
      await prisma.talentNineBoxRule.upsert({
        where: { templateVersionId_code: { templateVersionId: template.id, code: n.code } },
        create: {
          templateVersionId: template.id,
          code: n.code,
          label: n.label,
          potentialMin: n.potentialMin,
          potentialMax: n.potentialMax,
          performanceMin: n.performanceMin,
          performanceMax: n.performanceMax,
          colorToken: n.colorToken,
          sortOrder: n.sortOrder,
        },
        update: {
          label: n.label,
          potentialMin: n.potentialMin,
          potentialMax: n.potentialMax,
          performanceMin: n.performanceMin,
          performanceMax: n.performanceMax,
          colorToken: n.colorToken,
          sortOrder: n.sortOrder,
        },
      });
      nineBoxCount++;
    }
  }

  console.log(`[人才盘点模板] ${templateCount} 模板, ${dimensionCount} 维度, ${ratingOptionCount} 评分档, ${thresholdCount} 等级阈值, ${nineBoxCount} 九宫格规则`);
}

async function importKpiRating(maps: Maps, versions: KpiRatingRuleVersionExport[]) {
  let versionCount = 0;
  let bandCount = 0;

  for (const v of versions) {
    const deptId = resolveDepartmentId(maps, v.departmentName, `KPI绩效等级规则 ${v.name}`);
    if (!deptId) continue;

    const ruleVersion = await prisma.kpiRatingRuleVersion.upsert({
      where: { departmentOrgNodeId_name_version: { departmentOrgNodeId: deptId, name: v.name, version: v.version } },
      create: {
        departmentOrgNodeId: deptId,
        name: v.name,
        version: v.version,
        status: v.status as any,
        effectiveFrom: parseDate(v.effectiveFrom),
        effectiveTo: parseDate(v.effectiveTo),
        quarterlyKpiTotalScore: v.quarterlyKpiTotalScore,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        status: v.status as any,
        effectiveFrom: parseDate(v.effectiveFrom),
        effectiveTo: parseDate(v.effectiveTo),
        quarterlyKpiTotalScore: v.quarterlyKpiTotalScore,
      },
    });
    versionCount++;

    for (const b of v.bands) {
      await prisma.kpiRatingBand.upsert({
        where: { ruleVersionId_name: { ruleVersionId: ruleVersion.id, name: b.name } },
        create: {
          ruleVersionId: ruleVersion.id,
          name: b.name,
          minScore: b.minScore,
          maxScore: b.maxScore,
          isUnbounded: b.isUnbounded,
          description: b.description,
          sortOrder: b.sortOrder,
        },
        update: {
          minScore: b.minScore,
          maxScore: b.maxScore,
          isUnbounded: b.isUnbounded,
          description: b.description,
          sortOrder: b.sortOrder,
        },
      });
      bandCount++;
    }
  }

  console.log(`[KPI绩效等级规则] ${versionCount} 版本, ${bandCount} 等级段`);
}

async function importWorkIncident(maps: Maps, versions: WorkIncidentRuleVersionExport[]) {
  let count = 0;
  for (const v of versions) {
    const deptId = resolveDepartmentId(maps, v.departmentName, `工作事故规则 ${v.name}`);
    if (!deptId) continue;
    await prisma.workIncidentRuleVersion.upsert({
      where: { departmentOrgNodeId_name_version: { departmentOrgNodeId: deptId, name: v.name, version: v.version } },
      create: {
        departmentOrgNodeId: deptId,
        name: v.name,
        version: v.version,
        status: v.status as any,
        policyVersion: v.policyVersion,
        matrixJson: v.matrixJson,
        description: v.description,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        status: v.status as any,
        policyVersion: v.policyVersion,
        matrixJson: v.matrixJson,
        description: v.description,
      },
    });
    count++;
  }
  console.log(`[工作事故规则] 已导入/更新 ${count} 条`);
}

async function importBusinessAssessment(maps: Maps, rules: BusinessAssessmentRuleExport[]) {
  let ruleCount = 0;
  let subjectCount = 0;
  let standardCount = 0;

  for (const r of rules) {
    const deptId = r.departmentName ? resolveDepartmentId(maps, r.departmentName, `业务考核规则 ${r.scopeKey}`) : null;

    const rule = await prisma.businessAssessmentRule.upsert({
      where: { scopeKey: r.scopeKey },
      create: {
        scopeKey: r.scopeKey,
        name: r.name,
        departmentOrgNodeId: deptId,
        year: r.year,
        quarter: r.quarter,
        version: r.version,
        status: r.status as any,
        totalKpiScore: r.totalKpiScore,
        allocationMode: r.allocationMode,
        initialPassPercent: r.initialPassPercent,
        retestPassPercent: r.retestPassPercent,
        finalFailPercent: r.finalFailPercent,
        defaultScoringType: r.defaultScoringType as any,
        passingNumericScore: r.passingNumericScore,
        requiredGradeCode: r.requiredGradeCode,
      },
      update: {
        name: r.name,
        departmentOrgNodeId: deptId,
        year: r.year,
        quarter: r.quarter,
        version: r.version,
        status: r.status as any,
        totalKpiScore: r.totalKpiScore,
        allocationMode: r.allocationMode,
        initialPassPercent: r.initialPassPercent,
        retestPassPercent: r.retestPassPercent,
        finalFailPercent: r.finalFailPercent,
        defaultScoringType: r.defaultScoringType as any,
        passingNumericScore: r.passingNumericScore,
        requiredGradeCode: r.requiredGradeCode,
      },
    });
    ruleCount++;

    for (const s of r.subjects) {
      const subject = await prisma.businessAssessmentRuleSubject.upsert({
        where: { ruleId_code: { ruleId: rule.id, code: s.code } },
        create: {
          ruleId: rule.id,
          code: s.code,
          name: s.name,
          scoringType: s.scoringType as any,
          sortOrder: s.sortOrder,
        },
        update: {
          name: s.name,
          scoringType: s.scoringType as any,
          sortOrder: s.sortOrder,
        },
      });
      subjectCount++;

      for (const p of s.passingStandards) {
        let scopeId: string | null = null;
        if (p.scopeType === "ORG_NODE") {
          scopeId = resolveOrgNodeIdByName(maps, p.scopeName, `考核达标线 ${s.name}`);
        } else if (p.scopeType === "USER") {
          scopeId = resolveUserIdByName(maps, p.scopeName, `考核达标线 ${s.name}`);
        } else {
          scopeId = p.scopeName;
        }
        if (!scopeId) continue;

        await prisma.businessAssessmentPassingStandard.upsert({
          where: {
            ruleSubjectId_scopeType_scopeId: {
              ruleSubjectId: subject.id,
              scopeType: p.scopeType as any,
              scopeId,
            },
          },
          create: {
            ruleSubjectId: subject.id,
            scopeType: p.scopeType as any,
            scopeId,
            scoringType: p.scoringType as any,
            passingNumericScore: p.passingNumericScore,
            requiredGradeCode: p.requiredGradeCode,
          },
          update: {
            scoringType: p.scoringType as any,
            passingNumericScore: p.passingNumericScore,
            requiredGradeCode: p.requiredGradeCode,
          },
        });
        standardCount++;
      }
    }
  }

  console.log(`[业务考核规则] ${ruleCount} 规则, ${subjectCount} 科目, ${standardCount} 达标线`);
}

async function importSalaryCap(maps: Maps, configs: SalaryCapConfigExport[]) {
  let count = 0;
  for (const c of configs) {
    const deptId = resolveDepartmentId(maps, c.departmentName, `薪资上限`);
    if (!deptId) continue;
    const groupId = resolveJobLevelGroupId(maps, c.jobLevelGroupCode, `薪资上限`);
    if (!groupId) continue;
    const levelId = c.jobLevelCode
      ? resolveJobLevelId(maps, c.jobLevelCode, c.jobLevelGroupCode, `薪资上限`)
      : null;

    // Prisma upsert does not allow null in the where clause for a composite unique index,
    // so we use findFirst + create/update.
    const existing = await prisma.salaryCapConfig.findFirst({
      where: {
        departmentOrgNodeId: deptId,
        jobLevelGroupId: groupId,
        jobLevelId: levelId,
        version: c.version,
      },
      select: { id: true },
    });

    const data = {
      departmentOrgNodeId: deptId,
      jobLevelGroupId: groupId,
      jobLevelId: levelId,
      maxSalary: c.maxSalary,
      currency: c.currency,
      effectiveFrom: parseDate(c.effectiveFrom)!,
      effectiveTo: parseDate(c.effectiveTo),
      version: c.version,
      versionStatus: c.versionStatus as any,
    };

    if (existing) {
      await prisma.salaryCapConfig.update({ where: { id: existing.id }, data });
    } else {
      await prisma.salaryCapConfig.create({ data: { ...data, createdById: SYSTEM_USER_ID } });
    }
    count++;
  }
  console.log(`[薪资上限] 已导入/更新 ${count} 条`);
}

async function importCompetencyItems(items: CompetencyItemExport[]) {
  let count = 0;
  for (const item of items) {
    await prisma.competencyItem.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        name: item.name,
        category: item.category,
        description: item.description,
        measurementGuide: item.measurementGuide,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: item.name,
        category: item.category,
        description: item.description,
        measurementGuide: item.measurementGuide,
      },
    });
    count++;
  }
  console.log(`[能力项] 已导入/更新 ${count} 条`);
}

async function importCompetencyPackages(maps: Maps, packages: CompetencyPackageExport[]) {
  // Re-load competency items after import to map codes to ids in the current DB.
  const items = await prisma.competencyItem.findMany({ where: { deletedAt: null }, select: { id: true, code: true } });
  const itemByCode = new Map(items.map((i) => [i.code, i.id]));

  let packageCount = 0;
  let itemCount = 0;

  for (const p of packages) {
    const pkg = await prisma.competencyPackage.upsert({
      where: { code_version: { code: p.code, version: p.version } },
      create: {
        code: p.code,
        name: p.name,
        version: p.version,
        status: p.status as any,
        description: p.description,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: p.name,
        status: p.status as any,
        description: p.description,
      },
    });
    packageCount++;

    for (const i of p.items) {
      const itemId = itemByCode.get(i.competencyItemCode);
      if (!itemId) {
        console.warn(`[能力包 ${p.code}] 未找到能力项: ${i.competencyItemCode}`);
        continue;
      }
      await prisma.competencyPackageItem.upsert({
        where: { packageId_competencyItemId: { packageId: pkg.id, competencyItemId: itemId } },
        create: {
          packageId: pkg.id,
          competencyItemId: itemId,
          weight: i.weight,
          sortOrder: i.sortOrder,
        },
        update: {
          weight: i.weight,
          sortOrder: i.sortOrder,
        },
      });
      itemCount++;
    }
  }

  console.log(`[能力包] ${packageCount} 包, ${itemCount} 包内能力项`);
}

async function importCompetencyModelVersions(maps: Maps, versions: CompetencyModelVersionExport[]) {
  const items = await prisma.competencyItem.findMany({ where: { deletedAt: null }, select: { id: true, code: true } });
  const itemByCode = new Map(items.map((i) => [i.code, i.id]));

  let versionCount = 0;
  let requirementCount = 0;

  for (const m of versions) {
    const roleId = resolveJobRoleId(
      maps,
      m.departmentName,
      m.careerTrackCode,
      m.jobFamilyCode,
      m.jobRoleCode,
      `能力模型 ${m.code}`
    );
    if (!roleId) continue;
    const targetLevelId = resolveJobLevelId(maps, m.targetJobLevelCode, m.targetJobLevelGroupCode, `能力模型 ${m.code}`);
    if (!targetLevelId) continue;

    const model = await prisma.competencyModelVersion.upsert({
      where: {
        jobRoleId_targetJobLevelId_version: {
          jobRoleId: roleId,
          targetJobLevelId: targetLevelId,
          version: m.version,
        },
      },
      create: {
        code: m.code,
        name: m.name,
        jobRoleId: roleId,
        targetJobLevelId: targetLevelId,
        version: m.version,
        status: m.status as any,
        description: m.description,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: m.name,
        status: m.status as any,
        description: m.description,
      },
    });
    versionCount++;

    for (const r of m.jobLevelRequirements) {
      const itemId = itemByCode.get(r.competencyItemCode);
      if (!itemId) {
        console.warn(`[能力模型 ${m.code}] 未找到能力项: ${r.competencyItemCode}`);
        continue;
      }
      await prisma.jobLevelRequirement.upsert({
        where: { modelVersionId_competencyItemId: { modelVersionId: model.id, competencyItemId: itemId } },
        create: {
          modelVersionId: model.id,
          competencyItemId: itemId,
          requiredLevel: r.requiredLevel,
          weight: r.weight,
          isMandatory: r.isMandatory,
          evidenceRequirement: r.evidenceRequirement,
          sortOrder: r.sortOrder,
        },
        update: {
          requiredLevel: r.requiredLevel,
          weight: r.weight,
          isMandatory: r.isMandatory,
          evidenceRequirement: r.evidenceRequirement,
          sortOrder: r.sortOrder,
        },
      });
      requirementCount++;
    }
  }

  console.log(`[能力模型] ${versionCount} 版本, ${requirementCount} 岗位要求`);
}

async function importTalentRuleFieldDefinitions(defs: TalentRuleFieldDefinitionExport[]) {
  let count = 0;
  for (const f of defs) {
    await prisma.talentRuleFieldDefinition.upsert({
      where: { code: f.code },
      create: {
        code: f.code,
        displayName: f.displayName,
        source: f.source as any,
        sourceFieldPath: f.sourceFieldPath,
        dataType: f.dataType as any,
        enumValuesJson: f.enumValuesJson,
        operatorsJson: f.operatorsJson,
        ownerModule: f.ownerModule,
        isEnabled: f.isEnabled,
        isSystem: f.isSystem,
        description: f.description,
      },
      update: {
        displayName: f.displayName,
        source: f.source as any,
        sourceFieldPath: f.sourceFieldPath,
        dataType: f.dataType as any,
        enumValuesJson: f.enumValuesJson,
        operatorsJson: f.operatorsJson,
        ownerModule: f.ownerModule,
        isEnabled: f.isEnabled,
        isSystem: f.isSystem,
        description: f.description,
      },
    });
    count++;
  }
  console.log(`[规则字段定义] 已导入/更新 ${count} 条`);
}

async function importTalentRestrictionRules(maps: Maps, rules: TalentRestrictionRuleExport[]) {
  // Re-load field definitions to map codes to ids in the current DB.
  const fieldDefs = await prisma.talentRuleFieldDefinition.findMany({
    where: { isEnabled: true },
    select: { id: true, code: true },
  });
  const fieldDefByCode = new Map(fieldDefs.map((f) => [f.code, f.id]));

  let ruleCount = 0;
  let revisionCount = 0;
  let conditionCount = 0;
  let outputCount = 0;

  for (const r of rules) {
    if (!r.activeRevision) continue;

    const deptId = resolveDepartmentId(maps, r.departmentName, `人才决策规则 ${r.code}`);
    if (!deptId) continue;

    const rule = await prisma.talentRestrictionRule.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        name: r.name,
        category: r.category as any,
        departmentOrgNodeId: deptId,
        status: r.status as any,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        name: r.name,
        category: r.category as any,
        departmentOrgNodeId: deptId,
        status: r.status as any,
      },
    });
    ruleCount++;

    const rev = r.activeRevision;
    const revision = await prisma.talentRestrictionRuleRevision.upsert({
      where: { ruleId_revisionNo: { ruleId: rule.id, revisionNo: rev.revisionNo } },
      create: {
        ruleId: rule.id,
        revisionNo: rev.revisionNo,
        status: rev.status as any,
        policyBasis: rev.policyBasis,
        description: rev.description,
        effectiveFrom: parseDate(rev.effectiveFrom)!,
        effectiveTo: parseDate(rev.effectiveTo),
        priority: rev.priority,
        revisionNote: rev.revisionNote,
        createdById: SYSTEM_USER_ID,
      },
      update: {
        status: rev.status as any,
        policyBasis: rev.policyBasis,
        description: rev.description,
        effectiveFrom: parseDate(rev.effectiveFrom)!,
        effectiveTo: parseDate(rev.effectiveTo),
        priority: rev.priority,
        revisionNote: rev.revisionNote,
      },
    });
    revisionCount++;

    // Ensure the rule points to the imported active revision.
    await prisma.talentRestrictionRule.update({
      where: { id: rule.id },
      data: { currentRevisionId: revision.id },
    });

    for (const c of rev.conditions) {
      const fieldDefId = fieldDefByCode.get(c.fieldDefinitionCode);
      if (!fieldDefId) {
        console.warn(`[规则 ${r.code}] 未找到字段定义: ${c.fieldDefinitionCode}`);
        continue;
      }
      await prisma.talentRestrictionRuleCondition.upsert({
        where: { revisionId: revision.id },
        create: {
          revisionId: revision.id,
          fieldDefinitionId: fieldDefId,
          operator: c.operator as any,
          comparisonValueJson: c.comparisonValueJson,
        },
        update: {
          fieldDefinitionId: fieldDefId,
          operator: c.operator as any,
          comparisonValueJson: c.comparisonValueJson,
        },
      });
      conditionCount++;
    }

    for (const o of rev.outputs) {
      await prisma.talentRestrictionRuleOutput.upsert({
        where: { revisionId_sortOrder: { revisionId: revision.id, sortOrder: o.sortOrder } },
        create: {
          revisionId: revision.id,
          outputType: o.outputType as any,
          handlingCode: o.handlingCode,
          numericValue: o.numericValue,
          durationValue: o.durationValue,
          durationUnit: o.durationUnit as any,
          effectPeriodCode: o.effectPeriodCode,
          parametersJson: o.parametersJson,
          description: o.description,
          sortOrder: o.sortOrder,
        },
        update: {
          outputType: o.outputType as any,
          handlingCode: o.handlingCode,
          numericValue: o.numericValue,
          durationValue: o.durationValue,
          durationUnit: o.durationUnit as any,
          effectPeriodCode: o.effectPeriodCode,
          parametersJson: o.parametersJson,
          description: o.description,
        },
      });
      outputCount++;
    }
  }

  console.log(`[人才决策规则] ${ruleCount} 规则, ${revisionCount} 版本, ${conditionCount} 条件, ${outputCount} 输出`);
}

// ==================== Main ====================
async function main() {
  const inputFile = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT_FILE;
  if (!fs.existsSync(inputFile)) {
    console.error(`输入文件不存在: ${inputFile}`);
    process.exit(1);
  }

  const payload = loadPayload(inputFile);
  console.log(`加载导出文件: ${inputFile}`);
  console.log(`导出时间: ${payload.exportedAt}`);

  const maps = await loadLookupMaps();

  // 1. 职业发展通道基础数据
  await importJobLevelGroups(maps, payload.modules.careerTrack.jobLevelGroups);
  await importJobLevels(maps, payload.modules.careerTrack.jobLevels);
  await importCareerTracks(maps, payload.modules.careerTrack.careerTracks);
  await importJobFamilies(maps, payload.modules.careerTrack.jobFamilies);
  await importJobRoles(maps, payload.modules.careerTrack.jobRoles);

  // 2. 人才盘点、绩效、事故、业务考核
  await importTalentReviewModel(maps, payload.modules.talentReviewModel);
  await importKpiRating(maps, payload.modules.kpiRating);
  await importWorkIncident(maps, payload.modules.workIncident);
  await importBusinessAssessment(maps, payload.modules.businessAssessment);

  // 3. 薪资与职业能力模型
  await importSalaryCap(maps, payload.modules.salaryCap);
  await importCompetencyItems(payload.modules.competencyModel.competencyItems);
  await importCompetencyPackages(maps, payload.modules.competencyModel.competencyPackages);
  await importCompetencyModelVersions(maps, payload.modules.competencyModel.competencyModelVersions);

  // 4. 人才决策规则
  await importTalentRuleFieldDefinitions(payload.modules.talentRestriction.fieldDefinitions);
  await importTalentRestrictionRules(maps, payload.modules.talentRestriction.rules);

  console.log("\n导入完成");
}

main()
  .catch((err) => {
    console.error("导入失败:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
