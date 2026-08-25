"use server";

import { requireCurrentUser } from "@/server/auth/current-user";
import { getCareerConfiguration, getCompetencyConfiguration } from "@/server/talent/config-query";
import { getTalentHistoryData, getTalentRecommendationData } from "@/server/talent/decision-history-query";

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
