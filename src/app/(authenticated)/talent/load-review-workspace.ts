import { prisma } from "@/server/db/prisma";
import { buildUserWhereByPermission, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { getTalentReviewConfig, getTalentReviewCycleDetails, getTalentReviewCycles } from "@/server/talent/review-query";
import type { ReviewWorkspaceData } from "./review-workspace-types";

export async function loadTalentReviewWorkspace(user: Awaited<ReturnType<typeof import("@/server/auth/current-user").requireCurrentUser>>) {
  const reviewCoverage = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewReview);
  if (!reviewCoverage.hasPermission) return null;

  const [config, cycles] = await Promise.all([
    getTalentReviewConfig(user),
    getTalentReviewCycles(user),
  ]);
  const details = await getTalentReviewCycleDetails(user, cycles.cycles.map((cycle) => cycle.id));
  return JSON.parse(JSON.stringify({ config, cycles, details })) as ReviewWorkspaceData;
}

export async function loadTalentOverviewReviewDetails(user: Awaited<ReturnType<typeof import("@/server/auth/current-user").requireCurrentUser>>) {
  const profileCoverage = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile);
  const [config, cycles] = await Promise.all([
    getTalentReviewConfig(user),
    getTalentReviewCycles(user),
  ]);

  const profileVisibleUserIds = profileCoverage.hasPermission
    ? new Set(
        (await prisma.user.findMany({
          where: await buildUserWhereByPermission(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewProfile),
          select: { id: true },
        })).map((row) => row.id),
      )
    : new Set<string>();

  const details = (await getTalentReviewCycleDetails(user, cycles.cycles.map((cycle) => cycle.id)))
    .map((detail) => {
      const participants = detail.participants.filter((participant) => profileVisibleUserIds.has(participant.userId));
      const participantIds = new Set(participants.map((participant) => participant.id));
      return {
        ...detail,
        cycleId: detail.cycle.id,
        cycleStatus: detail.cycle.status,
        participants,
        results: detail.results.filter((result) => participantIds.has(result.participantId)),
        dimensionResults: detail.dimensionResults.filter((result) => participantIds.has(result.participantId)),
      };
    });

  return JSON.parse(JSON.stringify({ config, cycles, details })) as ReviewWorkspaceData;
}
