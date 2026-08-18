import type { EmploymentContractOutcome, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildUserWhereByPermission, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { promotionOutcomeLabels } from "./promotion-outcome";
import { rewardFormLabels, rewardLevelLabels, rewardRecipientLabels, type RewardCycle, type RewardForm, type RewardLevel, type RewardRecipient } from "./reward-types";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };
const contractOutcomeLabels: Record<EmploymentContractOutcome, string> = {
  RENEWED: "已续签",
  NOT_RENEWED: "不续签",
  EXTENDED: "延期",
  TERMINATED: "终止",
};
function parseJson(value: string) { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }
function promotionLevel(levelId: string | null, levelName: Map<string, string>) {
  return (levelId ? levelName.get(levelId) : null) || "—";
}
function rewardPeriod(row: { rewardCycle: RewardCycle; rewardPeriodYear: number; rewardPeriodMonth: number | null; rewardPeriodQuarter: number | null }) {
  if (row.rewardCycle === "QUARTERLY") return `${row.rewardPeriodYear}年第${row.rewardPeriodQuarter}季度`;
  if (row.rewardCycle === "ANNUAL") return `${row.rewardPeriodYear}年度`;
  return `${row.rewardPeriodYear}年${row.rewardPeriodMonth}月`;
}
async function visibleUsers(viewer: Viewer, abilityKey: (typeof talentAbilityKeys)[keyof typeof talentAbilityKeys]) {
  const where = await buildUserWhereByPermission(viewer, orgPermissionModuleKeys.talent, abilityKey);
  return prisma.user.findMany({ where, select: { id: true, name: true, orgNodeId: true }, orderBy: { name: "asc" } });
}

export async function getTalentRecommendationData(viewer: Viewer) {
  const [users, manage] = await Promise.all([visibleUsers(viewer, talentAbilityKeys.viewRecommendation), resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.manageRecommendation)]);
  const [rows, levels] = await Promise.all([
    prisma.talentDecisionRecommendation.findMany({ where: { userId: { in: users.map((row) => row.id) }, deletedAt: null }, orderBy: { proposedAt: "desc" } }),
    prisma.jobLevel.findMany({ where: { deletedAt: null }, select: { id: true, code: true }, orderBy: [{ displayOrder: "asc" }, { stepOrder: "asc" }] }),
  ]);
  return { users, levels, canManage: manage.hasPermission, rows: rows.map((row) => ({ ...row, content: parseJson(row.recommendationContentJson), evidence: parseJson(row.evidenceSnapshotJson), qualification: parseJson(row.qualificationResultJson) })) };
}

export async function getTalentHistoryData(viewer: Viewer, selectedUserId?: string, selectedImportBatchId?: string) {
  const [users, manage, sensitive] = await Promise.all([visibleUsers(viewer, talentAbilityKeys.viewHistory), resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.manageHistory), resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewSensitive)]);
  const userIds = selectedUserId && users.some((row) => row.id === selectedUserId) ? [selectedUserId] : users.map((row) => row.id); const where = { userId: { in: userIds }, deletedAt: null };
  const [promotions, contracts, salaryAdjustments, rewards, recommendations, levels, profiles, importBatches] = await Promise.all([
    prisma.promotionRecord.findMany({ where, orderBy: { effectiveDate: "desc" } }),
    prisma.employmentContractTerm.findMany({ where, orderBy: { startDate: "desc" } }),
    prisma.salaryAdjustmentRecord.findMany({ where, orderBy: { effectiveDate: "desc" } }),
    prisma.rewardRecord.findMany({ where, orderBy: { effectiveDate: "desc" } }),
    prisma.talentDecisionRecommendation.findMany({ where: { userId: { in: userIds }, deletedAt: null, companyFeedbackStatus: { in: ["ADOPTED", "ADJUSTED_ADOPTION"] } }, select: { id: true, recommendationNo: true, userId: true, decisionType: true } }),
    prisma.jobLevel.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.employeeTalentProfile.findMany({ where: { userId: { in: users.map((row) => row.id) }, deletedAt: null }, select: { userId: true, jobLevelId: true } }),
    manage.hasPermission ? prisma.talentImportBatch.findMany({ where: { importType: "TALENT_HISTORY", createdById: viewer.id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }) : [],
  ]);
  const selectedImportBatch = selectedImportBatchId ? importBatches.find((row) => row.id === selectedImportBatchId) ?? null : null;
  const importRows = selectedImportBatch ? await prisma.talentImportRow.findMany({ where: { batchId: selectedImportBatch.id }, orderBy: { rowNumber: "asc" } }) : [];
  const levelName = new Map(levels.map((row) => [row.id, row.code]));
  const currentLevelId = new Map(profiles.map((row) => [row.userId, row.jobLevelId]));
  const timeline = [
    ...promotions.map((row) => ({ id: row.id, recordNo: row.recordNo, userId: row.userId, type: "PROMOTION" as const, effectiveDate: row.effectiveDate, result: `${promotionLevel(row.fromJobLevelId, levelName)} → ${promotionLevel(row.toJobLevelId, levelName)} · ${promotionOutcomeLabels[row.outcome]}`, sourceType: row.sourceType, recommendationId: row.recommendationId, status: row.resultStatus })),
    ...contracts.map((row) => ({ id: row.id, recordNo: row.contractNo ?? `HT-${row.id.slice(-6)}`, userId: row.userId, type: "CONTRACT_RENEWAL" as const, effectiveDate: row.startDate, result: `${row.startDate.toLocaleDateString("zh-CN")} 至 ${row.endDate.toLocaleDateString("zh-CN")} · ${row.outcome ? contractOutcomeLabels[row.outcome] : "聘期"}`, sourceType: row.sourceType, recommendationId: row.recommendationId, status: row.resultStatus })),
    ...salaryAdjustments.map((row) => ({ id: row.id, recordNo: row.recordNo, userId: row.userId, type: "SALARY_ADJUSTMENT" as const, effectiveDate: row.effectiveDate, result: sensitive.hasPermission ? `${row.beforeSalary ?? "—"} → ${row.afterSalary ?? "—"}${row.adjustmentRate != null ? `（${row.adjustmentRate}%）` : ""}` : "已发生加薪（金额不可见）", sourceType: row.sourceType, recommendationId: row.recommendationId, status: row.resultStatus })),
    ...rewards.map((row) => ({ id: row.id, recordNo: row.recordNo, userId: row.userId, type: "REWARD" as const, effectiveDate: row.effectiveDate, result: `${rewardLevelLabels[row.rewardLevel as RewardLevel]} · ${rewardFormLabels[row.rewardForm as RewardForm]} · ${rewardRecipientLabels[row.rewardRecipient as RewardRecipient]} · ${rewardPeriod(row)} · ${row.rewardName}${sensitive.hasPermission ? `（${row.rewardAmount}元）` : ""}`, sourceType: row.sourceType, recommendationId: row.recommendationId, status: row.resultStatus })),
  ].sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
  return {
    users: users.map((row) => ({ ...row, currentJobLevelCode: promotionLevel(currentLevelId.get(row.id) ?? null, levelName) })),
    canManage: manage.hasPermission,
    canViewSensitive: sensitive.hasPermission,
    selectedUserId: selectedUserId && userIds.length === 1 ? selectedUserId : "",
    recommendations,
    levels,
    timeline,
    importBatches: importBatches.map((row) => ({ ...row, summary: parseJson(row.summaryJson ?? "{}") })),
    selectedImportBatch: selectedImportBatch ? { ...selectedImportBatch, summary: parseJson(selectedImportBatch.summaryJson ?? "{}") } : null,
    importRows: importRows.map((row) => ({ ...row, normalized: parseJson(row.normalizedDataJson ?? "{}"), errors: row.errorMessagesJson ? JSON.parse(row.errorMessagesJson) as string[] : [] })),
    counts: { promotion: promotions.length, contract: contracts.length, salary: salaryAdjustments.length, reward: rewards.length },
  };
}
