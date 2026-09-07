import { unstable_cache } from "next/cache";
import { getTalentOverviewPageData } from "@/server/talent/talent-overview-query";

type TalentUser = Awaited<ReturnType<typeof import("@/server/auth/current-user").requireCurrentUser>>;

export async function getCachedTalentOverviewPageData(user: TalentUser) {
  return unstable_cache(
    async () => getTalentOverviewPageData(user),
    ["talent-overview-page-data", user.id],
    { revalidate: 30 },
  )();
}
