/**
 * 产品管理模块测试数据导入脚本
 *
 * 从 depot-clean 环境的 db/dev.db 复制产品管理相关数据（产品目标/项目/任务/价值跟踪/操作日志），
 * 并补充生成各状态（已完成/关闭/延期完成等）的合成数据，供产品管理模块改版验证使用。
 *
 * 用法：npx tsx scripts/import-product-demo-data.ts
 *
 * 注意：
 * - 目标库的产品表必须为空，否则脚本报错退出（幂等保护）。
 * - 两个环境的 User/OrgNode ID 体系不同，脚本按 loginName/name 重映射；
 *   源环境被引用的真实姓名用户在目标库不存在时会新建（无登录权限，仅展示用）。
 * - 源库中已删除的用户/组织节点引用统一回退到 admin / 产品部。
 */
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

const SOURCE_DB =
  "/Users/sammilv/Desktop/百度云盘/MacbookPro/AIStudy/ClaudeCode工作区/depot-clean/db/dev.db";
const TARGET_DB = path.resolve(process.cwd(), "db/dev.db");

const src = new Database(SOURCE_DB, { readonly: true });
const dst = new Database(TARGET_DB);

function newId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// ---------- 幂等保护 ----------
const existingGoals = dst
  .prepare("SELECT COUNT(*) AS c FROM ProductGoal")
  .get() as { c: number };
if (existingGoals.c > 0) {
  console.error(
    `[import] 目标库 ProductGoal 已有 ${existingGoals.c} 条数据，为避免重复导入，脚本退出。`,
  );
  console.error("[import] 如需重新导入，请先清空产品相关表或恢复备份。");
  process.exit(1);
}

// ---------- OrgNode 映射（按名称） ----------
const srcOrgById = new Map<string, { id: string; name: string }>();
for (const row of src
  .prepare("SELECT id, name FROM OrgNode")
  .all() as Array<{ id: string; name: string }>) {
  srcOrgById.set(row.id, row);
}
const dstOrgByName = new Map<string, string>();
for (const row of dst
  .prepare("SELECT id, name FROM OrgNode")
  .all() as Array<{ id: string; name: string }>) {
  dstOrgByName.set(row.name, row.id);
}
const DST_PRODUCT_DEPT_ID = dstOrgByName.get("产品部")!;
if (!DST_PRODUCT_DEPT_ID) {
  console.error("[import] 目标库缺少「产品部」组织节点，请先执行 npm run seed:full");
  process.exit(1);
}

function mapOrgId(srcOrgId: string | null, fallback?: string | null): string | null {
  if (!srcOrgId) return fallback ?? null;
  const srcNode = srcOrgById.get(srcOrgId);
  if (!srcNode) return fallback ?? DST_PRODUCT_DEPT_ID;
  return dstOrgByName.get(srcNode.name) ?? fallback ?? DST_PRODUCT_DEPT_ID;
}

// ---------- User 映射 ----------
const dstAdmin = dst
  .prepare("SELECT id FROM User WHERE loginName = 'admin'")
  .get() as { id: string };
const dstUserByLogin = new Map<string, string>();
const dstUserByName = new Map<string, string>();
for (const row of dst
  .prepare("SELECT id, name, loginName FROM User")
  .all() as Array<{ id: string; name: string; loginName: string | null }>) {
  if (row.loginName) dstUserByLogin.set(row.loginName, row.id);
  if (!dstUserByName.has(row.name)) dstUserByName.set(row.name, row.id);
}

const userIdMap = new Map<string, string>();
const createdUsers: string[] = [];

function mapUserId(srcUserId: string | null): string {
  if (!srcUserId) return dstAdmin.id;
  if (userIdMap.has(srcUserId)) return userIdMap.get(srcUserId)!;

  const srcUser = src
    .prepare(
      "SELECT id, name, loginName, roleType, orgNodeId FROM User WHERE id = ?",
    )
    .get(srcUserId) as
    | { id: string; name: string; loginName: string | null; roleType: string; orgNodeId: string | null }
    | undefined;

  // 源库中已不存在的用户 → 回退 admin
  if (!srcUser) {
    userIdMap.set(srcUserId, dstAdmin.id);
    return dstAdmin.id;
  }

  // 1) loginName 精确匹配（admin / product-manager）
  if (srcUser.loginName && dstUserByLogin.has(srcUser.loginName)) {
    const id = dstUserByLogin.get(srcUser.loginName)!;
    userIdMap.set(srcUserId, id);
    return id;
  }
  // 2) name 匹配
  if (dstUserByName.has(srcUser.name)) {
    const id = dstUserByName.get(srcUser.name)!;
    userIdMap.set(srcUserId, id);
    return id;
  }
  // 3) 新建真实姓名用户（无登录权限，仅展示用）
  const id = newId();
  const orgNodeId = mapOrgId(srcUser.orgNodeId);
  dst.prepare(
    `INSERT INTO User (id, name, loginName, passwordLoginEnabled, roleType, orgNodeId, isActive, createdAt, updatedAt)
     VALUES (?, ?, NULL, 0, ?, ?, 1, ?, ?)`,
  ).run(id, srcUser.name, srcUser.roleType, orgNodeId, now(), now());
  dstUserByName.set(srcUser.name, id);
  userIdMap.set(srcUserId, id);
  createdUsers.push(`${srcUser.name}(${srcUser.roleType})`);
  return id;
}

// ---------- 通用复制 ----------
function copyTable(
  table: string,
  remap: (row: Record<string, unknown>) => Record<string, unknown>,
): number {
  const rows = src.prepare(`SELECT * FROM "${table}"`).all() as Array<
    Record<string, unknown>
  >;
  if (rows.length === 0) return 0;
  // 只复制目标表存在的列（源库可能残留历史列，如 Project.productGoalId）
  const dstCols = new Set(
    (dst.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    ),
  );
  const cols = Object.keys(rows[0]).filter((c) => dstCols.has(c));
  const stmt = dst.prepare(
    `INSERT INTO "${table}" (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
  );
  for (const row of rows) {
    const mapped = remap(row);
    stmt.run(...cols.map((c) => mapped[c]));
  }
  return rows.length;
}

// ---------- 操作日志工具 ----------
function insertOperationLog(
  targetType: string,
  targetId: string,
  targetTitle: string,
  action: string,
  remark: string,
): void {
  dst.prepare(
    `INSERT INTO OperationLog (id, targetType, targetId, targetTitle, action, operatorId, remark, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId(), targetType, targetId, targetTitle, action, dstAdmin.id, remark, now());
}

// ---------- 主流程 ----------
const result = dst.transaction(() => {
  const counts: Record<string, number> = {};

  // 1. 复制源数据（按依赖序；保留源 ID，目标表为空无冲突）
  counts.ProductGoal = copyTable("ProductGoal", (r) => ({
    ...r,
    ownerId: mapUserId(r.ownerId as string),
    orgNodeId: mapOrgId(r.orgNodeId as string | null),
    createdById: mapUserId(r.createdById as string),
  }));
  counts.Project = copyTable("Project", (r) => ({
    ...r,
    ownerId: mapUserId(r.ownerId as string),
    orgNodeId: mapOrgId(r.orgNodeId as string | null),
    createdById: mapUserId(r.createdById as string),
  }));
  counts.ProjectProductGoal = copyTable("ProjectProductGoal", (r) => r);
  counts.QuarterlyWork = copyTable("QuarterlyWork", (r) => ({
    ...r,
    ownerId: mapUserId(r.ownerId as string),
    orgNodeId: mapOrgId(r.orgNodeId as string | null),
    createdById: mapUserId(r.createdById as string),
  }));
  counts.RequirementValueTrack = copyTable("RequirementValueTrack", (r) => r);
  counts.OperationLog = copyTable("OperationLog", (r) => ({
    ...r,
    operatorId: mapUserId(r.operatorId as string),
  }));

  // 2. 状态补全合成数据
  const goalDigital = dst
    .prepare(
      "SELECT id, orgNodeId, ownerId FROM ProductGoal WHERE status = 'IN_PROGRESS' LIMIT 1",
    )
    .get() as { id: string; orgNodeId: string; ownerId: string };

  // 2.1 产品目标：+1 已完成、+1 关闭
  const ts = now();
  const goalCompleted = newId();
  dst.prepare(
    `INSERT INTO ProductGoal (id, title, year, description, expectedOutcome, ownerId, orgNodeId, status, createdById, completedAt, createdAt, updatedAt)
     VALUES (?, ?, 2026, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)`,
  ).run(
    goalCompleted,
    "采购链路体验升级（已完成示例）",
    "围绕采购门户核心链路完成体验升级，覆盖搜索、下单与售后环节。",
    "采购链路转化率提升 15%，售后工单量下降 20%。",
    goalDigital.ownerId,
    goalDigital.orgNodeId,
    dstAdmin.id,
    ts,
    ts,
    ts,
  );
  insertOperationLog("PRODUCT_GOAL", goalCompleted, "采购链路体验升级（已完成示例）", "新增", "新增产品目标「采购链路体验升级（已完成示例）」");

  const goalClosed = newId();
  dst.prepare(
    `INSERT INTO ProductGoal (id, title, year, description, expectedOutcome, ownerId, orgNodeId, status, createdById, completedAt, createdAt, updatedAt)
     VALUES (?, ?, 2026, ?, ?, ?, ?, 'CLOSED', ?, NULL, ?, ?)`,
  ).run(
    goalClosed,
    "旧版商家后台下线（关闭示例）",
    "原计划年内下线旧版商家后台，因业务策略调整暂缓，目标关闭。",
    "旧版后台访问量归零。",
    goalDigital.ownerId,
    goalDigital.orgNodeId,
    dstAdmin.id,
    ts,
    ts,
  );
  insertOperationLog("PRODUCT_GOAL", goalClosed, "旧版商家后台下线（关闭示例）", "新增", "新增产品目标「旧版商家后台下线（关闭示例）」");

  // 2.2 项目：+1 已完成（含工作量/实际价值/价值判断）、+1 关闭，并挂目标关联
  const projectCompleted = newId();
  dst.prepare(
    `INSERT INTO Project (id, title, description, expectedOutcome, startQuarter, endQuarter, ownerId, orgNodeId, status, completedAt, workloadPersonDay, otherCost, actualValue, valueJudgement, createdById, createdAt, updatedAt, valueTrackStatus, launchedAt)
     VALUES (?, ?, ?, ?, '2026-Q1', '2026-Q2', ?, ?, 'COMPLETED', ?, 45, '无', '上线后季度 GMV 环比提升 12%，达到预期目标。', '已达预期', ?, ?, ?, '已完成', ?)`,
  ).run(
    projectCompleted,
    "采购商城结算流程重构（已完成示例）",
    "重构采购商城结算流程，合并重复审批节点，支持批量结算。",
    "结算平均耗时从 2 天缩短至 0.5 天。",
    goalDigital.ownerId,
    goalDigital.orgNodeId,
    ts,
    dstAdmin.id,
    ts,
    ts,
    ts,
  );
  dst.prepare(
    `INSERT INTO ProjectProductGoal (id, projectId, productGoalId, sortOrder, createdAt)
     VALUES (?, ?, ?, 10, ?)`,
  ).run(newId(), projectCompleted, goalCompleted, ts);
  insertOperationLog("PROJECT", projectCompleted, "采购商城结算流程重构（已完成示例）", "新增", "新增项目「采购商城结算流程重构（已完成示例）」");

  const projectClosed = newId();
  dst.prepare(
    `INSERT INTO Project (id, title, description, expectedOutcome, startQuarter, endQuarter, ownerId, orgNodeId, status, createdById, createdAt, updatedAt, valueTrackStatus)
     VALUES (?, ?, ?, ?, '2026-Q2', '2026-Q3', ?, ?, 'CLOSED', ?, ?, ?, '未观测')`,
  ).run(
    projectClosed,
    "供应商自助报价平台（关闭示例）",
    "搭建供应商自助报价平台，因采购政策变化项目关闭。",
    "报价周期缩短 50%。",
    goalDigital.ownerId,
    goalDigital.orgNodeId,
    dstAdmin.id,
    ts,
    ts,
  );
  dst.prepare(
    `INSERT INTO ProjectProductGoal (id, projectId, productGoalId, sortOrder, createdAt)
     VALUES (?, ?, ?, 10, ?)`,
  ).run(newId(), projectClosed, goalClosed, ts);
  insertOperationLog("PROJECT", projectClosed, "供应商自助报价平台（关闭示例）", "新增", "新增项目「供应商自助报价平台（关闭示例）」");

  // 2.3 季度任务：+1 已完成、+1 延期完成、+1 关闭（挂在现有进行中的项目上）
  const hostProject = dst
    .prepare(
      "SELECT id, orgNodeId, ownerId FROM Project WHERE status = 'IN_PROGRESS' AND title LIKE '%AI搜索%' LIMIT 1",
    )
    .get() as { id: string; orgNodeId: string; ownerId: string };

  const taskCompleted = newId();
  dst.prepare(
    `INSERT INTO QuarterlyWork (id, projectId, year, quarter, startMonth, endMonth, title, description, ownerId, orgNodeId, status, approvalStatus, expectedOutcome, createdById, completedAt, createdAt, updatedAt, taskResult, executionSummary, workloadPersonDay)
     VALUES (?, ?, 2026, 3, 7, 7, ?, ?, ?, ?, 'COMPLETED', 'DRAFT', ?, ?, ?, ?, ?, '已达标', '搜索词库已上线并完成两轮效果回归，Top200 搜索词覆盖率达到 95%。', 12.5)`,
  ).run(
    taskCompleted,
    hostProject.id,
    "搜索词库搭建（已完成示例）",
    "完成采购商城搜索词库的梳理与同义词配置。",
    hostProject.ownerId,
    hostProject.orgNodeId,
    "搜索词覆盖率 ≥ 90%。",
    dstAdmin.id,
    ts,
    ts,
    ts,
  );
  insertOperationLog("QUARTERLY_WORK", taskCompleted, "搜索词库搭建（已完成示例）", "新增", "新增任务「搜索词库搭建（已完成示例）」");

  const taskDelayed = newId();
  dst.prepare(
    `INSERT INTO QuarterlyWork (id, projectId, year, quarter, startMonth, endMonth, title, description, ownerId, orgNodeId, status, approvalStatus, expectedOutcome, createdById, completedAt, createdAt, updatedAt, taskResult, executionSummary, workloadPersonDay)
     VALUES (?, ?, 2026, 3, 7, 8, ?, ?, ?, ?, 'DELAYED_COMPLETED', 'DRAFT', ?, ?, ?, ?, ?, '已达标', '因依赖的类目数据延期交付，实际于 8 月中旬完成联调，搜索结果准确率达标。', 18)`,
  ).run(
    taskDelayed,
    hostProject.id,
    "搜索排序联调（延期完成示例）",
    "与算法侧联调搜索排序策略并验证效果。",
    hostProject.ownerId,
    hostProject.orgNodeId,
    "搜索结果点击率提升 10%。",
    dstAdmin.id,
    ts,
    ts,
    ts,
  );
  insertOperationLog("QUARTERLY_WORK", taskDelayed, "搜索排序联调（延期完成示例）", "新增", "新增任务「搜索排序联调（延期完成示例）」");

  const taskClosed = newId();
  dst.prepare(
    `INSERT INTO QuarterlyWork (id, projectId, year, quarter, startMonth, endMonth, title, description, ownerId, orgNodeId, status, approvalStatus, expectedOutcome, createdById, createdAt, updatedAt)
     VALUES (?, ?, 2026, 3, 9, 9, ?, ?, ?, ?, 'CLOSED', 'DRAFT', ?, ?, ?, ?)`,
  ).run(
    taskClosed,
    hostProject.id,
    "旧搜索接口下线（关闭示例）",
    "旧搜索接口下线计划随新搜索延期而暂缓，任务关闭。",
    hostProject.ownerId,
    hostProject.orgNodeId,
    "旧接口调用量归零。",
    dstAdmin.id,
    ts,
    ts,
  );
  insertOperationLog("QUARTERLY_WORK", taskClosed, "旧搜索接口下线（关闭示例）", "新增", "新增任务「旧搜索接口下线（关闭示例）」");

  // 2.4 价值跟踪：+3 条（已达预期 / 超出预期 / 未达预期），同步更新项目价值字段
  const launched1 = dst
    .prepare("SELECT id, title FROM Project WHERE title = '文献头条' LIMIT 1")
    .get() as { id: string; title: string };
  dst.prepare(
    `INSERT INTO RequirementValueTrack (id, projectId, trackingResult, followUpOptimization, trackedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    launched1.id,
    "已达预期：上线 4 周后文献头条日均阅读量稳定在 8000+，达到立项预期。",
    "继续观察长尾内容的阅读转化，计划 Q4 增加个性化推荐位。",
    ts,
    ts,
    ts,
  );
  dst.prepare(
    "UPDATE Project SET valueTrackStatus = '观测中', valueJudgement = '已达预期', actualValue = '日均阅读量 8000+，达到预期。', updatedAt = ? WHERE id = ?",
  ).run(ts, launched1.id);

  const launched2 = dst
    .prepare("SELECT id, title FROM Project WHERE title LIKE 'C 端产品运营推广%' LIMIT 1")
    .get() as { id: string; title: string };
  dst.prepare(
    `INSERT INTO RequirementValueTrack (id, projectId, trackingResult, followUpOptimization, trackedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    launched2.id,
    "超出预期：推广活动带来新注册用户 1.2 万，超出预期目标 20%。",
    "总结高转化渠道特征，沉淀为后续活动的投放策略。",
    ts,
    ts,
    ts,
  );
  dst.prepare(
    "UPDATE Project SET valueTrackStatus = '观测中', valueJudgement = '超出预期', actualValue = '新注册 1.2 万，超预期 20%。', updatedAt = ? WHERE id = ?",
  ).run(ts, launched2.id);

  const belowExpectation = dst
    .prepare("SELECT id, title FROM Project WHERE title = '采购人中心改版' LIMIT 1")
    .get() as { id: string; title: string } | undefined;
  if (belowExpectation) {
    const q3At = "2026-08-15T08:00:00.000Z";
    const q2At = "2026-05-20T08:00:00.000Z";
    dst.prepare(
      `INSERT INTO RequirementValueTrack (id, projectId, trackingResult, followUpOptimization, trackedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      belowExpectation.id,
      "未达预期：改版上线后核心路径转化率较立项目标低约 18%，关键节点流失仍偏高。",
      "后续优化：Q4 补齐关键节点引导，并复盘流失环节后再评估。",
      q3At,
      ts,
      ts,
    );
    dst.prepare(
      `INSERT INTO RequirementValueTrack (id, projectId, trackingResult, followUpOptimization, trackedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      belowExpectation.id,
      "未达预期：Q2 试点转化未达预期，老用户路径习惯迁移成本高于预估。",
      "后续优化：先收敛改版范围，对高频路径做专项引导。",
      q2At,
      ts,
      ts,
    );
    dst.prepare(
      "UPDATE Project SET valueTrackStatus = '已完成', valueJudgement = '未达预期', actualValue = '核心路径转化率低于立项目标 18%。', updatedAt = ? WHERE id = ?",
    ).run(ts, belowExpectation.id);
  }

  // 2.5 每周进展：+3 条挂在进行中任务上
  const inProgressTasks = dst
    .prepare(
      "SELECT id, ownerId, title FROM QuarterlyWork WHERE status = 'IN_PROGRESS' LIMIT 2",
    )
    .all() as Array<{ id: string; ownerId: string; title: string }>;
  const weeklySamples = [
    { status: "ON_TRACK", summary: "本周完成方案初稿并与相关方评审，整体进度正常。", nextStep: "下周根据评审意见修订并输出终稿。", riskNote: null },
    { status: "AT_RISK", summary: "界面布局搭建完成 60%，数据源对接比预期复杂。", nextStep: "协调数据侧资源集中联调。", riskNote: "数据源字段口径未统一，存在延期风险。" },
    { status: "ON_TRACK", summary: "可视化看板主框架已搭建，核心图表已联调通过。", nextStep: "补充次级维度筛选并准备验收。", riskNote: null },
  ];
  inProgressTasks.forEach((task, i) => {
    const sample = weeklySamples[i % weeklySamples.length];
    dst.prepare(
      `INSERT INTO WeeklyWorkUpdate (id, quarterlyWorkId, monthlyWorkPlanId, updaterId, updateDate, status, summary, nextStep, riskNote, createdAt, updatedAt)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      task.id,
      task.ownerId,
      ts,
      sample.status,
      sample.summary,
      sample.nextStep,
      sample.riskNote,
      ts,
      ts,
    );
  });
  counts._weeklyAdded = Math.min(inProgressTasks.length, weeklySamples.length);

  return counts;
})();

console.log("[import] 导入完成：");
for (const [k, v] of Object.entries(result)) {
  console.log(`  ${k}: ${v}`);
}
console.log(`[import] 新建真实姓名用户 ${createdUsers.length} 人：${createdUsers.join("、")}`);
console.log("[import] 合成数据：产品目标 +2（已完成/关闭）、项目 +2（已完成/关闭）、任务 +3（已完成/延期完成/关闭）、价值跟踪 +3、每周进展 +3");
