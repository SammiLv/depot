"use server";

import { requireCurrentUser } from "@/server/auth/current-user";
import { getCareerConfiguration, getCompetencyConfiguration } from "@/server/talent/config-query";
import { getTalentHistoryData, getTalentRecommendationData } from "@/server/talent/decision-history-query";
import { getProfileOverviewExtrasForUsers } from "@/server/talent/profile-overview-query";
import { getTalentOverviewPageData } from "@/server/talent/talent-overview-query";
import { loadTalentReviewWorkspace } from "@/server/talent/load-review-workspace";
import { getTalentDecisionRuleConfiguration } from "@/server/talent/decision-rule-query";

export async function loadTalentOverviewPageData() {
  const user = await requireCurrentUser();
  return getTalentOverviewPageData(user);
}

export async function loadTalentProfileExtras(
  userIds: string[],
  scoreOptions: { kpiTotalScore: number; reviewTotalScore: number },
) {
  await requireCurrentUser();
  if (userIds.length === 0) return {};
  return JSON.parse(JSON.stringify(
    await getProfileOverviewExtrasForUsers(userIds, scoreOptions),
  ));
}

export async function loadTalentReviewPageData() {
  const user = await requireCurrentUser();
  const reviewWorkspace = await loadTalentReviewWorkspace(user);
  if (!reviewWorkspace) throw new Error("无人才盘点访问权限");
  return reviewWorkspace;
}

export async function loadTalentConfigPageData() {
  const user = await requireCurrentUser();
  const [reviewWorkspace, career, competency, decisionRules] = await Promise.all([
    loadTalentReviewWorkspace(user),
    getCareerConfiguration(user),
    getCompetencyConfiguration(user),
    getTalentDecisionRuleConfiguration(user),
  ]);
  if (!reviewWorkspace) throw new Error("无规则配置访问权限");
  return JSON.parse(JSON.stringify({ reviewWorkspace, career, competency, decisionRules }));
}

export async function loadTalentDecisionWorkspace() {
  const user = await requireCurrentUser();
  return JSON.parse(JSON.stringify(await getTalentRecommendationData(user)));
}

export async function loadTalentHistoryWorkspace() {
  const user = await requireCurrentUser();
  return JSON.parse(JSON.stringify(await getTalentHistoryData(user)));
}

export async function loadTalentConfigWorkspace() {
  const user = await requireCurrentUser();
  const [career, competency] = await Promise.all([
    getCareerConfiguration(user),
    getCompetencyConfiguration(user),
  ]);
  return JSON.parse(JSON.stringify({ career, competency }));
}
