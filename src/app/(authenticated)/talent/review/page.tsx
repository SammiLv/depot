import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { TalentReviewWorkbench } from "../content";
import { loadTalentReviewWorkspace } from "../load-review-workspace";
import { requireTalentSection, resolveTalentVisibleSections } from "../resolve-visible-sections";
import { TalentSectionPage } from "../talent-section-page";
export default async function TalentReviewPage() {
  const user = await requireCurrentUser();
  const visibleSections = await resolveTalentVisibleSections(user);
  if (!(await requireTalentSection(user, "review"))) redirect("/talent");

  const reviewWorkspace = await loadTalentReviewWorkspace(user);
  if (!reviewWorkspace) redirect("/talent");

  return (
    <TalentSectionPage visibleSections={visibleSections} activeSection="review">
      <TalentReviewWorkbench data={reviewWorkspace} />
    </TalentSectionPage>
  );
}
