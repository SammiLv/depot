import assert from "node:assert/strict";
import test from "node:test";
import { getContractExpiryStatus, getRemainingPromotionOpportunityCount, parseProfileBoolean, serializeProfileBoolean, shouldSyncCurrentContract, validateCurrentContractPeriod } from "./employee-profile";

test("人才决策事实支持待更新、是、否三态", () => {
  assert.equal(parseProfileBoolean(""), null);
  assert.equal(parseProfileBoolean("YES"), true);
  assert.equal(parseProfileBoolean("NO"), false);
  assert.equal(serializeProfileBoolean(null), "");
  assert.equal(serializeProfileBoolean(true), "YES");
  assert.equal(serializeProfileBoolean(false), "NO");
  assert.throws(() => parseProfileBoolean("UNKNOWN"));
});

test("当前聘期日期和期数必须有效", () => {
  validateCurrentContractPeriod({ joinedAt: new Date("2025-01-01"), startAt: new Date("2025-01-01"), endAt: new Date("2026-01-01"), sequence: 1 });
  assert.throws(() => validateCurrentContractPeriod({ joinedAt: new Date("2025-01-01"), startAt: new Date("2024-12-31"), endAt: null, sequence: 1 }));
  assert.throws(() => validateCurrentContractPeriod({ joinedAt: null, startAt: new Date("2026-01-02"), endAt: new Date("2026-01-01"), sequence: 1 }));
  assert.throws(() => validateCurrentContractPeriod({ joinedAt: null, startAt: null, endAt: null, sequence: 0 }));
});

test("只有已续签和延期会同步人才档案当前聘期", () => {
  assert.equal(shouldSyncCurrentContract("RENEWED"), true);
  assert.equal(shouldSyncCurrentContract("EXTENDED"), true);
  assert.equal(shouldSyncCurrentContract("NOT_RENEWED"), false);
  assert.equal(shouldSyncCurrentContract("TERMINATED"), false);
});

test("合同到期状态按提前三个月的日期边界判断", () => {
  const today = new Date("2026-08-14T12:00:00.000Z");
  assert.equal(getContractExpiryStatus(null, today), null);
  assert.equal(getContractExpiryStatus(new Date("2026-08-13T23:59:59.000Z"), today), "EXPIRED");
  assert.equal(getContractExpiryStatus(new Date("2026-08-14T00:00:00.000Z"), today), "EXPIRES_TODAY");
  assert.equal(getContractExpiryStatus(new Date("2026-11-14T23:59:59.000Z"), today), "EXPIRING_SOON");
  assert.equal(getContractExpiryStatus(new Date("2026-11-15T00:00:00.000Z"), today), null);
});

test("提前三个月边界在月末按目标月最后一天收敛", () => {
  const monthEnd = new Date("2026-01-31T12:00:00.000Z");
  assert.equal(getContractExpiryStatus(new Date("2026-04-30T00:00:00.000Z"), monthEnd), "EXPIRING_SOON");
  assert.equal(getContractExpiryStatus(new Date("2026-05-01T00:00:00.000Z"), monthEnd), null);
});

test("剩余晋升机会按当前月份至聘期结束月份之前的4月和10月统计", () => {
  const august = new Date("2026-08-14T12:00:00.000Z");
  assert.equal(getRemainingPromotionOpportunityCount(null, august), null);
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2026-08-13T23:59:59.000Z"), august), 0);
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2026-10-25T00:00:00.000Z"), august), 0);
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2027-03-31T00:00:00.000Z"), august), 1);
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2027-04-01T00:00:00.000Z"), august), 1);
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2027-11-21T00:00:00.000Z"), august), 3);
});

test("当前处于晋升月份时仅在聘期跨过当月后保留当月机会", () => {
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2026-04-30T00:00:00.000Z"), new Date("2026-04-01T12:00:00.000Z")), 0);
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2026-05-01T00:00:00.000Z"), new Date("2026-04-30T12:00:00.000Z")), 1);
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2026-10-31T00:00:00.000Z"), new Date("2026-10-01T12:00:00.000Z")), 0);
  assert.equal(getRemainingPromotionOpportunityCount(new Date("2026-11-01T00:00:00.000Z"), new Date("2026-10-31T12:00:00.000Z")), 1);
});
