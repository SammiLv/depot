/** 可晋升机会剩余次数：0 红 / 1 橙 / 2 黄 / 3–4 蓝 / 5+ 绿 */
export function remainingPromotionOpportunityTextColor(count: number) {
  if (count <= 0) return "#F53F3F";
  if (count === 1) return "#FF7D00";
  if (count === 2) return "#FAAD14";
  if (count <= 4) return "#3069F9";
  return "#16A34A";
}

/** 人才履历等整句 Badge：浅底 + 同色系文案（对齐 ui-kit Badge 视觉） */
export function remainingPromotionOpportunityBadgeStyle(count: number): { backgroundColor: string; color: string } {
  if (count <= 0) return { backgroundColor: "#FEF2F2", color: "#DC2626" };
  if (count === 1) return { backgroundColor: "#FFF7ED", color: "#EA580C" };
  if (count === 2) return { backgroundColor: "#FEFCE8", color: "#CA8A04" };
  if (count <= 4) return { backgroundColor: "#EFF6FF", color: "#2563EB" };
  return { backgroundColor: "#F0FDF4", color: "#16A34A" };
}
