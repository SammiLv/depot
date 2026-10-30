"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { calculateDecisionCycleEvidence } from "./decision-cycle-service";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} 不能为空`);
  return value;
}

async function manager() {
  const user = await requireCurrentUser();
  const permission = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageRecommendation);
  if (!permission.hasPermission) throw new Error("没有人才决策批次管理权限");
  return user;
}

async function assertDepartmentAccess(user: Awaited<ReturnType<typeof requireCurrentUser>>, departmentOrgNodeId: string) {
  const allowed = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageRecommendation);
  if (allowed !== null && !allowed.includes(departmentOrgNodeId)) throw new Error("不能管理该部门的决策批次");
}

async function manageableCycle(user: Awaited<ReturnType<typeof requireCurrentUser>>, cycleId: string) {
  const cycle = await prisma.talentDecisionCycle.findFirst({ where: { id: cycleId, deletedAt: null } });
  if (!cycle) throw new Error("决策批次不存在");
  await assertDepartmentAccess(user, cycle.departmentOrgNodeId);
  return cycle;
}

export async function calculateTalentDecisionCycle(formData: FormData) {
  const user = await manager();
  const cycleId = required(formData, "cycleId");
  const cycle = await manageableCycle(user, cycleId);
  await calculateDecisionCycleEvidence(cycleId, user.id);
  await prisma.talentActionLog.create({
    data: {
      targetType: "TalentDecisionCycle",
      targetId: cycleId,
      action: "CALCULATE",
      actorId: user.id,
      afterJson: JSON.stringify({ status: "PENDING_CONFIRMATION" }),
      remark: `计算候选池证据：${cycle.name}`,
    },
  });
  revalidatePath("/talent/recommendations");
}

export async function confirmTalentDecisionCycle(formData: FormData) {
  const user = await manager();
  const cycleId = required(formData, "cycleId");
  const cycle = await manageableCycle(user, cycleId);
  if (cycle.status !== "PENDING_CONFIRMATION") throw new Error("请先完成候选池证据计算");
  const resultCount = await prisma.talentDecisionEmployeeResult.count({ where: { cycleId } });
  if (resultCount === 0) throw new Error("候选池为空，不能确认批次");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.talentDecisionEmployeeResult.updateMany({ where: { cycleId }, data: { frozenAt: now } });
    await tx.talentDecisionCycle.update({ where: { id: cycleId }, data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: now } });
    await tx.talentActionLog.create({
      data: {
        targetType: "TalentDecisionCycle",
        targetId: cycleId,
        action: "CONFIRM",
        actorId: user.id,
        beforeJson: JSON.stringify({ status: cycle.status }),
        afterJson: JSON.stringify({ status: "CONFIRMED" }),
        remark: `确认决策批次：${cycle.name}；候选池 ${resultCount} 人`,
      },
    });
  });
  revalidatePath("/talent/recommendations");
}
