import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getCachedTalentOverviewPageData } from "@/server/talent/cached-talent-overview-query";
import { TalentOverviewContent } from "./content";
import { resolveTalentVisibleSections } from "./resolve-visible-sections";
import { resolveLegacyTalentSectionRedirect } from "./talent-sections";
import { TalentSectionPage } from "./talent-section-page";

type PageProps = {
  searchParams?: Promise<{ section?: string; tab?: string }>;
};

export default async function TalentPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const legacySection = params?.section ?? params?.tab;
  const legacyRedirect = resolveLegacyTalentSectionRedirect(legacySection, new URLSearchParams());
  if (legacyRedirect) redirect(legacyRedirect);

  const user = await requireCurrentUser();
  const visibleSections = await resolveTalentVisibleSections(user);
  if (!visibleSections.includes("overview")) {
    redirect(visibleSections[0] === "review" ? "/talent/review"
      : visibleSections[0] === "decision" ? "/talent/decision"
      : visibleSections[0] === "history" ? "/talent/history"
      : visibleSections[0] === "config" ? "/talent/config"
      : "/");
  }

  const payload = await getCachedTalentOverviewPageData(user);

  return (
    <TalentSectionPage visibleSections={visibleSections} activeSection="overview">
      <TalentOverviewContent
        reviewWorkspace={payload.reviewWorkspace}
        operationWorkspace={payload.operationWorkspace}
        latestKpiByUserId={payload.latestKpiByUserId}
        latestAssessmentByUserId={payload.latestAssessmentByUserId}
        statCards={payload.statCards}
        profileExtrasByUserId={payload.profileExtrasByUserId}
        overviewKpiRuleVersions={payload.overviewKpiRuleVersions}
        overviewKpiBands={payload.overviewKpiBands}
        participantUserIds={payload.participantUserIds}
        profileExtrasScoreOptions={payload.profileExtrasScoreOptions}
      />
    </TalentSectionPage>
  );
}
