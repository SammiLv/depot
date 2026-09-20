import { unstable_cache } from "next/cache";
import { getKpiData } from "@/server/kpi/kpi-query";

type KpiUser = Awaited<ReturnType<typeof import("@/server/auth/current-user").requireCurrentUser>>;

export async function getCachedKpiPageData(
  user: KpiUser,
  options?: { selectedYear?: number; selectedQuarter?: number },
) {
  const now = new Date();
  const year = options?.selectedYear ?? now.getFullYear();
  const quarter = options?.selectedQuarter ?? Math.floor(now.getMonth() / 3) + 1;
  return unstable_cache(
    async () => getKpiData(user, { selectedYear: year, selectedQuarter: quarter }),
    ["kpi-page-data", user.id, String(year), String(quarter)],
    { revalidate: 30 },
  )();
}
