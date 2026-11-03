/** 可晋升机会剩余次数：0 红 / 1 橙 / 2 黄 / 3–4 蓝 / 5+ 绿 */
export function remainingPromotionOpportunityTextColor(count: number) {
  if (count <= 0) return "#F53F3F";
  if (count === 1) return "#FF7D00";
  if (count === 2) return "#FAAD14";
  if (count <= 4) return "#3069F9";
  return "#16A34A";
}
