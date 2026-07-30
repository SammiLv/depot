// @ts-nocheck -- Phase 3 one-shot script targets the pre-Phase-6 Prisma schema.
import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { getLegacyMetric, getLegacyPlan, loadLegacyMetricsById, loadLegacyPlansById } from "./legacy-plan";

type Mode = "dry-run" | "apply";
type TargetKind = "METRIC" | "SOURCE";

type Target = {
  kind: TargetKind;
  id: string;
  authorityMetricId: string;
  name: string;
};

type Diagnostic = {
  severity: "INFO" | "ERROR";
  kind: string;
  normalizedKey: string;
  targetName: string;
  canonicalQuarterTargetId: string | null;
  duplicateQuarterTargetId: string | null;
  year: number | null;
  quarter: number | null;
  canonicalCurrentValue: number | null;
  duplicateCurrentValue: number | null;
  detail: string;
};

const confirmedConflictDecisions = [
  {
    sourceName: "C 端产品",
    year: 2026,
    quarter: 1,
    keepCurrentValue: 2187,
    discardCurrentValues: [2165],
  },
  {
    sourceName: "C 端产品",
    year: 2026,
    quarter: 2,
    keepCurrentValue: 2619,
    discardCurrentValues: [2836],
  },
] as const;

const mode = parseMode(process.argv.slice(2));
const databaseUrl = resolveDatabaseUrl();
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

function parseMode(args: string[]): Mode {
  const supported = args.filter((arg) => arg === "--dry-run" || arg === "--apply");
  if (supported.length !== 1 || args.length !== 1) {
    throw new Error(
      "用法：npx tsx scripts/annual-goals-migration/data/phase3-migrate-quarter-targets.ts --dry-run | --apply"
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

function normalizedKey(target: Target, year: number, quarter: number) {
  return `${target.kind}:${target.id}:${year}:Q${quarter}`;
}

function dateValue(value: Date | null) {
  return value?.getTime() ?? null;
}

function sameQuarterDefinition(
  left: {
    targetValue: number;
    currentValue: number;
    startDate: Date | null;
    endDate: Date | null;
    riskStatus: string;
  },
  right: {
    targetValue: number;
    currentValue: number;
    startDate: Date | null;
    endDate: Date | null;
    riskStatus: string;
  }
) {
  return (
    left.targetValue === right.targetValue &&
    left.currentValue === right.currentValue &&
    dateValue(left.startDate) === dateValue(right.startDate) &&
    dateValue(left.endDate) === dateValue(right.endDate) &&
    left.riskStatus === right.riskStatus
  );
}

function isConfirmedConflict(
  target: Target,
  canonical: { year: number; quarter: number; currentValue: number },
  duplicate: { currentValue: number }
) {
  if (target.kind !== "SOURCE") return false;
  return confirmedConflictDecisions.some(
    (decision) =>
      decision.sourceName === target.name &&
      decision.year === canonical.year &&
      decision.quarter === canonical.quarter &&
      decision.keepCurrentValue === canonical.currentValue &&
      (decision.discardCurrentValues as readonly number[]).includes(duplicate.currentValue)
  );
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function writeReport(diagnostics: Diagnostic[]) {
  const reportDirectory = path.resolve(process.cwd(), "requirements/handoff/prod-env");
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, `2026-07-28-年度指标季度归一-${mode}-报告.csv`);
  const headers: (keyof Diagnostic)[] = [
    "severity",
    "kind",
    "normalizedKey",
    "targetName",
    "canonicalQuarterTargetId",
    "duplicateQuarterTargetId",
    "year",
    "quarter",
    "canonicalCurrentValue",
    "duplicateCurrentValue",
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
  const [orgNodes, metrics, sources, quarterTargets, progressRows] = await Promise.all([
    prisma.orgNode.findMany({
      select: { id: true, nodeType: true, parentId: true },
    }),
    prisma.annualGoalMetric.findMany({
      include: { plan: true },
    }),
    prisma.annualGoalMetricSource.findMany({
      include: { parentMetric: { include: { plan: true } } },
    }),
    prisma.annualGoalQuarterTarget.findMany({
      where: { deletedAt: null },
      orderBy: [{ year: "asc" }, { quarter: "asc" }, { createdAt: "asc" }],
    }),
    prisma.annualGoalProgress.findMany({
      select: { id: true, metricId: true, sourceMetricId: true, quarterTargetId: true },
    }),
  ]);

  const diagnostics: Diagnostic[] = [];
  const legacyById = loadLegacyPlansById();
  const legacyMetricById = loadLegacyMetricsById();
  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const metricById = new Map(metrics.map((metric) => [metric.id, metric]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const activeDepartmentMetrics = metrics.filter((metric) => {
    const legacy = getLegacyPlan(legacyById, metric.planId);
    return (
      !metric.deletedAt &&
      !metric.plan.deletedAt &&
      legacy?.ownerType === "DEPARTMENT"
    );
  });

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

  function resolveSourceTarget(sourceMetricId: string): Target | null {
    const source = sourceById.get(sourceMetricId);
    const sourcePlanLegacy = getLegacyPlan(legacyById, source?.parentMetric.planId);
    if (
      !source ||
      source.deletedAt ||
      source.parentMetric.deletedAt ||
      source.parentMetric.plan.deletedAt ||
      sourcePlanLegacy?.ownerType !== "DEPARTMENT"
    ) {
      return null;
    }
    return {
      kind: "SOURCE",
      id: source.id,
      authorityMetricId: source.parentMetricId,
      name: source.name,
    };
  }

  function resolveQuarterTarget(
    quarterTarget: (typeof quarterTargets)[number]
  ): { target: Target | null; error: string | null } {
    if (quarterTarget.sourceMetricId) {
      return {
        target: resolveSourceTarget(quarterTarget.sourceMetricId),
        error: "sourceMetricId 未指向有效部门元指标",
      };
    }
    if (!quarterTarget.metricId) {
      return { target: null, error: "metricId/sourceMetricId 均为空" };
    }

    const metric = metricById.get(quarterTarget.metricId);
    if (!metric || metric.deletedAt || metric.plan.deletedAt) {
      return { target: null, error: "metricId 未指向有效指标" };
    }
    if (metric.sourceMetricId) {
      const target = resolveSourceTarget(metric.sourceMetricId);
      return {
        target,
        error: target ? null : "TEAM 指标的 sourceMetricId 未指向有效部门元指标",
      };
    }
    const legacyMetric = getLegacyMetric(legacyMetricById, metric.id);
    if (legacyMetric?.sourceMetricId) {
      const target = resolveSourceTarget(legacyMetric.sourceMetricId);
      return {
        target,
        error: target ? null : "TEAM 指标的 sourceMetricId 未指向有效部门元指标",
      };
    }
    const planLegacy = getLegacyPlan(legacyById, metric.planId);
    if (planLegacy?.ownerType === "DEPARTMENT") {
      return {
        target: {
          kind: "METRIC",
          id: metric.id,
          authorityMetricId: metric.id,
          name: metric.name,
        },
        error: null,
      };
    }
    if (planLegacy?.ownerType !== "TEAM" || !planLegacy.ownerOrgNodeId) {
      return { target: null, error: "季度指标不属于有效部门或小组方案" };
    }

    const departmentOrgNodeId = findDepartmentOrgNodeId(planLegacy.ownerOrgNodeId);
    if (!departmentOrgNodeId) {
      return { target: null, error: "TEAM 方案无法定位所属部门" };
    }
    const matches = activeDepartmentMetrics.filter(
      (departmentMetric) => {
        const departmentPlanLegacy = getLegacyPlan(legacyById, departmentMetric.planId);
        return (
          departmentMetric.plan.year === metric.plan.year &&
          (departmentPlanLegacy?.departmentOrgNodeId ?? departmentPlanLegacy?.ownerOrgNodeId) ===
            departmentOrgNodeId &&
          departmentMetric.metricCode === metric.metricCode
        );
      }
    );
    if (matches.length !== 1) {
      return {
        target: null,
        error: `按部门、年份和 metricCode 匹配到 ${matches.length} 条部门指标`,
      };
    }
    return {
      target: {
        kind: "METRIC",
        id: matches[0].id,
        authorityMetricId: matches[0].id,
        name: matches[0].name,
      },
      error: null,
    };
  }

  const groups = new Map<
    string,
    {
      target: Target;
      year: number;
      quarter: number;
      rows: typeof quarterTargets;
    }
  >();

  for (const quarterTarget of quarterTargets) {
    const resolved = resolveQuarterTarget(quarterTarget);
    if (!resolved.target) {
      diagnostics.push({
        severity: "ERROR",
        kind: "UNRESOLVED_QUARTER_TARGET",
        normalizedKey: "",
        targetName: "",
        canonicalQuarterTargetId: null,
        duplicateQuarterTargetId: quarterTarget.id,
        year: quarterTarget.year,
        quarter: quarterTarget.quarter,
        canonicalCurrentValue: null,
        duplicateCurrentValue: quarterTarget.currentValue,
        detail: resolved.error ?? "无法解析权威指标",
      });
      continue;
    }
    const key = normalizedKey(resolved.target, quarterTarget.year, quarterTarget.quarter);
    const group = groups.get(key) ?? {
      target: resolved.target,
      year: quarterTarget.year,
      quarter: quarterTarget.quarter,
      rows: [],
    };
    group.rows.push(quarterTarget);
    groups.set(key, group);
  }

  const migrationGroups: {
    key: string;
    target: Target;
    canonical: (typeof quarterTargets)[number];
    duplicates: typeof quarterTargets;
  }[] = [];

  for (const [key, group] of groups) {
    const authorityRows = group.rows.filter((row) =>
      group.target.kind === "SOURCE"
        ? row.sourceMetricId === group.target.id &&
          (row.metricId === group.target.authorityMetricId || row.metricId === null)
        : row.metricId === group.target.id && row.sourceMetricId === null
    );
    const canonical = authorityRows[0] ?? group.rows[0];
    const duplicates = group.rows.filter((row) => row.id !== canonical.id);

    for (const duplicate of duplicates) {
      if (sameQuarterDefinition(canonical, duplicate)) {
        diagnostics.push({
          severity: "INFO",
          kind: "MERGE_IDENTICAL_DUPLICATE",
          normalizedKey: key,
          targetName: group.target.name,
          canonicalQuarterTargetId: canonical.id,
          duplicateQuarterTargetId: duplicate.id,
          year: canonical.year,
          quarter: canonical.quarter,
          canonicalCurrentValue: canonical.currentValue,
          duplicateCurrentValue: duplicate.currentValue,
          detail: "季度定义和值一致，保留权威行并软删重复行",
        });
      } else if (authorityRows.includes(canonical) && isConfirmedConflict(group.target, canonical, duplicate)) {
        diagnostics.push({
          severity: "INFO",
          kind: "RESOLVED_KEEP_AUTHORITY",
          normalizedKey: key,
          targetName: group.target.name,
          canonicalQuarterTargetId: canonical.id,
          duplicateQuarterTargetId: duplicate.id,
          year: canonical.year,
          quarter: canonical.quarter,
          canonicalCurrentValue: canonical.currentValue,
          duplicateCurrentValue: duplicate.currentValue,
          detail: "按已确认裁决保留部门权威值并软删 TEAM 行",
        });
      } else {
        diagnostics.push({
          severity: "ERROR",
          kind: "UNRESOLVED_QUARTER_CONFLICT",
          normalizedKey: key,
          targetName: group.target.name,
          canonicalQuarterTargetId: canonical.id,
          duplicateQuarterTargetId: duplicate.id,
          year: canonical.year,
          quarter: canonical.quarter,
          canonicalCurrentValue: canonical.currentValue,
          duplicateCurrentValue: duplicate.currentValue,
          detail: "目标值、当前值、日期或风险状态不一致，且没有匹配到已确认裁决",
        });
      }
    }

    migrationGroups.push({
      key,
      target: group.target,
      canonical,
      duplicates,
    });
  }

  const expectedSourceCurrentValues = new Map<string, number>();
  const expectedDirectMetricCurrentValues = new Map<string, number>();
  for (const group of migrationGroups) {
    const targetMap =
      group.target.kind === "SOURCE" ? expectedSourceCurrentValues : expectedDirectMetricCurrentValues;
    targetMap.set(group.target.id, (targetMap.get(group.target.id) ?? 0) + group.canonical.currentValue);
  }

  const sourceCurrentValueUpdates = sources
    .filter((source) => !source.deletedAt)
    .map((source) => ({
      id: source.id,
      currentValue: expectedSourceCurrentValues.get(source.id) ?? 0,
      changed: source.currentValue !== (expectedSourceCurrentValues.get(source.id) ?? 0),
    }));
  const sourcesByParentMetric = new Map<string, typeof sources>();
  for (const source of sources.filter((item) => !item.deletedAt)) {
    const children = sourcesByParentMetric.get(source.parentMetricId) ?? [];
    children.push(source);
    sourcesByParentMetric.set(source.parentMetricId, children);
  }
  const metricCurrentValueUpdates = activeDepartmentMetrics.flatMap((metric) => {
    const childSources = sourcesByParentMetric.get(metric.id) ?? [];
    let currentValue: number | null = null;
    if (childSources.length > 0) {
      currentValue = childSources.reduce(
        (sum, source) => sum + (expectedSourceCurrentValues.get(source.id) ?? 0),
        0
      );
    } else if (expectedDirectMetricCurrentValues.has(metric.id)) {
      currentValue = expectedDirectMetricCurrentValues.get(metric.id) ?? 0;
    }
    return currentValue === null
      ? []
      : [{ id: metric.id, currentValue, changed: metric.currentValue !== currentValue }];
  });

  const reportPath = await writeReport(diagnostics);
  const blockingDiagnostics = diagnostics.filter((item) => item.severity === "ERROR");
  const duplicateIds = migrationGroups.flatMap((group) => group.duplicates.map((row) => row.id));
  const progressReferenceUpdates = migrationGroups.flatMap((group) => {
    const groupQuarterTargetIds = new Set([
      group.canonical.id,
      ...group.duplicates.map((row) => row.id),
    ]);
    return progressRows.filter(
      (row) =>
        row.quarterTargetId !== null &&
        groupQuarterTargetIds.has(row.quarterTargetId) &&
        (row.quarterTargetId !== group.canonical.id ||
          row.metricId !== group.target.authorityMetricId ||
          row.sourceMetricId !== (group.target.kind === "SOURCE" ? group.target.id : null))
    );
  });
  const canonicalReferenceUpdates = migrationGroups.filter((group) =>
    group.target.kind === "SOURCE"
      ? group.canonical.metricId !== null || group.canonical.sourceMetricId !== group.target.id
      : group.canonical.metricId !== group.target.id || group.canonical.sourceMetricId !== null
  ).length;

  console.log(`模式：${mode}`);
  console.log(`有效季度输入行：${quarterTargets.length}`);
  console.log(`归一后季度组：${migrationGroups.length}`);
  console.log(`权威引用待规范：${canonicalReferenceUpdates}`);
  console.log(`重复季度待软删：${duplicateIds.length}`);
  console.log(`Progress 待重指向：${progressReferenceUpdates.length}`);
  console.log(`元指标 currentValue 待更新：${sourceCurrentValueUpdates.filter((item) => item.changed).length}`);
  console.log(`部门指标 currentValue 待更新：${metricCurrentValueUpdates.filter((item) => item.changed).length}`);
  console.log(`已确认/一致合并：${diagnostics.filter((item) => item.severity === "INFO").length}`);
  console.log(`阻断问题：${blockingDiagnostics.length}`);
  console.log(`报告：${reportPath}`);

  if (blockingDiagnostics.length > 0) {
    throw new Error("存在未解析季度指标或未裁决冲突，未执行归一化");
  }
  if (mode === "dry-run") {
    console.log("dry-run 完成，数据库未修改");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const deletedAt = new Date();
      for (const group of migrationGroups) {
        const canonicalNeedsUpdate =
          group.target.kind === "SOURCE"
            ? group.canonical.metricId !== null || group.canonical.sourceMetricId !== group.target.id
            : group.canonical.metricId !== group.target.id || group.canonical.sourceMetricId !== null;
        if (canonicalNeedsUpdate) {
          await tx.annualGoalQuarterTarget.update({
            where: { id: group.canonical.id },
            data:
              group.target.kind === "SOURCE"
                ? { metricId: null, sourceMetricId: group.target.id }
                : { metricId: group.target.id, sourceMetricId: null },
          });
        }

        const groupQuarterTargetIds = [group.canonical.id, ...group.duplicates.map((row) => row.id)];
        for (const progress of progressRows.filter(
          (row) =>
            row.quarterTargetId !== null &&
            groupQuarterTargetIds.includes(row.quarterTargetId) &&
            (row.quarterTargetId !== group.canonical.id ||
              row.metricId !== group.target.authorityMetricId ||
              row.sourceMetricId !== (group.target.kind === "SOURCE" ? group.target.id : null))
        )) {
          await tx.annualGoalProgress.update({
            where: { id: progress.id },
            data: {
              quarterTargetId: group.canonical.id,
              metricId: group.target.authorityMetricId,
              sourceMetricId: group.target.kind === "SOURCE" ? group.target.id : null,
            },
          });
        }

        if (group.duplicates.length > 0) {
          await tx.annualGoalQuarterTarget.updateMany({
            where: { id: { in: group.duplicates.map((row) => row.id) } },
            data: { deletedAt },
          });
        }
      }

      for (const source of sourceCurrentValueUpdates) {
        if (source.changed) {
          await tx.annualGoalMetricSource.update({
            where: { id: source.id },
            data: { currentValue: source.currentValue },
          });
        }
      }
      for (const metric of metricCurrentValueUpdates) {
        if (metric.changed) {
          await tx.annualGoalMetric.update({
            where: { id: metric.id },
            data: { currentValue: metric.currentValue },
          });
        }
      }
    },
    { timeout: 120_000 }
  );

  console.log("季度与进度归一化完成");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
