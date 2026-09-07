export function parseProfileBoolean(value: string): boolean | null {
  if (!value) return null;
  if (value === "YES") return true;
  if (value === "NO") return false;
  throw new Error("人才决策事实只能选择待更新、是或否");
}

export function serializeProfileBoolean(value: boolean | null | undefined) {
  return value === true ? "YES" : value === false ? "NO" : "";
}

export function shouldSyncCurrentContract(outcome: string) {
  return outcome === "RENEWED" || outcome === "EXTENDED";
}

export type ContractExpiryStatus = "EXPIRING_SOON" | "EXPIRES_TODAY" | "EXPIRED" | null;

function toUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcMonthsClamped(value: Date, months: number) {
  const targetMonth = value.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(value.getUTCFullYear(), targetMonth, Math.min(value.getUTCDate(), lastDay)));
}

export function getContractExpiryWindowEnd(referenceDate = new Date()) {
  return new Date(referenceDate.getTime() + 90 * 24 * 60 * 60 * 1000);
}

export function isWithinContractExpiryWindow(endAt: Date, referenceDate = new Date()) {
  const today = toUtcDateOnly(referenceDate);
  const endDate = toUtcDateOnly(endAt);
  const windowEnd = toUtcDateOnly(getContractExpiryWindowEnd(referenceDate));
  return endDate >= today && endDate <= windowEnd;
}

export type ContractExpiryMonthTab = {
  year: number;
  month: number;
  label: string;
};

export function getContractExpiryMonthTabs(referenceDate = new Date()): ContractExpiryMonthTab[] {
  const windowEnd = getContractExpiryWindowEnd(referenceDate);
  const tabs: ContractExpiryMonthTab[] = [];
  let year = referenceDate.getFullYear();
  let month = referenceDate.getMonth();
  const endYear = windowEnd.getFullYear();
  const endMonth = windowEnd.getMonth();
  while (year < endYear || (year === endYear && month <= endMonth)) {
    tabs.push({ year, month: month + 1, label: `${month + 1}月` });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return tabs;
}

export function contractExpiryMonthKey(year: number, month: number) {
  return `${year}-${month}`;
}

export function formatContractExpiryDateLabel(endAt: Date) {
  return `${endAt.getMonth() + 1}月${endAt.getDate()}日到期`;
}

export function getContractExpiryStatus(endAt: Date | null, referenceDate = new Date()): ContractExpiryStatus {
  if (!endAt) return null;
  const today = toUtcDateOnly(referenceDate);
  const endDate = toUtcDateOnly(endAt);
  if (endDate < today) return "EXPIRED";
  if (endDate.getTime() === today.getTime()) return "EXPIRES_TODAY";
  return endDate <= addUtcMonthsClamped(today, 3) ? "EXPIRING_SOON" : null;
}

export function getRemainingPromotionOpportunityCount(endAt: Date | null, referenceDate = new Date()) {
  if (!endAt) return null;
  const today = toUtcDateOnly(referenceDate);
  const endDate = toUtcDateOnly(endAt);
  if (endDate < today) return 0;

  const currentMonthIndex = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const endMonthIndex = endDate.getUTCFullYear() * 12 + endDate.getUTCMonth();
  let count = 0;
  for (let year = today.getUTCFullYear(); year <= endDate.getUTCFullYear(); year += 1) {
    for (const month of [3, 9]) {
      const nodeMonthIndex = year * 12 + month;
      if (nodeMonthIndex >= currentMonthIndex && nodeMonthIndex < endMonthIndex) count += 1;
    }
  }
  return count;
}

export function validateCurrentContractPeriod(input: {
  joinedAt: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  sequence: number | null;
}) {
  if (input.startAt && input.endAt && input.endAt < input.startAt) throw new Error("当前聘期结束日期不能早于开始日期");
  if (input.joinedAt && input.startAt && input.startAt < input.joinedAt) throw new Error("当前聘期开始日期不能早于入职日期");
  if (input.sequence !== null && (!Number.isInteger(input.sequence) || input.sequence < 1)) throw new Error("当前聘期期数必须是大于或等于1的整数");
}
