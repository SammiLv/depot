#!/usr/bin/env node
/**
 * 发布部署审计日志记录脚本
 *
 * 用法：
 *   node scripts/log-deployment.js \
 *     --action "pull" \
 *     --operator "sammilv" \
 *     --gitCommit "abc123" \
 *     --gitBranch "main" \
 *     --success true \
 *     --note "拉取代码并重启"
 */

import { prisma } from "../src/server/db/prisma";
import { writeAuditEvent } from "../src/server/audit";
import { AUDIT_MODULES, AUDIT_ACTION_CODES } from "../src/server/audit";

interface DeploymentLogArgs {
  action: "pull" | "start" | "stop" | "restart" | "push" | "commit";
  operator?: string;
  gitCommit?: string;
  gitBranch?: string;
  success: boolean;
  note?: string;
  correlationId?: string;
}

function parseArgs(argv: string[]): DeploymentLogArgs {
  const args: Partial<DeploymentLogArgs> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];

      switch (key) {
        case "action":
          args.action = value as DeploymentLogArgs["action"];
          i++;
          break;
        case "operator":
          args.operator = value;
          i++;
          break;
        case "gitCommit":
          args.gitCommit = value;
          i++;
          break;
        case "gitBranch":
          args.gitBranch = value;
          i++;
          break;
        case "success":
          args.success = value === "true";
          i++;
          break;
        case "note":
          args.note = value;
          i++;
          break;
        case "correlationId":
          args.correlationId = value;
          i++;
          break;
      }
    }
  }

  if (!args.action) {
    throw new Error("缺少 --action 参数");
  }

  return args as DeploymentLogArgs;
}

function getActionName(action: string): string {
  const names: Record<string, string> = {
    pull: "生产环境 - 拉取代码并重启",
    start: "生产环境 - 启动服务",
    stop: "生产环境 - 停止服务",
    restart: "生产环境 - 重启服务",
    push: "生产环境 - 推送代码",
    commit: "生产环境 - 提交代码",
  };
  return names[action] || `生产环境 - ${action}`;
}

function getActionCode(action: string): string {
  const codes: Record<string, string> = {
    pull: "GIT_PULL",
    start: AUDIT_ACTION_CODES.SERVICE_START,
    stop: AUDIT_ACTION_CODES.SERVICE_STOP,
    restart: AUDIT_ACTION_CODES.SERVICE_RESTART,
    push: "GIT_PUSH",
    commit: "GIT_COMMIT",
  };
  return codes[action] || action.toUpperCase();
}

async function logDeployment(args: DeploymentLogArgs) {
  const actionName = getActionName(args.action);
  const actionCode = getActionCode(args.action);

  // 构建操作备注
  const notes: string[] = [];
  if (args.operator) notes.push(`操作人: ${args.operator}`);
  if (args.gitBranch) notes.push(`分支: ${args.gitBranch}`);
  if (args.gitCommit) notes.push(`提交: ${args.gitCommit.substring(0, 8)}`);
  if (args.note) notes.push(args.note);

  // 构建 afterData（包含 git 信息）
  const afterData: Record<string, unknown> = {};
  if (args.gitCommit) afterData.gitCommit = args.gitCommit;
  if (args.gitBranch) afterData.gitBranch = args.gitBranch;
  if (args.operator) afterData.operator = args.operator;

  await prisma.$transaction(async (tx) => {
    await writeAuditEvent(tx, {
      actorId: null, // 脚本执行，无用户 ID
      actorType: "DEPLOYMENT_SCRIPT",
      actorName: args.operator || "系统",
      module: AUDIT_MODULES.DEPLOYMENT,
      actionCode,
      actionName,
      isSuccess: args.success,
      operationNote: notes.join(", "),
      afterData: Object.keys(afterData).length > 0 ? afterData : undefined,
      correlationId: args.correlationId,
    });
  });

  console.log(`✓ 已记录部署日志: ${actionName} - ${args.success ? "成功" : "失败"}`);
}

// 主程序
async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    await logDeployment(args);
    process.exit(0);
  } catch (error) {
    console.error("记录部署日志失败:", error);
    process.exit(1);
  }
}

main();
