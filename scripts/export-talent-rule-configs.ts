import { prisma } from "../src/server/db/prisma";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = "/Users/sammilv/Desktop/百度云盘/MacbookPro/AIStudy/ClaudeCode工作区/depot-coordination/depot-KPI/requirements/handoff/talent";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "talent-rule-configs.json");

function pickLatestActive<T extends Record<string, unknown>>(
  records: T[],
  isActive: (r: T) => boolean,
  keyFields: (keyof T)[],
  versionField: keyof T = "version" as keyof T
): T[] {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    if (!isActive(r)) continue;
    const key = keyFields.map((f) => String(r[f])).join("\u0000");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.values()).map((group) =>
    group.sort((a, b) => Number(b[versionField]) - Number(a[versionField]))[0]
  );
}

async function main() {
  // ==================== Shared lookups ====================
  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true, name: true },
  });
  const deptById = new Map(departments.map((d) => [d.id, d.name]));

  const orgNodes = await prisma.orgNode.findMany({
    select: { id: true, name: true, nodeType: true },
  });
  const orgNodeById = new Map(orgNodes.map((n) => [n.id, n]));

  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u.name]));

  const jobLevelGroups = await prisma.jobLevelGroup.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, rankOrder: true, description: true },
  });
  const jobLevelGroupById = new Map(jobLevelGroups.map((g) => [g.id, g]));

  const jobLevels = await prisma.jobLevel.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, stepOrder: true, displayOrder: true, jobLevelGroupId: true },
  });
  const jobLevelById = new Map(jobLevels.map((l) => [l.id, l]));

  const careerTracks = await prisma.careerTrack.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, departmentOrgNodeId: true, description: true, sortOrder: true },
  });
  const careerTrackById = new Map(careerTracks.map((t) => [t.id, t]));

  const jobFamilies = await prisma.jobFamily.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, careerTrackId: true, description: true, sortOrder: true },
  });
  const jobFamilyById = new Map(jobFamilies.map((f) => [f.id, f]));

  const jobRoles = await prisma.jobRole.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, jobFamilyId: true, description: true, sortOrder: true },
  });
  const jobRoleById = new Map(jobRoles.map((r) => [r.id, r]));

  // ==================== 1. 人才盘点模型 ====================
  const allTalentReviewTemplates = await prisma.talentReviewTemplateVersion.findMany({
    where: { deletedAt: null },
    orderBy: [{ departmentOrgNodeId: "asc" }, { code: "asc" }, { version: "desc" }],
  });
  const talentReviewTemplates = pickLatestActive(
    allTalentReviewTemplates,
    (r) => r.status === "ACTIVE",
    ["departmentOrgNodeId", "code"]
  );
  const talentReviewTemplateIds = new Set(talentReviewTemplates.map((t) => t.id));

  const [talentReviewDimensions, talentGradeThresholds, talentNineBoxRules] = await Promise.all([
    prisma.talentReviewDimension.findMany({
      where: { templateVersionId: { in: Array.from(talentReviewTemplateIds) } },
      orderBy: [{ templateVersionId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.talentGradeThreshold.findMany({
      where: { templateVersionId: { in: Array.from(talentReviewTemplateIds) } },
      orderBy: [{ templateVersionId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.talentNineBoxRule.findMany({
      where: { templateVersionId: { in: Array.from(talentReviewTemplateIds) } },
      orderBy: [{ templateVersionId: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  const exportedTalentReviewTemplates = talentReviewTemplates.map((t) => ({
    code: t.code,
    name: t.name,
    departmentName: deptById.get(t.departmentOrgNodeId) ?? t.departmentOrgNodeId,
    version: t.version,
    status: t.status,
    description: t.description,
    dimensions: talentReviewDimensions
      .filter((d) => d.templateVersionId === t.id)
      .map((d) => ({
        code: d.code,
        name: d.name,
        category: d.category,
        weight: d.weight,
        maxScore: d.maxScore,
        sortOrder: d.sortOrder,
        isRequired: d.isRequired,
      })),
    gradeThresholds: talentGradeThresholds
      .filter((g) => g.templateVersionId === t.id)
      .map((g) => ({
        gradeCode: g.gradeCode,
        label: g.label,
        minScore: g.minScore,
        maxScore: g.maxScore,
        sortOrder: g.sortOrder,
      })),
    nineBoxRules: talentNineBoxRules
      .filter((n) => n.templateVersionId === t.id)
      .map((n) => ({
        code: n.code,
        label: n.label,
        potentialMin: n.potentialMin,
        potentialMax: n.potentialMax,
        performanceMin: n.performanceMin,
        performanceMax: n.performanceMax,
        colorToken: n.colorToken,
        sortOrder: n.sortOrder,
      })),
  }));

  // ==================== 2. 职业发展通道 ====================
  const exportedCareerTracks = careerTracks.map((t) => ({
    code: t.code,
    name: t.name,
    departmentName: deptById.get(t.departmentOrgNodeId) ?? t.departmentOrgNodeId,
    description: t.description,
    sortOrder: t.sortOrder,
  }));

  const exportedJobFamilies = jobFamilies.map((f) => {
    const track = careerTrackById.get(f.careerTrackId);
    return {
      code: f.code,
      name: f.name,
      careerTrackCode: track?.code ?? f.careerTrackId,
      departmentName: track ? deptById.get(track.departmentOrgNodeId) ?? track.departmentOrgNodeId : f.careerTrackId,
      description: f.description,
      sortOrder: f.sortOrder,
    };
  });

  const exportedJobRoles = jobRoles.map((r) => {
    const family = jobFamilyById.get(r.jobFamilyId);
    const track = family ? careerTrackById.get(family.careerTrackId) : undefined;
    return {
      code: r.code,
      name: r.name,
      jobFamilyCode: family?.code ?? r.jobFamilyId,
      careerTrackCode: track?.code ?? family?.careerTrackId ?? r.jobFamilyId,
      departmentName: track ? deptById.get(track.departmentOrgNodeId) ?? track.departmentOrgNodeId : r.jobFamilyId,
      description: r.description,
      sortOrder: r.sortOrder,
    };
  });

  const exportedJobLevelGroups = jobLevelGroups.map((g) => ({
    code: g.code,
    name: g.name,
    rankOrder: g.rankOrder,
    description: g.description,
  }));

  const exportedJobLevels = jobLevels.map((l) => {
    const group = jobLevelGroupById.get(l.jobLevelGroupId);
    return {
      code: l.code,
      name: l.name,
      jobLevelGroupCode: group?.code ?? l.jobLevelGroupId,
      stepOrder: l.stepOrder,
      displayOrder: l.displayOrder,
    };
  });

  // ==================== 3. 职业能力模型 ====================
  const competencyItems = await prisma.competencyItem.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
  });
  const competencyItemById = new Map(competencyItems.map((i) => [i.id, i]));

  const allCompetencyPackages = await prisma.competencyPackage.findMany({
    where: { deletedAt: null },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  const competencyPackages = pickLatestActive(
    allCompetencyPackages,
    (r) => r.status === "ACTIVE",
    ["code"]
  );
  const competencyPackageIds = new Set(competencyPackages.map((p) => p.id));

  const competencyPackageItems = await prisma.competencyPackageItem.findMany({
    where: { packageId: { in: Array.from(competencyPackageIds) } },
    orderBy: [{ packageId: "asc" }, { sortOrder: "asc" }],
  });

  const allCompetencyModelVersions = await prisma.competencyModelVersion.findMany({
    where: { deletedAt: null },
    orderBy: [{ code: "asc" }, { jobRoleId: "asc" }, { targetJobLevelId: "asc" }, { version: "desc" }],
  });
  const competencyModelVersions = pickLatestActive(
    allCompetencyModelVersions,
    (r) => r.status === "ACTIVE",
    ["code", "jobRoleId", "targetJobLevelId"]
  );
  const competencyModelVersionIds = new Set(competencyModelVersions.map((m) => m.id));

  const jobLevelRequirements = await prisma.jobLevelRequirement.findMany({
    where: { modelVersionId: { in: Array.from(competencyModelVersionIds) } },
    orderBy: [{ modelVersionId: "asc" }, { sortOrder: "asc" }],
  });

  const exportedCompetencyItems = competencyItems.map((item) => ({
    code: item.code,
    name: item.name,
    category: item.category,
    description: item.description,
    measurementGuide: item.measurementGuide,
  }));

  const exportedCompetencyPackages = competencyPackages.map((p) => ({
    code: p.code,
    name: p.name,
    version: p.version,
    status: p.status,
    description: p.description,
    items: competencyPackageItems
      .filter((i) => i.packageId === p.id)
      .map((i) => ({
        competencyItemCode: competencyItemById.get(i.competencyItemId)?.code ?? i.competencyItemId,
        weight: i.weight,
        sortOrder: i.sortOrder,
      })),
  }));

  const exportedCompetencyModelVersions = competencyModelVersions.map((m) => {
    const role = jobRoleById.get(m.jobRoleId);
    const family = role ? jobFamilyById.get(role.jobFamilyId) : undefined;
    const track = family ? careerTrackById.get(family.careerTrackId) : undefined;
    const targetLevel = jobLevelById.get(m.targetJobLevelId);
    const targetGroup = targetLevel ? jobLevelGroupById.get(targetLevel.jobLevelGroupId) : undefined;
    return {
      code: m.code,
      name: m.name,
      version: m.version,
      status: m.status,
      description: m.description,
      jobRoleCode: role?.code ?? m.jobRoleId,
      jobFamilyCode: family?.code ?? role?.jobFamilyId ?? m.jobRoleId,
      careerTrackCode: track?.code ?? family?.careerTrackId ?? m.jobRoleId,
      departmentName: track ? deptById.get(track.departmentOrgNodeId) ?? track.departmentOrgNodeId : m.jobRoleId,
      targetJobLevelCode: targetLevel?.code ?? m.targetJobLevelId,
      targetJobLevelGroupCode: targetGroup?.code ?? targetLevel?.jobLevelGroupId ?? m.targetJobLevelId,
      jobLevelRequirements: jobLevelRequirements
        .filter((r) => r.modelVersionId === m.id)
        .map((r) => ({
          competencyItemCode: competencyItemById.get(r.competencyItemId)?.code ?? r.competencyItemId,
          requiredLevel: r.requiredLevel,
          weight: r.weight,
          isMandatory: r.isMandatory,
          evidenceRequirement: r.evidenceRequirement,
          sortOrder: r.sortOrder,
        })),
    };
  });

  // ==================== 4. 薪资与职级上限 ====================
  const allSalaryCapConfigs = await prisma.salaryCapConfig.findMany({
    where: { deletedAt: null },
    orderBy: [
      { departmentOrgNodeId: "asc" },
      { jobLevelGroupId: "asc" },
      { jobLevelId: "asc" },
      { version: "desc" },
    ],
  });
  const salaryCapConfigs = pickLatestActive(
    allSalaryCapConfigs,
    (r) => r.versionStatus === "ACTIVE",
    ["departmentOrgNodeId", "jobLevelGroupId", "jobLevelId"]
  );

  const exportedSalaryCapConfigs = salaryCapConfigs.map((c) => {
    const group = jobLevelGroupById.get(c.jobLevelGroupId);
    const level = c.jobLevelId ? jobLevelById.get(c.jobLevelId) : undefined;
    return {
      departmentName: deptById.get(c.departmentOrgNodeId) ?? c.departmentOrgNodeId,
      jobLevelGroupCode: group?.code ?? c.jobLevelGroupId,
      jobLevelCode: level?.code ?? c.jobLevelId ?? null,
      maxSalary: c.maxSalary,
      currency: c.currency,
      effectiveFrom: c.effectiveFrom.toISOString(),
      effectiveTo: c.effectiveTo?.toISOString() ?? null,
      version: c.version,
      versionStatus: c.versionStatus,
    };
  });

  // ==================== 5. 业务考核规则 ====================
  const allBusinessRules = await prisma.businessAssessmentRule.findMany({
    where: { deletedAt: null },
    orderBy: [{ scopeKey: "asc" }, { version: "desc" }],
  });
  const businessRules = pickLatestActive(
    allBusinessRules,
    (r) => r.status === "CONFIRMED",
    ["scopeKey"]
  );
  const businessRuleIds = new Set(businessRules.map((r) => r.id));

  const businessRuleSubjects = await prisma.businessAssessmentRuleSubject.findMany({
    where: { ruleId: { in: Array.from(businessRuleIds) } },
    orderBy: [{ ruleId: "asc" }, { sortOrder: "asc" }],
  });
  const businessRuleSubjectIds = new Set(businessRuleSubjects.map((s) => s.id));

  const businessPassingStandards = await prisma.businessAssessmentPassingStandard.findMany({
    where: { ruleSubjectId: { in: Array.from(businessRuleSubjectIds) } },
    orderBy: [{ ruleSubjectId: "asc" }, { scopeType: "asc" }, { scopeId: "asc" }],
  });

  const exportedBusinessRules = businessRules.map((r) => ({
    scopeKey: r.scopeKey,
    name: r.name,
    departmentName: r.departmentOrgNodeId ? (deptById.get(r.departmentOrgNodeId) ?? r.departmentOrgNodeId) : null,
    year: r.year,
    quarter: r.quarter,
    version: r.version,
    status: r.status,
    totalKpiScore: r.totalKpiScore,
    allocationMode: r.allocationMode,
    initialPassPercent: r.initialPassPercent,
    retestPassPercent: r.retestPassPercent,
    finalFailPercent: r.finalFailPercent,
    defaultScoringType: r.defaultScoringType,
    passingNumericScore: r.passingNumericScore,
    requiredGradeCode: r.requiredGradeCode,
    subjects: businessRuleSubjects
      .filter((s) => s.ruleId === r.id)
      .map((s) => ({
        code: s.code,
        name: s.name,
        scoringType: s.scoringType,
        sortOrder: s.sortOrder,
        passingStandards: businessPassingStandards
          .filter((p) => p.ruleSubjectId === s.id)
          .map((p) => {
            let scopeName: string | null = p.scopeId;
            if (p.scopeType === "ORG_NODE") {
              scopeName = orgNodeById.get(p.scopeId)?.name ?? p.scopeId;
            } else if (p.scopeType === "USER") {
              scopeName = userById.get(p.scopeId) ?? p.scopeId;
            }
            return {
              scopeType: p.scopeType,
              scopeName,
              scoringType: p.scoringType,
              passingNumericScore: p.passingNumericScore,
              requiredGradeCode: p.requiredGradeCode,
            };
          }),
      })),
  }));

  // ==================== 6. 工作事故等级配置 ====================
  const allIncidentRuleVersions = await prisma.workIncidentRuleVersion.findMany({
    where: { deletedAt: null },
    orderBy: [{ departmentOrgNodeId: "asc" }, { name: "asc" }, { version: "desc" }],
  });
  const incidentRuleVersions = pickLatestActive(
    allIncidentRuleVersions,
    (r) => r.status === "ACTIVE",
    ["departmentOrgNodeId", "name"]
  );

  const exportedIncidentRuleVersions = incidentRuleVersions.map((r) => ({
    departmentName: deptById.get(r.departmentOrgNodeId) ?? r.departmentOrgNodeId,
    name: r.name,
    version: r.version,
    status: r.status,
    policyVersion: r.policyVersion,
    matrixJson: r.matrixJson,
    description: r.description,
  }));

  // ==================== 7. 绩效等级规则 ====================
  const allKpiRuleVersions = await prisma.kpiRatingRuleVersion.findMany({
    where: { deletedAt: null },
    orderBy: [{ departmentOrgNodeId: "asc" }, { name: "asc" }, { version: "desc" }],
  });
  const kpiRuleVersions = pickLatestActive(
    allKpiRuleVersions,
    (r) => r.status === "ACTIVE",
    ["departmentOrgNodeId", "name"]
  );
  const kpiRuleVersionIds = new Set(kpiRuleVersions.map((r) => r.id));

  const kpiRatingBands = await prisma.kpiRatingBand.findMany({
    where: { ruleVersionId: { in: Array.from(kpiRuleVersionIds) } },
    orderBy: [{ ruleVersionId: "asc" }, { sortOrder: "asc" }],
  });

  const exportedKpiRuleVersions = kpiRuleVersions.map((r) => ({
    departmentName: deptById.get(r.departmentOrgNodeId) ?? r.departmentOrgNodeId,
    name: r.name,
    version: r.version,
    status: r.status,
    effectiveFrom: r.effectiveFrom?.toISOString() ?? null,
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
    quarterlyKpiTotalScore: r.quarterlyKpiTotalScore,
    bands: kpiRatingBands
      .filter((b) => b.ruleVersionId === r.id)
      .map((b) => ({
        name: b.name,
        minScore: b.minScore,
        maxScore: b.maxScore,
        isUnbounded: b.isUnbounded,
        description: b.description,
        sortOrder: b.sortOrder,
      })),
  }));

  // ==================== 8. 人才决策规则配置 ====================
  const restrictionRules = await prisma.talentRestrictionRule.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    orderBy: [{ departmentOrgNodeId: "asc" }, { code: "asc" }],
  });
  const restrictionRuleIds = new Set(restrictionRules.map((r) => r.id));

  const restrictionRevisions = await prisma.talentRestrictionRuleRevision.findMany({
    where: { ruleId: { in: Array.from(restrictionRuleIds) }, status: "ACTIVE" },
    orderBy: [{ ruleId: "asc" }, { revisionNo: "desc" }],
  });
  const activeRevisionByRuleId = new Map<string, (typeof restrictionRevisions)[number]>();
  for (const rev of restrictionRevisions) {
    if (!activeRevisionByRuleId.has(rev.ruleId)) {
      activeRevisionByRuleId.set(rev.ruleId, rev);
    }
  }
  const activeRevisionIds = new Set(Array.from(activeRevisionByRuleId.values()).map((r) => r.id));

  const [restrictionConditions, restrictionOutputs, fieldDefinitions] = await Promise.all([
    prisma.talentRestrictionRuleCondition.findMany({
      where: { revisionId: { in: Array.from(activeRevisionIds) } },
      orderBy: [{ revisionId: "asc" }],
    }),
    prisma.talentRestrictionRuleOutput.findMany({
      where: { revisionId: { in: Array.from(activeRevisionIds) } },
      orderBy: [{ revisionId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.talentRuleFieldDefinition.findMany({
      where: { isEnabled: true },
      orderBy: [{ source: "asc" }, { code: "asc" }],
    }),
  ]);

  const fieldDefById = new Map(fieldDefinitions.map((f) => [f.id, f]));

  const exportedRestrictionRules = restrictionRules.map((r) => {
    const rev = activeRevisionByRuleId.get(r.id);
    return {
      code: r.code,
      name: r.name,
      category: r.category,
      departmentName: deptById.get(r.departmentOrgNodeId) ?? r.departmentOrgNodeId,
      status: r.status,
      activeRevision: rev
        ? {
            revisionNo: rev.revisionNo,
            status: rev.status,
            policyBasis: rev.policyBasis,
            description: rev.description,
            effectiveFrom: rev.effectiveFrom.toISOString(),
            effectiveTo: rev.effectiveTo?.toISOString() ?? null,
            priority: rev.priority,
            revisionNote: rev.revisionNote,
            conditions: restrictionConditions
              .filter((c) => c.revisionId === rev.id)
              .map((c) => {
                const field = fieldDefById.get(c.fieldDefinitionId);
                return {
                  fieldDefinitionCode: field?.code ?? c.fieldDefinitionId,
                  operator: c.operator,
                  comparisonValueJson: c.comparisonValueJson,
                };
              }),
            outputs: restrictionOutputs
              .filter((o) => o.revisionId === rev.id)
              .map((o) => ({
                outputType: o.outputType,
                handlingCode: o.handlingCode,
                numericValue: o.numericValue,
                durationValue: o.durationValue,
                durationUnit: o.durationUnit,
                effectPeriodCode: o.effectPeriodCode,
                parametersJson: o.parametersJson,
                description: o.description,
                sortOrder: o.sortOrder,
              })),
          }
        : null,
    };
  });

  const exportedFieldDefinitions = fieldDefinitions.map((f) => ({
    code: f.code,
    displayName: f.displayName,
    source: f.source,
    sourceFieldPath: f.sourceFieldPath,
    dataType: f.dataType,
    enumValuesJson: f.enumValuesJson,
    operatorsJson: f.operatorsJson,
    ownerModule: f.ownerModule,
    isEnabled: f.isEnabled,
    isSystem: f.isSystem,
    description: f.description,
  }));

  // ==================== Assemble output ====================
  const output = {
    exportedAt: new Date().toISOString(),
    summary: {
      talentReviewTemplates: exportedTalentReviewTemplates.length,
      careerTracks: exportedCareerTracks.length,
      jobFamilies: exportedJobFamilies.length,
      jobRoles: exportedJobRoles.length,
      jobLevelGroups: exportedJobLevelGroups.length,
      jobLevels: exportedJobLevels.length,
      competencyItems: exportedCompetencyItems.length,
      competencyPackages: exportedCompetencyPackages.length,
      competencyModelVersions: exportedCompetencyModelVersions.length,
      salaryCapConfigs: exportedSalaryCapConfigs.length,
      businessAssessmentRules: exportedBusinessRules.length,
      workIncidentRuleVersions: exportedIncidentRuleVersions.length,
      kpiRatingRuleVersions: exportedKpiRuleVersions.length,
      talentRestrictionRules: exportedRestrictionRules.length,
      talentRuleFieldDefinitions: exportedFieldDefinitions.length,
    },
    modules: {
      talentReviewModel: exportedTalentReviewTemplates,
      careerTrack: {
        careerTracks: exportedCareerTracks,
        jobFamilies: exportedJobFamilies,
        jobRoles: exportedJobRoles,
        jobLevelGroups: exportedJobLevelGroups,
        jobLevels: exportedJobLevels,
      },
      competencyModel: {
        competencyItems: exportedCompetencyItems,
        competencyPackages: exportedCompetencyPackages,
        competencyModelVersions: exportedCompetencyModelVersions,
      },
      salaryCap: exportedSalaryCapConfigs,
      businessAssessment: exportedBusinessRules,
      workIncident: exportedIncidentRuleVersions,
      kpiRating: exportedKpiRuleVersions,
      talentRestriction: {
        rules: exportedRestrictionRules,
        fieldDefinitions: exportedFieldDefinitions,
      },
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");

  console.log(`已导出: ${OUTPUT_FILE}`);
  console.log(`字节大小: ${fs.statSync(OUTPUT_FILE).size} bytes`);
  console.log("摘要:");
  for (const [key, count] of Object.entries(output.summary)) {
    console.log(`  ${key}: ${count}`);
  }
}

main()
  .catch((err) => {
    console.error("导出失败:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
