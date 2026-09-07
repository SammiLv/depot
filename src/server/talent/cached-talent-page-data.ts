import { unstable_cache } from "next/cache";
import { getCareerConfiguration, getCompetencyConfiguration } from "@/server/talent/config-query";
import { getTalentDecisionRuleConfiguration } from "@/server/talent/decision-rule-query";
import { getEmployeeProfileManagementData } from "@/server/talent/employee-profile-query";
import { getTalentHistoryData, getTalentRecommendationData } from "@/server/talent/decision-history-query";
import { loadTalentReviewWorkspace } from "@/server/talent/load-review-workspace";

type TalentUser = Awaited<ReturnType<typeof import("@/server/auth/current-user").requireCurrentUser>>;

// 30s 请求级缓存,与 getCachedTalentOverviewPageData 一致。key 含 user.id + roleType,
// 权限差异不同的用户各自独立缓存。以下 5 组数据在页面 tab 切换时高频命中,收益显著。

export async function getCachedTalentReviewWorkspace(user: TalentUser) {
  return unstable_cache(
    async () => loadTalentReviewWorkspace(user),
    ["talent-review-workspace", user.id, user.roleType],
    { revalidate: 30 },
  )();
}

export async function getCachedTalentRecommendationData(user: TalentUser) {
  return unstable_cache(
    async () => getTalentRecommendationData(user),
    ["talent-recommendation-data", user.id, user.roleType],
    { revalidate: 30 },
  )();
}

export async function getCachedTalentHistoryData(
  user: TalentUser,
  userIdFilter?: string,
  importBatchId?: string,
) {
  return unstable_cache(
    async () => getTalentHistoryData(user, userIdFilter, importBatchId),
    ["talent-history-data", user.id, user.roleType, userIdFilter ?? "", importBatchId ?? ""],
    { revalidate: 30 },
  )();
}

export async function getCachedEmployeeProfileManagementData(user: TalentUser) {
  return unstable_cache(
    async () => getEmployeeProfileManagementData(user),
    ["talent-employee-profile-management", user.id, user.roleType],
    { revalidate: 30 },
  )();
}

export async function getCachedCareerConfiguration(user: TalentUser) {
  return unstable_cache(
    async () => getCareerConfiguration(user),
    ["talent-career-configuration", user.id, user.roleType],
    { revalidate: 30 },
  )();
}

export async function getCachedCompetencyConfiguration(user: TalentUser) {
  return unstable_cache(
    async () => getCompetencyConfiguration(user),
    ["talent-competency-configuration", user.id, user.roleType],
    { revalidate: 30 },
  )();
}

export async function getCachedTalentDecisionRuleConfiguration(user: TalentUser) {
  return unstable_cache(
    async () => getTalentDecisionRuleConfiguration(user),
    ["talent-decision-rule-configuration", user.id, user.roleType],
    { revalidate: 30 },
  )();
}
