import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getCachedTalentReviewWorkspace } from "@/server/talent/cached-talent-page-data";
import { TalentReviewWorkbench } from "../content";
import { requireTalentSection, resolveTalentVisibleSections } from "../resolve-visible-sections";
import { TalentSectionPage } from "../talent-section-page";

export default async function TalentReviewPage() {
  const user = await requireCurrentUser();
  const visibleSections = await resolveTalentVisibleSections(user);
  if (!(await requireTalentSection(user, "review"))) redirect("/talent");

  const data = await getCachedTalentReviewWorkspace(user);
  if (!data) redirect("/talent");

  return (
    <TalentSectionPage visibleSections={visibleSections} activeSection="review">
      <TalentReviewWorkbench data={data} />
    </TalentSectionPage>
  );
}
