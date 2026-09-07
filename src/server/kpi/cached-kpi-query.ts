import { unstable_cache } from "next/cache";
import { getKpiData } from "@/server/kpi/kpi-query";

type KpiUser = Awaited<ReturnType<typeof import("@/server/auth/current-user").requireCurrentUser>>;

export async function getCachedKpiPageData(
  user: KpiUser,
  options?: { selectedYear?: number; selectedQuarter?: number },
) {
  const year = options?.selectedYear ?? "default";
  const quarter = options?.selectedQuarter ?? "default";
  return unstable_cache(
    async () => getKpiData(user, options),
    ["kpi-page-data", user.id, String(year), String(quarter)],
    { revalidate: 30 },
  )();
}
