import type { PromotionOutcome, TalentRecordStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getRemainingPromotionOpportunityCount } from "./employee-profile";

function toUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function isEffectiveDateInCurrentContract(
  effectiveDate: Date,
  contractStartAt: Date | null | undefined,
  contractEndAt: Date | null | undefined,
) {
  if (!contractEndAt) return false;
  const date = toUtcDateOnly(effectiveDate);
  const end = toUtcDateOnly(contractEndAt);
  if (date > end) return false;
  if (contractStartAt) {
    const start = toUtcDateOnly(contractStartAt);
    if (date < start) return false;
  }
  return true;
}

export type ContractPromotionRecord = {
  effectiveDate: Date;
  outcome: PromotionOutcome;
  resultStatus: TalentRecordStatus;
};

export function hasSuccessfulPromotionInCurrentContract(
  promotions: ContractPromotionRecord[],
  contractStartAt: Date | null | undefined,
  contractEndAt: Date | null | undefined,
) {
  return promotions.some(
    (row) =>
      row.resultStatus === "CONFIRMED"
      && row.outcome === "SUCCESS"
      && isEffectiveDateInCurrentContract(row.effectiveDate, contractStartAt, contractEndAt),
  );
}

type PromotionSyncClient = Pick<typeof prisma, "promotionRecord" | "employeeTalentProfile">;

export async function syncHasFormalPromotionInCurrentContract(
  client: PromotionSyncClient,
  userId: string,
  updatedById?: string,
) {
  const profile = await client.employeeTalentProfile.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true, currentContractStartAt: true, currentContractEndAt: true },
  });
  if (!profile) return;

  const promotions = await client.promotionRecord.findMany({
    where: { userId, deletedAt: null, resultStatus: "CONFIRMED", outcome: "SUCCESS" },
    select: { effectiveDate: true, outcome: true, resultStatus: true },
  });

  const hasPromotion = hasSuccessfulPromotionInCurrentContract(
    promotions,
    profile.currentContractStartAt,
    profile.currentContractEndAt,
  );

  await client.employeeTalentProfile.update({
    where: { id: profile.id },
    data: {
      hasFormalPromotionInCurrentContract: hasPromotion,
      ...(updatedById ? { updatedById } : {}),
    },
  });
}

export function groupSuccessPromotionsByUserId<T extends { userId: string } & ContractPromotionRecord>(
  records: T[],
) {
  const map = new Map<string, ContractPromotionRecord[]>();
  for (const row of records) {
    const list = map.get(row.userId) ?? [];
    list.push({ effectiveDate: row.effectiveDate, outcome: row.outcome, resultStatus: row.resultStatus });
    map.set(row.userId, list);
  }
  return map;
}

/** 机会紧张名单：聘期内尚未成功晋升，且剩余 4/10 月窗口 ≤ 2 次 */
export function shouldIncludeInLowPromotionOpportunity(
  contractStartAt: Date | null | undefined,
  contractEndAt: Date | null | undefined,
  promotions: ContractPromotionRecord[],
  referenceDate: Date,
) {
  if (!contractEndAt) return false;
  if (hasSuccessfulPromotionInCurrentContract(promotions, contractStartAt, contractEndAt)) return false;
  const count = getRemainingPromotionOpportunityCount(contractEndAt, referenceDate);
  return count !== null && count <= 2;
}
