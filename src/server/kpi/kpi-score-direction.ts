import type { KpiScoreDirection } from "@prisma/client";

// 指标项计分方向校验与阶段汇总（前后端共用纯函数）

/** 输入值是否符合计分方向；不合法时返回错误提示文案，合法返回 null */
export function validateScoreByDirection(value: number, scoreDirection: KpiScoreDirection): string | null {
  if (scoreDirection === "BONUS" && value < 0) {
    return "为加分项，只能填写 0 或正数";
  }
  if (scoreDirection !== "BONUS" && value > 0) {
    return "为扣分项，只能填写 0 或负数";
  }
  return null;
}

/** 阶段汇总 = 分值合计 + Σ(阶段调整分)：扣分项为负向扣减，加分项为正向计入 */
export function sumStageTotal(scoreTotal: number, values: Array<number | null | undefined>) {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), scoreTotal);
}
