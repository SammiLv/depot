import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import {
  buildPersonalKpiApprovalPolicyData,
  buildPersonalKpiApprovalStepData,
  resolveKpiApprovalSnapshot,
} from "@/server/kpi/approval-snapshot";
import { transitionKpiApprovalChain } from "@/server/kpi/approval-workflow-store";

after(async () => {
  await prisma.$disconnect();
});

test("configured approval runs end-to-end against a migrated SQLite database", async () => {
  await prisma.orgNode.createMany({
    data: [
      { id: "company", name: "公司", nodeType: "ROOT" },
      { id: "department", name: "产品部", nodeType: "DEPARTMENT", parentId: "company" },
      { id: "team", name: "产品一组", nodeType: "TEAM", parentId: "department" },
      { id: "other-department", name: "研发部", nodeType: "DEPARTMENT", parentId: "company" },
    ],
  });
  await prisma.orgClosure.createMany({
    data: [
      { id: "closure-company", ancestorId: "company", descendantId: "company", depth: 0 },
      { id: "closure-department", ancestorId: "department", descendantId: "department", depth: 0 },
      { id: "closure-team", ancestorId: "team", descendantId: "team", depth: 0 },
      { id: "closure-company-department", ancestorId: "company", descendantId: "department", depth: 1 },
      { id: "closure-department-team", ancestorId: "department", descendantId: "team", depth: 1 },
      { id: "closure-company-team", ancestorId: "company", descendantId: "team", depth: 2 },
      { id: "closure-other-department", ancestorId: "other-department", descendantId: "other-department", depth: 0 },
      { id: "closure-company-other-department", ancestorId: "company", descendantId: "other-department", depth: 1 },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: "member", name: "成员", orgNodeId: "team", roleType: "MEMBER" },
      { id: "leader", name: "组长", orgNodeId: "team", roleType: "TEAM_LEADER" },
      { id: "manager", name: "主管", orgNodeId: "department", roleType: "DEPARTMENT_MANAGER" },
      { id: "admin", name: "管理员", orgNodeId: "company", roleType: "ADMIN" },
      { id: "other-member", name: "研发成员", orgNodeId: "other-department", roleType: "MEMBER" },
    ],
  });

  await prisma.kpiApprovalPolicy.createMany({
    data: [
      {
        id: "system-policy",
        scopeType: "SYSTEM",
        departmentOrgNodeId: "",
        name: "系统默认审批",
      },
      {
        id: "department-policy",
        scopeType: "DEPARTMENT",
        departmentOrgNodeId: "department",
        name: "产品部审批",
      },
    ],
  });
  await prisma.kpiApprovalPolicyStep.createMany({
    data: [
      {
        id: "system-admin-step",
        policyId: "system-policy",
        stepOrder: 1,
        label: "系统管理员",
        resolverType: "ADMIN",
      },
      {
        id: "department-leader-step",
        policyId: "department-policy",
        stepOrder: 1,
        label: "直属组长",
        ancestorDepth: 0,
        resolverType: "TEAM_LEADER",
      },
      {
        id: "department-manager-step",
        policyId: "department-policy",
        stepOrder: 2,
        label: "部门主管",
        resolverType: "DEPARTMENT_MANAGER",
      },
      {
        id: "department-admin-step",
        policyId: "department-policy",
        stepOrder: 3,
        label: "管理员终审",
        resolverType: "ADMIN",
      },
    ],
  });

  const snapshot = await resolveKpiApprovalSnapshot({
    subjectUserId: "member",
    subjectOrgNodeId: "team",
  });
  assert.equal(snapshot.policyId, "department-policy");
  assert.deepEqual(snapshot.steps.map((step) => step.approverId), ["leader", "manager", "admin"]);
  assert.deepEqual(snapshot.steps.map((step) => step.stageKey), ["LEADER", "MANAGER", "FINAL"]);

  const fallbackSnapshot = await resolveKpiApprovalSnapshot({
    subjectUserId: "other-member",
    subjectOrgNodeId: "other-department",
  });
  assert.equal(fallbackSnapshot.policyId, "system-policy");
  assert.deepEqual(fallbackSnapshot.steps.map((step) => step.approverId), ["admin"]);

  const personalKpi = await prisma.$transaction(async (tx) => {
    const created = await tx.personalKpi.create({
      data: {
        id: "personal-kpi",
        year: 2026,
        quarter: 3,
        userId: "member",
        orgNodeId: "team",
        initializedById: "admin",
        initializedAt: new Date("2026-07-27T00:00:00.000Z"),
        ...buildPersonalKpiApprovalPolicyData(snapshot),
      },
    });
    await tx.personalKpiItem.create({
      data: {
        id: "personal-kpi-item",
        personalKpiId: created.id,
        name: "完成核心项目",
        score: 100,
        weight: 100,
      },
    });
    await tx.personalKpiApprovalStep.createMany({
      data: buildPersonalKpiApprovalStepData(created.id, snapshot),
    });
    return created;
  });

  const initializedSteps = await prisma.personalKpiApprovalStep.findMany({
    where: { personalKpiId: personalKpi.id },
    orderBy: { stepOrder: "asc" },
  });
  assert.deepEqual(initializedSteps.map((step) => step.status), ["PENDING", "WAITING", "WAITING"]);

  await prisma.kpiApprovalPolicy.update({
    where: { id: "department-policy" },
    data: { name: "产品部审批（新版）" },
  });
  await prisma.kpiApprovalPolicyStep.update({
    where: { id: "department-manager-step" },
    data: { label: "新版部门主管" },
  });
  const persistedSnapshot = await prisma.personalKpi.findUniqueOrThrow({
    where: { id: personalKpi.id },
  });
  const persistedManagerStep = await prisma.personalKpiApprovalStep.findUniqueOrThrow({
    where: { id: initializedSteps[1]!.id },
  });
  assert.equal(persistedSnapshot.approvalPolicyName, "产品部审批");
  assert.equal(persistedManagerStep.stepLabel, "部门主管");

  const selfSubmittedStatus = await prisma.$transaction(async (tx) => {
    const nextStatus = await transitionKpiApprovalChain(tx, {
      personalKpiId: personalKpi.id,
      action: "submit",
      currentStep: null,
    });
    await tx.personalKpi.update({
      where: { id: personalKpi.id },
      data: { status: nextStatus, submittedAt: new Date("2026-07-27T01:00:00.000Z") },
    });
    return nextStatus;
  });
  assert.equal(selfSubmittedStatus, "PENDING_LEADER_SCORE");

  await prisma.$transaction(async (tx) => {
    await tx.personalKpiItemStepScore.create({
      data: {
        personalKpiItemId: "personal-kpi-item",
        approvalStepId: initializedSteps[0]!.id,
        score: -2,
        comment: "组长扣分",
      },
    });
    const nextStatus = await transitionKpiApprovalChain(tx, {
      personalKpiId: personalKpi.id,
      action: "approve",
      currentStep: initializedSteps[0]!,
      comment: "组长审批通过",
      actedAt: new Date("2026-07-27T02:00:00.000Z"),
    });
    assert.equal(nextStatus, "PENDING_MANAGER_SCORE");
    await tx.personalKpi.update({ where: { id: personalKpi.id }, data: { status: nextStatus } });
  });

  const rejectedStatus = await prisma.$transaction(async (tx) => {
    const nextStatus = await transitionKpiApprovalChain(tx, {
      personalKpiId: personalKpi.id,
      action: "reject",
      currentStep: initializedSteps[1]!,
      comment: "请补充数据",
      actedAt: new Date("2026-07-27T03:00:00.000Z"),
    });
    await tx.personalKpi.update({ where: { id: personalKpi.id }, data: { status: nextStatus } });
    return nextStatus;
  });
  assert.equal(rejectedStatus, "PENDING_SELF_REVIEW");

  await prisma.$transaction(async (tx) => {
    const nextStatus = await transitionKpiApprovalChain(tx, {
      personalKpiId: personalKpi.id,
      action: "submit",
      currentStep: null,
    });
    assert.equal(nextStatus, "PENDING_MANAGER_SCORE");
    await tx.personalKpi.update({ where: { id: personalKpi.id }, data: { status: nextStatus } });
  });
  const restoredManagerStep = await prisma.personalKpiApprovalStep.findUniqueOrThrow({
    where: { id: initializedSteps[1]!.id },
  });
  assert.equal(restoredManagerStep.status, "PENDING");
  assert.equal(restoredManagerStep.comment, null);
  assert.equal(restoredManagerStep.actedAt, null);

  await prisma.$transaction(async (tx) => {
    await tx.personalKpiItemStepScore.create({
      data: {
        personalKpiItemId: "personal-kpi-item",
        approvalStepId: initializedSteps[1]!.id,
        score: -1,
        comment: "主管扣分",
      },
    });
    const nextStatus = await transitionKpiApprovalChain(tx, {
      personalKpiId: personalKpi.id,
      action: "approve",
      currentStep: initializedSteps[1]!,
      comment: "主管审批通过",
    });
    assert.equal(nextStatus, "PENDING_FINAL_REVIEW");
    await tx.personalKpi.update({ where: { id: personalKpi.id }, data: { status: nextStatus } });
  });

  await prisma.$transaction(async (tx) => {
    const nextStatus = await transitionKpiApprovalChain(tx, {
      personalKpiId: personalKpi.id,
      action: "approve",
      currentStep: initializedSteps[2]!,
      comment: "终审通过",
    });
    assert.equal(nextStatus, "COMPLETED");
    await tx.personalKpi.update({
      where: { id: personalKpi.id },
      data: { status: nextStatus, completedAt: new Date("2026-07-27T04:00:00.000Z") },
    });
  });

  const completedKpi = await prisma.personalKpi.findUniqueOrThrow({ where: { id: personalKpi.id } });
  const completedSteps = await prisma.personalKpiApprovalStep.findMany({
    where: { personalKpiId: personalKpi.id },
    orderBy: { stepOrder: "asc" },
  });
  const stepScores = await prisma.personalKpiItemStepScore.findMany({
    where: { personalKpiItemId: "personal-kpi-item" },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(completedKpi.status, "COMPLETED");
  assert.deepEqual(completedSteps.map((step) => step.status), ["COMPLETED", "COMPLETED", "COMPLETED"]);
  assert.deepEqual(stepScores.map((score) => score.score), [-2, -1]);
});
