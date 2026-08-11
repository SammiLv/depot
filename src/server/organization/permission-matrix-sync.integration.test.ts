import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/server/db/prisma";
import { annualGoalPermissionDefinitions } from "./annual-goal-permissions";
import { permissionMatrixRoles, syncAnnualGoalPermissionMatrix, syncKpiPermissionMatrix, syncRoleMenuPermissionMatrix } from "./permission-matrix-sync";
import { removePermissionMatrixIntegrationTestArtifacts } from "./integration-test-artifacts";

after(async () => {
  await removePermissionMatrixIntegrationTestArtifacts();
  await prisma.$disconnect();
});

function payload(permissionIds: string[], allowed: (role: string, permissionId: string) => boolean) {
  return JSON.stringify(permissionMatrixRoles.flatMap((roleType) => permissionIds.map((permissionId) => ({ roleType, permissionId, allowed: allowed(roleType, permissionId), explicit: true }))));
}

test("difference and full synchronization preserve unrelated permission data", async () => {
  await prisma.orgNode.createMany({ data: [
    { id: "root", name: "锐竞信息", nodeType: "ROOT" },
    { id: "dept-a", name: "产品部", nodeType: "DEPARTMENT", parentId: "root" },
    { id: "dept-b", name: "平台部", nodeType: "DEPARTMENT", parentId: "root" },
  ] });
  await prisma.menuPermission.createMany({ data: [
    { id: "menu-dashboard", code: "dashboard-test", name: "首页", path: "/dashboard" },
    { id: "menu-project", code: "project-test", name: "项目", path: "/projects" },
  ] });
  const menuIds = ["menu-dashboard", "menu-project"];
  const initialMenuPayload = payload(menuIds, (role, id) => role === "ADMIN" && id === "menu-dashboard");
  await prisma.$transaction((tx) => syncRoleMenuPermissionMatrix(tx, initialMenuPayload, "FULL"));
  await prisma.roleMenuPermission.update({ where: { scopeType_departmentOrgNodeId_roleType_menuPermissionId: { scopeType: "DEPARTMENT", departmentOrgNodeId: "dept-a", roleType: "MEMBER", menuPermissionId: "menu-dashboard" } }, data: { allowed: true } });
  const changedMenuPayload = payload(menuIds, (role, id) => (role === "ADMIN" && id === "menu-dashboard") || (role === "MEMBER" && id === "menu-project"));
  const menuSummary = await prisma.$transaction((tx) => syncRoleMenuPermissionMatrix(tx, changedMenuPayload, "CHANGES"));
  assert.equal(menuSummary.changedCellCount, 1);
  assert.equal((await prisma.roleMenuPermission.findUnique({ where: { scopeType_departmentOrgNodeId_roleType_menuPermissionId: { scopeType: "DEPARTMENT", departmentOrgNodeId: "dept-a", roleType: "MEMBER", menuPermissionId: "menu-dashboard" } } }))?.allowed, true);
  assert.equal((await prisma.roleMenuPermission.findUnique({ where: { scopeType_departmentOrgNodeId_roleType_menuPermissionId: { scopeType: "DEPARTMENT", departmentOrgNodeId: "dept-b", roleType: "MEMBER", menuPermissionId: "menu-project" } } }))?.allowed, true);

  for (const definition of annualGoalPermissionDefinitions) await prisma.annualGoalPermission.create({ data: definition });
  const annualIds = (await prisma.annualGoalPermission.findMany({ orderBy: { code: "asc" } })).map((row) => row.id);
  const annualSummary = await prisma.$transaction((tx) => syncAnnualGoalPermissionMatrix(tx, payload(annualIds, (role) => role !== "MEMBER"), "FULL"));
  assert.equal(annualSummary.syncedCellCount, 2 * 3 * annualIds.length);

  await prisma.orgPermissionGrant.createMany({ data: [
    { moduleKey: "KPI", abilityKey: "VIEW_KPI", scopeType: "SELF", subjectType: "USER", userId: "preserved-user", orgNodeId: "dept-a", isActive: true },
    { moduleKey: "ANNUAL_GOAL", abilityKey: "VIEW_KPI", scopeType: "ALL", subjectType: "ROLE", roleType: "ADMIN", isActive: true },
  ] });
  const kpiIds = ["VIEW_KPI", "INITIALIZE_KPI", "VIEW_KPI_TEMPLATE", "MANAGE_KPI_TEMPLATE", "TOGGLE_KPI_TEMPLATE", "SCORE_SELF"];
  const kpiPayload = payload(kpiIds, (role, id) => role === "ADMIN" || id === "VIEW_KPI");
  await prisma.$transaction((tx) => syncKpiPermissionMatrix(tx, kpiPayload, "FULL"));
  await prisma.$transaction((tx) => syncKpiPermissionMatrix(tx, kpiPayload, "FULL"));
  assert.equal(await prisma.orgPermissionGrant.count({ where: { subjectType: "USER", userId: "preserved-user" } }), 1);
  assert.equal(await prisma.orgPermissionGrant.count({ where: { moduleKey: "ANNUAL_GOAL" } }), 1);
  const enabledKpiCells = permissionMatrixRoles.flatMap((role) => kpiIds.map((id) => ({ role, id }))).filter(({ role, id }) => role !== "ADMIN" && id === "VIEW_KPI");
  assert.equal(await prisma.orgPermissionGrant.count({ where: { moduleKey: "KPI", subjectType: "ROLE", orgNodeId: { in: ["dept-a", "dept-b"] } } }), 2 * enabledKpiCells.length);

  await assert.rejects(prisma.$transaction(async (tx) => {
    await syncKpiPermissionMatrix(tx, payload(kpiIds, () => false), "FULL");
    throw new Error("force rollback");
  }), /force rollback/);
  assert.ok(await prisma.orgPermissionGrant.count({ where: { moduleKey: "KPI", subjectType: "ROLE" } }) > 0);
});
