import { prisma } from "@/server/db/prisma";
import { toBusinessDate } from "@/server/quarterly-work/value-tracking-period";

/**
 * 项目首版完成度统计快照的唯一写入口。
 *
 * 统计值只有一份，存放在 Project 表，不可手工编辑；
 * 以下时机由服务端自动重算：
 * - 需求新建 / 编辑（工作量、是否需开发、状态）/ 删除；
 * - 项目上线时间变更。
 *
 * 口径：needsDevelopment = true、未软删除、非 CLOSED 的需求；
 * 缺工作量的需求不计入合计；完成日 <= 上线日为首版，上线后完成或尚未完成为迭代；
 * 项目未上线时全部计入首版。
 */
export async function recalcProjectWorkloadSnapshot(
  projectId: string,
  client: Pick<typeof prisma, "project" | "quarterlyWork"> = prisma,
) {
  const project = await client.project.findUnique({
    where: { id: projectId },
    select: { id: true, launchedAt: true, needsDevelopment: true },
  });
  if (!project) return;

  // 开发需求：未软删除、需开发、非关闭（取消未投入）
  const requirements = await client.quarterlyWork.findMany({
    where: { projectId, deletedAt: null, needsDevelopment: true, status: { not: "CLOSED" } },
    select: { completedAt: true, workloadPersonDay: true },
  });

  const launchDay = project.launchedAt ? toBusinessDate(project.launchedAt) : null;
  let firstVersionWorkload = 0;
  let postLaunchIterationWorkload = 0;
  for (const requirement of requirements) {
    if (requirement.workloadPersonDay === null || requirement.workloadPersonDay === undefined) continue;
    if (launchDay && (!requirement.completedAt || toBusinessDate(requirement.completedAt) > launchDay)) {
      postLaunchIterationWorkload += requirement.workloadPersonDay;
    } else {
      firstVersionWorkload += requirement.workloadPersonDay;
    }
  }

  // 项目是否开发 = 存在开发需求（未删、非关闭）或 已上线；
  // 最后一个开发需求被删除/关闭时自动转为非开发项目，并退出价值跟踪列表
  const nextNeedsDevelopment = requirements.length > 0 || Boolean(project.launchedAt);

  // 人天保留 1 位小数，避免 Float 求和长尾
  const round1 = (value: number) => Math.round(value * 10) / 10;
  await client.project.update({
    where: { id: projectId },
    data: {
      firstVersionWorkloadPersonDay: round1(firstVersionWorkload),
      postLaunchIterationWorkloadPersonDay: round1(postLaunchIterationWorkload),
      totalWorkloadPersonDay: round1(firstVersionWorkload + postLaunchIterationWorkload),
      ...(project.needsDevelopment !== nextNeedsDevelopment ? { needsDevelopment: nextNeedsDevelopment } : {}),
    },
  });
}
