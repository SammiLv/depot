import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSuccessfulPromotionInCurrentContract,
  isEffectiveDateInCurrentContract,
} from "./formal-promotion-in-contract";

test("聘期内晋升按生效日与聘期起止判断", () => {
  const start = new Date("2024-07-04T00:00:00.000Z");
  const end = new Date("2027-07-03T00:00:00.000Z");
  assert.equal(isEffectiveDateInCurrentContract(new Date("2024-07-03T00:00:00.000Z"), start, end), false);
  assert.equal(isEffectiveDateInCurrentContract(new Date("2024-07-04T00:00:00.000Z"), start, end), true);
  assert.equal(isEffectiveDateInCurrentContract(new Date("2026-10-15T00:00:00.000Z"), start, end), true);
  assert.equal(isEffectiveDateInCurrentContract(new Date("2027-07-04T00:00:00.000Z"), start, end), false);
});

test("仅统计当前聘期内成功晋升记录", () => {
  const start = new Date("2024-07-04T00:00:00.000Z");
  const end = new Date("2027-07-03T00:00:00.000Z");
  const promotions = [
    {
      effectiveDate: new Date("2023-10-01T00:00:00.000Z"),
      outcome: "SUCCESS" as const,
      resultStatus: "CONFIRMED" as const,
    },
    {
      effectiveDate: new Date("2026-10-01T00:00:00.000Z"),
      outcome: "SUCCESS" as const,
      resultStatus: "CONFIRMED" as const,
    },
  ];
  assert.equal(hasSuccessfulPromotionInCurrentContract(promotions, start, end), true);
  assert.equal(
    hasSuccessfulPromotionInCurrentContract([promotions[0]], start, end),
    false,
  );
});
