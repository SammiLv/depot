import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTalentRestrictionRuleFilters } from "./restriction-rule-query";

test("规则列表只接受受控筛选值并限制搜索长度", () => {
  const filters = normalizeTalentRestrictionRuleFilters({
    query: `  ${"规".repeat(100)}  `,
    category: "WORK_INCIDENT",
    source: "EMPLOYEE_PROFILE",
    outputType: "CONTRACT_PROCESSING",
    status: "ACTIVE",
  });
  assert.equal(filters.query?.length, 80);
  assert.equal(filters.category, "WORK_INCIDENT");
  assert.equal(filters.source, "EMPLOYEE_PROFILE");
  assert.equal(filters.outputType, "CONTRACT_PROCESSING");
  assert.equal(filters.status, "ACTIVE");
});

test("无效筛选值不会进入数据库查询条件", () => {
  assert.deepEqual(normalizeTalentRestrictionRuleFilters({ category: "SCRIPT", outputType: "DELETE_EMPLOYEE", status: "PUBLISHED" }), {
    query: undefined,
    category: undefined,
    source: undefined,
    outputType: undefined,
    departmentOrgNodeId: undefined,
    status: undefined,
  });
});
