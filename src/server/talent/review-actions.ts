"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { calculateTalentReview, resolveTalentNineBoxAxis, validateGradeThresholds } from "./review-engine";

function value(formData: FormData, key: string) { const result = String(formData.get(key) ?? "").trim(); if (!result) throw new Error(`${key} 不能为空`); return result; }
function numberValue(formData: FormData, key: string) { const result = Number(value(formData, key)); if (!Number.isFinite(result)) throw new Error(`${key} 必须是数字`); return result; }
function positiveIntegerValue(formData: FormData, key: string) { const result = numberValue(formData, key); if (!Number.isInteger(result) || result <= 0) throw new Error(`${key} 必须是正整数`); return result; }
function optionalValue(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim() || null; }
async function requireAbility(abilityKey: (typeof talentAbilityKeys)[keyof typeof talentAbilityKeys]) { const user = await requireCurrentUser(); const coverage = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, abilityKey); if (!coverage.hasPermission) throw new Error("没有相应的人才盘点权限"); return user; }
async function assertDepartment(user: Awaited<ReturnType<typeof requireCurrentUser>>, departmentOrgNodeId: string, abilityKey: (typeof talentAbilityKeys)[keyof typeof talentAbilityKeys]) { const ids = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, abilityKey); if (ids !== null && !ids.includes(departmentOrgNodeId)) throw new Error("不能操作该部门的盘点数据"); }
async function assertParticipantScope(user: Awaited<ReturnType<typeof requireCurrentUser>>, orgNodeId: string | null, abilityKey: (typeof talentAbilityKeys)[keyof typeof talentAbilityKeys]) { const ids = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, abilityKey); if (ids !== null && (!orgNodeId || !ids.includes(orgNodeId))) throw new Error("不能评价该组织范围内的员工"); }
async function audit(targetType: string, targetId: string, action: string, actorId: string, after: unknown) { await prisma.talentActionLog.create({ data: { targetType, targetId, action, actorId, afterJson: JSON.stringify(after) } }); }
async function editableTemplate(user: Awaited<ReturnType<typeof requireCurrentUser>>, id: string) { const template = await prisma.talentReviewTemplateVersion.findUnique({ where: { id } }); if (!template || template.status !== "DRAFT") throw new Error("只能修改草稿模板"); await assertDepartment(user, template.departmentOrgNodeId, talentAbilityKeys.manageConfig); return template; }
function revalidateTalentReview() { revalidatePath("/talent"); revalidatePath("/talent/config/reviews"); revalidatePath("/talent/reviews"); }

const defaultNineBoxDefinitions = [
  { code: "LOW_LOW", label: "问题员工", potentialBand: 0, performanceBand: 0, colorToken: "danger" },
  { code: "MID_LOW", label: "基本胜任", potentialBand: 0, performanceBand: 1, colorToken: "warning" },
  { code: "HIGH_LOW", label: "熟练员工", potentialBand: 0, performanceBand: 2, colorToken: "warning" },
  { code: "LOW_MID", label: "差距员工", potentialBand: 1, performanceBand: 0, colorToken: "default" },
  { code: "MID_MID", label: "中坚力量", potentialBand: 1, performanceBand: 1, colorToken: "primary" },
  { code: "HIGH_MID", label: "绩效之星", potentialBand: 1, performanceBand: 2, colorToken: "warning" },
  { code: "LOW_HIGH", label: "待发展者", potentialBand: 2, performanceBand: 0, colorToken: "warning" },
  { code: "MID_HIGH", label: "潜力之星", potentialBand: 2, performanceBand: 1, colorToken: "warning" },
  { code: "HIGH_HIGH", label: "超级明星", potentialBand: 2, performanceBand: 2, colorToken: "danger" },
] as const;
const legacyNineBoxLabels: Record<string, string> = { LOW_LOW: "观察", MID_LOW: "稳定贡献", HIGH_LOW: "明星员工", LOW_MID: "待发展", MID_MID: "中坚力量", HIGH_MID: "核心骨干", LOW_HIGH: "潜力新星", MID_HIGH: "高潜中绩", HIGH_HIGH: "高潜高绩" };

function threeScoreBands(minScore: number, maxScore: number) {
  const round = (score: number) => Number(score.toFixed(4));
  if (Number.isInteger(minScore) && Number.isInteger(maxScore)) {
    const count = maxScore - minScore + 1;
    const firstEnd = minScore + Math.ceil(count / 3) - 1;
    const secondEnd = firstEnd + Math.ceil((count - (firstEnd - minScore + 1)) / 2);
    return [[minScore, firstEnd], [firstEnd + 1, secondEnd], [secondEnd + 1, maxScore]] as const;
  }
  const firstBoundary = round(minScore + (maxScore - minScore) / 3);
  const secondBoundary = round(minScore + ((maxScore - minScore) * 2) / 3);
  return [[minScore, firstBoundary], [firstBoundary, secondBoundary], [secondBoundary, maxScore]] as const;
}

async function buildDefaultNineBoxRows(templateVersionId: string, labels: Record<string, string> = {}) {
  const [dimensions, ratings] = await Promise.all([
    prisma.talentReviewDimension.findMany({ where: { templateVersionId } }),
    prisma.talentRatingOption.findMany({ where: { templateVersionId } }),
  ]);
  if (ratings.length === 0) throw new Error("请先配置评分档，再生成九宫格");
  const ratingScores = ratings.map((item) => item.numericScore);
  const ratingMin = Math.min(...ratingScores);
  const ratingMax = Math.max(...ratingScores);
  if (ratingMax <= 0 || ratingMin < 0) throw new Error("评分档分值无效，不能生成九宫格");
  function categoryBands(category: "POTENTIAL" | "PERFORMANCE") {
    const categoryDimensions = dimensions.filter((item) => resolveTalentNineBoxAxis(item) === category);
    if (categoryDimensions.length === 0) throw new Error(category === "POTENTIAL" ? "请至少配置一个发展潜力维度" : "请至少配置一个当前绩效维度");
    const maxScore = categoryDimensions.reduce((sum, item) => sum + item.maxScore * item.weight, 0);
    const minScore = categoryDimensions.reduce((sum, item) => sum + item.maxScore * item.weight * (ratingMin / ratingMax), 0);
    return threeScoreBands(Number(minScore.toFixed(4)), Number(maxScore.toFixed(4)));
  }
  const potentialBands = categoryBands("POTENTIAL");
  const performanceBands = categoryBands("PERFORMANCE");
  return defaultNineBoxDefinitions.map((item, index) => ({
    templateVersionId,
    code: item.code,
    label: !labels[item.code]?.trim() || labels[item.code]?.trim() === legacyNineBoxLabels[item.code] ? item.label : labels[item.code].trim(),
    potentialMin: potentialBands[item.potentialBand][0],
    potentialMax: potentialBands[item.potentialBand][1],
    performanceMin: performanceBands[item.performanceBand][0],
    performanceMax: performanceBands[item.performanceBand][1],
    colorToken: item.colorToken,
    sortOrder: (index + 1) * 10,
  }));
}

async function replaceDefaultNineBoxRules(templateVersionId: string, labels: Record<string, string> = {}) {
  const rows = await buildDefaultNineBoxRows(templateVersionId, labels);
  await prisma.$transaction(async (tx) => {
    await tx.talentNineBoxRule.deleteMany({ where: { templateVersionId } });
    await tx.talentNineBoxRule.createMany({ data: rows });
  });
  return rows;
}

export async function createTalentReviewTemplate(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig); const departmentOrgNodeId = value(formData, "departmentOrgNodeId"); await assertDepartment(user, departmentOrgNodeId, talentAbilityKeys.manageConfig);
  const code = `TRM_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const row = await prisma.talentReviewTemplateVersion.create({ data: { departmentOrgNodeId, code, name: value(formData, "name"), version: 1, kpiWeight: 0.6, reviewWeight: 0.4, description: optionalValue(formData, "description"), createdById: user.id } });
  await audit("TalentReviewTemplateVersion", row.id, "CREATE", user.id, row); revalidateTalentReview();
}

export async function updateTalentReviewTemplate(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig); const id = value(formData, "id"); const before = await editableTemplate(user, id);
  const row = await prisma.talentReviewTemplateVersion.update({ where: { id }, data: { name: value(formData, "name"), description: optionalValue(formData, "description") } });
  await audit("TalentReviewTemplateVersion", id, "UPDATE_DRAFT", user.id, { before, after: row }); revalidateTalentReview();
}

export async function updateTalentAbilityCalculationWeights(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig); const id = value(formData, "id"); const before = await editableTemplate(user, id);
  const kpiWeight = numberValue(formData, "kpiWeight");
  const reviewWeight = numberValue(formData, "reviewWeight");
  if (kpiWeight < 0 || kpiWeight > 1) throw new Error("KPI 权重必须在 0 到 1 之间");
  if (reviewWeight < 0 || reviewWeight > 1) throw new Error("人才盘点权重必须在 0 到 1 之间");
  const sum = Number((kpiWeight + reviewWeight).toFixed(4));
  if (sum !== 1) throw new Error(`KPI 权重与人才盘点权重之和必须等于 1，当前为 ${sum}`);
  const row = await prisma.talentReviewTemplateVersion.update({ where: { id }, data: { kpiWeight, reviewWeight } });
  await audit("TalentReviewTemplateVersion", id, "UPDATE_WEIGHTS", user.id, { before, after: row }); revalidateTalentReview();
}

export async function cloneTalentReviewTemplateVersion(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig); const sourceId = value(formData, "sourceId"); const source = await prisma.talentReviewTemplateVersion.findFirst({ where: { id: sourceId, deletedAt: null } }); if (!source) throw new Error("源模型不存在"); await assertDepartment(user, source.departmentOrgNodeId, talentAbilityKeys.manageConfig);
  const latest = await prisma.talentReviewTemplateVersion.aggregate({ where: { departmentOrgNodeId: source.departmentOrgNodeId, code: source.code }, _max: { version: true } }); const version = (latest._max.version ?? source.version) + 1;
  const [dimensions, ratings, thresholds, boxes] = await Promise.all([prisma.talentReviewDimension.findMany({ where: { templateVersionId: sourceId } }), prisma.talentRatingOption.findMany({ where: { templateVersionId: sourceId } }), prisma.talentGradeThreshold.findMany({ where: { templateVersionId: sourceId } }), prisma.talentNineBoxRule.findMany({ where: { templateVersionId: sourceId } })]);
  const row = await prisma.$transaction(async (tx) => { const target = await tx.talentReviewTemplateVersion.create({ data: { departmentOrgNodeId: source.departmentOrgNodeId, code: source.code, name: source.name, version, kpiWeight: source.kpiWeight, reviewWeight: source.reviewWeight, description: optionalValue(formData, "description") ?? `基于 V${source.version} 复制`, createdById: user.id } }); await tx.talentReviewDimension.createMany({ data: dimensions.map(({ code, name, category, weight, maxScore, sortOrder, isRequired }) => ({ templateVersionId: target.id, code, name, category, weight, maxScore, sortOrder, isRequired })) }); await tx.talentRatingOption.createMany({ data: ratings.map(({ code, label, numericScore, sortOrder }) => ({ templateVersionId: target.id, code, label, numericScore, sortOrder })) }); await tx.talentGradeThreshold.createMany({ data: thresholds.map(({ gradeCode, label, minScore, maxScore, sortOrder }) => ({ templateVersionId: target.id, gradeCode, label, minScore, maxScore, sortOrder })) }); await tx.talentNineBoxRule.createMany({ data: boxes.map(({ code, label, potentialMin, potentialMax, performanceMin, performanceMax, colorToken, sortOrder }) => ({ templateVersionId: target.id, code, label, potentialMin, potentialMax, performanceMin, performanceMax, colorToken, sortOrder })) }); return target; });
  await audit("TalentReviewTemplateVersion", row.id, "CLONE_VERSION", user.id, { sourceId, version }); revalidateTalentReview();
}

export async function deleteTalentReviewRule(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig); const ruleType = value(formData, "ruleType"); const id = value(formData, "id");
  const rule = ruleType === "DIMENSION" ? await prisma.talentReviewDimension.findUnique({ where: { id } }) : ruleType === "RATING" ? await prisma.talentRatingOption.findUnique({ where: { id } }) : ruleType === "THRESHOLD" ? await prisma.talentGradeThreshold.findUnique({ where: { id } }) : ruleType === "NINE_BOX" ? await prisma.talentNineBoxRule.findUnique({ where: { id } }) : null;
  if (!rule) throw new Error("规则不存在"); await editableTemplate(user, rule.templateVersionId);
  if (ruleType === "DIMENSION") await prisma.talentReviewDimension.delete({ where: { id } }); else if (ruleType === "RATING") await prisma.talentRatingOption.delete({ where: { id } }); else if (ruleType === "THRESHOLD") await prisma.talentGradeThreshold.delete({ where: { id } }); else await prisma.talentNineBoxRule.delete({ where: { id } });
  await audit("TalentReviewRule", id, "DELETE_DRAFT_RULE", user.id, { ruleType }); revalidateTalentReview();
}

export async function initializeDefaultTalentReviewTemplate(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig); const templateVersionId = value(formData, "templateVersionId");
  const template = await prisma.talentReviewTemplateVersion.findUnique({ where: { id: templateVersionId } }); if (!template || template.status !== "DRAFT") throw new Error("只能初始化草稿模板"); await assertDepartment(user, template.departmentOrgNodeId, talentAbilityKeys.manageConfig);
  const exists = await prisma.talentReviewDimension.count({ where: { templateVersionId } }); if (exists) throw new Error("模板已有维度，不能重复初始化");
  await prisma.$transaction(async (tx) => {
    await tx.talentReviewDimension.createMany({ data: [
      ["LOYALTY", "忠诚度", "POTENTIAL"], ["ATTITUDE", "工作态度", "PERFORMANCE"], ["FIT", "匹配度", "POTENTIAL"],
      ["GROWTH", "成长性", "POTENTIAL"], ["CAPABILITY", "能力度", "PERFORMANCE"], ["OUTPUT", "产出度", "PERFORMANCE"],
    ].map(([code, name, category], index) => ({ templateVersionId, code, name, category, weight: 1, maxScore: 5, sortOrder: (index + 1) * 10, isRequired: true })) });
    await tx.talentRatingOption.createMany({ data: [["S", "杰出", 5], ["A", "优秀", 4], ["B", "普通", 3], ["C", "略差", 2], ["D", "淘汰", 1]].map(([code, label, numericScore], index) => ({ templateVersionId, code: String(code), label: String(label), numericScore: Number(numericScore), sortOrder: (index + 1) * 10 })) });
    await tx.talentGradeThreshold.createMany({ data: [["S", "杰出", 25, 30], ["A", "优秀", 19, 24], ["B", "普通", 13, 18], ["C", "略差", 7, 12], ["D", "淘汰", 0, 6]].map(([gradeCode, label, minScore, maxScore], index) => ({ templateVersionId, gradeCode: String(gradeCode), label: String(label), minScore: Number(minScore), maxScore: Number(maxScore), sortOrder: (index + 1) * 10 })) });
    const labels = [["LOW_LOW", "观察"], ["MID_LOW", "稳定贡献"], ["HIGH_LOW", "明星员工"], ["LOW_MID", "待发展"], ["MID_MID", "中坚力量"], ["HIGH_MID", "核心骨干"], ["LOW_HIGH", "潜力新星"], ["MID_HIGH", "高潜中绩"], ["HIGH_HIGH", "高潜高绩"]];
    await tx.talentNineBoxRule.createMany({ data: labels.map(([code, label], index) => { const potentialBand = Math.floor(index / 3); const performanceBand = index % 3; const ranges = [[2, 4], [5, 7], [8, 10]]; return { templateVersionId, code, label, potentialMin: ranges[potentialBand][0], potentialMax: ranges[potentialBand][1], performanceMin: ranges[performanceBand][0], performanceMax: ranges[performanceBand][1], colorToken: potentialBand === 2 || performanceBand === 2 ? "success" : potentialBand === 1 || performanceBand === 1 ? "primary" : "default", sortOrder: (index + 1) * 10 }; }) });
  });
  await audit("TalentReviewTemplateVersion", template.id, "INITIALIZE_DEFAULT", user.id, { templateVersionId }); revalidateTalentReview();
}

export async function addTalentReviewDimension(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const templateVersionId = value(formData, "templateVersionId");
  await editableTemplate(user, templateVersionId);
  const count = await prisma.talentReviewDimension.count({ where: { templateVersionId } });
  const row = await prisma.talentReviewDimension.create({ data: {
    templateVersionId,
    code: `DIM_${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    name: value(formData, "name"),
    category: value(formData, "category"),
    weight: 1,
    maxScore: positiveIntegerValue(formData, "maxScore"),
    sortOrder: (count + 1) * 10,
    isRequired: formData.get("isRequired") === "on",
  } });
  await audit("TalentReviewDimension", row.id, "CREATE", user.id, row);
  revalidateTalentReview();
}
export async function addTalentReviewDimensions(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const templateVersionId = value(formData, "templateVersionId");
  await editableTemplate(user, templateVersionId);
  const raw = value(formData, "dimensionsJson");
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("评价维度数据格式无效"); }
  if (!Array.isArray(input) || input.length === 0) throw new Error("请至少添加一个评价维度");
  if (input.length > 50) throw new Error("单次最多添加 50 个评价维度");
  const allowedCategories = new Set(["VALUE", "POTENTIAL", "PERFORMANCE"]);
  const rows = input.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 行数据无效`);
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    const category = String(record.category ?? "").trim();
    const maxScore = Number(record.maxScore);
    if (!name) throw new Error(`第 ${index + 1} 行维度名称不能为空`);
    if (!allowedCategories.has(category)) throw new Error(`第 ${index + 1} 行评价类别无效`);
    if (!Number.isInteger(maxScore) || maxScore <= 0) throw new Error(`第 ${index + 1} 行满分必须是正整数`);
    return { name, category, maxScore, isRequired: record.isRequired !== false };
  });
  const existingCount = await prisma.talentReviewDimension.count({ where: { templateVersionId } });
  const created = await prisma.talentReviewDimension.createMany({ data: rows.map((item, index) => ({
    templateVersionId,
    code: `DIM_${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    name: item.name,
    category: item.category,
    weight: 1,
    maxScore: item.maxScore,
    sortOrder: (existingCount + index + 1) * 10,
    isRequired: item.isRequired,
  })) });
  await audit("TalentReviewTemplateVersion", templateVersionId, "BATCH_ADD_DIMENSIONS", user.id, { count: created.count, rows });
  revalidateTalentReview();
}
export async function updateTalentReviewDimension(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const id = value(formData, "id");
  const before = await prisma.talentReviewDimension.findUnique({ where: { id } });
  if (!before) throw new Error("评价维度不存在");
  await editableTemplate(user, before.templateVersionId);
  const maxScore = positiveIntegerValue(formData, "maxScore");
  const row = await prisma.talentReviewDimension.update({ where: { id }, data: { maxScore } });
  await audit("TalentReviewDimension", id, "UPDATE_MAX_SCORE", user.id, { before, after: row });
  revalidateTalentReview();
}
export async function addTalentRatingOption(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const templateVersionId = value(formData, "templateVersionId");
  await editableTemplate(user, templateVersionId);
  const count = await prisma.talentRatingOption.count({ where: { templateVersionId } });
  const numericScore = positiveIntegerValue(formData, "numericScore");
  const row = await prisma.talentRatingOption.create({ data: { templateVersionId, code: value(formData, "code"), label: value(formData, "label"), numericScore, sortOrder: (count + 1) * 10 } });
  await audit("TalentRatingOption", row.id, "CREATE", user.id, row);
  revalidateTalentReview();
}
export async function addTalentRatingOptions(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const templateVersionId = value(formData, "templateVersionId");
  await editableTemplate(user, templateVersionId);
  let input: unknown;
  try { input = JSON.parse(value(formData, "ratingsJson")); } catch { throw new Error("评分档数据格式无效"); }
  if (!Array.isArray(input) || input.length === 0) throw new Error("请至少添加一个评分档");
  if (input.length > 20) throw new Error("单次最多添加 20 个评分档");
  const rows = input.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 行数据无效`);
    const record = item as Record<string, unknown>;
    const code = String(record.code ?? "").trim().toUpperCase();
    const label = String(record.label ?? "").trim();
    const numericScore = Number(record.numericScore);
    if (!code || !label) throw new Error(`第 ${index + 1} 行等级和名称不能为空`);
    if (!Number.isInteger(numericScore) || numericScore <= 0) throw new Error(`第 ${index + 1} 行等级分值必须是正整数`);
    return { code, label, numericScore };
  });
  if (new Set(rows.map((item) => item.code)).size !== rows.length) throw new Error("同一批次内的评分等级不能重复");
  const existingCount = await prisma.talentRatingOption.count({ where: { templateVersionId } });
  const created = await prisma.talentRatingOption.createMany({ data: rows.map((item, index) => ({ templateVersionId, ...item, sortOrder: (existingCount + index + 1) * 10 })) });
  await audit("TalentReviewTemplateVersion", templateVersionId, "BATCH_ADD_RATINGS", user.id, { count: created.count, rows });
  revalidateTalentReview();
}
export async function addTalentGradeThreshold(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const templateVersionId = value(formData, "templateVersionId");
  await editableTemplate(user, templateVersionId);
  const count = await prisma.talentGradeThreshold.count({ where: { templateVersionId } });
  const row = await prisma.talentGradeThreshold.create({ data: { templateVersionId, gradeCode: value(formData, "gradeCode"), label: value(formData, "label"), minScore: numberValue(formData, "minScore"), maxScore: numberValue(formData, "maxScore"), sortOrder: (count + 1) * 10 } });
  await audit("TalentGradeThreshold", row.id, "CREATE", user.id, row);
  revalidateTalentReview();
}
export async function addTalentGradeThresholds(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const templateVersionId = value(formData, "templateVersionId");
  await editableTemplate(user, templateVersionId);
  let input: unknown;
  try { input = JSON.parse(value(formData, "thresholdsJson")); } catch { throw new Error("等级区间数据格式无效"); }
  if (!Array.isArray(input) || input.length === 0) throw new Error("请至少添加一个等级区间");
  if (input.length > 20) throw new Error("单次最多添加 20 个等级区间");
  const rows = input.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 行数据无效`);
    const record = item as Record<string, unknown>;
    const gradeCode = String(record.gradeCode ?? "").trim().toUpperCase();
    const label = String(record.label ?? "").trim();
    const minScore = Number(record.minScore);
    const maxScore = Number(record.maxScore);
    if (!gradeCode || !label) throw new Error(`第 ${index + 1} 行等级和名称不能为空`);
    if (!Number.isFinite(minScore) || !Number.isFinite(maxScore) || minScore < 0 || minScore > maxScore) throw new Error(`第 ${index + 1} 行分数范围无效`);
    return { gradeCode, label, minScore, maxScore };
  });
  if (new Set(rows.map((item) => item.gradeCode)).size !== rows.length) throw new Error("同一批次内的等级不能重复");
  const existingCount = await prisma.talentGradeThreshold.count({ where: { templateVersionId } });
  const created = await prisma.talentGradeThreshold.createMany({ data: rows.map((item, index) => ({ templateVersionId, ...item, sortOrder: (existingCount + index + 1) * 10 })) });
  await audit("TalentReviewTemplateVersion", templateVersionId, "BATCH_ADD_THRESHOLDS", user.id, { count: created.count, rows });
  revalidateTalentReview();
}
export async function addTalentNineBoxRule(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const templateVersionId = value(formData, "templateVersionId");
  await editableTemplate(user, templateVersionId);
  const count = await prisma.talentNineBoxRule.count({ where: { templateVersionId } });
  const row = await prisma.talentNineBoxRule.create({ data: { templateVersionId, code: value(formData, "code"), label: value(formData, "label"), potentialMin: numberValue(formData, "potentialMin"), potentialMax: numberValue(formData, "potentialMax"), performanceMin: numberValue(formData, "performanceMin"), performanceMax: numberValue(formData, "performanceMax"), colorToken: value(formData, "colorToken"), sortOrder: (count + 1) * 10 } });
  await audit("TalentNineBoxRule", row.id, "CREATE", user.id, row);
  revalidateTalentReview();
}

export type TalentNineBoxActionState = { status: "idle" | "success" | "error"; message: string; requestId: string; clientRevision: number };
export async function saveDefaultTalentNineBoxRules(_previousState: TalentNineBoxActionState, formData: FormData): Promise<TalentNineBoxActionState> {
  const clientRevision = Number(formData.get("clientRevision") ?? 0);
  try {
    const user = await requireAbility(talentAbilityKeys.manageConfig);
    const templateVersionId = value(formData, "templateVersionId");
    await editableTemplate(user, templateVersionId);
    const labels = Object.fromEntries(defaultNineBoxDefinitions.map((item) => [item.code, String(formData.get(`label_${item.code}`) ?? "").trim()]));
    const rows = await replaceDefaultNineBoxRules(templateVersionId, labels);
    await audit("TalentReviewTemplateVersion", templateVersionId, "SAVE_DEFAULT_NINE_BOX", user.id, { rows });
    revalidateTalentReview();
    return { status: "success", message: "九宫格已生成并保存", requestId: randomUUID(), clientRevision };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "九宫格保存失败，请稍后重试", requestId: randomUUID(), clientRevision };
  }
}

export async function publishTalentReviewTemplate(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig); const id = value(formData, "id"); const template = await prisma.talentReviewTemplateVersion.findUnique({ where: { id } }); if (!template || template.status !== "DRAFT") throw new Error("模板不存在或不是草稿"); await assertDepartment(user, template.departmentOrgNodeId, talentAbilityKeys.manageConfig);
  const [dimensions, ratings, thresholds, existingBoxes] = await Promise.all([prisma.talentReviewDimension.findMany({ where: { templateVersionId: id } }), prisma.talentRatingOption.findMany({ where: { templateVersionId: id } }), prisma.talentGradeThreshold.findMany({ where: { templateVersionId: id } }), prisma.talentNineBoxRule.findMany({ where: { templateVersionId: id } })]);
  const missingRules = [dimensions.length === 0 ? "评价维度" : null, ratings.length === 0 ? "评分档" : null, thresholds.length === 0 ? "等级区间" : null].filter(Boolean);
  if (missingRules.length > 0) throw new Error(`发布前请先完成：${missingRules.join("、")}`);
  const weightSum = Number((template.kpiWeight + template.reviewWeight).toFixed(4));
  if (weightSum !== 1) throw new Error(`发布前请确认人才能力测算权重：KPI 权重与人才盘点权重之和必须等于 1，当前为 ${weightSum}`);
  const boxes = await replaceDefaultNineBoxRules(id, Object.fromEntries(existingBoxes.map((item) => [item.code, item.label])));
  const modelMaxScore = dimensions.reduce((sum, item) => sum + item.maxScore * item.weight, 0); validateGradeThresholds(thresholds, modelMaxScore);
  if (boxes.length !== 9) throw new Error("九宫格生成失败，请重新保存后再发布");
  const row = await prisma.$transaction(async (tx) => { await tx.talentReviewTemplateVersion.updateMany({ where: { departmentOrgNodeId: template.departmentOrgNodeId, code: template.code, status: "ACTIVE", id: { not: id } }, data: { status: "RETIRED" } }); return tx.talentReviewTemplateVersion.update({ where: { id }, data: { status: "ACTIVE", publishedAt: new Date() } }); }); await audit("TalentReviewTemplateVersion", id, "PUBLISH", user.id, row); revalidateTalentReview();
}

export type TalentPublishActionState = { status: "idle" | "success" | "error"; message: string; requestId: string };
export async function publishTalentReviewTemplateWithState(_previousState: TalentPublishActionState, formData: FormData): Promise<TalentPublishActionState> {
  try {
    await publishTalentReviewTemplate(formData);
    return { status: "success", message: "人才盘点模型已发布", requestId: randomUUID() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "发布失败，请稍后重试", requestId: randomUUID() };
  }
}

export async function deleteTalentReviewTemplate(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageConfig);
  const id = value(formData, "id");
  const template = await prisma.talentReviewTemplateVersion.findUnique({ where: { id } });
  if (!template) throw new Error("模板不存在");
  if (template.status !== "DRAFT") throw new Error("只能删除草稿模板");
  await assertDepartment(user, template.departmentOrgNodeId, talentAbilityKeys.manageConfig);
  await prisma.$transaction(async (tx) => {
    await tx.talentReviewDimension.deleteMany({ where: { templateVersionId: id } });
    await tx.talentRatingOption.deleteMany({ where: { templateVersionId: id } });
    await tx.talentGradeThreshold.deleteMany({ where: { templateVersionId: id } });
    await tx.talentNineBoxRule.deleteMany({ where: { templateVersionId: id } });
    await tx.talentReviewTemplateVersion.delete({ where: { id } });
  });
  await audit("TalentReviewTemplateVersion", id, "DELETE_DRAFT", user.id, { template });
  revalidateTalentReview();
}

export type TalentDeleteTemplateState = { status: "idle" | "success" | "error"; message: string; requestId: string };
export async function deleteTalentReviewTemplateWithState(_previousState: TalentDeleteTemplateState, formData: FormData): Promise<TalentDeleteTemplateState> {
  try {
    await deleteTalentReviewTemplate(formData);
    return { status: "success", message: "草稿模型已删除", requestId: randomUUID() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "删除失败，请稍后重试", requestId: randomUUID() };
  }
}

export async function createTalentReviewCycle(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.calibrateReview); const departmentOrgNodeId = value(formData, "departmentOrgNodeId"); await assertDepartment(user, departmentOrgNodeId, talentAbilityKeys.calibrateReview);
  const templateVersionId = value(formData, "templateVersionId"); const template = await prisma.talentReviewTemplateVersion.findFirst({ where: { id: templateVersionId, departmentOrgNodeId, status: "ACTIVE", deletedAt: null } }); if (!template) throw new Error("请选择本部门已发布的盘点模板");
  const year = numberValue(formData, "year"); const halfYear = numberValue(formData, "halfYear"); if (![1, 2].includes(halfYear)) throw new Error("盘点周期必须为上半年或下半年");
  const selectedUserIds = [...new Set(formData.getAll("participantUserIds").map((item) => String(item).trim()).filter(Boolean))];
  if (selectedUserIds.length === 0) throw new Error("请至少选择一名盘点成员");
  const orgNodeIds = await getDescendantOrgNodeIds(departmentOrgNodeId);
  const users = await prisma.user.findMany({ where: { id: { in: selectedUserIds }, orgNodeId: { in: orgNodeIds }, roleType: { in: ["TEAM_LEADER", "MEMBER"] }, isActive: true, deletedAt: null }, select: { id: true, name: true, orgNodeId: true } });
  if (users.length !== selectedUserIds.length) throw new Error("九宫格盘点不包含部门主管，主管请使用管理层评价模型");
  const conflict = await prisma.talentReviewParticipant.findFirst({ where: { userId: { in: selectedUserIds }, periodYear: year, periodHalfYear: halfYear }, select: { userId: true } });
  if (conflict) { const employeeName = users.find((item) => item.id === conflict.userId)?.name; throw new Error(`${employeeName ?? "所选员工"}已参加本期其他盘点批次，同一员工每半年只能参加一个批次`); }
  const profiles = await prisma.employeeTalentProfile.findMany({ where: { userId: { in: selectedUserIds }, deletedAt: null } }); const profileByUserId = new Map(profiles.map((row) => [row.userId, row]));
  const name = `${year}年${halfYear === 1 ? "上半年" : "下半年"}人才盘点`;
  const cycle = await prisma.$transaction(async (tx) => { const row = await tx.talentReviewCycle.create({ data: { year, halfYear, name, departmentOrgNodeId, templateVersionId, status: "IN_PROGRESS", startedAt: new Date(), createdById: user.id } }); await tx.talentReviewParticipant.createMany({ data: users.map((person) => ({ cycleId: row.id, userId: person.id, periodYear: year, periodHalfYear: halfYear, orgNodeIdSnapshot: person.orgNodeId, jobRoleIdSnapshot: profileByUserId.get(person.id)?.jobRoleId ?? null, jobLevelIdSnapshot: profileByUserId.get(person.id)?.jobLevelId ?? null, reviewerId: user.id })) }); return row; });
  await audit("TalentReviewCycle", cycle.id, "CREATE_AND_START", user.id, { ...cycle, participantCount: users.length }); revalidateTalentReview();
}

export type TalentReviewCycleActionState = { status: "idle" | "success" | "error"; message: string; requestId: string };
export async function createTalentReviewCycleWithState(_previousState: TalentReviewCycleActionState, formData: FormData): Promise<TalentReviewCycleActionState> {
  try {
    await createTalentReviewCycle(formData);
    return { status: "success", message: "盘点批次创建成功", requestId: randomUUID() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "盘点批次创建失败，请稍后重试", requestId: randomUUID() };
  }
}

export async function deleteTalentReviewCycle(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.calibrateReview);
  const cycleId = value(formData, "cycleId");
  const cycle = await prisma.talentReviewCycle.findFirst({ where: { id: cycleId, deletedAt: null } });
  if (!cycle) throw new Error("盘点批次不存在或已删除");
  await assertDepartment(user, cycle.departmentOrgNodeId, talentAbilityKeys.calibrateReview);
  if (cycle.status === "CONFIRMED") throw new Error("已确认的历史盘点批次不能删除");
  const participantIds = (await prisma.talentReviewParticipant.findMany({ where: { cycleId }, select: { id: true } })).map((item) => item.id);
  const resultCount = await prisma.talentReviewResult.count({ where: { participantId: { in: participantIds } } });
  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.talentReviewDimensionResult.deleteMany({ where: { participantId: { in: participantIds } } });
    await tx.talentReviewResult.deleteMany({ where: { participantId: { in: participantIds } } });
    await tx.talentReviewParticipant.deleteMany({ where: { cycleId } });
    await tx.talentReviewCycle.update({ where: { id: cycleId }, data: { deletedAt, archivedAt: deletedAt } });
    await tx.talentActionLog.create({ data: { targetType: "TalentReviewCycle", targetId: cycleId, action: "DELETE", actorId: user.id, beforeJson: JSON.stringify(cycle), afterJson: JSON.stringify({ deletedAt, participantCount: participantIds.length, resultCount }) } });
  });
  revalidateTalentReview();
}

export async function saveTalentReviewEvaluation(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.manageReview); const participantId = value(formData, "participantId"); const participant = await prisma.talentReviewParticipant.findUnique({ where: { id: participantId } }); if (!participant) throw new Error("盘点参与人不存在"); const cycle = await prisma.talentReviewCycle.findUnique({ where: { id: participant.cycleId } }); if (!cycle || !["IN_PROGRESS", "CALIBRATING"].includes(cycle.status)) throw new Error("当前批次不能评价"); await assertParticipantScope(user, participant.orgNodeIdSnapshot, talentAbilityKeys.manageReview);
  const [dimensions, options, thresholds, boxes] = await Promise.all([prisma.talentReviewDimension.findMany({ where: { templateVersionId: cycle.templateVersionId } }), prisma.talentRatingOption.findMany({ where: { templateVersionId: cycle.templateVersionId } }), prisma.talentGradeThreshold.findMany({ where: { templateVersionId: cycle.templateVersionId } }), prisma.talentNineBoxRule.findMany({ where: { templateVersionId: cycle.templateVersionId } })]); const optionByCode = new Map(options.map((row) => [row.code, row]));
  const ratings = dimensions.map((dimension) => { const ratingCode = value(formData, `rating_${dimension.id}`); const option = optionByCode.get(ratingCode); if (!option) throw new Error(`${dimension.name} 评分无效`); return { dimensionId: dimension.id, ratingCode, numericScore: option.numericScore }; }); const ratingMaxScore = Math.max(...options.map((item) => item.numericScore)); const calculated = calculateTalentReview(dimensions, ratings, thresholds, boxes, ratingMaxScore);
  await prisma.$transaction(async (tx) => { for (const rating of ratings) await tx.talentReviewDimensionResult.upsert({ where: { participantId_dimensionId: { participantId, dimensionId: rating.dimensionId } }, update: { ...rating, evaluatorId: user.id, evaluatedAt: new Date() }, create: { participantId, ...rating, evaluatorId: user.id } }); await tx.talentReviewResult.upsert({ where: { participantId }, update: { ...calculated, talentType: calculated.nineBoxCode ? boxes.find((row) => row.code === calculated.nineBoxCode)?.label ?? null : null, managerComment: String(formData.get("managerComment") ?? "").trim() || null, calculatedAt: new Date() }, create: { participantId, ...calculated, talentType: calculated.nineBoxCode ? boxes.find((row) => row.code === calculated.nineBoxCode)?.label ?? null : null, managerComment: String(formData.get("managerComment") ?? "").trim() || null } }); await tx.talentReviewParticipant.update({ where: { id: participantId }, data: { status: "EVALUATED", reviewerId: user.id } }); });
  await audit("TalentReviewParticipant", participantId, "EVALUATE", user.id, calculated); revalidatePath(`/talent/reviews/${cycle.id}`); revalidateTalentReview();
}

export async function calibrateTalentReviewResult(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.calibrateReview); const participantId = value(formData, "participantId");
  const participant = await prisma.talentReviewParticipant.findUnique({ where: { id: participantId } }); if (!participant) throw new Error("盘点参与人不存在");
  const cycle = await prisma.talentReviewCycle.findUnique({ where: { id: participant.cycleId } }); if (!cycle || !["IN_PROGRESS", "CALIBRATING"].includes(cycle.status)) throw new Error("当前批次不能校准"); await assertDepartment(user, cycle.departmentOrgNodeId, talentAbilityKeys.calibrateReview);
  const gradeCode = value(formData, "gradeCode"); const nineBoxCode = value(formData, "nineBoxCode");
  const [grade, box, before] = await Promise.all([prisma.talentGradeThreshold.findFirst({ where: { templateVersionId: cycle.templateVersionId, gradeCode } }), prisma.talentNineBoxRule.findFirst({ where: { templateVersionId: cycle.templateVersionId, code: nineBoxCode } }), prisma.talentReviewResult.findUnique({ where: { participantId } })]); if (!grade || !box || !before) throw new Error("校准目标或原始结果不存在");
  const row = await prisma.talentReviewResult.update({ where: { participantId }, data: { gradeCode, nineBoxCode, talentType: box.label, managerComment: String(formData.get("managerComment") ?? "").trim() || before.managerComment } }); await prisma.talentReviewCycle.update({ where: { id: cycle.id }, data: { status: "CALIBRATING" } }); await audit("TalentReviewResult", row.id, "CALIBRATE", user.id, { before, after: row }); revalidatePath(`/talent/reviews/${cycle.id}`); revalidateTalentReview();
}

export async function confirmTalentReviewCycle(formData: FormData) {
  const user = await requireAbility(talentAbilityKeys.calibrateReview); const cycleId = value(formData, "cycleId"); const cycle = await prisma.talentReviewCycle.findUnique({ where: { id: cycleId } }); if (!cycle || !["IN_PROGRESS", "CALIBRATING"].includes(cycle.status)) throw new Error("批次状态不能确认"); await assertDepartment(user, cycle.departmentOrgNodeId, talentAbilityKeys.calibrateReview);
  const pending = await prisma.talentReviewParticipant.count({ where: { cycleId, status: "PENDING" } }); if (pending > 0) throw new Error(`仍有 ${pending} 人未完成评价`); const now = new Date();
  await prisma.$transaction(async (tx) => { await tx.talentReviewParticipant.updateMany({ where: { cycleId }, data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: now } }); const participants = await tx.talentReviewParticipant.findMany({ where: { cycleId }, select: { id: true } }); await tx.talentReviewResult.updateMany({ where: { participantId: { in: participants.map((row) => row.id) } }, data: { confirmedAt: now } }); await tx.talentReviewCycle.update({ where: { id: cycleId }, data: { status: "CONFIRMED", confirmedAt: now } }); }); await audit("TalentReviewCycle", cycleId, "CONFIRM", user.id, { confirmedAt: now }); revalidatePath(`/talent/reviews/${cycleId}`); revalidateTalentReview();
}
