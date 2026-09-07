import { requireCurrentUser } from "@/server/auth/current-user";
import { resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import type { Section } from "./content";

export async function resolveTalentVisibleSections(user: Awaited<ReturnType<typeof requireCurrentUser>>) {
  const [profileCoverage, reviewCoverage, recommendationCoverage, historyCoverage, configCoverage] = await Promise.all([
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewReview),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewRecommendation),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewHistory),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewConfig),
  ]);

  return ([
    ["overview", profileCoverage],
    ["review", reviewCoverage],
    ["decision", recommendationCoverage],
    ["history", historyCoverage],
    ["config", configCoverage],
  ] as const).filter(([, coverage]) => coverage.hasPermission).map(([key]) => key as Section);
}

export async function requireTalentSection(user: Awaited<ReturnType<typeof requireCurrentUser>>, section: Section) {
  const visibleSections = await resolveTalentVisibleSections(user);
  return visibleSections.includes(section);
}
