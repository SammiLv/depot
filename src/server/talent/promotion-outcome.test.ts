import assert from "node:assert/strict";
import test from "node:test";
import { isSuccessfulPromotionOutcome, promotionOutcomeLabels, promotionOutcomeValues } from "./promotion-outcome";

test("晋升结果包含成功、驳回和失败三种业务状态", () => {
  assert.deepEqual(promotionOutcomeValues, ["SUCCESS", "REJECTED", "FAILED"]);
  assert.deepEqual(Object.values(promotionOutcomeLabels), ["晋升成功", "申请驳回", "晋升失败"]);
});

test("只有晋升成功才允许更新人才档案当前职级", () => {
  assert.equal(isSuccessfulPromotionOutcome("SUCCESS"), true);
  assert.equal(isSuccessfulPromotionOutcome("REJECTED"), false);
  assert.equal(isSuccessfulPromotionOutcome("FAILED"), false);
});
