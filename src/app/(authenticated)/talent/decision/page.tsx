import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getCachedTalentRecommendationData } from "@/server/talent/cached-talent-page-data";
import { TalentDecisionWorkspace } from "../operation-workspaces";
import { requireTalentSection, resolveTalentVisibleSections } from "../resolve-visible-sections";
import { TalentSectionPage } from "../talent-section-page";

export default async function TalentDecisionPage() {
  const user = await requireCurrentUser();
  const visibleSections = await resolveTalentVisibleSections(user);
  if (!(await requireTalentSection(user, "decision"))) redirect("/talent");

  const data = await getCachedTalentRecommendationData(user);

  return (
    <TalentSectionPage visibleSections={visibleSections} activeSection="decision">
      <TalentDecisionWorkspace data={JSON.parse(JSON.stringify(data))} />
    </TalentSectionPage>
  );
}
