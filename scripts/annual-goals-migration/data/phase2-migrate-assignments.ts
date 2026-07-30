// @ts-nocheck -- Phase 2 one-shot script targets the pre-Phase-6 Prisma schema.
import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { AnnualGoalPlanStatus, PrismaClient } from "@prisma/client";
import { getLegacyMetric, getLegacyPlan, loadLegacyMetricsById, loadLegacyPlansById, mapLegacyPlanStatus } from "./legacy-plan";

type Mode = "dry-run" | "apply";

type Diagnostic = {
  severity: "INFO" | "ERROR";
  kind: string;
  planId: string;
  planName: string;
  teamOrgNodeId: string | null;
  teamName: string | null;
  metricId: string | null;
  metricCode: string | null;
  metricName: string | null;
  targetType: "METRIC" | "SOURCE" | null;
  targetId: string | null;
  detail: string;
};

type AssignmentCandidate = {
  teamOrgNodeId: string;
  metricId: string | null;
  sourceMetricId: string | null;
  weight: number;
  responsibleUserId: string | null;
  sortOrder: number;
  createdById: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  restoreId: string | null;
};

const mode = parseMode(process.argv.slice(2));
const databaseUrl = resolveDatabaseUrl();
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

function parseMode(args: string[]): Mode {
  const supported = args.filter((arg) => arg === "--dry-run" || arg === "--apply");
  if (supported.length !== 1 || args.length !== 1) {
    throw new Error(
      "用法：npx tsx scripts/annual-goals-migration/data/phase2-migrate-assignments.ts --dry-run | --apply"
    );
  }
  return supported[0] === "--apply" ? "apply" : "dry-run";
}

function resolveDatabaseUrl() {
  const configured = process.env.DATABASE_URL;
  if (!configured || configured === "file:./dev.db") {
    return `file:${path.resolve(process.cwd(), "db/dev.db")}`;
  }
  if (!configured.startsWith("file:")) {
    return configured;
  }
  const rawPath = configured.slice("file:".length);
  return path.isAbsolute(rawPath) ? configured : `file:${path.resolve(process.cwd(), rawPath)}`;
}

function sameNullable(left: string | null, right: string | null) {
  return left === right;
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function writeReport(diagnostics: Diagnostic[]) {
  const reportDirectory = path.resolve(process.cwd(), "requirements/handoff/prod-env");
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, `2026-07-28-年度指标承接回填-${mode}-报告.csv`);
  const headers: (keyof Diagnostic)[] = [
    "severity",
    "kind",
    "planId",
    "planName",
    "teamOrgNodeId",
    "teamName",
    "metricId",
    "metricCode",
    "metricName",
    "targetType",
    "targetId",
    "detail",
  ];
  const rows = [
    headers.map(csvCell).join(","),
    ...diagnostics.map((item) => headers.map((header) => csvCell(item[header])).join(",")),
  ];
  await writeFile(reportPath, `${rows.join("\n")}\n`, "utf8");
  return path.relative(process.cwd(), reportPath);
}

async function main() {
  const [orgNodes, plans, sources, existingAssignments] = await Promise.all([
    prisma.orgNode.findMany({
      select: { id: true, name: true, nodeType: true, parentId: true },
    }),
    prisma.annualGoalPlan.findMany({
      where: { deletedAt: null },
      include: {
        metrics: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ year: "asc" }, { createdAt: "asc" }],
    }),
    prisma.annualGoalMetricSource.findMany({
      where: { deletedAt: null },
      include: {
        parentMetric: {
          include: { plan: true },
        },
      },
    }),
    prisma.annualGoalMetricAssignment.findMany({
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  const diagnostics: Diagnostic[] = [];
  const legacyById = loadLegacyPlansById();
  const legacyMetricById = loadLegacyMetricsById();
  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const departmentPlans = plans.filter((plan) => getLegacyPlan(legacyById, plan.id)?.ownerType === "DEPARTMENT");
  const teamPlans = plans.filter((plan) => getLegacyPlan(legacyById, plan.id)?.ownerType === "TEAM");
  const departmentPlanUpdates = departmentPlans.map((plan) => {
    const legacy = getLegacyPlan(legacyById, plan.id)!;
    return {
      id: plan.id,
      departmentOrgNodeId: legacy.ownerOrgNodeId,
      status: mapLegacyPlanStatus(legacy) as AnnualGoalPlanStatus,
    };
  });

  for (const plan of departmentPlans) {
    const legacy = getLegacyPlan(legacyById, plan.id)!;
    const owner = legacy.ownerOrgNodeId ? orgNodeById.get(legacy.ownerOrgNodeId) : null;
    if (!legacy.ownerOrgNodeId || !owner || owner.nodeType !== "DEPARTMENT") {
      diagnostics.push({
        severity: "ERROR",
        kind: "INVALID_DEPARTMENT_PLAN_OWNER",
        planId: plan.id,
        planName: plan.name,
        teamOrgNodeId: null,
        teamName: null,
        metricId: null,
        metricCode: null,
        metricName: null,
        targetType: null,
        targetId: null,
        detail: "部门方案缺少有效的 DEPARTMENT ownerOrgNodeId",
      });
    }
  }

  function findDepartmentOrgNodeId(teamOrgNodeId: string) {
    let current = orgNodeById.get(teamOrgNodeId);
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.nodeType === "DEPARTMENT") return current.id;
      visited.add(current.id);
      current = current.parentId ? orgNodeById.get(current.parentId) : undefined;
    }
    return null;
  }

  const candidateByKey = new Map<string, AssignmentCandidate>();
  let alreadyMigrated = 0;
  let assignmentsToRestore = 0;

  for (const plan of teamPlans) {
    const legacy = getLegacyPlan(legacyById, plan.id)!;
    const team = legacy.ownerOrgNodeId ? orgNodeById.get(legacy.ownerOrgNodeId) : null;
    const departmentOrgNodeId =
      legacy.ownerOrgNodeId && team?.nodeType === "TEAM" ? findDepartmentOrgNodeId(legacy.ownerOrgNodeId) : null;

    if (!legacy.ownerOrgNodeId || !team || team.nodeType !== "TEAM" || !departmentOrgNodeId) {
      diagnostics.push({
        severity: "INFO",
        kind: "SKIPPED_ORPHAN_TEAM_PLAN",
        planId: plan.id,
        planName: plan.name,
        teamOrgNodeId: legacy.ownerOrgNodeId,
        teamName: team?.name ?? null,
        metricId: null,
        metricCode: null,
        metricName: null,
        targetType: null,
        targetId: null,
        detail: `已按业务确认跳过 ORPHAN 方案，包含 ${plan.metrics.length} 条有效指标`,
      });
      continue;
    }

    for (const metric of plan.metrics) {
      let targetType: "METRIC" | "SOURCE";
      let targetId: string;
      const legacyMetric = getLegacyMetric(legacyMetricById, metric.id);
      const linkedSourceMetricId = legacyMetric?.sourceMetricId ?? null;

      if (linkedSourceMetricId) {
        const source = sourceById.get(linkedSourceMetricId);
        const sourcePlan = source?.parentMetric.plan;
        const sourceLegacy = getLegacyPlan(legacyById, sourcePlan?.id);
        const sourceDepartmentOrgNodeId =
          sourceLegacy?.departmentOrgNodeId ?? sourceLegacy?.ownerOrgNodeId ?? null;
        if (
          !source ||
          !sourcePlan ||
          sourcePlan.deletedAt ||
          sourceLegacy?.ownerType !== "DEPARTMENT" ||
          sourcePlan.year !== plan.year ||
          sourceDepartmentOrgNodeId !== departmentOrgNodeId
        ) {
          diagnostics.push({
            severity: "ERROR",
            kind: "UNMATCHED_SOURCE_METRIC",
            planId: plan.id,
            planName: plan.name,
            teamOrgNodeId: team.id,
            teamName: team.name,
            metricId: metric.id,
            metricCode: metric.metricCode,
            metricName: metric.name,
            targetType: "SOURCE",
            targetId: linkedSourceMetricId,
            detail: "sourceMetricId 不属于该小组所在部门的同年度有效部门方案",
          });
          continue;
        }
        targetType = "SOURCE";
        targetId = source.id;
      } else {
        const matchingPlans = departmentPlans.filter((departmentPlan) => {
          const departmentLegacy = getLegacyPlan(legacyById, departmentPlan.id)!;
          return (
            departmentPlan.year === plan.year &&
            (departmentLegacy.departmentOrgNodeId ?? departmentLegacy.ownerOrgNodeId) === departmentOrgNodeId
          );
        });
        const matchingMetrics = matchingPlans.flatMap((departmentPlan) =>
          departmentPlan.metrics.filter(
            (departmentMetric) =>
              !departmentMetric.sourceMetricId && departmentMetric.metricCode === metric.metricCode
          )
        );
        if (matchingMetrics.length !== 1) {
          diagnostics.push({
            severity: "ERROR",
            kind: matchingMetrics.length === 0 ? "UNMATCHED_DEPARTMENT_METRIC" : "AMBIGUOUS_DEPARTMENT_METRIC",
            planId: plan.id,
            planName: plan.name,
            teamOrgNodeId: team.id,
            teamName: team.name,
            metricId: metric.id,
            metricCode: metric.metricCode,
            metricName: metric.name,
            targetType: "METRIC",
            targetId: null,
            detail: `按部门、年份和 metricCode 匹配到 ${matchingMetrics.length} 条部门指标`,
          });
          continue;
        }
        targetType = "METRIC";
        targetId = matchingMetrics[0].id;
      }

      const key = `${team.id}:${targetType}:${targetId}`;
      if (candidateByKey.has(key)) {
        diagnostics.push({
          severity: "ERROR",
          kind: "DUPLICATE_TEAM_ASSIGNMENT_SOURCE",
          planId: plan.id,
          planName: plan.name,
          teamOrgNodeId: team.id,
          teamName: team.name,
          metricId: metric.id,
          metricCode: metric.metricCode,
          metricName: metric.name,
          targetType,
          targetId,
          detail: "有效 TEAM 指标中存在重复承接关系",
        });
        continue;
      }

      const activeExisting = existingAssignments.find(
        (assignment) =>
          !assignment.deletedAt &&
          assignment.teamOrgNodeId === team.id &&
          (targetType === "SOURCE"
            ? assignment.sourceMetricId === targetId && assignment.metricId === null
            : assignment.metricId === targetId && assignment.sourceMetricId === null)
      );
      if (activeExisting) {
        const fieldsMatch =
          activeExisting.weight === metric.weight &&
          activeExisting.sortOrder === metric.sortOrder &&
          sameNullable(activeExisting.responsibleUserId, metric.responsibleUserId);
        if (!fieldsMatch) {
          diagnostics.push({
            severity: "ERROR",
            kind: "EXISTING_ASSIGNMENT_FIELD_CONFLICT",
            planId: plan.id,
            planName: plan.name,
            teamOrgNodeId: team.id,
            teamName: team.name,
            metricId: metric.id,
            metricCode: metric.metricCode,
            metricName: metric.name,
            targetType,
            targetId,
            detail: "现有 Assignment 的 weight、sortOrder 或 responsibleUserId 与 TEAM 指标不一致",
          });
        } else {
          alreadyMigrated += 1;
        }
        continue;
      }

      const deletedExisting = existingAssignments.find(
        (assignment) =>
          assignment.deletedAt &&
          assignment.teamOrgNodeId === team.id &&
          (targetType === "SOURCE"
            ? assignment.sourceMetricId === targetId && assignment.metricId === null
            : assignment.metricId === targetId && assignment.sourceMetricId === null)
      );
      if (deletedExisting) assignmentsToRestore += 1;

      candidateByKey.set(key, {
        teamOrgNodeId: team.id,
        metricId: targetType === "METRIC" ? targetId : null,
        sourceMetricId: targetType === "SOURCE" ? targetId : null,
        weight: metric.weight,
        responsibleUserId: metric.responsibleUserId,
        sortOrder: metric.sortOrder,
        createdById: metric.createdById ?? plan.createdById,
        updatedById: metric.updatedById,
        createdAt: metric.createdAt,
        updatedAt: metric.updatedAt,
        restoreId: deletedExisting?.id ?? null,
      });
    }
  }

  const reportPath = await writeReport(diagnostics);
  const blockingDiagnostics = diagnostics.filter((item) => item.severity === "ERROR");
  const candidates = [...candidateByKey.values()];

  console.log(`模式：${mode}`);
  console.log(`部门方案待回填：${departmentPlanUpdates.length}`);
  console.log(`Assignment 待新增：${candidates.length - assignmentsToRestore}`);
  console.log(`Assignment 待恢复：${assignmentsToRestore}`);
  console.log(`Assignment 已存在且一致：${alreadyMigrated}`);
  console.log(`已确认跳过项：${diagnostics.filter((item) => item.severity === "INFO").length}`);
  console.log(`阻断问题：${blockingDiagnostics.length}`);
  console.log(`报告：${reportPath}`);

  if (blockingDiagnostics.length > 0) {
    throw new Error("存在未匹配或冲突数据，未执行回填");
  }
  if (mode === "dry-run") {
    console.log("dry-run 完成，数据库未修改");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const plan of departmentPlanUpdates) {
      if (!plan.departmentOrgNodeId) {
        throw new Error(`部门方案 ${plan.id} 缺少 departmentOrgNodeId`);
      }
      await tx.annualGoalPlan.update({
        where: { id: plan.id },
        data: {
          departmentOrgNodeId: plan.departmentOrgNodeId,
          status: plan.status,
        },
      });
    }

    for (const candidate of candidates) {
      const { restoreId, ...data } = candidate;
      if (restoreId) {
        await tx.annualGoalMetricAssignment.update({
          where: { id: restoreId },
          data: { ...data, deletedAt: null },
        });
      } else {
        await tx.annualGoalMetricAssignment.create({ data });
      }
    }
  });

  console.log("Assignment 回填完成");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
