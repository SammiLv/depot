import { prisma } from "@/server/db/prisma";
import { resolveKpiRating, type KpiRatingBandInput } from "@/server/talent/decision-rule-config";
import {
  allocateSubjectScores,
  earnedAssessmentScore,
  summarizeAssessment,
  BUSINESS_ASSESSMENT_TOTAL_SCORE,
} from "@/server/talent/assessment-engine";
import xlsx from "xlsx";
import path from "path";

const INPUT_FILE = process.argv[2]
  ? path.resolve(process.argv[2])
  : "/Users/sammilv/Desktop/百度云盘/MacbookPro/AIStudy/ClaudeCode工作区/depot-clean/requirements/handoff/talent/数据导入-生产.xlsx";

const SYSTEM_USER_ID = "system-import";
const CONTRACT_SEQUENCE = 1;

// 人才盘点维度评分映射
const reviewRatingScoreMap: Record<string, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

// Excel 列名 -> 维度 code 映射
const dimensionNameToCode: Record<string, string> = {
  忠诚度: "DIM_02C159CB",
  工作态度: "DIM_A7512E57",
  匹配度: "DIM_14455587",
  成长度: "DIM_E1F385D2",
  能力度: "DIM_13E315BE",
  产出度: "DIM_D80F2F77",
};

// 奖励"正式结果"列解析示例：
// "部门 · 现金 · 个人 · 2026年第2季度 · 最佳创新奖（200元）"
function parseRewardResult(result: string): {
  rewardLevel: "COMPANY" | "DEPARTMENT";
  rewardForm: "COIN" | "CASH";
  rewardRecipient: "INDIVIDUAL" | "PROJECT";
  rewardCycle: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "OTHER";
  rewardPeriodYear: number;
  rewardPeriodQuarter: number | null;
  rewardName: string;
  rewardAmount: number;
} | null {
  const parts = result.split(" · ").map((s) => s.trim());
  if (parts.length < 5) {
    console.warn(`[奖励] 无法解析正式结果: ${result}`);
    return null;
  }

  const [levelPart, formPart, recipientPart, periodPart, namePart] = parts;

  const rewardLevel = levelPart === "公司" ? "COMPANY" : "DEPARTMENT";
  const rewardForm = formPart === "竞币" ? "COIN" : "CASH";
  const rewardRecipient = recipientPart === "项目" ? "PROJECT" : "INDIVIDUAL";

  let rewardCycle: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "OTHER" = "OTHER";
  let rewardPeriodYear = new Date().getFullYear();
  let rewardPeriodQuarter: number | null = null;

  const yearMatch = periodPart.match(/(\d{4})年/);
  if (yearMatch) {
    rewardPeriodYear = Number.parseInt(yearMatch[1], 10);
  }
  if (periodPart.includes("季度")) {
    rewardCycle = "QUARTERLY";
    const quarterMatch = periodPart.match(/第(\d)季度/);
    if (quarterMatch) {
      rewardPeriodQuarter = Number.parseInt(quarterMatch[1], 10);
    }
  } else if (periodPart.includes("年度")) {
    rewardCycle = "ANNUAL";
  } else if (periodPart.includes("月")) {
    rewardCycle = "MONTHLY";
  }

  const amountMatch = namePart.match(/（(\d+)元）/);
  const rewardAmount = amountMatch ? Number.parseInt(amountMatch[1], 10) : 0;
  const rewardName = namePart.replace(/（\d+元）/, "").trim();

  return {
    rewardLevel,
    rewardForm,
    rewardRecipient,
    rewardCycle,
    rewardPeriodYear,
    rewardPeriodQuarter,
    rewardName,
    rewardAmount,
  };
}

async function loadLookupMaps() {
  const [users, jobLevelGroups, jobLevels, departments] = await Promise.all([
    prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true, orgNodeId: true } }),
    prisma.jobLevelGroup.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.jobLevel.findMany({ where: { deletedAt: null }, select: { id: true, code: true, jobLevelGroupId: true } }),
    prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true, name: true } }),
  ]);

  const userByName = new Map<string, string>();
  const userOrgNodeIdById = new Map<string, string | null>();
  for (const u of users) {
    if (!userByName.has(u.name)) userByName.set(u.name, u.id);
    userOrgNodeIdById.set(u.id, u.orgNodeId);
  }

  const groupByCode = new Map<string, string>();
  for (const g of jobLevelGroups) {
    if (!groupByCode.has(g.code)) groupByCode.set(g.code, g.id);
  }

  const levelByCode = new Map<string, string>();
  for (const l of jobLevels) {
    if (!levelByCode.has(l.code)) levelByCode.set(l.code, l.id);
  }

  const deptByName = new Map<string, string>();
  for (const d of departments) {
    if (!deptByName.has(d.name)) deptByName.set(d.name, d.id);
  }

  return { userByName, userOrgNodeIdById, groupByCode, levelByCode, deptByName };
}

function resolveJobLevelGroupCode(levelCode: string): string {
  // R3-1 -> R3, R4-1 -> R4, R1 -> R1
  const match = levelCode.match(/^R(\d)/i);
  if (!match) throw new Error(`无法解析职级组代码: ${levelCode}`);
  return `R${match[1]}`;
}

async function ensureJobLevels(levelCodes: string[], maps: Awaited<ReturnType<typeof loadLookupMaps>>) {
  const codes = [...new Set(levelCodes.filter(Boolean))];
  let created = 0;
  for (const code of codes) {
    if (maps.levelByCode.has(code)) continue;

    const groupCode = resolveJobLevelGroupCode(code);
    const groupId = maps.groupByCode.get(groupCode);
    if (!groupId) {
      console.warn(`[职级] 未找到职级组: ${groupCode}`);
      continue;
    }

    // 解析 stepOrder：R3-1 -> 1, R3 -> 0, R4-1 -> 1
    const stepMatch = code.match(/^R\d-(\d)$/);
    const stepOrder = stepMatch ? Number.parseInt(stepMatch[1], 10) : 0;

    const existing = await prisma.jobLevel.findFirst({ where: { jobLevelGroupId: groupId, code } });
    if (existing) {
      maps.levelByCode.set(code, existing.id);
      continue;
    }

    const createdLevel = await prisma.jobLevel.create({
      data: {
        jobLevelGroupId: groupId,
        code,
        name: code,
        stepOrder,
        displayOrder: stepOrder,
        createdById: SYSTEM_USER_ID,
      },
    });
    maps.levelByCode.set(code, createdLevel.id);
    created++;
  }
  if (created > 0) {
    console.log(`[职级] 已创建 ${created} 个缺失职级`);
  }
}

function resolveLevelId(maps: Awaited<ReturnType<typeof loadLookupMaps>>, code: string | null | undefined): string | null {
  if (!code) return null;
  return maps.levelByCode.get(code) ?? null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel 序列号转 JS Date（1900 日期系统）
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * 24 * 60 * 60 * 1000);
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

async function importEmployeeProfiles(
  maps: Awaited<ReturnType<typeof loadLookupMaps>>,
  rows: Record<string, unknown>[],
) {
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const name = String(row["姓名"] ?? "").trim();
    if (!name) continue;
    const userId = maps.userByName.get(name);
    if (!userId) {
      console.warn(`[人才档案] 未找到用户: ${name}`);
      continue;
    }

    const entryLevelCode = String(row["入职职级"] ?? "").trim();
    const currentLevelCode = String(row["当前职级"] ?? "").trim();
    const entryLevelId = resolveLevelId(maps, entryLevelCode);
    const currentLevelId = resolveLevelId(maps, currentLevelCode);

    await prisma.employeeTalentProfile.upsert({
      where: { userId },
      create: {
        userId,
        entryJobLevelId: entryLevelId,
        jobLevelId: currentLevelId,
        startingSalary: toNumber(row["入职薪资"]),
        currentSalary: toNumber(row["当前薪资"]),
        currentContractStartAt: parseDate(row["合同开始日期"]),
        currentContractEndAt: parseDate(row["合同到期日期"]),
        currentContractSequence: toNumber(row["聘期期数"]) ?? CONTRACT_SEQUENCE,
        hasTwoCReviewsInCurrentContract: row["聘期内人才盘点2次C"] === "是" ? true : null,
        hasConsecutiveTwoCReviewsInCurrentContract: row["聘期内人才盘点连续2次C"] === "是" ? true : null,
        isLatestPreRenewalReviewC: row["续聘前人才盘点C"] === "是" ? true : null,
        hasFormalPromotionInCurrentContract: row["续聘前是否晋升"] === "是" ? true : null,
        updatedById: SYSTEM_USER_ID,
      },
      update: {
        entryJobLevelId: entryLevelId,
        jobLevelId: currentLevelId,
        startingSalary: toNumber(row["入职薪资"]),
        currentSalary: toNumber(row["当前薪资"]),
        currentContractStartAt: parseDate(row["合同开始日期"]),
        currentContractEndAt: parseDate(row["合同到期日期"]),
        currentContractSequence: toNumber(row["聘期期数"]) ?? CONTRACT_SEQUENCE,
        hasTwoCReviewsInCurrentContract: row["聘期内人才盘点2次C"] === "是" ? true : null,
        hasConsecutiveTwoCReviewsInCurrentContract: row["聘期内人才盘点连续2次C"] === "是" ? true : null,
        isLatestPreRenewalReviewC: row["续聘前人才盘点C"] === "是" ? true : null,
        hasFormalPromotionInCurrentContract: row["续聘前是否晋升"] === "是" ? true : null,
        updatedById: SYSTEM_USER_ID,
      },
    });

    const existing = await prisma.employeeTalentProfile.findUnique({ where: { userId }, select: { createdAt: true, updatedAt: true } });
    if (existing && existing.createdAt.getTime() === existing.updatedAt.getTime()) {
      created++;
    } else {
      updated++;
    }
  }
  console.log(`[人才档案] 新建 ${created} 条, 更新 ${updated} 条`);
}

async function importContractHistory(
  maps: Awaited<ReturnType<typeof loadLookupMaps>>,
  rows: Record<string, unknown>[],
) {
  let count = 0;
  for (const row of rows) {
    const name = String(row["人员"] ?? "").trim();
    if (!name) continue;
    const userId = maps.userByName.get(name);
    if (!userId) {
      console.warn(`[续签历史] 未找到用户: ${name}`);
      continue;
    }

    const startDate = parseDate(row["合同开始日期"]);
    const endDate = parseDate(row["合同结束日期"]);
    const effectiveDate = parseDate(row["生效日期"]);
    if (!startDate || !endDate) {
      console.warn(`[续签历史] 缺少日期: ${name}`);
      continue;
    }

    const existing = await prisma.employmentContractTerm.findFirst({
      where: { userId, startDate },
    });
    if (existing) continue;

    // 计算 renewalSequence：查找该用户已有的合同数量 + 1
    const existingCount = await prisma.employmentContractTerm.count({ where: { userId } });

    await prisma.employmentContractTerm.create({
      data: {
        userId,
        startDate,
        endDate,
        renewalSequence: existingCount + 1,
        outcome: "RENEWED",
        resultStatus: "CONFIRMED",
        sourceType: "MANUAL_IMPORT",
        confirmedAt: effectiveDate ?? startDate,
        confirmedById: SYSTEM_USER_ID,
        createdById: SYSTEM_USER_ID,
      },
    });
    count++;
  }
  console.log(`[续签历史] 已导入 ${count} 条`);
}

async function importPromotionHistory(
  maps: Awaited<ReturnType<typeof loadLookupMaps>>,
  rows: Record<string, unknown>[],
) {
  let count = 0;
  const quarterColumns = ["2024Q2", "2024Q4", "2025Q2", "2025Q4", "2026Q2"];
  const effectiveDates: Record<string, Date> = {};

  // 第一行是生效日期
  const dateRow = rows[0];
  for (const col of quarterColumns) {
    const d = parseDate(dateRow[col]);
    if (d) effectiveDates[col] = d;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row["人员"] ?? "").trim();
    if (!name) continue;
    const userId = maps.userByName.get(name);
    if (!userId) {
      console.warn(`[晋升历史] 未找到用户: ${name}`);
      continue;
    }

    for (const col of quarterColumns) {
      const value = row[col];
      if (!value) continue;
      const str = String(value).trim();
      if (!str) continue;

      const match = str.match(/^(R\d(?:-\d)?)-(R\d(?:-\d)?)$/);
      if (!match) {
        console.warn(`[晋升历史] 无法解析晋升记录: ${name} ${col} ${str}`);
        continue;
      }

      const [, fromCode, toCode] = match;
      const fromLevelId = resolveLevelId(maps, fromCode);
      const toLevelId = resolveLevelId(maps, toCode);
      if (!fromLevelId || !toLevelId) {
        console.warn(`[晋升历史] 未找到职级: ${fromCode} -> ${toCode}`);
        continue;
      }

      const effectiveDate = effectiveDates[col];
      if (!effectiveDate) continue;

      const recordNo = `PROM_${userId.slice(-8)}_${effectiveDate.toISOString().slice(0, 10)}_${fromCode}_${toCode}`;
      const existing = await prisma.promotionRecord.findUnique({ where: { recordNo } });
      if (existing) continue;

      await prisma.promotionRecord.create({
        data: {
          recordNo,
          userId,
          fromJobLevelId: fromLevelId,
          toJobLevelId: toLevelId,
          promotionType: "REGULAR",
          outcome: "SUCCESS",
          effectiveDate,
          sourceType: "MANUAL_IMPORT",
          resultStatus: "CONFIRMED",
          confirmedAt: effectiveDate,
          confirmedById: SYSTEM_USER_ID,
          createdById: SYSTEM_USER_ID,
        },
      });
      count++;
    }
  }
  console.log(`[晋升历史] 已导入 ${count} 条`);
}

async function importQuarterlyKpiHistory(
  maps: Awaited<ReturnType<typeof loadLookupMaps>>,
  rows: Record<string, unknown>[],
) {
  let count = 0;
  const quarterColumns = ["2024Q1", "2024Q2", "2024Q3", "2024Q4", "2025Q1", "2025Q2", "2025Q3", "2025Q4", "2026Q1", "2026Q2", "2026Q3", "2026Q4"];

  // 生效日期行
  const dateRow = rows[0];
  const effectiveDates: Record<string, Date | null> = {};
  for (const col of quarterColumns) {
    effectiveDates[col] = parseDate(dateRow[col]);
  }

  // 加载各部门生效中的 KPI 等级规则
  const activeRules = await prisma.kpiRatingRuleVersion.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true, departmentOrgNodeId: true, name: true, version: true, quarterlyKpiTotalScore: true },
  });
  const activeBands = await prisma.kpiRatingBand.findMany({
    where: { ruleVersionId: { in: activeRules.map((row) => row.id) } },
    select: { id: true, ruleVersionId: true, name: true, minScore: true, maxScore: true, isUnbounded: true, sortOrder: true },
  });
  const bandsByRuleId = new Map<string, KpiRatingBandInput[]>();
  for (const band of activeBands) {
    const list = bandsByRuleId.get(band.ruleVersionId) ?? [];
    list.push(band);
    bandsByRuleId.set(band.ruleVersionId, list);
  }
  const ruleByDeptId = new Map<string, (typeof activeRules)[number]>();
  for (const rule of activeRules) {
    if (!ruleByDeptId.has(rule.departmentOrgNodeId)) {
      ruleByDeptId.set(rule.departmentOrgNodeId, rule);
    }
  }

  // 按用户组织节点向上追溯祖先部门，匹配最近一条 KPI 等级规则
  const userOrgNodeIds = [...maps.userOrgNodeIdById.values()].filter((id): id is string => Boolean(id));
  const closures = userOrgNodeIds.length
    ? await prisma.orgClosure.findMany({
        where: { descendantId: { in: userOrgNodeIds } },
        select: { ancestorId: true, descendantId: true, depth: true },
      })
    : [];
  const ancestorsByUserId = new Map<string, string[]>();
  for (const [userId, orgNodeId] of maps.userOrgNodeIdById.entries()) {
    if (!orgNodeId) continue;
    const ancestors = closures
      .filter((c) => c.descendantId === orgNodeId)
      .sort((a, b) => b.depth - a.depth)
      .map((c) => c.ancestorId);
    ancestorsByUserId.set(userId, ancestors);
  }

  function resolveRating(userId: string, score: number) {
    const ancestors = ancestorsByUserId.get(userId) ?? [];
    for (const deptId of ancestors) {
      const rule = ruleByDeptId.get(deptId);
      if (!rule) continue;
      const bands = bandsByRuleId.get(rule.id);
      if (!bands || bands.length === 0) continue;
      const rating = resolveKpiRating(score, bands);
      if (!rating) continue;
      return {
        finalRatingName: rating.name,
        ratingRuleVersionId: rule.id,
        ratingSnapshotJson: JSON.stringify({
          ruleVersionId: rule.id,
          ruleName: rule.name,
          ruleVersion: rule.version,
          quarterlyKpiTotalScore: rule.quarterlyKpiTotalScore,
          bands,
          score,
          ratingName: rating.name,
        }),
      };
    }
    return null;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row["人员"] ?? "").trim();
    if (!name) continue;
    const userId = maps.userByName.get(name);
    if (!userId) {
      console.warn(`[季度KPI历史] 未找到用户: ${name}`);
      continue;
    }

    for (const col of quarterColumns) {
      const score = toNumber(row[col]);
      if (score === null) continue;

      const match = col.match(/^(\d{4})Q(\d)$/);
      if (!match) continue;
      const year = Number.parseInt(match[1], 10);
      const quarter = Number.parseInt(match[2], 10);

      const ratingSnapshot = resolveRating(userId, score);
      const completedAt = effectiveDates[col] ?? new Date(year, quarter * 3 - 1, 30);

      await prisma.personalKpi.upsert({
        where: { year_quarter_userId: { year, quarter, userId } },
        create: {
          year,
          quarter,
          userId,
          orgNodeId: maps.userOrgNodeIdById.get(userId) ?? null,
          finalScore: score,
          status: "COMPLETED",
          completedAt,
          createdAt: completedAt,
          updatedAt: completedAt,
          ...ratingSnapshot,
        },
        update: {
          finalScore: score,
          status: "COMPLETED",
          orgNodeId: maps.userOrgNodeIdById.get(userId) ?? null,
          completedAt: effectiveDates[col] ?? undefined,
          ...ratingSnapshot,
        },
      });
      count++;
    }
  }
  console.log(`[季度KPI历史] 已导入/更新 ${count} 条`);
}

async function importTalentReviewHistory(
  maps: Awaited<ReturnType<typeof loadLookupMaps>>,
  rows: Record<string, unknown>[],
) {
  const templateVersion = await prisma.talentReviewTemplateVersion.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true, departmentOrgNodeId: true },
  });
  if (!templateVersion) {
    console.warn("[人才盘点历史] 未找到 ACTIVE 的人才盘点模板版本，跳过");
    return;
  }

  const dimensions = await prisma.talentReviewDimension.findMany({
    where: { templateVersionId: templateVersion.id },
    select: { id: true, code: true, name: true, category: true, weight: true, maxScore: true },
  });
  const dimByCode = new Map(dimensions.map((d) => [d.code, d]));

  const nineBoxRules = await prisma.talentNineBoxRule.findMany({
    where: { templateVersionId: templateVersion.id },
    select: { code: true, label: true, potentialMin: true, potentialMax: true, performanceMin: true, performanceMax: true },
  });

  // 按盘点批次分组创建 cycle
  const batchGroups = new Map<string, { year: number; halfYear: number; effectiveDate: Date; rows: Record<string, unknown>[] }>();
  for (const row of rows) {
    const batchName = String(row["盘点批次"] ?? "").trim();
    if (!batchName) continue;

    const match = batchName.match(/^(\d{4})年(上|下)半年$/);
    if (!match) {
      console.warn(`[人才盘点历史] 无法解析盘点批次: ${batchName}`);
      continue;
    }
    const year = Number.parseInt(match[1], 10);
    const halfYear = match[2] === "上" ? 1 : 2;
    const effectiveDate = parseDate(row["生效日期"]) ?? new Date(year, halfYear === 1 ? 5 : 11, 30);

    if (!batchGroups.has(batchName)) {
      batchGroups.set(batchName, { year, halfYear, effectiveDate, rows: [] });
    }
    batchGroups.get(batchName)!.rows.push(row);
  }

  let cycleCount = 0;
  let participantCount = 0;
  let dimensionResultCount = 0;
  let resultCount = 0;

  for (const [batchName, group] of batchGroups) {
    const existingCycle = await prisma.talentReviewCycle.findFirst({
      where: {
        year: group.year,
        halfYear: group.halfYear,
        departmentOrgNodeId: templateVersion.departmentOrgNodeId,
      },
    });

    const cycle = existingCycle
      ? await prisma.talentReviewCycle.update({
          where: { id: existingCycle.id },
          data: {
            name: batchName,
            templateVersionId: templateVersion.id,
            status: "ARCHIVED",
          },
        })
      : await prisma.talentReviewCycle.create({
          data: {
            year: group.year,
            halfYear: group.halfYear,
            name: batchName,
            departmentOrgNodeId: templateVersion.departmentOrgNodeId,
            templateVersionId: templateVersion.id,
            status: "ARCHIVED",
            confirmedAt: group.effectiveDate,
            createdById: SYSTEM_USER_ID,
          },
        });
    cycleCount++;

    for (const row of group.rows) {
      const name = String(row["姓名"] ?? "").trim();
      if (!name) continue;
      const userId = maps.userByName.get(name);
      if (!userId) {
        console.warn(`[人才盘点历史] 未找到用户: ${name}`);
        continue;
      }

      const participant = await prisma.talentReviewParticipant.upsert({
        where: { cycleId_userId: { cycleId: cycle.id, userId } },
        create: {
          cycleId: cycle.id,
          userId,
          periodYear: group.year,
          periodHalfYear: group.halfYear,
          // 快照写入盘点时所属组织，权限范围过滤（组长看本组）依赖该字段
          orgNodeIdSnapshot: maps.userOrgNodeIdById.get(userId) ?? null,
          status: "CONFIRMED",
          confirmedAt: group.effectiveDate,
        },
        update: {
          orgNodeIdSnapshot: maps.userOrgNodeIdById.get(userId) ?? null,
          status: "CONFIRMED",
          confirmedAt: group.effectiveDate,
        },
      });
      participantCount++;

      let totalScore = 0;
      let potentialScore = 0;
      let performanceScore = 0;
      let potentialCount = 0;
      let performanceCount = 0;

      for (const [dimName, dimCode] of Object.entries(dimensionNameToCode)) {
        const dim = dimByCode.get(dimCode);
        if (!dim) continue;

        const rating = String(row[dimName] ?? "").trim().toUpperCase();
        if (!rating) continue;
        const score = reviewRatingScoreMap[rating];
        if (score === undefined) {
          console.warn(`[人才盘点历史] 未知评分: ${name} ${dimName}=${rating}`);
          continue;
        }

        const numericScore = score * dim.weight;
        totalScore += numericScore;
        if (dim.category === "POTENTIAL") {
          potentialScore += numericScore;
          potentialCount++;
        } else if (dim.category === "PERFORMANCE") {
          performanceScore += numericScore;
          performanceCount++;
        }

        await prisma.talentReviewDimensionResult.upsert({
          where: { participantId_dimensionId: { participantId: participant.id, dimensionId: dim.id } },
          create: {
            participantId: participant.id,
            dimensionId: dim.id,
            ratingCode: rating,
            numericScore,
            evaluatorId: SYSTEM_USER_ID,
            evaluatedAt: group.effectiveDate,
          },
          update: {
            ratingCode: rating,
            numericScore,
            evaluatorId: SYSTEM_USER_ID,
            evaluatedAt: group.effectiveDate,
          },
        });
        dimensionResultCount++;
      }

      const gradeCode = String(row["级别"] ?? "").trim().toUpperCase();
      const nineBox = nineBoxRules.find(
        (rule) =>
          potentialScore >= rule.potentialMin &&
          potentialScore <= rule.potentialMax &&
          performanceScore >= rule.performanceMin &&
          performanceScore <= rule.performanceMax,
      );
      const nineBoxCode = nineBox?.code ?? null;
      const talentType = nineBox?.label ?? null;
      await prisma.talentReviewResult.upsert({
        where: { participantId: participant.id },
        create: {
          participantId: participant.id,
          totalScore,
          gradeCode,
          potentialScore: potentialCount > 0 ? potentialScore : 0,
          performanceScore: performanceCount > 0 ? performanceScore : 0,
          nineBoxCode,
          talentType,
          calculatedAt: group.effectiveDate,
          confirmedAt: group.effectiveDate,
        },
        update: {
          totalScore,
          gradeCode,
          potentialScore: potentialCount > 0 ? potentialScore : 0,
          performanceScore: performanceCount > 0 ? performanceScore : 0,
          nineBoxCode,
          talentType,
          calculatedAt: group.effectiveDate,
          confirmedAt: group.effectiveDate,
        },
      });
      resultCount++;
    }
  }

  console.log(
    `[人才盘点历史] ${cycleCount} 周期, ${participantCount} 参与者, ${dimensionResultCount} 维度结果, ${resultCount} 总结果`,
  );
}

async function importRewardHistory(
  maps: Awaited<ReturnType<typeof loadLookupMaps>>,
  rows: Record<string, unknown>[],
) {
  let count = 0;
  for (const row of rows) {
    const name = String(row["员工"] ?? "").trim();
    if (!name) continue;
    const userId = maps.userByName.get(name);
    if (!userId) {
      console.warn(`[奖励历史] 未找到用户: ${name}`);
      continue;
    }

    const effectiveDate = parseDate(row["生效日期"]);
    if (!effectiveDate) {
      console.warn(`[奖励历史] 缺少生效日期: ${name}`);
      continue;
    }

    const resultStr = String(row["正式结果"] ?? "").trim();
    const description = String(row["奖励说明"] ?? "").trim();
    const parsed = parseRewardResult(resultStr);
    if (!parsed) continue;

    // recordNo 需对"同一人同一天同名"的多条奖励（如同时获部门现金奖和公司竞币奖）也能区分，
    // 否则去重检查会误杀后续行，且重复执行时生成的新 recordNo 与旧数据对不上导致重复导入。
    const recordNo = `REWARD_${userId.slice(-8)}_${effectiveDate.toISOString().slice(0, 10)}_${parsed.rewardLevel}_${parsed.rewardForm}_${parsed.rewardAmount}_${parsed.rewardName.replace(/\s+/g, "_")}`;
    const existingReward = await prisma.rewardRecord.findUnique({ where: { recordNo } });
    if (existingReward) continue;

    await prisma.rewardRecord.create({
      data: {
        recordNo,
        userId,
        rewardLevel: parsed.rewardLevel,
        rewardForm: parsed.rewardForm,
        rewardRecipient: parsed.rewardRecipient,
        rewardCycle: parsed.rewardCycle,
        rewardPeriodYear: parsed.rewardPeriodYear,
        rewardPeriodQuarter: parsed.rewardPeriodQuarter,
        rewardName: parsed.rewardName,
        rewardAmount: parsed.rewardAmount,
        rewardDescription: description || null,
        effectiveDate,
        sourceType: "MANUAL_IMPORT",
        resultStatus: "CONFIRMED",
        confirmedAt: effectiveDate,
        confirmedById: SYSTEM_USER_ID,
        createdById: SYSTEM_USER_ID,
      },
    });
    count++;
  }
  console.log(`[奖励历史] 已导入 ${count} 条`);
}

async function importBusinessAssessmentHistory(
  maps: Awaited<ReturnType<typeof loadLookupMaps>>,
  rows: unknown[][],
) {
  if (rows.length < 2) {
    console.log("[业务考核历史] 无数据");
    return;
  }

  const DEFAULT_DEPARTMENT_NAME = "产品部";
  const departmentOrgNodeId = maps.deptByName.get(DEFAULT_DEPARTMENT_NAME);
  if (!departmentOrgNodeId) {
    console.warn(`[业务考核历史] 未找到默认部门: ${DEFAULT_DEPARTMENT_NAME}`);
    return;
  }

  const headerRow0 = rows[0];
  const headerRow1 = rows[1];
  const maxCol = Math.max(headerRow0.length, headerRow1.length);

  type QuarterGroup = {
    year: number;
    quarter: number;
    startCol: number;
    endCol: number;
    subjects: Array<{ col: number; name: string; code: string }>;
    resultCol: number | null;
  };

  const quarterGroups: QuarterGroup[] = [];
  let currentGroup: { year: number; quarter: number; startCol: number } | null = null;

  for (let col = 1; col < maxCol; col++) {
    const cell = headerRow0[col];
    if (cell) {
      const match = String(cell).trim().match(/^(\d{4})Q(\d)$/);
      if (match) {
        currentGroup = {
          year: Number.parseInt(match[1], 10),
          quarter: Number.parseInt(match[2], 10),
          startCol: col,
        };
      }
    }

    const isLastCol = col === maxCol - 1;
    const nextCell = headerRow0[col + 1];
    if (currentGroup && (isLastCol || nextCell)) {
      const endCol = col;
      const subjects: QuarterGroup["subjects"] = [];
      let resultCol: number | null = null;
      for (let c = currentGroup.startCol; c <= endCol; c++) {
        const label = String(headerRow1[c] ?? "").trim();
        if (!label) continue;
        if (label === "结果") {
          resultCol = c;
        } else {
          subjects.push({
            col: c,
            name: label,
            code: `SUBJECT_${label.replace(/\s+/g, "_")}`,
          });
        }
      }
      quarterGroups.push({ ...currentGroup, endCol, subjects, resultCol });
      currentGroup = null;
    }
  }

  if (quarterGroups.length === 0) {
    console.warn("[业务考核历史] 未识别到任何季度分组");
    return;
  }

  let cycleCount = 0;
  let subjectCount = 0;
  let resultCount = 0;
  let summaryCount = 0;

  for (const group of quarterGroups) {
    const subjectNames = group.subjects.map((s) => s.name);
    const subjectMaxScores = allocateSubjectScores(group.subjects.length, BUSINESS_ASSESSMENT_TOTAL_SCORE);

    const cycle = await prisma.businessAssessmentCycle.upsert({
      where: {
        departmentOrgNodeId_year_quarter: {
          departmentOrgNodeId,
          year: group.year,
          quarter: group.quarter,
        },
      },
      create: {
        departmentOrgNodeId,
        year: group.year,
        quarter: group.quarter,
        name: `${group.year}Q${group.quarter}业务考核`,
        status: "CONFIRMED",
        totalKpiScore: BUSINESS_ASSESSMENT_TOTAL_SCORE,
        defaultScoringType: "NUMERIC",
        passingNumericScore: 80,
        requiredGradeCode: "C",
        createdById: SYSTEM_USER_ID,
        confirmedById: SYSTEM_USER_ID,
        confirmedAt: new Date(),
      },
      update: {
        name: `${group.year}Q${group.quarter}业务考核`,
        status: "CONFIRMED",
      },
    });
    cycleCount++;

    const subjectByCol = new Map<number, typeof prisma.businessAssessmentSubject>();
    for (let i = 0; i < group.subjects.length; i++) {
      const subjectDef = group.subjects[i];
      const sampleValue = (() => {
        for (let r = 2; r < rows.length; r++) {
          const v = rows[r][subjectDef.col];
          if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
        }
        return "";
      })();
      const scoringType = /^\d+(\.\d+)?$/.test(sampleValue.replace(/\(补考\)/, "").trim()) ? "NUMERIC" : "GRADE";

      const subject = await prisma.businessAssessmentSubject.upsert({
        where: {
          cycleId_code: {
            cycleId: cycle.id,
            code: subjectDef.code,
          },
        },
        create: {
          cycleId: cycle.id,
          code: subjectDef.code,
          name: subjectDef.name,
          scoringType,
          passingNumericScore: scoringType === "NUMERIC" ? 80 : null,
          requiredGradeCode: scoringType === "GRADE" ? "C" : null,
          maxScore: subjectMaxScores[i],
          sortOrder: i * 10,
        },
        update: {
          name: subjectDef.name,
          scoringType,
          passingNumericScore: scoringType === "NUMERIC" ? 80 : null,
          requiredGradeCode: scoringType === "GRADE" ? "C" : null,
          maxScore: subjectMaxScores[i],
          sortOrder: i * 10,
        },
      });
      subjectByCol.set(subjectDef.col, subject as any);
      subjectCount++;
    }

    for (let rowIdx = 2; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const name = String(row[0] ?? "").trim();
      if (!name) continue;
      const userId = maps.userByName.get(name);
      if (!userId) {
        console.warn(`[业务考核历史] 未找到用户: ${name}`);
        continue;
      }

      const quarterResult = group.resultCol !== null ? String(row[group.resultCol] ?? "").trim() : "";

      const resultsForSummary: Array<{ isPassed: boolean; earnedScore: number }> = [];
      let hasAnySubject = false;

      for (let i = 0; i < group.subjects.length; i++) {
        const subjectDef = group.subjects[i];
        const rawValue = row[subjectDef.col];
        if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") continue;
        hasAnySubject = true;

        const rawValueStr = String(rawValue).trim();
        const isRetest = rawValueStr.includes("补考");
        const cleanedValue = rawValueStr.replace(/\(补考\)/g, "").trim();

        const subject = subjectByCol.get(subjectDef.col);
        if (!subject) continue;

        const subjectMax = subjectMaxScores[i];
        const isPassed = quarterResult === "及格";
        const attemptResult: "INITIAL_PASS" | "RETEST_PASS" | "FINAL_FAIL" = isPassed
          ? (isRetest ? "RETEST_PASS" : "INITIAL_PASS")
          : "FINAL_FAIL";
        const earnedScore = earnedAssessmentScore(subjectMax, attemptResult);

        await prisma.businessAssessmentResult.upsert({
          where: {
            cycleId_subjectId_userId: {
              cycleId: cycle.id,
              subjectId: (subject as any).id,
              userId,
            },
          },
          create: {
            cycleId: cycle.id,
            subjectId: (subject as any).id,
            userId,
            rawFinalValue: rawValueStr,
            attemptResult,
            isPassed,
            earnedScore,
            confirmedAt: new Date(),
          },
          update: {
            rawFinalValue: rawValueStr,
            attemptResult,
            isPassed,
            earnedScore,
            confirmedAt: new Date(),
          },
        });
        resultCount++;

        resultsForSummary.push({ isPassed, earnedScore });
      }

      if (!hasAnySubject) continue;

      const summary = summarizeAssessment(resultsForSummary, BUSINESS_ASSESSMENT_TOTAL_SCORE);
      await prisma.businessAssessmentSummary.upsert({
        where: {
          cycleId_userId: {
            cycleId: cycle.id,
            userId,
          },
        },
        create: {
          cycleId: cycle.id,
          userId,
          subjectCount: summary.subjectCount,
          passedSubjectCount: summary.passedSubjectCount,
          earnedScore: summary.earnedScore,
          maxScore: summary.maxScore,
          isOverallPassed: summary.isOverallPassed,
        },
        update: {
          subjectCount: summary.subjectCount,
          passedSubjectCount: summary.passedSubjectCount,
          earnedScore: summary.earnedScore,
          maxScore: summary.maxScore,
          isOverallPassed: summary.isOverallPassed,
        },
      });
      summaryCount++;
    }
  }

  console.log(
    `[业务考核历史] ${cycleCount} 周期, ${subjectCount} 科目, ${resultCount} 结果, ${summaryCount} 汇总`,
  );
}

async function updateProfilePromotionFacts() {
  const profiles = await prisma.employeeTalentProfile.findMany({
    where: { deletedAt: null },
    select: { userId: true, currentContractStartAt: true, currentContractEndAt: true },
  });
  if (profiles.length === 0) return;

  const promotionRecords = await prisma.promotionRecord.findMany({
    where: { deletedAt: null, outcome: "SUCCESS", resultStatus: "CONFIRMED" },
    select: { userId: true, effectiveDate: true },
  });

  const promotionDatesByUser = new Map<string, Date[]>();
  for (const record of promotionRecords) {
    const list = promotionDatesByUser.get(record.userId) ?? [];
    list.push(record.effectiveDate);
    promotionDatesByUser.set(record.userId, list);
  }

  let updated = 0;
  for (const profile of profiles) {
    const dates = promotionDatesByUser.get(profile.userId) ?? [];
    const hasPromotion = dates.some((date) => {
      if (!profile.currentContractStartAt || !profile.currentContractEndAt) return true;
      return date >= profile.currentContractStartAt && date <= profile.currentContractEndAt;
    });
    await prisma.employeeTalentProfile.update({
      where: { userId: profile.userId },
      data: { hasFormalPromotionInCurrentContract: hasPromotion },
    });
    updated++;
  }
  console.log(`[人才档案] 已更新 ${updated} 条晋升事实`);
}

async function main() {
  if (!require("fs").existsSync(INPUT_FILE)) {
    console.error(`输入文件不存在: ${INPUT_FILE}`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(INPUT_FILE, { cellDates: true });
  const maps = await loadLookupMaps();

  // 收集所有用到的职级代码
  const allLevelCodes: string[] = [];

  const profileSheet = workbook.Sheets["人才档案"];
  const profileRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(profileSheet, { defval: null });
  for (const row of profileRows) {
    allLevelCodes.push(String(row["入职职级"] ?? "").trim());
    allLevelCodes.push(String(row["当前职级"] ?? "").trim());
  }

  const promotionSheet = workbook.Sheets["晋升历史"];
  const promotionRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(promotionSheet, { defval: null });
  for (let i = 1; i < promotionRows.length; i++) {
    const row = promotionRows[i];
    for (const col of ["2024Q2", "2024Q4", "2025Q2", "2025Q4", "2026Q2"]) {
      const value = row[col];
      if (!value) continue;
      const parts = String(value).split("-");
      if (parts.length === 2) {
        allLevelCodes.push(parts[0].trim(), parts[1].trim());
      }
    }
  }

  await ensureJobLevels(allLevelCodes, maps);

  console.log("开始导入人才档案相关基础数据...\n");
  await importEmployeeProfiles(maps, profileRows);

  const contractSheet = workbook.Sheets["续签历史"];
  const contractRowsRaw = xlsx.utils.sheet_to_json<Record<string, unknown>>(contractSheet, { defval: null, header: 1 });
  // 跳过前两行（第一行为合并标题，第二行为表头），手动映射列
  const contractRows = contractRowsRaw.slice(2).map((row) => ({
    人员: row[0],
    合同开始日期: row[1],
    合同结束日期: row[2],
    生效日期: row[3],
  }));
  await importContractHistory(maps, contractRows);

  await importPromotionHistory(maps, promotionRows);

  const kpiSheet = workbook.Sheets["季度KPI历史"];
  const kpiRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(kpiSheet, { defval: null });
  await importQuarterlyKpiHistory(maps, kpiRows);

  const reviewSheet = workbook.Sheets["人才盘点历史"];
  const reviewRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(reviewSheet, { defval: null });
  await importTalentReviewHistory(maps, reviewRows);

  const rewardSheet = workbook.Sheets["奖励历史"];
  const rewardRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(rewardSheet, { defval: null });
  await importRewardHistory(maps, rewardRows);

  const assessmentSheet = workbook.Sheets["业务考核成绩"];
  const assessmentRows = xlsx.utils.sheet_to_json<unknown[]>(assessmentSheet, { defval: null, header: 1 });
  await importBusinessAssessmentHistory(maps, assessmentRows);

  await updateProfilePromotionFacts();

  console.log("\n导入完成");
}

main()
  .catch((err) => {
    console.error("导入失败:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
