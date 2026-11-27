import test from "node:test";
import assert from "node:assert/strict";
import { collectDeptIds } from "@/server/auth/dingtalk";

test("collectDeptIds 合并 deptList 与 depts 并统一为字符串", () => {
  const ids = collectDeptIds(
    [{ deptId: 981702099 }, { deptId: "482439763", deptName: "B端组" }],
    [{ deptId: "122435118" }],
  );
  assert.deepEqual(new Set(ids), new Set(["981702099", "482439763", "122435118"]));
});

test("collectDeptIds 去重并忽略缺 id 的条目", () => {
  const ids = collectDeptIds(
    [{ deptId: "111" }, { deptId: "111" }, { deptName: "无ID" }, {}],
    undefined,
  );
  assert.deepEqual(ids, ["111"]);
});

test("collectDeptIds 网关未返回部门信息时为空数组（新用户将被拒绝，fail-closed）", () => {
  assert.deepEqual(collectDeptIds(undefined, undefined), []);
  assert.deepEqual(collectDeptIds([], []), []);
});
