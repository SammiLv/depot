"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EmploymentContractOutcome, TalentDecisionType } from "@prisma/client";
import * as XLSX from "xlsx";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import {
  historyImportRecordKey,
  normalizeContractOutcome,
  normalizeHistoryDecisionType,
  parseHistoryDate,
  parseOptionalHistoryInteger,
} from "./history-import";
import { companyCoinAwardAmounts, isControlledCompanyCoinAward, rewardCycleLabels, rewardFormLabels, rewardLevelLabels, rewardRecipientLabels, type RewardCycle, type RewardForm, type RewardLevel, type RewardRecipient } from "./reward-types";

type RawHistoryRow = Record<string, unknown>;
type NormalizedHistoryRow = {
  decisionType: TalentDecisionType;
  recordNo: string;
  userId: string;
  effectiveDate: string;
  toJobLevelId: string | null;
  promotionType: string | null;
  reason: string | null;
  beforeSalary: number | null;
  afterSalary: number | null;
  rewardLevel: RewardLevel | null;
  rewardForm: RewardForm | null;
  rewardRecipient: RewardRecipient | null;
  rewardCycle: RewardCycle | null;
  rewardPeriodYear: number | null;
  rewardPeriodMonth: number | null;
  rewardPeriodQuarter: number | null;
  rewardName: string | null;
  rewardAmount: number | null;
  contractNo: string | null;
  startDate: string | null;
  endDate: string | null;
  renewalSequence: number | null;
  outcome: EmploymentContractOutcome | null;
  externalProcessNo: string | null;
};

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function enumKeyByLabel<T extends Record<string, string>>(labels: T, value: unknown): keyof T | null {
  const normalized = textValue(value);
  const entry = Object.entries(labels).find(([key, label]) => key === normalized || label === normalized);
  return entry ? entry[0] as keyof T : null;
}

async function historyManager() {
  const user = await requireCurrentUser();
  const permission = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageHistory);
  if (!permission.hasPermission) throw new Error("没有人才履历管理权限");
  return user;
}

function uniqueLookup<T extends { id: string }>(rows: T[], values: Array<keyof T>) {
  const lookup = new Map<string, T[]>();
  for (const row of rows) {
    for (const field of values) {
      const key = textValue(row[field]);
      if (key) lookup.set(key, [...(lookup.get(key) ?? []), row]);
    }
  }
  return lookup;
}

function resolveUnique<T extends { id: string }>(lookup: Map<string, T[]>, value: unknown) {
  const key = textValue(value);
  if (!key) return { row: null, ambiguous: false };
  const matches = lookup.get(key) ?? [];
  return { row: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}

export async function uploadTalentHistoryImport(formData: FormData) {
  const actor = await historyManager();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("请选择 Excel 或 CSV 文件");

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawHistoryRow>(sheet, { defval: "" });
  if (!rows.length) throw new Error("导入文件没有数据");

  const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(actor, orgPermissionModuleKeys.talent, talentAbilityKeys.manageHistory);
  const userWhere = authorizedOrgNodeIds === null ? { isActive: true, deletedAt: null } : { orgNodeId: { in: authorizedOrgNodeIds }, isActive: true, deletedAt: null };
  const [users, levels] = await Promise.all([
    prisma.user.findMany({ where: userWhere, select: { id: true, name: true } }),
    prisma.jobLevel.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, code: true, name: true } }),
  ]);
  const userById = new Map(users.map((row) => [row.id, row]));
  const usersByName = uniqueLookup(users, ["name"]);
  const levelLookup = uniqueLookup(levels, ["id", "code", "name"]);

  const normalizedRows = rows.map((raw, index) => {
    const errors: string[] = [];
    const parsedDecisionType = normalizeHistoryDecisionType(raw["类型"]);
    const decisionType = parsedDecisionType === "QUARTERLY_REWARD" || parsedDecisionType === "ANNUAL_REWARD" ? "REWARD" : parsedDecisionType;
    if (!decisionType) errors.push("类型必须为晋升/续签/加薪/奖励");
    const recordNo = textValue(raw["记录编号"]);
    if (!recordNo) errors.push("记录编号不能为空");

    const userIdInput = textValue(raw["用户ID"]);
    const nameInput = textValue(raw["姓名"]);
    const nameMatches = nameInput ? usersByName.get(nameInput) ?? [] : [];
    const targetUser = userIdInput ? userById.get(userIdInput) : nameMatches.length === 1 ? nameMatches[0] : null;
    if (!targetUser) errors.push(userIdInput ? "用户ID不存在或超出管理范围" : nameMatches.length > 1 ? "姓名重名，请填写用户ID" : "员工不存在或超出管理范围");

    const effectiveDate = parseHistoryDate(raw["生效日期"]);
    if (!effectiveDate) errors.push("生效日期无效");
    const levelResult = resolveUnique(levelLookup, raw["目标职级"] || raw["目标职级ID"]);
    if (levelResult.ambiguous) errors.push("目标职级存在重名/重码，请填写目标职级ID");

    const beforeSalary = parseOptionalHistoryInteger(raw["调整前薪资"]);
    const afterSalary = parseOptionalHistoryInteger(raw["调整后薪资"]);
    const rewardAmount = parseOptionalHistoryInteger(raw["奖励金额"]);
    const renewalSequence = parseOptionalHistoryInteger(raw["续签次数"]);
    const startDate = parseHistoryDate(raw["聘期开始"]);
    const endDate = parseHistoryDate(raw["聘期结束"]);
    const outcome = normalizeContractOutcome(raw["续签结果"]);

    if (decisionType === "PROMOTION" && !levelResult.row) errors.push("晋升必须填写有效的目标职级");
    if (decisionType === "SALARY_ADJUSTMENT") {
      if (afterSalary === null || afterSalary < 0) errors.push("加薪必须填写非负整数的调整后薪资");
      if (textValue(raw["调整前薪资"]) && (beforeSalary === null || beforeSalary < 0)) errors.push("调整前薪资必须为非负整数");
    }
    const rewardLevel = enumKeyByLabel(rewardLevelLabels, raw["奖励层级"]) as RewardLevel | null;
    const rewardForm = enumKeyByLabel(rewardFormLabels, raw["奖励形式"]) as RewardForm | null;
    const rewardRecipient = enumKeyByLabel(rewardRecipientLabels, raw["奖励对象"]) as RewardRecipient | null;
    const rewardCycle = enumKeyByLabel(rewardCycleLabels, raw["奖励周期"]) as RewardCycle | null;
    let rewardPeriodYear: number | null = null;
    let rewardPeriodMonth: number | null = null;
    let rewardPeriodQuarter: number | null = null;
    if (decisionType === "REWARD") {
      if (!rewardLevel) errors.push("奖励层级必须为公司或部门");
      if (!rewardForm) errors.push("奖励形式必须为竞币或现金");
      if (!rewardRecipient) errors.push("奖励对象必须为个人或项目");
      if (!rewardCycle) errors.push("奖励周期必须为月度、季度、年度或其他");
      const rewardPeriod = textValue(raw["奖励期间"]);
      if (rewardCycle === "MONTHLY" || rewardCycle === "OTHER") {
        const monthMatch = /^(\d{4})[-年/](\d{1,2})(?:月)?$/.exec(rewardPeriod);
        if (!monthMatch) errors.push("月度或其他奖励的奖励期间必须填写为年月，例如2026-08");
        else { rewardPeriodYear = Number(monthMatch[1]); rewardPeriodMonth = Number(monthMatch[2]); }
      }
      else if (rewardCycle === "QUARTERLY") {
        const quarterMatch = /^(\d{4})(?:年)?(?:第|[-/ ]?Q?)([1-4])(?:季度)?$/i.exec(rewardPeriod);
        rewardPeriodYear = quarterMatch ? Number(quarterMatch[1]) : null;
        rewardPeriodQuarter = quarterMatch ? Number(quarterMatch[2]) : null;
        if (!rewardPeriodYear || !rewardPeriodQuarter) errors.push("季度奖励的奖励期间必须填写为年度和季度，例如2026年第3季度");
      }
      else if (rewardCycle === "ANNUAL") {
        const yearMatch = /^(\d{4})(?:年(?:度)?)?$/.exec(rewardPeriod);
        rewardPeriodYear = yearMatch ? Number(yearMatch[1]) : null;
        if (!rewardPeriodYear) errors.push("年度奖励的奖励期间必须填写为年份，例如2026年");
      }
      if (!textValue(raw["奖励名称"])) errors.push("奖励名称不能为空");
      if (rewardAmount === null || rewardAmount <= 0) errors.push("奖励金额必须是大于0的整数");
      if (rewardLevel && rewardForm && rewardCycle && isControlledCompanyCoinAward(rewardLevel, rewardForm, rewardCycle)) {
        const allowedAmounts = companyCoinAwardAmounts(textValue(raw["奖励名称"]), rewardCycle);
        if (!allowedAmounts.length) errors.push("奖励名称不在公司竞币奖励标准中");
      }
    }
    if (decisionType === "CONTRACT_RENEWAL") {
      if (!startDate || !endDate) errors.push("续签必须填写有效的聘期开始和聘期结束");
      if (startDate && endDate && endDate < startDate) errors.push("聘期结束不能早于聘期开始");
      if (renewalSequence === null || renewalSequence < 1) errors.push("续签次数必须为正整数");
      if (!outcome) errors.push("续签结果必须为已续签/不续签/延期/终止");
    }

    const normalized: NormalizedHistoryRow | null = decisionType && targetUser && effectiveDate ? {
      decisionType,
      recordNo,
      userId: targetUser.id,
      effectiveDate: effectiveDate.toISOString(),
      toJobLevelId: levelResult.row?.id ?? null,
      promotionType: textValue(raw["晋升类型"]) || null,
      reason: textValue(raw["原因/说明"]) || null,
      beforeSalary,
      afterSalary,
      rewardLevel,
      rewardForm,
      rewardRecipient,
      rewardCycle,
      rewardPeriodYear,
      rewardPeriodMonth,
      rewardPeriodQuarter,
      rewardName: textValue(raw["奖励名称"]) || null,
      rewardAmount,
      contractNo: textValue(raw["合同编号"]) || null,
      startDate: startDate?.toISOString() ?? null,
      endDate: endDate?.toISOString() ?? null,
      renewalSequence,
      outcome,
      externalProcessNo: textValue(raw["公司流程号"]) || null,
    } : null;
    return { rowNumber: index + 2, raw, normalized, errors };
  });

  const validNormalized = normalizedRows.flatMap((row) => row.normalized ? [row.normalized] : []);
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  for (const row of validNormalized) {
    const key = historyImportRecordKey({ ...row, startDate: row.startDate ? new Date(row.startDate) : null });
    if (seenKeys.has(key)) duplicateKeys.add(key);
    seenKeys.add(key);
  }

  const promotionNos = validNormalized.filter((row) => row.decisionType === "PROMOTION").map((row) => row.recordNo);
  const salaryNos = validNormalized.filter((row) => row.decisionType === "SALARY_ADJUSTMENT").map((row) => row.recordNo);
  const rewardNos = validNormalized.filter((row) => ["REWARD", "QUARTERLY_REWARD", "ANNUAL_REWARD"].includes(row.decisionType)).map((row) => row.recordNo);
  const contractUserIds = validNormalized.filter((row) => row.decisionType === "CONTRACT_RENEWAL").map((row) => row.userId);
  const [existingPromotions, existingSalary, existingRewards, existingContracts] = await Promise.all([
    promotionNos.length ? prisma.promotionRecord.findMany({ where: { recordNo: { in: promotionNos } }, select: { recordNo: true } }) : [],
    salaryNos.length ? prisma.salaryAdjustmentRecord.findMany({ where: { recordNo: { in: salaryNos } }, select: { recordNo: true } }) : [],
    rewardNos.length ? prisma.rewardRecord.findMany({ where: { recordNo: { in: rewardNos } }, select: { recordNo: true } }) : [],
    contractUserIds.length ? prisma.employmentContractTerm.findMany({ where: { userId: { in: contractUserIds } }, select: { userId: true, startDate: true, renewalSequence: true } }) : [],
  ]);
  const existingKeys = new Set<string>([
    ...existingPromotions.map((row) => `PROMOTION:${row.recordNo}`),
    ...existingSalary.map((row) => `SALARY_ADJUSTMENT:${row.recordNo}`),
    ...existingRewards.map((row) => `REWARD:${row.recordNo}`),
    ...existingContracts.map((row) => historyImportRecordKey({ decisionType: "CONTRACT_RENEWAL", recordNo: "", ...row })),
  ]);
  for (const row of normalizedRows) {
    if (!row.normalized) continue;
    const key = historyImportRecordKey({ ...row.normalized, startDate: row.normalized.startDate ? new Date(row.normalized.startDate) : null });
    if (duplicateKeys.has(key)) row.errors.push("文件内存在重复记录");
    if (existingKeys.has(key)) row.errors.push("该正式履历已存在");
  }

  const invalidCount = normalizedRows.filter((row) => row.errors.length > 0).length;
  const batch = await prisma.talentImportBatch.create({
    data: {
      importType: "TALENT_HISTORY",
      fileName: file.name,
      fileSha256: createHash("sha256").update(buffer).digest("hex"),
      status: invalidCount > 0 ? "FAILED" : "VALIDATED",
      createdById: actor.id,
      summaryJson: JSON.stringify({ total: rows.length, valid: rows.length - invalidCount, invalid: invalidCount }),
    },
  });
  await prisma.talentImportRow.createMany({
    data: normalizedRows.map((row) => ({
      batchId: batch.id,
      rowNumber: row.rowNumber,
      rawDataJson: JSON.stringify(row.raw),
      normalizedDataJson: row.normalized ? JSON.stringify(row.normalized) : null,
      userId: row.normalized?.userId,
      status: row.errors.length > 0 ? "INVALID" : "VALID",
      errorMessagesJson: row.errors.length > 0 ? JSON.stringify(row.errors) : null,
    })),
  });
  await prisma.talentActionLog.create({
    data: { targetType: "TalentImportBatch", targetId: batch.id, action: "VALIDATE_HISTORY_IMPORT", actorId: actor.id, afterJson: batch.summaryJson },
  });
  revalidatePath("/talent/history");
  revalidatePath("/talent");
  if (textValue(formData.get("returnPath")) === "/talent") return;
  redirect(`/talent/history?importBatchId=${batch.id}`);
}

export async function confirmTalentHistoryImport(formData: FormData) {
  const actor = await historyManager();
  const batchId = textValue(formData.get("batchId"));
  const batch = await prisma.talentImportBatch.findFirst({ where: { id: batchId, importType: "TALENT_HISTORY", createdById: actor.id, deletedAt: null } });
  if (!batch || batch.status !== "VALIDATED") throw new Error("该导入批次不存在或不能确认");
  const importRows = await prisma.talentImportRow.findMany({ where: { batchId }, orderBy: { rowNumber: "asc" } });
  if (!importRows.length || importRows.some((row) => row.status !== "VALID" || !row.normalizedDataJson)) throw new Error("导入批次包含未通过预检的行");
  const normalizedRows = importRows.map((row) => ({ importRow: row, value: JSON.parse(row.normalizedDataJson!) as NormalizedHistoryRow }));
  const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(actor, orgPermissionModuleKeys.talent, talentAbilityKeys.manageHistory);
  const targetUsers = await prisma.user.findMany({ where: { id: { in: normalizedRows.map((row) => row.value.userId) }, isActive: true, deletedAt: null }, select: { id: true, orgNodeId: true } });
  if (targetUsers.length !== new Set(normalizedRows.map((row) => row.value.userId)).size || (authorizedOrgNodeIds !== null && targetUsers.some((row) => !row.orgNodeId || !authorizedOrgNodeIds.includes(row.orgNodeId)))) throw new Error("导入员工已不存在或不再属于可管理范围");

  await prisma.$transaction(async (tx) => {
    for (const { importRow, value } of normalizedRows) {
      const effectiveDate = new Date(value.effectiveDate);
      let targetType: string;
      let targetId: string;
      if (value.decisionType === "PROMOTION") {
        const row = await tx.promotionRecord.create({ data: { recordNo: value.recordNo, userId: value.userId, toJobLevelId: value.toJobLevelId, promotionType: value.promotionType, reason: value.reason, effectiveDate, sourceType: "MANUAL_IMPORT", externalProcessNo: value.externalProcessNo, resultStatus: "CONFIRMED", confirmedById: actor.id, confirmedAt: new Date(), createdById: actor.id } });
        targetType = "PromotionRecord"; targetId = row.id;
      } else if (value.decisionType === "CONTRACT_RENEWAL") {
        const row = await tx.employmentContractTerm.create({ data: { userId: value.userId, contractNo: value.contractNo ?? value.recordNo, startDate: new Date(value.startDate!), endDate: new Date(value.endDate!), renewalSequence: value.renewalSequence!, outcome: value.outcome!, sourceType: "MANUAL_IMPORT", resultStatus: "CONFIRMED", externalProcessNo: value.externalProcessNo, confirmedById: actor.id, confirmedAt: new Date(), createdById: actor.id } });
        targetType = "EmploymentContractTerm"; targetId = row.id;
      } else if (value.decisionType === "SALARY_ADJUSTMENT") {
        const adjustmentAmount = value.beforeSalary === null ? null : value.afterSalary! - value.beforeSalary;
        const adjustmentRate = value.beforeSalary ? Number(((adjustmentAmount! / value.beforeSalary) * 100).toFixed(4)) : null;
        const row = await tx.salaryAdjustmentRecord.create({ data: { recordNo: value.recordNo, userId: value.userId, beforeSalary: value.beforeSalary, afterSalary: value.afterSalary, adjustmentAmount, adjustmentRate, reason: value.reason, effectiveDate, sourceType: "MANUAL_IMPORT", externalProcessNo: value.externalProcessNo, resultStatus: "CONFIRMED", confirmedById: actor.id, confirmedAt: new Date(), createdById: actor.id } });
        targetType = "SalaryAdjustmentRecord"; targetId = row.id;
      } else {
        const row = await tx.rewardRecord.create({ data: { recordNo: value.recordNo, userId: value.userId, rewardLevel: value.rewardLevel!, rewardForm: value.rewardForm!, rewardRecipient: value.rewardRecipient!, rewardCycle: value.rewardCycle!, rewardPeriodYear: value.rewardPeriodYear!, rewardPeriodMonth: value.rewardPeriodMonth, rewardPeriodQuarter: value.rewardPeriodQuarter, rewardName: value.rewardName!, rewardAmount: value.rewardAmount!, rewardDescription: value.reason, effectiveDate, sourceType: "MANUAL_IMPORT", externalProcessNo: value.externalProcessNo, resultStatus: "CONFIRMED", confirmedById: actor.id, confirmedAt: new Date(), createdById: actor.id } });
        targetType = "RewardRecord"; targetId = row.id;
      }
      await tx.talentImportRow.update({ where: { id: importRow.id }, data: { status: "IMPORTED", importedTargetType: targetType, importedTargetId: targetId } });
      await tx.talentActionLog.create({ data: { targetType, targetId, action: "IMPORT_CONFIRMED_HISTORY", actorId: actor.id, afterJson: JSON.stringify({ batchId, rowNumber: importRow.rowNumber, decisionType: value.decisionType }) } });
    }
    await tx.talentImportBatch.update({ where: { id: batchId }, data: { status: "CONFIRMED", confirmedById: actor.id, confirmedAt: new Date() } });
  });
  revalidatePath("/talent/history");
  revalidatePath("/talent");
  if (textValue(formData.get("returnPath")) === "/talent") return;
  redirect(`/talent/history?importBatchId=${batchId}`);
}
