export const OPERATION_LOG_TARGET_TYPES = [
  "PRODUCT_GOAL",
  "PROJECT",
  "QUARTERLY_WORK",
  "ANNUAL_GOAL_PLAN",
  "ANNUAL_GOAL_METRIC",
  "ANNUAL_GOAL_METRIC_SOURCE",
  "ANNUAL_GOAL_METRIC_ASSIGNMENT",
  "ANNUAL_GOAL_QUARTER",
] as const;
export type OperationLogTargetType = (typeof OPERATION_LOG_TARGET_TYPES)[number];

export const OPERATION_LOG_TARGET_TYPE_LABELS: Record<OperationLogTargetType, string> = {
  PRODUCT_GOAL: "产品目标",
  PROJECT: "项目",
  QUARTERLY_WORK: "需求",
  ANNUAL_GOAL_PLAN: "年度方案",
  ANNUAL_GOAL_METRIC: "部门指标",
  ANNUAL_GOAL_METRIC_SOURCE: "元指标",
  ANNUAL_GOAL_METRIC_ASSIGNMENT: "小组承接",
  ANNUAL_GOAL_QUARTER: "季度指标",
};

export const OPERATION_LOG_ACTION_CREATE = "新增";
export const OPERATION_LOG_ACTION_UPDATE = "编辑";
export const OPERATION_LOG_ACTION_DELETE = "删除";

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "未启动",
  IN_PROGRESS: "进行中",
  LAUNCHED: "已上线",
  COMPLETED: "已完成",
  CLOSED: "关闭",
};

export const WORK_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "未启动",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  DELAYED_COMPLETED: "延期完成",
  CLOSED: "关闭",
};
