"use server";

import { revalidatePath } from "next/cache";
import type { TalentDecisionType } from "@prisma/client";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { decisionControlledRestrictionTypes, decisionRestrictionTypes, hasBlockingQualification } from "./decision-engine";

function required(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); if (!value) throw new Error(`${key} 不能为空`); return value; }
function optional(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim() || null; }
async function manager() { const user = await requireCurrentUser(); const permission = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageRecommendation); if (!permission.hasPermission) throw new Error("没有人才决策建议管理权限"); return user; }
async function targetContext(user: Awaited<ReturnType<typeof requireCurrentUser>>, userId: string) { const target = await prisma.user.findFirst({ where: { id: userId, isActive: true, deletedAt: null }, select: { id: true, name: true, orgNodeId: true } }); if (!target?.orgNodeId) throw new Error("员工不存在或未分配组织"); const allowed = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageRecommendation); if (allowed !== null && !allowed.includes(target.orgNodeId)) throw new Error("不能管理该员工的决策建议"); const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(target.orgNodeId); if (!departmentOrgNodeId) throw new Error("员工所属部门无效"); return { target, departmentOrgNodeId }; }

async function buildEvidence(userId: string, departmentOrgNodeId: string, decisionType: TalentDecisionType) {
  const now = new Date();
  const [profile, kpi, reviewParticipant, assessmentCycle, restrictions] = await Promise.all([
    prisma.employeeTalentProfile.findFirst({ where: { userId, deletedAt: null } }),
    prisma.personalKpi.findFirst({ where: { userId, status: "COMPLETED", deletedAt: null }, orderBy: [{ year: "desc" }, { quarter: "desc" }], select: { year: true, quarter: true, finalScore: true } }),
    prisma.talentReviewParticipant.findFirst({ where: { userId, status: "CONFIRMED" }, orderBy: { confirmedAt: "desc" }, select: { id: true, cycleId: true } }),
    prisma.businessAssessmentCycle.findFirst({ where: { departmentOrgNodeId, status: "CONFIRMED", deletedAt: null }, orderBy: [{ year: "desc" }, { quarter: "desc" }], select: { id: true, year: true, quarter: true } }),
    prisma.incidentRestriction.findMany({ where: { userId, isActive: true, status: "ACTIVE", effectiveFrom: { lte: now }, AND: [{ OR: [{ controlledType: { in: decisionControlledRestrictionTypes[decisionType] } }, { controlledType: null, restrictionType: { in: decisionRestrictionTypes[decisionType] } }] }, { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }] }, select: { restrictionType: true, controlledType: true, effectiveTo: true, incidentId: true } }),
  ]);
  const [review, assessment] = await Promise.all([
    reviewParticipant ? prisma.talentReviewResult.findUnique({ where: { participantId: reviewParticipant.id }, select: { gradeCode: true, totalScore: true, nineBoxCode: true } }) : null,
    assessmentCycle ? prisma.businessAssessmentSummary.findUnique({ where: { cycleId_userId: { cycleId: assessmentCycle.id, userId } }, select: { earnedScore: true, maxScore: true, isOverallPassed: true } }) : null,
  ]);
  const evidence = { capturedAt: now.toISOString(), profile: profile ? { jobLevelId: profile.jobLevelId, currentSalary: profile.currentSalary } : null, kpi, talentReview: reviewParticipant && review ? { cycleId: reviewParticipant.cycleId, ...review } : null, businessAssessment: assessmentCycle && assessment ? { year: assessmentCycle.year, quarter: assessmentCycle.quarter, ...assessment } : null, activeRestrictions: restrictions };
  const rules = [
    { code: "NO_ACTIVE_RESTRICTION", label: "无当前决策限制", passed: restrictions.length === 0, blocking: true, detail: restrictions.length ? restrictions.map((row) => row.restrictionType).join("、") : "未发现有效限制" },
    { code: "KPI_EVIDENCE", label: "已取得有效KPI", passed: Boolean(kpi?.finalScore != null), blocking: false, detail: kpi?.finalScore != null ? `${kpi.year} Q${kpi.quarter}：${kpi.finalScore}分` : "暂无已完成KPI" },
    { code: "TALENT_REVIEW_EVIDENCE", label: "已取得人才盘点", passed: Boolean(review), blocking: false, detail: review ? `${review.gradeCode}级 / ${review.totalScore}分` : "暂无已确认盘点" },
    { code: "ASSESSMENT_PASSED", label: "业务考核综合及格", passed: Boolean(assessment?.isOverallPassed), blocking: false, detail: assessment ? `${assessment.earnedScore}/${assessment.maxScore}分` : "暂无已确认考核" },
  ];
  return { evidence, qualification: { passed: !hasBlockingQualification(rules), rules } };
}

export async function createTalentDecisionRecommendation(formData: FormData) {
  const user = await manager(); const userId = required(formData, "userId"); const { target, departmentOrgNodeId } = await targetContext(user, userId); const decisionType = required(formData, "decisionType") as TalentDecisionType; if (!Object.keys(decisionRestrictionTypes).includes(decisionType)) throw new Error("决策类型无效"); const snapshot = await buildEvidence(userId, departmentOrgNodeId, decisionType);
  const targetJobLevelId = optional(formData, "targetJobLevelId");
  if (decisionType === "PROMOTION" && !targetJobLevelId) throw new Error("晋升建议必须填写目标职级");
  const content = { conclusion: required(formData, "conclusion"), summary: required(formData, "summary"), targetJobLevelId, suggestedRate: optional(formData, "suggestedRate"), rewardName: optional(formData, "rewardName") };
  const row = await prisma.talentDecisionRecommendation.create({ data: { recommendationNo: required(formData, "recommendationNo"), userId, departmentOrgNodeId, decisionType, status: "PROPOSED", recommendationContentJson: JSON.stringify(content), evidenceSnapshotJson: JSON.stringify(snapshot.evidence), qualificationResultJson: JSON.stringify(snapshot.qualification), externalProcessNo: optional(formData, "externalProcessNo"), proposedById: user.id } });
  await prisma.talentActionLog.create({ data: { targetType: "TalentDecisionRecommendation", targetId: row.id, action: "PROPOSE", actorId: user.id, afterJson: JSON.stringify({ ...row, targetName: target.name }) } }); revalidatePath("/talent/recommendations"); revalidatePath("/talent");
}

export async function updateTalentRecommendationFeedback(formData: FormData) {
  const user = await manager(); const id = required(formData, "id"); const row = await prisma.talentDecisionRecommendation.findFirst({ where: { id, deletedAt: null } }); if (!row) throw new Error("决策建议不存在"); await targetContext(user, row.userId); const companyFeedbackStatus = required(formData, "companyFeedbackStatus") as "PENDING" | "ADOPTED" | "ADJUSTED_ADOPTION" | "REJECTED" | "DEFERRED"; if (!(["PENDING","ADOPTED","ADJUSTED_ADOPTION","REJECTED","DEFERRED"] as const).includes(companyFeedbackStatus)) throw new Error("公司反馈状态无效"); const closed = ["ADOPTED","ADJUSTED_ADOPTION","REJECTED"].includes(companyFeedbackStatus); await prisma.talentDecisionRecommendation.update({ where: { id }, data: { companyFeedbackStatus, companyFeedbackContent: optional(formData, "companyFeedbackContent"), externalProcessNo: optional(formData, "externalProcessNo") ?? row.externalProcessNo, status: closed ? "CLOSED" : companyFeedbackStatus === "DEFERRED" ? "DEFERRED" : row.status, closedById: closed ? user.id : null, closedAt: closed ? new Date() : null } }); await prisma.talentActionLog.create({ data: { targetType: "TalentDecisionRecommendation", targetId: id, action: "UPDATE_COMPANY_FEEDBACK", actorId: user.id, beforeJson: JSON.stringify(row), afterJson: JSON.stringify({ companyFeedbackStatus }) } }); revalidatePath("/talent/recommendations"); revalidatePath("/talent");
}
