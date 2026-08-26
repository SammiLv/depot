import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import {
  getCachedCareerConfiguration,
  getCachedCompetencyConfiguration,
  getCachedTalentDecisionRuleConfiguration,
  getCachedTalentReviewWorkspace,
} from "@/server/talent/cached-talent-page-data";
import { TalentConfigPageContent } from "../config-content";
import { requireTalentSection, resolveTalentVisibleSections } from "../resolve-visible-sections";
import { TalentSectionPage } from "../talent-section-page";

export default async function TalentConfigPage() {
  const user = await requireCurrentUser();
  const visibleSections = await resolveTalentVisibleSections(user);
  if (!(await requireTalentSection(user, "config"))) redirect("/talent");

  const [reviewWorkspace, career, competency, decisionRules] = await Promise.all([
    getCachedTalentReviewWorkspace(user),
    getCachedCareerConfiguration(user),
    getCachedCompetencyConfiguration(user),
    getCachedTalentDecisionRuleConfiguration(user),
  ]);
  if (!reviewWorkspace) redirect("/talent");

  return (
    <TalentSectionPage visibleSections={visibleSections} activeSection="config">
      <TalentConfigPageContent
        reviewWorkspace={JSON.parse(JSON.stringify(reviewWorkspace))}
        career={JSON.parse(JSON.stringify(career))}
        competency={JSON.parse(JSON.stringify(competency))}
        decisionRules={JSON.parse(JSON.stringify(decisionRules))}
      />
    </TalentSectionPage>
  );
}
