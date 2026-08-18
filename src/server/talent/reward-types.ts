export const rewardLevelLabels = { COMPANY: "公司", DEPARTMENT: "部门" } as const;
export const rewardFormLabels = { COIN: "竞币", CASH: "现金" } as const;
export const rewardRecipientLabels = { INDIVIDUAL: "个人", PROJECT: "项目" } as const;
export const rewardCycleLabels = { MONTHLY: "月度", QUARTERLY: "季度", ANNUAL: "年度", OTHER: "其他" } as const;

export type RewardLevel = keyof typeof rewardLevelLabels;
export type RewardForm = keyof typeof rewardFormLabels;
export type RewardRecipient = keyof typeof rewardRecipientLabels;
export type RewardCycle = keyof typeof rewardCycleLabels;

export const companyCoinAwardBaseAmounts = {
  突出贡献奖: [1000],
  最佳产出奖: [800],
  最佳质量奖: [800],
  最佳创新奖: [800],
  最佳协作奖: [600],
  最佳分享奖: [600],
  最佳新人奖: [500],
  最佳服务奖: [500],
  最佳进步奖: [500],
  最努力工作奖: [800, 500, 300],
} as const;

export type CompanyCoinAwardName = keyof typeof companyCoinAwardBaseAmounts;

export function isControlledCompanyCoinAward(level: RewardLevel, form: RewardForm, cycle: RewardCycle) {
  return level === "COMPANY" && form === "COIN" && (cycle === "QUARTERLY" || cycle === "ANNUAL");
}

export function companyCoinAwardAmounts(name: string, cycle: RewardCycle): number[] {
  if (!(name in companyCoinAwardBaseAmounts) || (cycle !== "QUARTERLY" && cycle !== "ANNUAL")) return [];
  const multiplier = cycle === "ANNUAL" ? 2 : 1;
  return [...companyCoinAwardBaseAmounts[name as CompanyCoinAwardName]].map((amount) => amount * multiplier);
}
