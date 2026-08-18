import "dotenv/config";
import { prisma } from "../src/server/db/prisma";

const apply = process.argv.includes("--apply");
const updateNote = "已建档人员无当前聘期正式晋升记录，初始化为否";

async function main() {
  const profiles = await prisma.employeeTalentProfile.findMany({
    where: {
      deletedAt: null,
      hasFormalPromotionInCurrentContract: null,
    },
    select: { id: true, userId: true, updatedById: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: profiles.map((profile) => profile.userId) } },
    select: { id: true, name: true },
  });
  const userNameById = new Map(users.map((user) => [user.id, user.name]));

  console.table(profiles.map((profile) => ({
    employee: userNameById.get(profile.userId) ?? profile.userId,
    currentValue: "未维护",
    nextValue: "否",
  })));

  if (!apply) {
    console.log(`预检完成：将初始化 ${profiles.length} 份已有档案；不会为未建档人员创建档案。`);
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const profile of profiles) {
      await tx.employeeTalentProfile.update({
        where: { id: profile.id },
        data: {
          hasFormalPromotionInCurrentContract: false,
          decisionFactsUpdatedAt: now,
          decisionFactsUpdateNote: updateNote,
        },
      });
      await tx.talentActionLog.create({
        data: {
          targetType: "EmployeeTalentProfile",
          targetId: profile.id,
          action: "INITIALIZE_FORMAL_PROMOTION_IN_CURRENT_CONTRACT_FALSE",
          actorId: profile.updatedById,
          beforeJson: JSON.stringify({ hasFormalPromotionInCurrentContract: null }),
          afterJson: JSON.stringify({ hasFormalPromotionInCurrentContract: false }),
        },
      });
    }
  });
  console.log(`已将 ${profiles.length} 份已有档案的“聘期内正式晋升”初始化为“否”。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
