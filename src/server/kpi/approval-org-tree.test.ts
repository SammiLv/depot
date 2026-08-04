import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKpiApprovalOrgTreeIndex,
  getKpiApprovalDepartmentNodeIds,
  getKpiApprovalLeafNodeIds,
  getKpiApprovalOrgNodeIdsAtDepth,
  selectKpiApprovalOrgNodes,
} from "@/lib/kpi-approval-org-tree";

const nodes = [
  { id: "root", name: "公司", nodeType: "ROOT" as const, parentId: null },
  { id: "product", name: "产品部", nodeType: "DEPARTMENT" as const, parentId: "root" },
  { id: "platform", name: "平台部", nodeType: "DEPARTMENT" as const, parentId: "root" },
  { id: "purchase", name: "采购组", nodeType: "TEAM" as const, parentId: "product" },
  { id: "purchase-1", name: "采购1组", nodeType: "TEAM" as const, parentId: "purchase" },
  { id: "data", name: "数据策略组", nodeType: "TEAM" as const, parentId: "platform" },
];

test("organization tree calculates stable levels from the selected scope root", () => {
  const index = buildKpiApprovalOrgTreeIndex(nodes, "root");

  assert.deepEqual(getKpiApprovalOrgNodeIdsAtDepth(index, 0), ["root"]);
  assert.deepEqual(getKpiApprovalOrgNodeIdsAtDepth(index, 1).sort(), ["platform", "product"]);
  assert.deepEqual(getKpiApprovalOrgNodeIdsAtDepth(index, 2).sort(), ["data", "purchase"]);
  assert.deepEqual(getKpiApprovalOrgNodeIdsAtDepth(index, 3), ["purchase-1"]);
  assert.equal(index.maxDepth, 3);
});

test("department and leaf shortcuts return explicit conflict-free node sets", () => {
  const index = buildKpiApprovalOrgTreeIndex(nodes, "root");

  assert.deepEqual(getKpiApprovalDepartmentNodeIds(index).sort(), ["platform", "product"]);
  assert.deepEqual(getKpiApprovalLeafNodeIds(index).sort(), ["data", "purchase-1"]);
});

test("department scope treats the department as level zero and keeps company as a separate root", () => {
  const index = buildKpiApprovalOrgTreeIndex(nodes, "product");

  assert.deepEqual(getKpiApprovalOrgNodeIdsAtDepth(index, 0), ["product"]);
  assert.deepEqual(getKpiApprovalOrgNodeIdsAtDepth(index, 1), ["purchase"]);
  assert.deepEqual(getKpiApprovalOrgNodeIdsAtDepth(index, 2), ["purchase-1"]);
  assert.deepEqual(index.roots.map((node) => node.id), ["product", "root"]);
  assert.deepEqual(index.childrenById.get("root") ?? [], []);
  assert.equal(index.treeParentById.has("platform"), false);
});

test("a new selection replaces selected ancestors or descendants on the same path", () => {
  const index = buildKpiApprovalOrgTreeIndex(nodes, "root");
  const selectChild = selectKpiApprovalOrgNodes(["product", "platform"], ["purchase"], index);

  assert.deepEqual(selectChild.selectedIds.sort(), ["platform", "purchase"]);
  assert.deepEqual(selectChild.removedIds, ["product"]);

  const selectParent = selectKpiApprovalOrgNodes(["purchase-1", "data"], ["product"], index);
  assert.deepEqual(selectParent.selectedIds.sort(), ["data", "product"]);
  assert.deepEqual(selectParent.removedIds, ["purchase-1"]);
});
