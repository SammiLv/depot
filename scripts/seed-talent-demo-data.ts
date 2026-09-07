/**
 * 人才发展模块本地演示数据
 *
 * 用法：
 *   npx tsx scripts/seed-talent-demo-data.ts          # 幂等：已有演示数据则跳过
 *   npx tsx scripts/seed-talent-demo-data.ts --force # 清除并重建演示数据
 *
 * 前置：已执行 npm run seed（组织与用户）；脚本会自动导入 talent-rule-configs.json（若尚未导入）。
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { calculateTalentReview } from "@/server/talent/review-engine";

const DEMO_CYCLE_NAME = "2026年上半年人才盘点（演示）";
const DEMO_RECORD_PREFIX = "DEMO-";
const RULE_CONFIG_FILE = path.resolve(process.cwd(), "requirements/handoff/talent/talent-rule-configs.json");
const force = process.argv.includes("--force");

type RatingPreset = {
  potential: string;
  performance: string;
  label: string;
};

const nineBoxPresets: RatingPreset[] = [
  { potential: "S", performance: "S", label: "超级明星" },
  { potential: "A", performance: "S", label: "绩效之星" },
  { potential: "B", performance: "S", label: "熟练员工" },
  { potential: "S", performance: "A", label: "潜力之星" },
  { potential: "A", performance: "A", label: "中坚力量" },
  { potential: "B", performance: "A", label: "基本胜任" },
  { potential: "S", performance: "B", label: "待发展者" },
  { potential: "A", performance: "B", label: "差距员工" },
  { potential: "C", performance: "C", label: "问题员工" },
];

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function currentQuarter() {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

async function ensureRuleConfigs() {
  const templateCount = await prisma.talentReviewTemplateVersion.count({ where: { deletedAt: null } });
  if (templateCount > 0) {
    console.log("[seed:talent] 规则配置已存在，跳过导入");
    return;
  }
  console.log("[seed:talent] 导入 talent-rule-configs.json …");
  execSync(`npx tsx scripts/import-talent-rule-configs.ts "${RULE_CONFIG_FILE}"`, {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

async function clearDemoData() {
  const demoCycle = await prisma.talentReviewCycle.findFirst({
    where: { name: DEMO_CYCLE_NAME, deletedAt: null },
    select: { id: true },
  });
  if (demoCycle) {
    const participants = await prisma.talentReviewParticipant.findMany({
      where: { cycleId: demoCycle.id },
      select: { id: true },
    });
    const participantIds = participants.map((row) => row.id);
    if (participantIds.length > 0) {
      await prisma.talentReviewDimensionResult.deleteMany({ where: { participantId: { in: participantIds } } });
      await prisma.talentReviewResult.deleteMany({ where: { participantId: { in: participantIds } } });
    }
    await prisma.talentReviewParticipant.deleteMany({ where: { cycleId: demoCycle.id } });
    await prisma.talentReviewCycle.delete({ where: { id: demoCycle.id } });
  }

  await prisma.talentDecisionRecommendation.deleteMany({
    where: { recommendationNo: { startsWith: DEMO_RECORD_PREFIX } },
  });
  await prisma.rewardRecord.deleteMany({ where: { recordNo: { startsWith: DEMO_RECORD_PREFIX } } });
  await prisma.promotionRecord.deleteMany({ where: { recordNo: { startsWith: DEMO_RECORD_PREFIX } } });
  await prisma.employmentContractTerm.deleteMany({ where: { contractNo: { startsWith: DEMO_RECORD_PREFIX } } });
  const demoAssessmentCycles = await prisma.businessAssessmentCycle.findMany({
    where: { name: { startsWith: "演示" } },
    select: { id: true },
  });
  const demoAssessmentCycleIds = demoAssessmentCycles.map((row) => row.id);
  if (demoAssessmentCycleIds.length > 0) {
    await prisma.businessAssessmentSummary.deleteMany({ where: { cycleId: { in: demoAssessmentCycleIds } } });
    await prisma.businessAssessmentResult.deleteMany({ where: { cycleId: { in: demoAssessmentCycleIds } } });
    await prisma.businessAssessmentSubject.deleteMany({ where: { cycleId: { in: demoAssessmentCycleIds } } });
    await prisma.businessAssessmentCycle.deleteMany({ where: { id: { in: demoAssessmentCycleIds } } });
  }
  await prisma.personalKpi.deleteMany({
    where: { id: { startsWith: "demo_kpi_" } },
  });

  console.log("[seed:talent] 已清除旧演示数据");
}

function demoContractEndDate(index: number, now: Date) {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (index === 0) return new Date(year, month, 15);
  if (index === 1) return new Date(year, month + 1, 2);
  if (index === 2) return new Date(year, month + 1, 24);
  if (index === 3) return new Date(year, month + 2, 10);
  if (index < 6) return addMonths(now, 5);
  return addMonths(now, 14);
}

async function main() {
  await ensureRuleConfigs();

  const existing = await prisma.talentReviewCycle.findFirst({
    where: { name: DEMO_CYCLE_NAME, deletedAt: null },
  });
  if (existing && !force) {
    console.log(`[seed:talent] 演示盘点「${DEMO_CYCLE_NAME}」已存在，跳过。使用 --force 重建。`);
    return;
  }
  if (force) await clearDemoData();

  const admin = await prisma.user.findFirst({ where: { loginName: "admin", deletedAt: null } });
  if (!admin) throw new Error("未找到 admin 用户，请先执行 npm run seed");

  const productDept = await prisma.orgNode.findFirst({ where: { name: "产品部", nodeType: "DEPARTMENT" } });
  if (!productDept) throw new Error("未找到「产品部」，请先执行 npm run seed:full");

  const template = await prisma.talentReviewTemplateVersion.findFirst({
    where: { departmentOrgNodeId: productDept.id, status: "ACTIVE", deletedAt: null },
    orderBy: { publishedAt: "desc" },
  });
  if (!template) throw new Error("产品部缺少 ACTIVE 人才盘点模板，请检查规则配置导入");

  const [dimensions, ratings, thresholds, nineBoxRules, kpiRule] = await Promise.all([
    prisma.talentReviewDimension.findMany({ where: { templateVersionId: template.id }, orderBy: { sortOrder: "asc" } }),
    prisma.talentRatingOption.findMany({ where: { templateVersionId: template.id }, orderBy: { sortOrder: "asc" } }),
    prisma.talentGradeThreshold.findMany({ where: { templateVersionId: template.id }, orderBy: { sortOrder: "asc" } }),
    prisma.talentNineBoxRule.findMany({ where: { templateVersionId: template.id }, orderBy: { sortOrder: "asc" } }),
    prisma.kpiRatingRuleVersion.findFirst({
      where: { departmentOrgNodeId: productDept.id, status: "ACTIVE", deletedAt: null },
      orderBy: { publishedAt: "desc" },
    }),
  ]);

  const ratingByCode = new Map(ratings.map((row) => [row.code, row]));
  const potentialDims = dimensions.filter((row) => row.category === "POTENTIAL");
  const performanceDims = dimensions.filter((row) => row.category === "PERFORMANCE");
  if (potentialDims.length === 0 || performanceDims.length === 0) {
    throw new Error("盘点模板缺少潜力/绩效维度");
  }

  const descendantIds = await getDescendantOrgNodeIds(productDept.id);
  const participants = await prisma.user.findMany({
    where: {
      orgNodeId: { in: descendantIds },
      roleType: { in: ["TEAM_LEADER", "MEMBER"] },
      isActive: true,
      deletedAt: null,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, orgNodeId: true, title: true },
  });
  if (participants.length === 0) throw new Error("产品部下无可用员工");

  const manager = await prisma.user.findFirst({
    where: { roleType: "DEPARTMENT_MANAGER", orgNodeId: productDept.id, deletedAt: null },
  });
  const careerTrack = await prisma.careerTrack.findFirst({
    where: { departmentOrgNodeId: productDept.id, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  const jobFamily = careerTrack
    ? await prisma.jobFamily.findFirst({
        where: { careerTrackId: careerTrack.id, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      })
    : null;
  const jobRole = jobFamily
    ? await prisma.jobRole.findFirst({
        where: { jobFamilyId: jobFamily.id, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      })
    : null;
  const jobLevels = await prisma.jobLevel.findMany({
    where: { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { stepOrder: "asc" }],
    take: 6,
  });
  const levelByIndex = (index: number) => jobLevels[index % jobLevels.length]?.id ?? null;

  const now = new Date();
  const { year, quarter } = currentQuarter();
  const confirmedAt = new Date("2026-06-30T10:00:00.000Z");

  const cycle = await prisma.talentReviewCycle.create({
    data: {
      year: 2026,
      halfYear: 1,
      name: DEMO_CYCLE_NAME,
      departmentOrgNodeId: productDept.id,
      templateVersionId: template.id,
      status: "CONFIRMED",
      startedAt: new Date("2026-01-15T00:00:00.000Z"),
      confirmedAt,
      createdById: admin.id,
    },
  });

  function buildRatings(preset: RatingPreset) {
    const potentialRating = ratingByCode.get(preset.potential);
    const performanceRating = ratingByCode.get(preset.performance);
    if (!potentialRating || !performanceRating) throw new Error(`无效评分档：${preset.potential}/${preset.performance}`);
    return [
      ...potentialDims.map((dim) => ({
        dimensionId: dim.id,
        ratingCode: potentialRating.code,
        numericScore: potentialRating.numericScore,
      })),
      ...performanceDims.map((dim) => ({
        dimensionId: dim.id,
        ratingCode: performanceRating.code,
        numericScore: performanceRating.numericScore,
      })),
    ];
  }

  let participantCount = 0;
  let resultCount = 0;

  for (const [index, user] of participants.entries()) {
    const preset = nineBoxPresets[index % nineBoxPresets.length];
    const ratingInputs = buildRatings(preset);
    const calculated = calculateTalentReview(
      dimensions,
      ratingInputs,
      thresholds,
      nineBoxRules,
      Math.max(...ratings.map((row) => row.numericScore)),
    );
    const boxLabel = nineBoxRules.find((row) => row.code === calculated.nineBoxCode)?.label ?? preset.label;

    const participant = await prisma.talentReviewParticipant.create({
      data: {
        cycleId: cycle.id,
        userId: user.id,
        periodYear: 2026,
        periodHalfYear: 1,
        orgNodeIdSnapshot: user.orgNodeId,
        jobRoleIdSnapshot: jobRole?.id ?? null,
        jobLevelIdSnapshot: levelByIndex(index),
        status: "CONFIRMED",
        reviewerId: manager?.id ?? admin.id,
        confirmedById: manager?.id ?? admin.id,
        confirmedAt,
      },
    });
    participantCount++;

    for (const rating of ratingInputs) {
      await prisma.talentReviewDimensionResult.create({
        data: {
          participantId: participant.id,
          dimensionId: rating.dimensionId,
          ratingCode: rating.ratingCode,
          numericScore: rating.numericScore,
          evaluatorId: manager?.id ?? admin.id,
          evaluatedAt: confirmedAt,
        },
      });
    }

    await prisma.talentReviewResult.create({
      data: {
        participantId: participant.id,
        totalScore: calculated.totalScore,
        gradeCode: calculated.gradeCode,
        potentialScore: calculated.potentialScore,
        performanceScore: calculated.performanceScore,
        nineBoxCode: calculated.nineBoxCode,
        talentType: boxLabel,
        managerComment: `演示数据：${preset.label}`,
        calculatedAt: confirmedAt,
        confirmedAt,
      },
    });
    resultCount++;

    const contractStart = addMonths(now, -18);
    const contractEnd = demoContractEndDate(index, now);

    await prisma.employeeTalentProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        jobRoleId: jobRole?.id ?? null,
        entryJobLevelId: levelByIndex(index),
        jobLevelId: levelByIndex(index),
        managerUserId: manager?.id ?? null,
        startingSalary: 12000 + index * 500,
        currentSalary: 15000 + index * 800,
        currentContractStartAt: contractStart,
        currentContractEndAt: contractEnd,
        currentContractSequence: 2,
        hasTwoCReviewsInCurrentContract: preset.potential === "C" && index % 3 === 0 ? true : false,
        hasConsecutiveTwoCReviewsInCurrentContract: false,
        isLatestPreRenewalReviewC: calculated.gradeCode === "C",
        hasFormalPromotionInCurrentContract: index >= 8,
        updatedById: admin.id,
      },
      update: {
        jobRoleId: jobRole?.id ?? null,
        entryJobLevelId: levelByIndex(index),
        jobLevelId: levelByIndex(index),
        managerUserId: manager?.id ?? null,
        currentContractStartAt: contractStart,
        currentContractEndAt: contractEnd,
        currentContractSequence: 2,
        hasFormalPromotionInCurrentContract: index >= 8,
        updatedById: admin.id,
      },
    });

    await prisma.employmentContractTerm.upsert({
      where: {
        userId_startDate_renewalSequence: {
          userId: user.id,
          startDate: contractStart,
          renewalSequence: 2,
        },
      },
      create: {
        userId: user.id,
        contractNo: `${DEMO_RECORD_PREFIX}CT-${String(index + 1).padStart(3, "0")}`,
        startDate: contractStart,
        endDate: contractEnd,
        renewalSequence: 2,
        outcome: "RENEWED",
        resultStatus: "CONFIRMED",
        confirmedById: admin.id,
        confirmedAt: now,
        createdById: admin.id,
      },
      update: {
        endDate: contractEnd,
        resultStatus: "CONFIRMED",
      },
    });

    const kpiScore = 85 + (index % 5) * 3;
    const kpiRating = kpiScore >= 95 ? "S" : kpiScore >= 88 ? "A" : "B";
    await prisma.personalKpi.upsert({
      where: { year_quarter_userId: { year, quarter, userId: user.id } },
      create: {
        id: `demo_kpi_${user.id.slice(-8)}_${year}_q${quarter}`,
        year,
        quarter,
        userId: user.id,
        orgNodeId: user.orgNodeId,
        status: "COMPLETED",
        finalScore: kpiScore,
        finalRatingName: kpiRating,
        ratingRuleVersionId: kpiRule?.id ?? null,
        completedAt: now,
      },
      update: {
        status: "COMPLETED",
        finalScore: kpiScore,
        finalRatingName: kpiRating,
        completedAt: now,
      },
    });

    if (index < 4) {
      await prisma.promotionRecord.create({
        data: {
          recordNo: `${DEMO_RECORD_PREFIX}PR-${String(index + 1).padStart(3, "0")}`,
          userId: user.id,
          fromJobLevelId: levelByIndex(index),
          toJobLevelId: levelByIndex(index + 1),
          outcome: "SUCCESS",
          reason: "演示：半年晋升",
          effectiveDate: new Date(`${year}-0${index < 2 ? 4 : 5}-15T00:00:00.000Z`),
          resultStatus: "CONFIRMED",
          confirmedById: admin.id,
          confirmedAt: now,
          createdById: admin.id,
        },
      });
    }

    if (index < 5) {
      await prisma.rewardRecord.create({
        data: {
          recordNo: `${DEMO_RECORD_PREFIX}RW-${String(index + 1).padStart(3, "0")}`,
          userId: user.id,
          rewardLevel: index % 2 === 0 ? "DEPARTMENT" : "COMPANY",
          rewardForm: "CASH",
          rewardRecipient: "INDIVIDUAL",
          rewardCycle: "QUARTERLY",
          rewardPeriodYear: year,
          rewardPeriodQuarter: quarter,
          rewardName: index % 2 === 0 ? "最佳创新奖" : "季度之星",
          rewardAmount: 200 + index * 100,
          effectiveDate: now,
          resultStatus: "CONFIRMED",
          confirmedById: admin.id,
          confirmedAt: now,
          createdById: admin.id,
        },
      });
    }
  }

  const assessmentCycle = await prisma.businessAssessmentCycle.upsert({
    where: {
      departmentOrgNodeId_year_quarter: {
        departmentOrgNodeId: productDept.id,
        year,
        quarter,
      },
    },
    create: {
      year,
      quarter,
      name: `演示 ${year}年Q${quarter} 业务考核`,
      departmentOrgNodeId: productDept.id,
      status: "CONFIRMED",
      confirmedById: admin.id,
      confirmedAt: now,
      createdById: admin.id,
    },
    update: {
      status: "CONFIRMED",
      confirmedAt: now,
    },
  });

  const subject = await prisma.businessAssessmentSubject.upsert({
    where: { cycleId_code: { cycleId: assessmentCycle.id, code: "DEMO_SUBJECT" } },
    create: {
      cycleId: assessmentCycle.id,
      code: "DEMO_SUBJECT",
      name: "产品知识",
      scoringType: "NUMERIC",
      passingNumericScore: 80,
      maxScore: 3,
      sortOrder: 10,
    },
    update: { name: "产品知识" },
  });

  for (const [index, user] of participants.entries()) {
    const passed = index % 4 !== 3;
    const earnedScore = passed ? 3 : 1.5;
    await prisma.businessAssessmentResult.upsert({
      where: { cycleId_subjectId_userId: { cycleId: assessmentCycle.id, subjectId: subject.id, userId: user.id } },
      create: {
        cycleId: assessmentCycle.id,
        subjectId: subject.id,
        userId: user.id,
        rawFinalValue: passed ? "92" : "65",
        attemptResult: passed ? "INITIAL_PASS" : "FINAL_FAIL",
        isPassed: passed,
        earnedScore,
        confirmedAt: now,
      },
      update: {
        rawFinalValue: passed ? "92" : "65",
        isPassed: passed,
        earnedScore,
      },
    });
    await prisma.businessAssessmentSummary.upsert({
      where: { cycleId_userId: { cycleId: assessmentCycle.id, userId: user.id } },
      create: {
        cycleId: assessmentCycle.id,
        userId: user.id,
        subjectCount: 1,
        passedSubjectCount: passed ? 1 : 0,
        earnedScore,
        maxScore: 3,
        isOverallPassed: passed,
      },
      update: {
        passedSubjectCount: passed ? 1 : 0,
        earnedScore,
        isOverallPassed: passed,
      },
    });
  }

  const recommendationTargets = participants.slice(0, 4);
  const decisionTypes = ["PROMOTION", "CONTRACT_RENEWAL", "SALARY_ADJUSTMENT", "DEVELOPMENT"] as const;
  for (const [index, user] of recommendationTargets.entries()) {
    await prisma.talentDecisionRecommendation.create({
      data: {
        recommendationNo: `${DEMO_RECORD_PREFIX}REC-${String(index + 1).padStart(3, "0")}`,
        userId: user.id,
        departmentOrgNodeId: productDept.id,
        decisionType: decisionTypes[index],
        status: index === 0 ? "PROPOSED" : "CLOSED",
        recommendationContentJson: JSON.stringify({
          summary: `演示建议：${decisionTypes[index]}`,
          rationale: "本地 seed 生成的决策建议样例",
        }),
        evidenceSnapshotJson: JSON.stringify({ source: "seed-talent-demo-data" }),
        qualificationResultJson: JSON.stringify({ qualified: index !== 3, missingItems: index === 3 ? ["业务考核"] : [] }),
        companyFeedbackStatus: index === 0 ? "PENDING" : index === 1 ? "ADOPTED" : index === 2 ? "ADJUSTED_ADOPTION" : "REJECTED",
        companyFeedbackContent: index === 0 ? null : "演示反馈",
        proposedById: manager?.id ?? admin.id,
        proposedAt: addDays(now, -7 + index),
        closedById: index === 0 ? null : manager?.id ?? admin.id,
        closedAt: index === 0 ? null : addDays(now, -3 + index),
      },
    });
  }

  console.log(`[seed:talent] 完成：盘点周期 1，参与人 ${participantCount}，结果 ${resultCount}`);
  console.log(`[seed:talent] 员工档案 ${participants.length}，KPI ${participants.length}，决策建议 ${recommendationTargets.length}`);
  console.log("[seed:talent] 刷新 http://localhost:3003/talent 查看人才总览");
}

main()
  .catch((error) => {
    console.error("[seed:talent] 失败:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
