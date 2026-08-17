export const VALUE_TRACK_STATUSES = ["未观测", "观测中", "已完成"] as const;
export type ValueTrackStatus = (typeof VALUE_TRACK_STATUSES)[number];

export const VALUE_TRACK_STATUS_NOT_OBSERVED = "未观测";
export const VALUE_TRACK_STATUS_OBSERVING = "观测中";
export const VALUE_TRACK_STATUS_COMPLETED = "已完成";

export const VALUE_JUDGEMENTS = ["未达预期", "已达预期", "超出预期"] as const;
export type ValueJudgement = (typeof VALUE_JUDGEMENTS)[number];

export const VALUE_JUDGEMENT_BELOW_EXPECTATION = "未达预期";

export const VALUE_TRACK_STATUS_TONES = {
  未观测: "default",
  观测中: "primary",
  已完成: "success",
} as const;

export const VALUE_JUDGEMENT_TONES = {
  未达预期: "warning",
  已达预期: "success",
  超出预期: "primary",
} as const;

export function isValueTrackStatus(value: string | null | undefined): value is ValueTrackStatus {
  return Boolean(value && (VALUE_TRACK_STATUSES as readonly string[]).includes(value));
}

export function isValueJudgement(value: string | null | undefined): value is ValueJudgement {
  return Boolean(value && (VALUE_JUDGEMENTS as readonly string[]).includes(value));
}

export function normalizeValueTrackStatus(value: string | null | undefined): ValueTrackStatus {
  return isValueTrackStatus(value) ? value : VALUE_TRACK_STATUS_NOT_OBSERVED;
}
