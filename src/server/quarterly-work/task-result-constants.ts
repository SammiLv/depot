export const TASK_RESULTS = ["未达标", "已达标", "超预期"] as const;

export type TaskResult = (typeof TASK_RESULTS)[number];
