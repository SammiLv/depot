"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { buildIncidentRestrictions, calculateIncidentPenalty } from "./incident-engine";

function required(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); if (!value) throw new Error(`${key} 不能为空`); return value; }
async function manager() { const user = await requireCurrentUser(); const permission = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageWorkIncident); if (!permission.hasPermission) throw new Error("没有工作事故管理权限"); return user; }
async function assertDepartment(user: Awaited<ReturnType<typeof requireCurrentUser>>, departmentOrgNodeId: string) { const ids = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageWorkIncident); if (ids !== null && !ids.includes(departmentOrgNodeId)) throw new Error("不能管理该部门的工作事故"); }
function period(date: Date) { return { year: date.getFullYear(), quarter: Math.floor(date.getMonth() / 3) + 1 }; }

async function recomputeQuarter(userId: string, year: number, quarter: number) {
  const start = new Date(year, (quarter - 1) * 3, 1); const end = new Date(year, quarter * 3, 1);
  const people = await prisma.workIncidentResponsiblePerson.findMany({ where: { userId }, select: { incidentId: true } });
  const incidents = await prisma.workIncident.findMany({ where: { id: { in: people.map((row) => row.incidentId) }, status: "CONFIRMED", occurredAt: { gte: start, lt: end } }, select: { level: true } });
  const summary = calculateIncidentPenalty(incidents.map((row) => row.level));
  await prisma.workIncidentQuarterSummary.upsert({ where: { userId_year_quarter: { userId, year, quarter } }, update: { ...summary, calculatedAt: new Date() }, create: { userId, year, quarter, ...summary } });
}

export async function createWorkIncident(formData: FormData) {
  const user = await manager(); const departmentOrgNodeId = required(formData, "departmentOrgNodeId"); await assertDepartment(user, departmentOrgNodeId);
  const targetUserId = required(formData, "userId"); const target = await prisma.user.findFirst({ where: { id: targetUserId, isActive: true, deletedAt: null }, select: { orgNodeId: true } }); if (!target?.orgNodeId) throw new Error("责任人不存在"); const allowed = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageWorkIncident); if (allowed !== null && !allowed.includes(target.orgNodeId)) throw new Error("不能录入该员工的工作事故");
  const occurredAt = new Date(required(formData, "occurredAt")); if (Number.isNaN(occurredAt.getTime())) throw new Error("事故日期无效"); const level = required(formData, "level") as "S" | "A" | "B" | "C" | "D"; if (!(["S","A","B","C","D"] as const).includes(level)) throw new Error("事故等级无效");
  const now = new Date(); const row = await prisma.$transaction(async (tx) => { const incident = await tx.workIncident.create({ data: { incidentNo: required(formData, "incidentNo"), title: required(formData, "title"), description: required(formData, "description"), occurredAt, departmentOrgNodeId, level, status: "CONFIRMED", confirmedById: user.id, confirmedAt: now, externalReferenceNo: String(formData.get("externalReferenceNo") ?? "").trim() || null, createdById: user.id } }); await tx.workIncidentResponsiblePerson.create({ data: { incidentId: incident.id, userId: targetUserId, responsibilityRate: 100, isPrimary: true, confirmedFact: String(formData.get("confirmedFact") ?? "").trim() || null } }); const descriptions: Record<typeof level, string> = { S: "解除劳动合同；情节严重者追究法律责任", A: "扣除当年度年终奖；1年内不予晋升、加薪和季度奖励", B: "工作事故项扣满110分；1年内不予晋升、加薪和季度奖励", C: "工作事故项扣40分；半年内不予晋升、加薪和季度奖励", D: "工作事故项扣10分；取消当季度单项奖和季度奖" }; const restrictions = buildIncidentRestrictions(level, now); await tx.workIncidentAction.create({ data: { incidentId: incident.id, actionType: "COMPANY_RULE", description: descriptions[level], effectiveFrom: now, effectiveTo: restrictions.map((item) => item.effectiveTo).filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null, createdById: user.id } }); await tx.incidentRestriction.createMany({ data: restrictions.map((restriction) => ({ incidentId: incident.id, userId: targetUserId, restrictionType: restriction.legacyType, controlledType: restriction.controlledType, status: "ACTIVE", sourceType: "WORK_INCIDENT", sourceRecordId: incident.id, effectiveFrom: restriction.effectiveFrom, effectiveTo: restriction.effectiveTo, ruleSnapshotJson: JSON.stringify({ policy: "部门绩效管理机制", version: "V3.0", incidentLevel: level, restrictionType: restriction.controlledType }) })) }); return incident; });
  const { year, quarter } = period(occurredAt); await recomputeQuarter(targetUserId, year, quarter); await prisma.talentActionLog.create({ data: { targetType: "WorkIncident", targetId: row.id, action: "CREATE_AND_CONFIRM", actorId: user.id, afterJson: JSON.stringify(row) } }); revalidatePath("/talent/incidents"); revalidatePath("/talent"); revalidatePath("/kpi");
}

export async function voidWorkIncident(formData: FormData) {
  const user = await manager(); const id = required(formData, "id"); const incident = await prisma.workIncident.findUnique({ where: { id } }); if (!incident || incident.status !== "CONFIRMED") throw new Error("事故不存在或不能作废"); await assertDepartment(user, incident.departmentOrgNodeId); const people = await prisma.workIncidentResponsiblePerson.findMany({ where: { incidentId: id } }); const releasedAt = new Date(); await prisma.$transaction([prisma.workIncident.update({ where: { id }, data: { status: "VOIDED", voidedById: user.id, voidedAt: releasedAt, voidReason: required(formData, "voidReason") } }), prisma.incidentRestriction.updateMany({ where: { incidentId: id, isActive: true }, data: { isActive: false, status: "VOIDED", releasedById: user.id, releasedAt, releaseReason: "事故已作废" } })]); const { year, quarter } = period(incident.occurredAt); for (const person of people) await recomputeQuarter(person.userId, year, quarter); revalidatePath("/talent/incidents"); revalidatePath("/talent"); revalidatePath("/kpi");
}
