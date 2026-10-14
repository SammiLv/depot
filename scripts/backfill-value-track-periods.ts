/**
 * 价值跟踪历史数据回填与预检脚本。
 *
 * 用法：
 *   pnpm tsx scripts/backfill-value-track-periods.ts           # 预检，只输出报告不写库
 *   pnpm tsx scripts/backfill-value-track-periods.ts --apply   # 执行回填
 *
 * 规则：
 * - 只处理 deletedAt 为空且尚未回填 trackingSequence 的 RequirementValueTrack；
 * - 根据项目 launchedAt 与记录 trackedAt 推断 trackingSequence（1 或 2），
 *   回填 periodStartAt / checkpointAt / deadlineAt / completedAt(=trackedAt)；
 * - 无法明确归类的记录不删除、不修改，输出冲突清单由业务确认；
 * - 异常数据（已完成项目无上线时间、有跟踪记录但无上线时间、跟踪记录早于上线时间）
 *   只报告，不自动修复。
 */
import { prisma } from "@/server/db/prisma";
import { recalcProjectWorkloadSnapshot } from "@/server/quarterly-work/value-tracking-snapshot";
import {
  getValueTrackingSequence,
  getValueTrackingTaskDates,
  toBusinessDate,
} from "@/server/quarterly-work/value-tracking-period";

const apply = process.argv.includes("--apply");

type Anomaly = { kind: string; projectId: string; projectTitle: string; detail: string };

async function main() {
  const tracks = await prisma.requirementValueTrack.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      projectId: true,
      trackedAt: true,
      trackingSequence: true,
    },
    orderBy: { trackedAt: "asc" },
  });

  const projectIds = [...new Set(tracks.map((track) => track.projectId))];
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, title: true, status: true, launchedAt: true, valueTrackStatus: true },
  });
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  // 项目级异常预检
  const anomalies: Anomaly[] = [];
  const completedWithoutLaunch = await prisma.project.findMany({
    where: { status: "COMPLETED", launchedAt: null, deletedAt: null },
    select: { id: true, title: true },
  });
  for (const project of completedWithoutLaunch) {
    anomalies.push({
      kind: "COMPLETED_WITHOUT_LAUNCHED_AT",
      projectId: project.id,
      projectTitle: project.title,
      detail: "已完成项目缺少上线时间，不纳入首版完成度统计",
    });
  }

  const updates: Array<{ id: string; sequence: 1 | 2; periodStartAt: Date; checkpointAt: Date; deadlineAt: Date; trackedAt: Date }> = [];
  const conflicts: Anomaly[] = [];
  const sequenceByProject = new Map<string, Map<number, string[]>>();

  for (const track of tracks) {
    const project = projectMap.get(track.projectId);
    if (!project) {
      conflicts.push({
        kind: "TRACK_WITHOUT_PROJECT",
        projectId: track.projectId,
        projectTitle: "—",
        detail: `跟踪记录 ${track.id} 找不到项目`,
      });
      continue;
    }
    if (!project.launchedAt) {
      anomalies.push({
        kind: "TRACK_WITHOUT_LAUNCHED_AT",
        projectId: project.id,
        projectTitle: project.title,
        detail: `项目存在跟踪记录 ${track.id} 但缺少上线时间`,
      });
      continue;
    }
    if (track.trackingSequence !== null) {
      // 已回填，仅纳入重复检查
      const seen = sequenceByProject.get(project.id) ?? new Map<number, string[]>();
      seen.set(track.trackingSequence, [...(seen.get(track.trackingSequence) ?? []), track.id]);
      sequenceByProject.set(project.id, seen);
      continue;
    }

    if (toBusinessDate(track.trackedAt) < toBusinessDate(project.launchedAt)) {
      anomalies.push({
        kind: "TRACK_BEFORE_LAUNCH",
        projectId: project.id,
        projectTitle: project.title,
        detail: `跟踪记录 ${track.id} 填报时间 ${track.trackedAt.toISOString()} 早于上线时间 ${project.launchedAt.toISOString()}，按第 1 检查点回填`,
      });
    }

    const sequence = getValueTrackingSequence(project.launchedAt, track.trackedAt);
    if (sequence === null) {
      conflicts.push({
        kind: "TRACK_BEYOND_WINDOW",
        projectId: project.id,
        projectTitle: project.title,
        detail: `跟踪记录 ${track.id} 填报时间超出第 2 检查点，无法明确归类`,
      });
      continue;
    }

    const dates = getValueTrackingTaskDates(project.launchedAt, sequence);
    updates.push({
      id: track.id,
      sequence,
      periodStartAt: dates.periodStartAt,
      checkpointAt: dates.checkpointAt,
      deadlineAt: dates.deadlineAt,
      trackedAt: track.trackedAt,
    });

    const seen = sequenceByProject.get(project.id) ?? new Map<number, string[]>();
    seen.set(sequence, [...(seen.get(sequence) ?? []), track.id]);
    sequenceByProject.set(project.id, seen);
  }

  // 同项目同检查点重复记录 → 冲突清单，不允许脚本合并
  const conflictedKeys = new Set<string>();
  for (const [projectId, sequenceMap] of sequenceByProject) {
    for (const [sequence, ids] of sequenceMap) {
      if (ids.length > 1) {
        const project = projectMap.get(projectId);
        conflicts.push({
          kind: "DUPLICATE_SEQUENCE",
          projectId,
          projectTitle: project?.title ?? "—",
          detail: `项目存在 ${ids.length} 条第 ${sequence} 检查点记录：${ids.join(", ")}`,
        });
        conflictedKeys.add(`${projectId}:${sequence}`);
      }
    }
  }

  // 涉及冲突的记录不回填，待业务确认后人工处理
  const safeUpdates = updates.filter((update) => {
    const track = tracks.find((item) => item.id === update.id);
    return track && !conflictedKeys.has(`${track.projectId}:${update.sequence}`);
  });
  const skippedByConflict = updates.length - safeUpdates.length;

  // 项目首版完成度快照：全部未删除项目（快照字段由服务端维护，历史数据需重算一次）
  const snapshotProjectIds = (await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true },
  })).map((project) => project.id);

  // 历史已上线项目：补齐缺失的第 1 / 第 2 检查任务（不覆盖已有记录，含冲突项目缺失的序号）
  // 遵循初始化顺序：仅开发项目进入价值跟踪（needsDevelopment 由迁移先行回填）
  const launchedProjects = await prisma.project.findMany({
    where: { launchedAt: { not: null }, deletedAt: null, needsDevelopment: true },
    select: { id: true, title: true, launchedAt: true, valueTrackStatus: true },
  });
  const tracksByProject = new Map<string, typeof tracks>();
  for (const track of tracks) {
    const list = tracksByProject.get(track.projectId) ?? [];
    list.push(track);
    tracksByProject.set(track.projectId, list);
  }
  const taskCreations: Array<{ projectId: string; projectTitle: string; sequence: 1 | 2; periodStartAt: Date; checkpointAt: Date; deadlineAt: Date }> = [];
  // 存在重复检查点冲突的项目不自动补齐，待业务确认后人工处理
  const conflictedProjectIds = new Set([...conflictedKeys].map((key) => key.split(":")[0]));
  for (const project of launchedProjects) {
    if (conflictedProjectIds.has(project.id)) continue;
    const existingSequences = new Set(
      (tracksByProject.get(project.id) ?? []).map((track) => track.trackingSequence).filter((value) => value !== null),
    );
    for (const sequence of [1, 2] as const) {
      if (existingSequences.has(sequence)) continue;
      const dates = getValueTrackingTaskDates(project.launchedAt!, sequence);
      taskCreations.push({
        projectId: project.id,
        projectTitle: project.title,
        sequence,
        periodStartAt: dates.periodStartAt,
        checkpointAt: dates.checkpointAt,
        deadlineAt: dates.deadlineAt,
      });
    }
  }

  console.log(`\n=== 预检结果 ===`);
  console.log(`跟踪记录总数：${tracks.length}`);
  console.log(`待回填：${safeUpdates.length}（另有 ${skippedByConflict} 条因冲突跳过）`);
  console.log(`待补齐检查任务：${taskCreations.length}`);
  console.log(`待重算项目快照：${snapshotProjectIds.length}`);
  console.log(`项目级异常：${anomalies.length}`);
  console.log(`冲突记录：${conflicts.length}`);

  if (anomalies.length > 0) {
    console.log(`\n--- 异常清单 ---`);
    for (const anomaly of anomalies) {
      console.log(`[${anomaly.kind}] ${anomaly.projectTitle} (${anomaly.projectId})：${anomaly.detail}`);
    }
  }
  if (conflicts.length > 0) {
    console.log(`\n--- 冲突清单（需业务确认，脚本不做处理） ---`);
    for (const conflict of conflicts) {
      console.log(`[${conflict.kind}] ${conflict.projectTitle} (${conflict.projectId})：${conflict.detail}`);
    }
  }

  if (!apply) {
    console.log(`\n预检模式，未写入任何数据。确认无误后使用 --apply 执行回填。`);
    return;
  }

  for (const update of safeUpdates) {
    await prisma.requirementValueTrack.update({
      where: { id: update.id },
      data: {
        trackingSequence: update.sequence,
        periodStartAt: update.periodStartAt,
        checkpointAt: update.checkpointAt,
        deadlineAt: update.deadlineAt,
        completedAt: update.trackedAt,
      },
    });
  }
  console.log(`\n已回填 ${safeUpdates.length} 条跟踪记录。`);

  for (const creation of taskCreations) {
    await prisma.requirementValueTrack.create({
      data: {
        projectId: creation.projectId,
        trackingSequence: creation.sequence,
        periodStartAt: creation.periodStartAt,
        checkpointAt: creation.checkpointAt,
        deadlineAt: creation.deadlineAt,
      },
    });
  }
  console.log(`已补齐 ${taskCreations.length} 条检查任务。`);

  for (const projectId of snapshotProjectIds) {
    await recalcProjectWorkloadSnapshot(projectId);
  }
  console.log(`已重算 ${snapshotProjectIds.length} 个项目的首版完成度快照。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
