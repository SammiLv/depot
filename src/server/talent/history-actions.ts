"use server";

import { revalidatePath } from "next/cache";
import type { PromotionOutcome, TalentDecisionType, TalentHistorySourceType } from "@prisma/client";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { isFeedbackEligibleForFormalResult } from "./decision-engine";
import { shouldSyncCurrentContract } from "./employee-profile";
import { isSuccessfulPromotionOutcome, promotionOutcomeValues } from "./promotion-outcome";
import { companyCoinAwardAmounts, isControlledCompanyCoinAward, rewardCycleLabels, rewardFormLabels, rewardLevelLabels, rewardRecipientLabels, type RewardCycle, type RewardForm, type RewardLevel, type RewardRecipient } from "./reward-types";

function required(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); if (!value) throw new Error(`${key} 不能为空`); return value; }
function optional(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim() || null; }
function optionalNumber(formData: FormData, key: string) { const raw = optional(formData, key); if (raw === null) return null; const value = Number(raw); if (!Number.isFinite(value)) throw new Error(`${key} 必须是数字`); return value; }
function recordKey(userId: string, key: string, isBatch: boolean) { return isBatch ? `${key}:${userId}` : key; }
function recordRequired(formData: FormData, userId: string, key: string, isBatch: boolean) { return required(formData, recordKey(userId, key, isBatch)); }
function recordOptional(formData: FormData, userId: string, key: string, isBatch: boolean) { return optional(formData, recordKey(userId, key, isBatch)); }
function recordOptionalNumber(formData: FormData, userId: string, key: string, isBatch: boolean) { return optionalNumber(formData, recordKey(userId, key, isBatch)); }
const supportedHistoryTypes = ["PROMOTION", "CONTRACT_RENEWAL", "SALARY_ADJUSTMENT", "REWARD"] as const;

function generateRecordNo(decisionType: (typeof supportedHistoryTypes)[number]) {
  const prefix: Record<(typeof supportedHistoryTypes)[number], string> = {
    PROMOTION: "PROMO",
    CONTRACT_RENEWAL: "TERM",
    SALARY_ADJUSTMENT: "SALARY",
    REWARD: "REWARD",
  };
  const time = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `${prefix[decisionType]}-${time}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}
async function manager() { const user = await requireCurrentUser(); const permission = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageHistory); if (!permission.hasPermission) throw new Error("没有人才履历管理权限"); return user; }
async function target(user: Awaited<ReturnType<typeof requireCurrentUser>>, userId: string) { const row = await prisma.user.findFirst({ where: { id: userId, isActive: true, deletedAt: null }, select: { id: true, orgNodeId: true } }); if (!row?.orgNodeId) throw new Error("员工不存在"); const ids = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageHistory); if (ids !== null && !ids.includes(row.orgNodeId)) throw new Error("不能管理该员工的正式履历"); return row; }
async function validateRecommendation(recommendationId: string | null, userId: string, decisionType: TalentDecisionType) { if (!recommendationId) return null; const row = await prisma.talentDecisionRecommendation.findFirst({ where: { id: recommendationId, userId, decisionType: decisionType === "REWARD" ? { in: ["REWARD", "QUARTERLY_REWARD", "ANNUAL_REWARD"] } : decisionType, deletedAt: null } }); if (!row) throw new Error("关联建议不存在或与员工/事项不匹配"); if (!isFeedbackEligibleForFormalResult(row.companyFeedbackStatus)) throw new Error("关联建议尚未被公司采纳"); return row; }

export async function createTalentHistoryRecord(formData: FormData) {
  const user = await manager();
  const submittedType = required(formData, "decisionType") as TalentDecisionType;
  if (!supportedHistoryTypes.includes(submittedType as (typeof supportedHistoryTypes)[number])) throw new Error("正式结果类型无效");
  const decisionType = submittedType as (typeof supportedHistoryTypes)[number];
  const sourceType = required(formData, "sourceType") as TalentHistorySourceType;
  if (!(["RECOMMENDATION", "COMPANY_SYSTEM", "MANUAL_IMPORT", "MANUAL_ENTRY"] as const).includes(sourceType)) throw new Error("来源类型无效");
  const batchUserIds = formData.getAll("selectedUserIds").map((value) => String(value).trim()).filter(Boolean);
  const legacyUserId = optional(formData, "userId");
  const userIds = [...new Set(batchUserIds.length ? batchUserIds : legacyUserId ? [legacyUserId] : [])];
  if (!userIds.length) throw new Error("请至少选择一位员工");
  const isBatch = batchUserIds.length > 0;
  const effectiveDate = new Date(required(formData, "effectiveDate"));
  if (Number.isNaN(effectiveDate.getTime())) throw new Error("生效日期无效");
  const recommendationIds = new Map<string, string | null>();
  for (const userId of userIds) {
    await target(user, userId);
    const recommendationId = recordOptional(formData, userId, "recommendationId", isBatch);
    await validateRecommendation(recommendationId, userId, decisionType);
    if (sourceType === "RECOMMENDATION" && !recommendationId) throw new Error("来源为人才决策建议时，每位员工都必须选择关联建议");
    recommendationIds.set(userId, recommendationId);
  }

  let commonRewardFields: { rewardLevel: RewardLevel; rewardForm: RewardForm; rewardRecipient: RewardRecipient; rewardCycle: RewardCycle; rewardPeriodYear: number; rewardPeriodMonth: number | null; rewardPeriodQuarter: number | null; rewardName: string } | null = null;
  if (decisionType === "REWARD") {
    const rewardLevel = required(formData, "rewardLevel") as RewardLevel;
    const rewardForm = required(formData, "rewardForm") as RewardForm;
    const rewardRecipient = required(formData, "rewardRecipient") as RewardRecipient;
    const rewardCycle = required(formData, "rewardCycle") as RewardCycle;
    if (!(rewardLevel in rewardLevelLabels)) throw new Error("奖励层级无效");
    if (!(rewardForm in rewardFormLabels)) throw new Error("奖励形式无效");
    if (!(rewardRecipient in rewardRecipientLabels)) throw new Error("奖励对象无效");
    if (!(rewardCycle in rewardCycleLabels)) throw new Error("奖励周期无效");

    let rewardPeriodYear: number;
    let rewardPeriodMonth: number | null = null;
    let rewardPeriodQuarter: number | null = null;
    if (rewardCycle === "MONTHLY" || rewardCycle === "OTHER") {
      const match = /^(\d{4})-(\d{2})$/.exec(required(formData, "rewardPeriodMonthValue"));
      if (!match) throw new Error("请选择有效的奖励期间");
      rewardPeriodYear = Number(match[1]);
      rewardPeriodMonth = Number(match[2]);
      if (rewardPeriodMonth < 1 || rewardPeriodMonth > 12) throw new Error("奖励月份无效");
    } else {
      rewardPeriodYear = Number(required(formData, "rewardPeriodYear"));
      if (rewardCycle === "QUARTERLY") rewardPeriodQuarter = Number(required(formData, "rewardPeriodQuarter"));
    }
    if (!Number.isInteger(rewardPeriodYear) || rewardPeriodYear < 2000 || rewardPeriodYear > 2200) throw new Error("奖励年份无效");
    if (rewardPeriodQuarter !== null && ![1, 2, 3, 4].includes(rewardPeriodQuarter)) throw new Error("奖励季度无效");

    const rewardName = required(formData, "rewardName");
    if (isControlledCompanyCoinAward(rewardLevel, rewardForm, rewardCycle) && !companyCoinAwardAmounts(rewardName, rewardCycle).length) throw new Error("请选择公司竞币奖励名称");
    commonRewardFields = { rewardLevel, rewardForm, rewardRecipient, rewardCycle, rewardPeriodYear, rewardPeriodMonth, rewardPeriodQuarter, rewardName };
  }

  await prisma.$transaction(async (tx) => {
    for (const userId of userIds) {
      const recommendationId = recommendationIds.get(userId) ?? null;
      const common = { recordNo: generateRecordNo(decisionType), userId, effectiveDate, recommendationId, sourceType, externalProcessNo: recordOptional(formData, userId, "externalProcessNo", isBatch), resultStatus: "CONFIRMED" as const, confirmedById: user.id, confirmedAt: new Date(), createdById: user.id };
      let targetType = "";
      let targetId = "";

      if (decisionType === "PROMOTION") {
        const profile = await tx.employeeTalentProfile.findFirst({ where: { userId, deletedAt: null } });
        const toJobLevelId = recordRequired(formData, userId, "toJobLevelId", isBatch);
        const outcome = recordRequired(formData, userId, "promotionOutcome", isBatch) as PromotionOutcome;
        if (!promotionOutcomeValues.includes(outcome)) throw new Error("晋升结果无效");
        const row = await tx.promotionRecord.create({ data: { ...common, fromJobLevelId: profile?.jobLevelId, toJobLevelId, promotionType: recordOptional(formData, userId, "promotionType", isBatch), outcome, reason: recordOptional(formData, userId, "reason", isBatch) } });
        if (isSuccessfulPromotionOutcome(outcome)) await tx.employeeTalentProfile.upsert({ where: { userId }, update: { jobLevelId: toJobLevelId, updatedById: user.id }, create: { userId, jobLevelId: toJobLevelId, updatedById: user.id } });
        targetType = "PromotionRecord";
        targetId = row.id;
      }
      else if (decisionType === "CONTRACT_RENEWAL") {
        const startDate = effectiveDate;
        const endDate = new Date(recordRequired(formData, userId, "endDate", isBatch));
        if (Number.isNaN(endDate.getTime())) throw new Error("请填写有效的新聘期结束日期");
        if (endDate < startDate) throw new Error("聘期结束日不能早于开始日");
        const renewalSequence = Number(recordRequired(formData, userId, "renewalSequence", isBatch));
        if (!Number.isInteger(renewalSequence) || renewalSequence < 1) throw new Error("聘期期数必须是大于或等于1的整数");
        const outcome = recordRequired(formData, userId, "outcome", isBatch) as "RENEWED" | "NOT_RENEWED" | "EXTENDED" | "TERMINATED";
        if (!(["RENEWED", "NOT_RENEWED", "EXTENDED", "TERMINATED"] as const).includes(outcome)) throw new Error("续签结果无效");
        const row = await tx.employmentContractTerm.create({ data: { userId, contractNo: null, startDate, endDate, renewalSequence, outcome, resultStatus: "CONFIRMED", recommendationId, sourceType, externalProcessNo: common.externalProcessNo, confirmedById: user.id, confirmedAt: common.confirmedAt, createdById: user.id } });
        if (shouldSyncCurrentContract(outcome)) {
          await tx.employeeTalentProfile.upsert({ where: { userId }, update: { currentContractStartAt: startDate, currentContractEndAt: endDate, currentContractSequence: renewalSequence, updatedById: user.id, deletedAt: null }, create: { userId, currentContractStartAt: startDate, currentContractEndAt: endDate, currentContractSequence: renewalSequence, updatedById: user.id } });
          await tx.user.update({ where: { id: userId }, data: { contractRenewAt: endDate } });
        }
        targetType = "EmploymentContractTerm";
        targetId = row.id;
      }
      else if (decisionType === "SALARY_ADJUSTMENT") {
        const profile = await tx.employeeTalentProfile.findFirst({ where: { userId, deletedAt: null } });
        const afterSalary = recordOptionalNumber(formData, userId, "afterSalary", isBatch);
        if (afterSalary === null || afterSalary < 0 || !Number.isInteger(afterSalary)) throw new Error("调整后薪资必须为非负整数");
        const beforeSalary = profile?.currentSalary ?? recordOptionalNumber(formData, userId, "beforeSalary", isBatch);
        const row = await tx.salaryAdjustmentRecord.create({ data: { ...common, beforeSalary, afterSalary, adjustmentAmount: beforeSalary === null ? null : afterSalary - beforeSalary, adjustmentRate: beforeSalary ? Number((((afterSalary - beforeSalary) / beforeSalary) * 100).toFixed(4)) : null, reason: recordOptional(formData, userId, "reason", isBatch) } });
        await tx.employeeTalentProfile.upsert({ where: { userId }, update: { currentSalary: afterSalary, updatedById: user.id }, create: { userId, currentSalary: afterSalary, updatedById: user.id } });
        targetType = "SalaryAdjustmentRecord";
        targetId = row.id;
      }
      else if (decisionType === "REWARD") {
        if (!commonRewardFields) throw new Error("奖励公共字段缺失");
        const { rewardLevel, rewardForm, rewardRecipient, rewardCycle, rewardPeriodYear, rewardPeriodMonth, rewardPeriodQuarter, rewardName } = commonRewardFields;

        const rewardAmount = recordOptionalNumber(formData, userId, "rewardAmount", isBatch);
        if (rewardAmount === null || !Number.isInteger(rewardAmount) || rewardAmount <= 0) throw new Error("奖励金额必须是大于0的整数");

        const row = await tx.rewardRecord.create({ data: { ...common, rewardLevel, rewardForm, rewardRecipient, rewardCycle, rewardPeriodYear, rewardPeriodMonth, rewardPeriodQuarter, rewardName, rewardAmount, rewardDescription: recordOptional(formData, userId, "reason", isBatch) } });
        targetType = "RewardRecord";
        targetId = row.id;
      }
      else throw new Error("正式结果类型无效");

      await tx.talentActionLog.create({ data: { targetType, targetId, action: "CREATE_CONFIRMED_HISTORY", actorId: user.id, afterJson: JSON.stringify({ decisionType, recordNo: common.recordNo, userId, recommendationId, batchSize: userIds.length }) } });
    }
  });
  revalidatePath("/talent/history"); revalidatePath("/talent/employees"); revalidatePath("/talent/recommendations"); revalidatePath("/talent");
}

export async function voidTalentHistoryRecord(formData: FormData) {
  const user = await manager(); const id = required(formData, "id"); const decisionType = required(formData, "decisionType") as TalentDecisionType; const voidReason = required(formData, "voidReason");
  const recordOwner = decisionType === "PROMOTION" ? await prisma.promotionRecord.findUnique({ where: { id }, select: { userId: true } })
    : decisionType === "SALARY_ADJUSTMENT" ? await prisma.salaryAdjustmentRecord.findUnique({ where: { id }, select: { userId: true } })
      : decisionType === "CONTRACT_RENEWAL" ? await prisma.employmentContractTerm.findUnique({ where: { id }, select: { userId: true } })
        : decisionType === "REWARD" ? await prisma.rewardRecord.findUnique({ where: { id }, select: { userId: true } }) : null;
  if (!recordOwner) throw new Error("履历记录不存在"); await target(user, recordOwner.userId);
  await prisma.$transaction(async (tx) => {
    if (decisionType === "PROMOTION") {
      const row = await tx.promotionRecord.findUnique({ where: { id } });
      if (!row || row.resultStatus !== "CONFIRMED") throw new Error("晋升记录不存在或已作废");
      if (isSuccessfulPromotionOutcome(row.outcome)) {
        const newer = await tx.promotionRecord.count({ where: { userId: row.userId, outcome: "SUCCESS", resultStatus: "CONFIRMED", deletedAt: null, effectiveDate: { gt: row.effectiveDate } } });
        if (newer) throw new Error("只能作废该员工最新的成功晋升记录");
      }
      await tx.promotionRecord.update({ where: { id }, data: { resultStatus: "VOIDED", voidReason } });
      if (isSuccessfulPromotionOutcome(row.outcome)) await tx.employeeTalentProfile.updateMany({ where: { userId: row.userId, deletedAt: null }, data: { jobLevelId: row.fromJobLevelId, updatedById: user.id } });
    }
    else if (decisionType === "SALARY_ADJUSTMENT") { const row = await tx.salaryAdjustmentRecord.findUnique({ where: { id } }); if (!row || row.resultStatus !== "CONFIRMED") throw new Error("加薪记录不存在或已作废"); const newer = await tx.salaryAdjustmentRecord.count({ where: { userId: row.userId, resultStatus: "CONFIRMED", deletedAt: null, effectiveDate: { gt: row.effectiveDate } } }); if (newer) throw new Error("只能作废该员工最新的加薪记录"); await tx.salaryAdjustmentRecord.update({ where: { id }, data: { resultStatus: "VOIDED", voidReason } }); await tx.employeeTalentProfile.updateMany({ where: { userId: row.userId, deletedAt: null }, data: { currentSalary: row.beforeSalary, updatedById: user.id } }); }
    else if (decisionType === "CONTRACT_RENEWAL") { const row = await tx.employmentContractTerm.findUnique({ where: { id } }); if (!row || row.resultStatus !== "CONFIRMED") throw new Error("聘期记录不存在或已作废"); await tx.employmentContractTerm.update({ where: { id }, data: { resultStatus: "VOIDED", voidReason } }); }
    else if (decisionType === "REWARD") { const row = await tx.rewardRecord.findUnique({ where: { id } }); if (!row || row.resultStatus !== "CONFIRMED") throw new Error("奖励记录不存在或已作废"); await tx.rewardRecord.update({ where: { id }, data: { resultStatus: "VOIDED", voidReason } }); }
    else throw new Error("履历类型无效");
    await tx.talentActionLog.create({ data: { targetType: `${decisionType}_HISTORY`, targetId: id, action: "VOID", actorId: user.id, afterJson: JSON.stringify({ voidReason }) } });
  }); revalidatePath("/talent/history"); revalidatePath("/talent");
}
