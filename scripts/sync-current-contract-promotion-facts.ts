import "dotenv/config";
import { prisma } from "../src/server/db/prisma";

const apply = process.argv.includes("--apply");
const updateNote = "系统根据已确认晋升记录的生效日期与当前聘期自动维护";

async function main() {
  const importedPromotions = await prisma.promotionRecord.findMany({
    where: { sourceType: "MANUAL_IMPORT", resultStatus: "CONFIRMED", deletedAt: null },
    select: { userId: true },
  });
  const userIds = [...new Set(importedPromotions.map((record) => record.userId))];
  const [profiles, users] = await Promise.all([
    prisma.employeeTalentProfile.findMany({
      where: { userId: { in: userIds }, deletedAt: null },
      select: {
        id: true,
        userId: true,
        currentContractStartAt: true,
        currentContractEndAt: true,
        hasFormalPromotionInCurrentContract: true,
        updatedById: true,
      },
    }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const userNameById = new Map(users.map((user) => [user.id, user.name]));

  if (profiles.length !== userIds.length) {
    throw new Error(`导入晋升涉及 ${userIds.length} 人，但仅找到 ${profiles.length} 份有效人才档案`);
  }

  const results = await Promise.all(profiles.map(async (profile) => {
    if (!profile.currentContractStartAt || !profile.currentContractEndAt) {
      throw new Error(`${userNameById.get(profile.userId) ?? profile.userId} 的当前聘期起止日期不完整，无法判断`);
    }
    const matchingCount = await prisma.promotionRecord.count({
      where: {
        userId: profile.userId,
        resultStatus: "CONFIRMED",
        deletedAt: null,
        effectiveDate: { gte: profile.currentContractStartAt, lte: profile.currentContractEndAt },
      },
    });
    return {
      ...profile,
      employeeName: userNameById.get(profile.userId) ?? profile.userId,
      nextValue: matchingCount > 0,
      matchingCount,
    };
  }));

  console.table(results.map((result) => ({
    employee: result.employeeName,
    contractStart: result.currentContractStartAt!.toISOString().slice(0, 10),
    contractEnd: result.currentContractEndAt!.toISOString().slice(0, 10),
    matchingPromotions: result.matchingCount,
    currentValue: result.hasFormalPromotionInCurrentContract,
    nextValue: result.nextValue,
  })));

  if (!apply) {
    console.log("当前为预检模式；确认结果后使用 --apply 写入。");
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const result of results) {
      const profile = await tx.employeeTalentProfile.update({
        where: { id: result.id },
        data: {
          hasFormalPromotionInCurrentContract: result.nextValue,
          decisionFactsUpdatedAt: now,
          decisionFactsUpdateNote: updateNote,
        },
      });
      await tx.talentActionLog.create({
        data: {
          targetType: "EmployeeTalentProfile",
          targetId: result.id,
          action: "SYNC_FORMAL_PROMOTION_IN_CURRENT_CONTRACT",
          actorId: result.updatedById,
          beforeJson: JSON.stringify({ hasFormalPromotionInCurrentContract: result.hasFormalPromotionInCurrentContract }),
          afterJson: JSON.stringify({
            hasFormalPromotionInCurrentContract: profile.hasFormalPromotionInCurrentContract,
            currentContractStartAt: result.currentContractStartAt,
            currentContractEndAt: result.currentContractEndAt,
            matchingPromotionCount: result.matchingCount,
          }),
        },
      });
    }
  });
  console.log(`已同步 ${results.length} 份人才档案。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
