import assert from "node:assert/strict";
import test from "node:test";
import {
  historyImportRecordKey,
  normalizeContractOutcome,
  normalizeHistoryDecisionType,
  parseHistoryDate,
  parseOptionalHistoryInteger,
} from "./history-import";

test("历史履历类型同时支持中文和枚举值", () => {
  assert.equal(normalizeHistoryDecisionType("晋升"), "PROMOTION");
  assert.equal(normalizeHistoryDecisionType("salary_adjustment"), "SALARY_ADJUSTMENT");
  assert.equal(normalizeHistoryDecisionType("未知"), null);
});

test("续签结果支持中文别名", () => {
  assert.equal(normalizeContractOutcome("已续签"), "RENEWED");
  assert.equal(normalizeContractOutcome("not_renewed"), "NOT_RENEWED");
  assert.equal(normalizeContractOutcome("无效"), null);
});

test("历史日期和整数采用严格解析", () => {
  assert.equal(parseHistoryDate("2026/08/06")?.toISOString().slice(0, 10), "2026-08-06");
  assert.equal(parseHistoryDate("不是日期"), null);
  assert.equal(parseOptionalHistoryInteger("12000"), 12000);
  assert.equal(parseOptionalHistoryInteger("1.5"), null);
});

test("合同以员工、开始日期和续签次数去重", () => {
  const startDate = new Date("2026-01-01");
  assert.equal(
    historyImportRecordKey({ decisionType: "CONTRACT_RENEWAL", recordNo: "HT-1", userId: "u1", startDate, renewalSequence: 2 }),
    "CONTRACT_RENEWAL:u1:2026-01-01T00:00:00.000Z:2",
  );
  assert.equal(historyImportRecordKey({ decisionType: "REWARD", recordNo: "JL-1", userId: "u1" }), "REWARD:JL-1");
});
