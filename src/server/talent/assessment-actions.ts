"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";
import {
  allocateSubjectScores,
  earnedAssessmentScore,
  isAssessmentPassed,
  resolveAssessmentPassingRequirement,
  summarizeAssessment,
  type AssessmentPassingStandard,
} from "./assessment-engine";

function required(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); if (!value) throw new Error(`${key} 不能为空`); return value; }
function numberValue(formData: FormData, key: string) { const value = Number(required(formData, key)); if (!Number.isFinite(value)) throw new Error(`${key} 必须是数字`); return value; }
async function manager() { const user = await requireCurrentUser(); const permission = await resolvePermissionCoverage(user, orgPermissionModuleKeys.kpi, kpiAbilityKeys.manageBusinessAssessment); if (!permission.hasPermission) throw new Error("没有业务考核管理权限"); return user; }
async function assertDepartment(user: Awaited<ReturnType<typeof requireCurrentUser>>, departmentOrgNodeId: string) { const ids = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.kpi, kpiAbilityKeys.manageBusinessAssessment); if (ids !== null && !ids.includes(departmentOrgNodeId)) throw new Error("不能管理该部门的业务考核"); }

type QuarterlyRuleStandardInput = {
  scopeType: "ORG_NODE" | "USER";
  scopeId: string;
  passingNumericScore: number | null;
  requiredGradeCode: string | null;
};
type QuarterlyRuleSubjectInput = {
  code: string;
  name: string;
  scoringType: "NUMERIC" | "GRADE";
  standards: QuarterlyRuleStandardInput[];
};

function validatePassingRequirement(scoringType: "NUMERIC" | "GRADE", passingNumericScore: number | null, requiredGradeCode: string | null) {
  if (scoringType === "NUMERIC") {
    if (passingNumericScore == null || !Number.isFinite(passingNumericScore) || passingNumericScore < 0 || passingNumericScore > 100) throw new Error("分数及格线必须在 0 至 100 分之间");
    return;
  }
  if (!requiredGradeCode || !(["S", "A", "B", "C", "D"] as const).includes(requiredGradeCode as "S" | "A" | "B" | "C" | "D")) throw new Error("要求等级必须为 S、A、B、C 或 D");
}

function parseQuarterlyRuleSubjects(formData: FormData): QuarterlyRuleSubjectInput[] {
  let rows: unknown;
  try { rows = JSON.parse(String(formData.get("ruleSubjectsJson") ?? "[]")); } catch { throw new Error("科目配置格式无效"); }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("请至少配置一个考核科目");
  const subjectCodes = new Set<string>();
  const subjectNames = new Set<string>();
  return rows.map((item, subjectIndex) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${subjectIndex + 1} 个科目配置无效`);
    const raw = item as Record<string, unknown>;
    const code = String(raw.code ?? "").trim().toUpperCase() || `SUBJECT_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const name = String(raw.name ?? "").trim();
    const scoringType = raw.scoringType === "NUMERIC" || raw.scoringType === "GRADE" ? raw.scoringType : null;
    if (!name || !scoringType) throw new Error(`请完整填写第 ${subjectIndex + 1} 个科目的名称和评分方式`);
    if (subjectNames.has(name)) throw new Error(`科目名称“${name}”重复`);
    subjectNames.add(name);
    if (subjectCodes.has(code)) throw new Error("系统生成科目标识失败，请重试");
    subjectCodes.add(code);
    if (!Array.isArray(raw.standards) || raw.standards.length === 0) throw new Error(`科目“${name}”至少需要一个小组及格标准`);
    const scopeKeys = new Set<string>();
    const standards: QuarterlyRuleStandardInput[] = raw.standards.map((standard, standardIndex) => {
      if (!standard || typeof standard !== "object") throw new Error(`科目“${name}”第 ${standardIndex + 1} 条及格标准无效`);
      const value = standard as Record<string, unknown>;
      const scopeType: QuarterlyRuleStandardInput["scopeType"] | null = value.scopeType === "ORG_NODE" || value.scopeType === "USER" ? value.scopeType : null;
      const scopeId = String(value.scopeId ?? "").trim();
      if (!scopeType || !scopeId) throw new Error(`请完整选择科目“${name}”的适用范围`);
      const scopeKey = `${scopeType}:${scopeId}`;
      if (scopeKeys.has(scopeKey)) throw new Error(`科目“${name}”中同一小组或员工只能配置一条标准`);
      scopeKeys.add(scopeKey);
      const passingNumericScore = scoringType === "NUMERIC" ? Number(value.passingNumericScore) : null;
      const requiredGradeCode = scoringType === "GRADE" ? String(value.requiredGradeCode ?? "").trim().toUpperCase() : null;
      validatePassingRequirement(scoringType, passingNumericScore, requiredGradeCode);
      return { scopeType, scopeId, passingNumericScore, requiredGradeCode };
    });
    if (!standards.some((row) => row.scopeType === "ORG_NODE")) throw new Error(`科目“${name}”至少需要一个小组及格标准`);
    return { code, name, scoringType, standards };
  });
}

export type BusinessAssessmentOperationState = {
  status: "idle" | "success" | "error";
  message: string;
  details?: Array<{
    rowNumber: number;
    employeeName: string;
    subjectName: string;
    messages: string[];
  }>;
};

class BusinessAssessmentImportValidationError extends Error {
  constructor(
    message: string,
    readonly details: NonNullable<BusinessAssessmentOperationState["details"]>,
  ) {
    super(message);
    this.name = "BusinessAssessmentImportValidationError";
  }
}

export async function createBusinessAssessmentCycleInlineWithState(
  _previousState: BusinessAssessmentOperationState,
  formData: FormData,
): Promise<BusinessAssessmentOperationState> {
  try {
    const user = await manager();
    const departmentOrgNodeId = required(formData, "departmentOrgNodeId");
    await assertDepartment(user, departmentOrgNodeId);
    const year = numberValue(formData, "year");
    const quarter = numberValue(formData, "quarter");
    if (![1, 2, 3, 4].includes(quarter)) throw new Error("季度必须为 Q1 至 Q4");
    // 计分规则随部门已发布的绩效管理规则版本冻结（人才发展-规则配置-绩效管理规则维护）。
    const activeRule = await prisma.kpiRatingRuleVersion.findFirst({
      where: { departmentOrgNodeId, status: "ACTIVE", deletedAt: null },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    });
    const totalKpiScore = activeRule?.businessAssessmentTotalScore ?? 6;
    const initialPassPercent = activeRule?.baInitialPassPercent ?? 100;
    const retestPassPercent = activeRule?.baRetestPassPercent ?? 50;
    const finalFailPercent = activeRule?.baFinalFailPercent ?? 0;
    const assessmentStartDate = parseAssessmentDate(formData.get("assessmentStartDate"), "考核开始日期");
    const assessmentEndDate = parseAssessmentDate(formData.get("assessmentEndDate"), "考核结束日期");
    validateAssessmentPeriod(assessmentStartDate, assessmentEndDate);
    const subjects = parseQuarterlyRuleSubjects(formData);

    const existingCycle = await prisma.businessAssessmentCycle.findFirst({
      where: { departmentOrgNodeId, year, quarter, deletedAt: null },
      select: { id: true },
    });
    if (existingCycle) throw new Error(`该部门 ${year} 年 Q${quarter} 业务考核已存在`);

    const departmentOrgNodeIds = await getDescendantOrgNodeIds(departmentOrgNodeId);
    const [validTeams, validUsers] = await Promise.all([
      prisma.orgNode.findMany({ where: { id: { in: departmentOrgNodeIds }, nodeType: "TEAM" }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { orgNodeId: { in: departmentOrgNodeIds }, roleType: { in: ["TEAM_LEADER", "MEMBER"] }, isActive: true, deletedAt: null }, select: { id: true } }),
    ]);
    const validTeamIds = new Set(validTeams.map((row) => row.id));
    const validUserIds = new Set(validUsers.map((row) => row.id));
    for (const subject of subjects) {
      for (const standard of subject.standards) {
        if (standard.scopeType === "ORG_NODE" && !validTeamIds.has(standard.scopeId)) throw new Error(`科目“${subject.name}”所选小组不在考核部门内`);
        if (standard.scopeType === "USER" && !validUserIds.has(standard.scopeId)) throw new Error(`科目“${subject.name}”所选员工不在考核部门内`);
      }
      const configuredTeamIds = new Set(subject.standards.filter((row) => row.scopeType === "ORG_NODE").map((row) => row.scopeId));
      const missingTeams = validTeams.filter((team) => !configuredTeamIds.has(team.id));
      if (missingTeams.length) throw new Error(`科目“${subject.name}”尚未配置小组及格标准：${missingTeams.map((team) => team.name).join("、")}`);
    }

    const standardSnapshot = subjects.flatMap((subject) => subject.standards.map((standard) => ({
      subjectCode: subject.code,
      scopeType: standard.scopeType,
      scopeId: standard.scopeId,
      scoringType: subject.scoringType,
      passingNumericScore: standard.passingNumericScore,
      requiredGradeCode: standard.requiredGradeCode,
    })));
    const scores = allocateSubjectScores(subjects.length, totalKpiScore);
    const row = await prisma.$transaction(async (tx) => {
      const cycle = await tx.businessAssessmentCycle.create({ data: {
        year,
        quarter,
        name: `${year}年Q${quarter}业务考核`,
        departmentOrgNodeId,
        createdById: user.id,
        ruleId: null,
        totalKpiScore,
        initialPassPercent,
        retestPassPercent,
        finalFailPercent,
        passingStandardsJson: JSON.stringify(standardSnapshot),
        assessmentStartDate,
        assessmentEndDate,
      } });
      await tx.businessAssessmentSubject.createMany({ data: subjects.map((subject, index) => ({
        cycleId: cycle.id,
        code: subject.code,
        name: subject.name,
        scoringType: subject.scoringType,
        passingNumericScore: null,
        requiredGradeCode: null,
        maxScore: scores[index],
        sortOrder: (index + 1) * 10,
      })) });
      return cycle;
    });
    await prisma.talentActionLog.create({ data: { targetType: "BusinessAssessmentCycle", targetId: row.id, action: "CREATE", actorId: user.id, afterJson: JSON.stringify(row) } });
    revalidatePath("/kpi");
    revalidatePath("/talent");
    return { status: "success", message: "业务考核已创建，科目、评分方式和小组及格标准已随本次考核冻结" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "业务考核创建失败" };
  }
}

export async function deleteBusinessAssessmentCycleWithState(
  _previousState: BusinessAssessmentOperationState,
  formData: FormData,
): Promise<BusinessAssessmentOperationState> {
  try {
    const user = await manager();
    const cycleId = required(formData, "cycleId");
    const cycle = await prisma.businessAssessmentCycle.findFirst({ where: { id: cycleId, deletedAt: null } });
    if (!cycle) throw new Error("业务考核不存在或已删除");
    if (cycle.status !== "DRAFT") throw new Error("已导入结果的业务考核不能删除");
    await assertDepartment(user, cycle.departmentOrgNodeId);
    const [resultCount, summaryCount] = await Promise.all([
      prisma.businessAssessmentResult.count({ where: { cycleId } }),
      prisma.businessAssessmentSummary.count({ where: { cycleId } }),
    ]);
    if (resultCount > 0 || summaryCount > 0) throw new Error("该业务考核已有结果，不能删除");
    await prisma.$transaction(async (tx) => {
      await tx.businessAssessmentSubject.deleteMany({ where: { cycleId } });
      await tx.businessAssessmentCycle.delete({ where: { id: cycleId } });
      await tx.talentActionLog.create({ data: { targetType: "BusinessAssessmentCycle", targetId: cycleId, action: "DELETE", actorId: user.id, beforeJson: JSON.stringify(cycle) } });
    });
    revalidatePath("/talent");
    return { status: "success", message: "业务考核已删除" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "业务考核删除失败" };
  }
}

const resultAliases: Record<string, "INITIAL_PASS" | "RETEST_PASS" | "FINAL_FAIL"> = { "首次及格": "INITIAL_PASS", "补考及格": "RETEST_PASS", "补考不及格": "FINAL_FAIL", "最终不及格": "FINAL_FAIL", INITIAL_PASS: "INITIAL_PASS", RETEST_PASS: "RETEST_PASS", FINAL_FAIL: "FINAL_FAIL" };
type ImportRow = { "用户ID"?: unknown; "姓名"?: unknown; "科目名称"?: unknown; "最终值"?: unknown; "最终结果"?: unknown; "考核开始日期"?: unknown; "考核结束日期"?: unknown; "考核日期"?: unknown; "备注"?: unknown };

function parseAssessmentDate(raw: unknown, label: string) {
  if (raw == null || raw === "") return null;
  const date = raw instanceof Date ? raw : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim()) ? `${String(raw).trim()}T00:00:00` : String(raw));
  if (Number.isNaN(date.getTime())) throw new Error(`${label}无效，请使用 yyyy-mm-dd 格式`);
  return date;
}

function validateAssessmentPeriod(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) throw new Error("请完整填写考核开始日期和考核结束日期");
  if (startDate.getTime() > endDate.getTime()) throw new Error("考核开始日期不能晚于考核结束日期");
}

export async function updateBusinessAssessmentResultWithState(
  _previousState: BusinessAssessmentOperationState,
  formData: FormData,
): Promise<BusinessAssessmentOperationState> {
  try {
    const user = await manager();
    const resultId = required(formData, "resultId");
    const rawFinalValue = required(formData, "rawFinalValue");
    const attemptResult = resultAliases[required(formData, "attemptResult").toUpperCase()];
    if (!attemptResult) throw new Error("最终结果必须为首次及格、补考及格或补考不及格");
    const result = await prisma.businessAssessmentResult.findUnique({ where: { id: resultId } });
    if (!result) throw new Error("员工考核成绩不存在");
    const [cycle, subject, employee] = await Promise.all([
      prisma.businessAssessmentCycle.findFirst({ where: { id: result.cycleId, deletedAt: null } }),
      prisma.businessAssessmentSubject.findUnique({ where: { id: result.subjectId } }),
      prisma.user.findUnique({ where: { id: result.userId }, select: { id: true, orgNodeId: true } }),
    ]);
    if (!cycle || cycle.status === "VOIDED") throw new Error("该业务考核当前不能编辑成绩");
    if (!subject || !employee) throw new Error("员工或考核科目不存在");
    await assertDepartment(user, cycle.departmentOrgNodeId);
    let standards: Array<AssessmentPassingStandard & { subjectCode?: string }> = [];
    try { standards = JSON.parse(cycle.passingStandardsJson) as Array<AssessmentPassingStandard & { subjectCode?: string }>; } catch { throw new Error("业务考核的及格规则快照无效"); }
    const requirement = resolveAssessmentPassingRequirement({
      userId: employee.id,
      orgNodeId: employee.orgNodeId,
      standards: standards.filter((row) => row.subjectCode === subject.code),
      fallback: { scoringType: subject.scoringType, passingNumericScore: subject.passingNumericScore, requiredGradeCode: subject.requiredGradeCode },
    });
    if (requirement.scoringType === "NUMERIC" && requirement.passingNumericScore == null) throw new Error("该员工所属小组未配置此科目的分数及格线");
    if (requirement.scoringType === "GRADE" && !requirement.requiredGradeCode) throw new Error("该员工所属小组未配置此科目的等级及格线");
    const passed = isAssessmentPassed({ ...requirement, rawValue: rawFinalValue });
    if (attemptResult === "FINAL_FAIL" && passed) throw new Error("最终成绩已达标，不能标记为补考不及格");
    if (attemptResult !== "FINAL_FAIL" && !passed) throw new Error("最终成绩未达标，不能标记为及格");
    const earnedScore = earnedAssessmentScore(subject.maxScore ?? 0, attemptResult, {
      INITIAL_PASS: cycle.initialPassPercent,
      RETEST_PASS: cycle.retestPassPercent,
      FINAL_FAIL: cycle.finalFailPercent,
    });
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.businessAssessmentResult.update({ where: { id: resultId }, data: {
        rawFinalValue,
        attemptResult,
        isPassed: passed,
        earnedScore,
        remark: String(formData.get("remark") ?? "").trim() || null,
      } });
      const employeeResults = await tx.businessAssessmentResult.findMany({ where: { cycleId: cycle.id, userId: result.userId } });
      const summary = summarizeAssessment(employeeResults, cycle.totalKpiScore);
      await tx.businessAssessmentSummary.upsert({ where: { cycleId_userId: { cycleId: cycle.id, userId: result.userId } }, update: summary, create: { cycleId: cycle.id, userId: result.userId, ...summary } });
      return row;
    });
    await prisma.talentActionLog.create({ data: { targetType: "BusinessAssessmentResult", targetId: resultId, action: "UPDATE", actorId: user.id, beforeJson: JSON.stringify(result), afterJson: JSON.stringify(updated) } });
    revalidatePath("/talent");
    revalidatePath("/kpi");
    return { status: "success", message: "员工考核成绩已保存，业务考核得分已重新计算" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "员工考核成绩保存失败" };
  }
}

export async function updateBusinessAssessmentCyclePeriodWithState(
  _previousState: BusinessAssessmentOperationState,
  formData: FormData,
): Promise<BusinessAssessmentOperationState> {
  try {
    const user = await manager();
    const cycleId = required(formData, "cycleId");
    const assessmentStartDate = parseAssessmentDate(formData.get("assessmentStartDate"), "考核开始日期");
    const assessmentEndDate = parseAssessmentDate(formData.get("assessmentEndDate"), "考核结束日期");
    validateAssessmentPeriod(assessmentStartDate, assessmentEndDate);
    const before = await prisma.businessAssessmentCycle.findFirst({ where: { id: cycleId, deletedAt: null } });
    if (!before || before.status === "VOIDED") throw new Error("该业务考核当前不能修改时间段");
    await assertDepartment(user, before.departmentOrgNodeId);
    const updated = await prisma.$transaction(async (tx) => {
      const cycle = await tx.businessAssessmentCycle.update({
        where: { id: cycleId },
        data: { assessmentStartDate, assessmentEndDate },
      });
      // 暂时同步旧字段，确保尚未迁移的查询仍能读取一致的统一时间段。
      await tx.businessAssessmentResult.updateMany({
        where: { cycleId },
        data: { assessmentStartDate, assessmentEndDate, assessmentDate: assessmentStartDate },
      });
      return cycle;
    });
    await prisma.talentActionLog.create({ data: { targetType: "BusinessAssessmentCycle", targetId: cycleId, action: "UPDATE_PERIOD", actorId: user.id, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(updated) } });
    revalidatePath("/talent");
    return { status: "success", message: "业务考核时间段已更新，所有员工统一使用该时间段" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "业务考核时间段更新失败" };
  }
}

async function importBusinessAssessmentResults(formData: FormData) {
  const user = await manager(); const cycleId = required(formData, "cycleId"); const cycle = await prisma.businessAssessmentCycle.findUnique({ where: { id: cycleId } });
  if (!cycle || cycle.status !== "DRAFT") throw new Error("只能向进行中的业务考核导入结果"); await assertDepartment(user, cycle.departmentOrgNodeId);
  validateAssessmentPeriod(cycle.assessmentStartDate, cycle.assessmentEndDate);
  const file = formData.get("file"); if (!(file instanceof File) || file.size === 0) throw new Error("请选择 Excel 或 CSV 文件");
  const buffer = Buffer.from(await file.arrayBuffer()); const hash = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: "" }); if (!rows.length) throw new Error("导入文件没有数据");
  const [subjects, departmentNodeIds] = await Promise.all([prisma.businessAssessmentSubject.findMany({ where: { cycleId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }), getDescendantOrgNodeIds(cycle.departmentOrgNodeId)]); if (!subjects.length) throw new Error("请先配置考试科目");
  let passingStandards: Array<AssessmentPassingStandard & { subjectCode?: string }> = [];
  try { passingStandards = JSON.parse(cycle.passingStandardsJson) as Array<AssessmentPassingStandard & { subjectCode?: string }>; } catch { throw new Error("考核批次的及格规则快照无效"); }
  const subjectByName = new Map(subjects.map((row) => [row.name, row])); const users = await prisma.user.findMany({ where: { orgNodeId: { in: departmentNodeIds }, isActive: true, deletedAt: null }, select: { id: true, name: true, orgNodeId: true } }); const userById = new Map(users.map((row) => [row.id, row])); const usersByName = new Map<string, typeof users>(); for (const row of users) usersByName.set(row.name, [...(usersByName.get(row.name) ?? []), row]);
  const normalized = rows.map((raw, index) => { const errors: string[] = []; const id = String(raw["用户ID"] ?? "").trim(); const name = String(raw["姓名"] ?? "").trim(); const candidates = name ? usersByName.get(name) ?? [] : []; const target = id ? userById.get(id) : candidates.length === 1 ? candidates[0] : undefined; if (!target) errors.push(id ? "用户ID不存在或不在部门范围" : candidates.length > 1 ? "姓名重名，请联系管理员处理重名员工" : "员工不存在"); const subject = subjectByName.get(String(raw["科目名称"] ?? "").trim()); if (!subject) errors.push("科目名称不存在"); const attemptResult = resultAliases[String(raw["最终结果"] ?? "").trim().toUpperCase()]; if (!attemptResult) errors.push("最终结果必须为首次及格/补考及格/补考不及格"); const rawValue = String(raw["最终值"] ?? "").trim(); let passed = false; const subjectStandards = subject ? passingStandards.filter((row) => row.subjectCode === subject.code) : []; const passingRequirement = target && subject ? resolveAssessmentPassingRequirement({ userId: target.id, orgNodeId: target.orgNodeId, standards: subjectStandards, fallback: { scoringType: subject.scoringType, passingNumericScore: subject.passingNumericScore, requiredGradeCode: subject.requiredGradeCode } }) : null; if (target && subject && passingRequirement?.passingNumericScore == null && passingRequirement?.scoringType === "NUMERIC") errors.push("该员工所属小组未配置此科目的分数及格线"); else if (target && subject && !passingRequirement?.requiredGradeCode && passingRequirement?.scoringType === "GRADE") errors.push("该员工所属小组未配置此科目的等级及格线"); else if (passingRequirement && rawValue) { try { passed = isAssessmentPassed({ ...passingRequirement, rawValue }); } catch (error) { errors.push(error instanceof Error ? error.message : "最终值无效"); } } else if (!rawValue) errors.push("最终值不能为空"); if (passingRequirement && attemptResult === "FINAL_FAIL" && passed) errors.push("最终值已达标，不能标记为补考不及格"); if (passingRequirement && attemptResult && attemptResult !== "FINAL_FAIL" && !passed) errors.push("最终值未达标，不能标记为及格"); return { rowNumber: index + 2, raw, errors, target, subject, attemptResult, rawValue, passed }; });
  const batch = await prisma.talentImportBatch.create({ data: { importType: "BUSINESS_ASSESSMENT", fileName: file.name, fileSha256: hash, status: normalized.some((row) => row.errors.length) ? "FAILED" : "VALIDATED", year: cycle.year, quarter: cycle.quarter, departmentOrgNodeId: cycle.departmentOrgNodeId, createdById: user.id, summaryJson: JSON.stringify({ total: rows.length, invalid: normalized.filter((row) => row.errors.length).length }) } });
  await prisma.talentImportRow.createMany({ data: normalized.map((row) => ({ batchId: batch.id, rowNumber: row.rowNumber, rawDataJson: JSON.stringify(row.raw), normalizedDataJson: row.target && row.subject && row.attemptResult ? JSON.stringify({ userId: row.target.id, subjectId: row.subject.id, rawValue: row.rawValue, attemptResult: row.attemptResult }) : null, userId: row.target?.id, status: row.errors.length ? "INVALID" : "VALID", errorMessagesJson: row.errors.length ? JSON.stringify(row.errors) : null })) });
  const invalid = normalized.filter((row) => row.errors.length); if (invalid.length) throw new BusinessAssessmentImportValidationError(
    `导入预检失败：${invalid.length} 行错误，未写入考核结果`,
    invalid.map((row) => ({
      rowNumber: row.rowNumber,
      employeeName: String(row.raw["姓名"] ?? "").trim() || "未填写员工",
      subjectName: String(row.raw["科目名称"] ?? "").trim() || "未填写科目",
      messages: row.errors,
    })),
  );
  const importRows = await prisma.talentImportRow.findMany({ where: { batchId: batch.id }, orderBy: { rowNumber: "asc" } });
  const percentages = { INITIAL_PASS: cycle.initialPassPercent, RETEST_PASS: cycle.retestPassPercent, FINAL_FAIL: cycle.finalFailPercent };
  await prisma.$transaction(async (tx) => { for (let index = 0; index < normalized.length; index += 1) { const row = normalized[index]; if (!row.target || !row.subject || !row.attemptResult) continue; const earnedScore = earnedAssessmentScore(row.subject.maxScore ?? 0, row.attemptResult, percentages); const period = { assessmentStartDate: cycle.assessmentStartDate, assessmentEndDate: cycle.assessmentEndDate, assessmentDate: cycle.assessmentStartDate }; const result = await tx.businessAssessmentResult.upsert({ where: { cycleId_subjectId_userId: { cycleId, subjectId: row.subject.id, userId: row.target.id } }, update: { rawFinalValue: row.rawValue, attemptResult: row.attemptResult, isPassed: row.passed, earnedScore, sourceImportRowId: importRows[index].id, ...period, remark: String(row.raw["备注"] ?? "").trim() || null }, create: { cycleId, subjectId: row.subject.id, userId: row.target.id, rawFinalValue: row.rawValue, attemptResult: row.attemptResult, isPassed: row.passed, earnedScore, sourceImportRowId: importRows[index].id, ...period, remark: String(row.raw["备注"] ?? "").trim() || null } }); await tx.talentImportRow.update({ where: { id: importRows[index].id }, data: { status: "IMPORTED", importedTargetType: "BusinessAssessmentResult", importedTargetId: result.id } }); }
    for (const userId of [...new Set(normalized.flatMap((row) => row.target ? [row.target.id] : []))]) { const results = await tx.businessAssessmentResult.findMany({ where: { cycleId, userId } }); const summary = summarizeAssessment(results, cycle.totalKpiScore); await tx.businessAssessmentSummary.upsert({ where: { cycleId_userId: { cycleId, userId } }, update: summary, create: { cycleId, userId, ...summary } }); }
    await tx.businessAssessmentCycle.update({ where: { id: cycleId }, data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() } }); await tx.talentImportBatch.update({ where: { id: batch.id }, data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() } }); });
  revalidatePath("/talent"); revalidatePath("/kpi");
}

export async function importBusinessAssessmentResultsWithState(
  _previousState: BusinessAssessmentOperationState,
  formData: FormData,
): Promise<BusinessAssessmentOperationState> {
  try {
    await importBusinessAssessmentResults(formData);
    return { status: "success", message: "业务考核最终结果已通过预检并完成导入，状态已更新为已完成" };
  } catch (error) {
    const message = error instanceof Error && error.name === "PrismaClientValidationError"
      ? "导入服务的数据结构尚未同步，请刷新页面后重试；如仍失败，请联系管理员重启服务"
      : error instanceof Error ? error.message : "业务考核结果导入失败";
    return {
      status: "error",
      message,
      details: error instanceof BusinessAssessmentImportValidationError ? error.details : undefined,
    };
  }
}
