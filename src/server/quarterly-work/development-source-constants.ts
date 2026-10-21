/** 需求开发方：区分产品部内部自研与外部开发；仅统计口径不变，两者均按开发需求对待 */
export const DEVELOPMENT_SOURCE_EXTERNAL = "EXTERNAL";
export const DEVELOPMENT_SOURCE_INTERNAL = "INTERNAL";

export const DEVELOPMENT_SOURCES = [DEVELOPMENT_SOURCE_EXTERNAL, DEVELOPMENT_SOURCE_INTERNAL] as const;
export type DevelopmentSource = (typeof DEVELOPMENT_SOURCES)[number];

export function developmentSourceLabel(value: string | null | undefined) {
  if (value === DEVELOPMENT_SOURCE_INTERNAL) return "内部自研";
  if (value === DEVELOPMENT_SOURCE_EXTERNAL) return "外部开发";
  return "-";
}
