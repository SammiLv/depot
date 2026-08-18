import { prisma } from "@/server/db/prisma";
import { getRemainingPromotionOpportunityCount } from "@/server/talent/employee-profile";

async function main() {
  const now = new Date();
  const profiles = await prisma.employeeTalentProfile.findMany({
    where: { deletedAt: null, currentContractEndAt: { not: null } },
    select: { userId: true, currentContractEndAt: true, hasFormalPromotionInCurrentContract: true },
    orderBy: { currentContractEndAt: "asc" },
  });

  const userIds = profiles.map((p) => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  const withCount = profiles
    .filter((profile) => profile.hasFormalPromotionInCurrentContract !== true)
    .map((profile) => ({
      userId: profile.userId,
      name: userNameById.get(profile.userId) ?? "(无姓名)",
      endAt: profile.currentContractEndAt!.toISOString().slice(0, 10),
      hasPromotion: profile.hasFormalPromotionInCurrentContract ?? null,
      count: getRemainingPromotionOpportunityCount(profile.currentContractEndAt, now),
    }))
    .filter((item) => item.count !== null && item.count <= 2);

  console.log(`当前日期: ${now.toISOString().slice(0, 10)}`);
  console.log(`晋升机会 <= 2 的员工共 ${withCount.length} 人:`);
  console.table(withCount);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
