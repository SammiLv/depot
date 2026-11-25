/** 需求开发方：区分内部自研、外部开发与混合开发；仅统计口径不变，均按开发需求对待 */
export const DEVELOPMENT_SOURCE_EXTERNAL = "EXTERNAL";
export const DEVELOPMENT_SOURCE_INTERNAL = "INTERNAL";
export const DEVELOPMENT_SOURCE_HYBRID = "HYBRID";

export const DEVELOPMENT_SOURCES = [DEVELOPMENT_SOURCE_EXTERNAL, DEVELOPMENT_SOURCE_INTERNAL, DEVELOPMENT_SOURCE_HYBRID] as const;
export type DevelopmentSource = (typeof DEVELOPMENT_SOURCES)[number];

export function developmentSourceLabel(value: string | null | undefined) {
  if (value === DEVELOPMENT_SOURCE_INTERNAL) return "内部自研";
  if (value === DEVELOPMENT_SOURCE_EXTERNAL) return "外部开发";
  if (value === DEVELOPMENT_SOURCE_HYBRID) return "混合开发";
  return "-";
}

/** 开发方标签底色：内部自研绿、外部开发蓝、混合开发橙 */
export function developmentSourceTagClass(value: string | null | undefined) {
  if (value === DEVELOPMENT_SOURCE_INTERNAL) return "bg-[#E8FFEA] text-[#00B42A]";
  if (value === DEVELOPMENT_SOURCE_EXTERNAL) return "bg-[#E8F2FF] text-[#3069F9]";
  if (value === DEVELOPMENT_SOURCE_HYBRID) return "bg-[#FFF7E8] text-[#FF7D00]";
  return "bg-[#F5F5F5] text-[#777777]";
}
