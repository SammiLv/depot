import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";

type Viewer = { id: string; roleType: RoleType; orgNodeId?: string | null };

async function canViewTarget(viewer: Viewer, userId: string) {
  if (viewer.roleType === "ADMIN") return true;
  const [viewerDepartment, targetDepartment] = await Promise.all([
    findNearestDepartmentOrgNodeId(viewer.orgNodeId),
    prisma.user.findUnique({ where: { id: userId }, select: { orgNodeId: true } }).then((user) => findNearestDepartmentOrgNodeId(user?.orgNodeId)),
  ]);
  return viewerDepartment != null && viewerDepartment === targetDepartment;
}

async function loadTalentKpiDeductionReminder(viewer: Viewer, userId: string, year: number, quarter: number) {
  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { orgNodeId: true } });
  const departmentOrgNodeId = targetUser?.orgNodeId ? await findNearestDepartmentOrgNodeId(targetUser.orgNodeId) : null;
  const [cycle, incidentSummary, canViewAssessment, canViewIncident] = await Promise.all([
    departmentOrgNodeId ? prisma.businessAssessmentCycle.findFirst({ where: { year, quarter, departmentOrgNodeId, status: "CONFIRMED", deletedAt: null }, select: { id: true, totalKpiScore: true } }) : null,
    prisma.workIncidentQuarterSummary.findUnique({ where: { userId_year_quarter: { userId, year, quarter } } }),
    canViewTarget(viewer, userId),
    canViewTarget(viewer, userId),
  ]);
  const assessmentSummary = cycle ? await prisma.businessAssessmentSummary.findUnique({ where: { cycleId_userId: { cycleId: cycle.id, userId } } }) : null;
  const assessment = assessmentSummary ? {
    earnedScore: assessmentSummary.earnedScore,
    maxScore: assessmentSummary.maxScore,
    penalty: Number((assessmentSummary.earnedScore - assessmentSummary.maxScore).toFixed(4)),
    message: `业务考核：实得 ${assessmentSummary.earnedScore}/${assessmentSummary.maxScore} 分，建议扣 ${Math.abs(assessmentSummary.earnedScore - assessmentSummary.maxScore)} 分`,
    canViewDetail: canViewAssessment,
    href: `/kpi?year=${year}&quarter=${quarter}&tab=business-assessment`,
  } : null;
  const incident = incidentSummary && incidentSummary.kpiPenalty < 0 ? {
    penalty: incidentSummary.kpiPenalty,
    cCount: incidentSummary.cCount,
    dCount: incidentSummary.dCount,
    hasSevereIncident: incidentSummary.hasSevereIncident,
    message: incidentSummary.hasSevereIncident ? "工作事故：存在 B/A/S 级事故，建议扣满 110 分" : `工作事故：C级 ${incidentSummary.cCount} 起、D级 ${incidentSummary.dCount} 起，建议扣 ${Math.abs(incidentSummary.kpiPenalty)} 分`,
    canViewDetail: canViewIncident,
    href: `/talent/incidents?year=${year}&quarter=${quarter}&userId=${userId}`,
  } : null;
  return { assessment, incident, hasReminder: Boolean(assessment || incident), loadFailed: false };
}

export async function getTalentKpiDeductionReminder(viewer: Viewer, userId: string, year: number, quarter: number) {
  try {
    return await loadTalentKpiDeductionReminder(viewer, userId, year, quarter);
  } catch (error) {
    console.error("人才扣分信息读取失败", { userId, year, quarter, error });
    return { assessment: null, incident: null, hasReminder: false, loadFailed: true };
  }
}
